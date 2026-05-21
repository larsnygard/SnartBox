import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { SketchControls, WallZProfile } from '@/types/sketch'
import type { Point2, Point3 } from './types'
import {
  buildBaseShapePoints,
  sanitizeClosedPath,
  moveSeamToHingeMidpoint,
  polygonSignedArea,
} from './baseShape'
import { buildZProfilePoints } from './zProfile'

export function normalize2(dx: number, dz: number): Point2 {
  const length = Math.hypot(dx, dz)
  if (length < 1e-9) return [1, 0]
  return [dx / length, dz / length]
}

export function outwardNormalFromTangent(tx: number, tz: number, isCCW: boolean): Point2 {
  return isCCW ? [tz, -tx] : [-tz, tx]
}

export function intersectOffsetLines(
  point: Point2,
  prevTangent: Point2,
  nextTangent: Point2,
  prevNormal: Point2,
  nextNormal: Point2,
  offset: number,
): Point2 {
  const aPoint: Point2 = [point[0] - prevNormal[0] * offset, point[1] - prevNormal[1] * offset]
  const bPoint: Point2 = [point[0] - nextNormal[0] * offset, point[1] - nextNormal[1] * offset]

  const det = prevTangent[0] * nextTangent[1] - prevTangent[1] * nextTangent[0]
  if (Math.abs(det) < 1e-9) {
    const avgNormal = normalize2(prevNormal[0] + nextNormal[0], prevNormal[1] + nextNormal[1])
    return [point[0] - avgNormal[0] * offset, point[1] - avgNormal[1] * offset]
  }

  const deltaX = bPoint[0] - aPoint[0]
  const deltaZ = bPoint[1] - aPoint[1]
  const t = (deltaX * nextTangent[1] - deltaZ * nextTangent[0]) / det

  return [
    aPoint[0] + prevTangent[0] * t,
    aPoint[1] + prevTangent[1] * t,
  ]
}

export function addTriangle(positions: number[], a: Point3, b: Point3, c: Point3): void {
  positions.push(a[0], a[1], a[2])
  positions.push(b[0], b[1], b[2])
  positions.push(c[0], c[1], c[2])
}

export function addQuad(positions: number[], a: Point3, b: Point3, c: Point3, d: Point3): void {
  addTriangle(positions, a, b, c)
  addTriangle(positions, a, c, d)
}

export function buildWallSweepGeometry(
  controls: SketchControls,
  zProfile: WallZProfile,
  topHeight?: number,
): BufferGeometry | null {
  const rawPath = buildBaseShapePoints(controls, zProfile.wallThickness)
  const cleanedPath = sanitizeClosedPath(rawPath)
  const path = moveSeamToHingeMidpoint(cleanedPath)
  if (path.length < 3) return null

  const isCCW = polygonSignedArea(path) > 0

  const profileHeight = Math.max(20, topHeight ?? controls.boxHeight)
  const { outer, inner } = buildZProfilePoints(zProfile, profileHeight)
  if (outer.length < 2 || inner.length < 2) return null

  const stationCount = path.length
  const sampleCount = outer.length

  const stations = path.map((point, index) => {
    const prev = path[(index - 1 + stationCount) % stationCount]
    const next = path[(index + 1) % stationCount]
    const prevTangent = normalize2(point[0] - prev[0], point[1] - prev[1])
    const nextTangent = normalize2(next[0] - point[0], next[1] - point[1])
    const prevNormal = outwardNormalFromTangent(prevTangent[0], prevTangent[1], isCCW)
    const nextNormal = outwardNormalFromTangent(nextTangent[0], nextTangent[1], isCCW)
    return { point, prevTangent, nextTangent, prevNormal, nextNormal }
  })

  const outerGrid: Point3[][] = stations.map((station) =>
    outer.map(([offset, y]) => {
      const [x, z] = intersectOffsetLines(
        station.point,
        station.prevTangent,
        station.nextTangent,
        station.prevNormal,
        station.nextNormal,
        offset,
      )
      return [x, y, z] as Point3
    }),
  )

  const innerGrid: Point3[][] = stations.map((station) =>
    inner.map(([offset, y]) => {
      const [x, z] = intersectOffsetLines(
        station.point,
        station.prevTangent,
        station.nextTangent,
        station.prevNormal,
        station.nextNormal,
        offset,
      )
      return [x, y, z] as Point3
    }),
  )

  const positions: number[] = []
  const floorThickness = Math.max(0.1, zProfile.bottomThickness)

  for (let i = 0; i < stationCount; i += 1) {
    const nextI = (i + 1) % stationCount

    for (let j = 0; j < sampleCount - 1; j += 1) {
      const a = outerGrid[i][j]
      const b = outerGrid[nextI][j]
      const c = outerGrid[nextI][j + 1]
      const d = outerGrid[i][j + 1]
      addQuad(positions, a, b, c, d)

      const ia = innerGrid[i][j]
      const ib = innerGrid[nextI][j]
      const ic = innerGrid[nextI][j + 1]
      const id = innerGrid[i][j + 1]
      addQuad(positions, ia, id, ic, ib)
    }

    const topA = outerGrid[i][sampleCount - 1]
    const topB = outerGrid[nextI][sampleCount - 1]
    const topC = innerGrid[nextI][sampleCount - 1]
    const topD = innerGrid[i][sampleCount - 1]
    addQuad(positions, topA, topB, topC, topD)

    const bottomA = outerGrid[i][0]
    const bottomB = outerGrid[nextI][0]
    const bottomC = innerGrid[nextI][0]
    const bottomD = innerGrid[i][0]
    addQuad(positions, bottomA, bottomD, bottomC, bottomB)
  }

  const floorBottomLoop: Point3[] = innerGrid.map((column) => {
    const p = column[0]
    return [p[0], 0, p[2]]
  })
  const floorTopLoop: Point3[] = floorBottomLoop.map(([x, y, z]) => [x, y + floorThickness, z])

  if (floorTopLoop.length >= 3) {
    for (let i = 1; i < floorTopLoop.length - 1; i += 1) {
      addTriangle(positions, floorTopLoop[0], floorTopLoop[i], floorTopLoop[i + 1])
      addTriangle(positions, floorBottomLoop[0], floorBottomLoop[i + 1], floorBottomLoop[i])
    }

    for (let i = 0; i < floorTopLoop.length; i += 1) {
      const nextI = (i + 1) % floorTopLoop.length
      const a = floorTopLoop[i]
      const b = floorTopLoop[nextI]
      const c = floorBottomLoop[nextI]
      const d = floorBottomLoop[i]
      addQuad(positions, a, b, c, d)
    }
  }

  const meshGeometry = new BufferGeometry()
  meshGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  meshGeometry.computeVertexNormals()
  return meshGeometry
}
