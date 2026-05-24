import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'
import type { SketchControls, WallZProfile } from '@/types/sketch'
import type { Point2, Point3 } from './types'
import {
  buildBaseShapePoints,
  sanitizeClosedPath,
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
  const ix = aPoint[0] + prevTangent[0] * t
  const iz = aPoint[1] + prevTangent[1] * t

  // Guard against runaway miter spikes at sharp corners with large draft offsets.
  const maxMiterDistance = Math.max(0.5, Math.abs(offset) * 4)
  const fromCornerX = ix - point[0]
  const fromCornerZ = iz - point[1]
  const miterDistance = Math.hypot(fromCornerX, fromCornerZ)

  if (!Number.isFinite(miterDistance) || miterDistance > maxMiterDistance) {
    const avgNormal = normalize2(prevNormal[0] + nextNormal[0], prevNormal[1] + nextNormal[1])
    return [point[0] - avgNormal[0] * offset, point[1] - avgNormal[1] * offset]
  }

  return [ix, iz]
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

function addHorizontalTriangle(
  positions: number[],
  a: Point3,
  b: Point3,
  c: Point3,
  upFacing: boolean,
): void {
  const yNormal = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
  const needsFlip = upFacing ? yNormal < 0 : yNormal > 0
  if (needsFlip) {
    addTriangle(positions, a, c, b)
  } else {
    addTriangle(positions, a, b, c)
  }
}

function triangulateHorizontalLoop(loop: Point3[]): number[][] {
  const contour = loop.map((point) => new Vector2(point[0], point[2]))
  return ShapeUtils.triangulateShape(contour, [])
}

function rotateXZAtHeight(
  x: number,
  z: number,
  y: number,
  totalTwistDegrees: number,
  fullHeight: number,
): Point2 {
  if (Math.abs(totalTwistDegrees) < 1e-9 || fullHeight < 1e-9) return [x, z]

  const t = Math.max(0, Math.min(1, y / fullHeight))
  const angle = (totalTwistDegrees * t * Math.PI) / 180
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  return [x * cosA - z * sinA, x * sinA + z * cosA]
}

function buildOffsetLoop(
  stations: Array<{
    point: Point2
    prevTangent: Point2
    nextTangent: Point2
    prevNormal: Point2
    nextNormal: Point2
  }>,
  offset: number,
): Point2[] {
  return stations.map((station) =>
    intersectOffsetLines(
      station.point,
      station.prevTangent,
      station.nextTangent,
      station.prevNormal,
      station.nextNormal,
      offset,
    ),
  )
}

function segmentsIntersect(a1: Point2, a2: Point2, b1: Point2, b2: Point2): boolean {
  const eps = 1e-9
  const dax = a2[0] - a1[0]
  const daz = a2[1] - a1[1]
  const dbx = b2[0] - b1[0]
  const dbz = b2[1] - b1[1]
  const det = dax * dbz - daz * dbx

  if (Math.abs(det) < eps) return false

  const cx = b1[0] - a1[0]
  const cz = b1[1] - a1[1]
  const t = (cx * dbz - cz * dbx) / det
  const u = (cx * daz - cz * dax) / det
  return t > eps && t < 1 - eps && u > eps && u < 1 - eps
}

function loopSelfIntersects(loop: Point2[]): boolean {
  const n = loop.length
  if (n < 4) return false

  for (let i = 0; i < n; i += 1) {
    const a1 = loop[i]
    const a2 = loop[(i + 1) % n]

    for (let j = i + 1; j < n; j += 1) {
      if (j === i) continue
      if ((j + 1) % n === i) continue
      if ((i + 1) % n === j) continue

      const b1 = loop[j]
      const b2 = loop[(j + 1) % n]
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true
      }
    }
  }

  return false
}

function loopsAreValid(
  stations: Array<{
    point: Point2
    prevTangent: Point2
    nextTangent: Point2
    prevNormal: Point2
    nextNormal: Point2
  }>,
  outerOffset: number,
  innerOffset: number,
): boolean {
  const outerLoop = buildOffsetLoop(stations, outerOffset)
  if (loopSelfIntersects(outerLoop)) return false

  const innerLoop = buildOffsetLoop(stations, innerOffset)
  if (loopSelfIntersects(innerLoop)) return false

  return true
}

function profileOffsetsAreValid(
  stations: Array<{
    point: Point2
    prevTangent: Point2
    nextTangent: Point2
    prevNormal: Point2
    nextNormal: Point2
  }>,
  outerOffsets: number[],
  innerOffsets: number[],
  scale: number,
  sampleIndices?: number[],
): boolean {
  const indices = sampleIndices ?? outerOffsets.map((_, index) => index)

  for (const index of indices) {
    if (!loopsAreValid(stations, outerOffsets[index] * scale, innerOffsets[index] * scale)) {
      return false
    }
  }

  return true
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

function getCriticalSampleIndices(outerOffsets: number[], innerOffsets: number[]): number[] {
  const last = Math.max(0, outerOffsets.length - 1)

  let maxOuterIndex = 0
  let maxInnerIndex = 0
  let maxOuter = 0
  let maxInner = 0

  for (let index = 0; index < outerOffsets.length; index += 1) {
    const outerAbs = Math.abs(outerOffsets[index])
    const innerAbs = Math.abs(innerOffsets[index])
    if (outerAbs > maxOuter) {
      maxOuter = outerAbs
      maxOuterIndex = index
    }
    if (innerAbs > maxInner) {
      maxInner = innerAbs
      maxInnerIndex = index
    }
  }

  return uniqueSorted([0, last, Math.floor(last * 0.5), maxOuterIndex, maxInnerIndex])
}

function getCoarseSampleIndices(sampleCount: number, target = 8): number[] {
  if (sampleCount <= target) {
    return Array.from({ length: sampleCount }, (_, index) => index)
  }

  const stride = Math.max(1, Math.floor(sampleCount / target))
  const values: number[] = []
  for (let index = 0; index < sampleCount; index += stride) {
    values.push(index)
  }
  values.push(sampleCount - 1)
  return uniqueSorted(values)
}

function solveGlobalProfileScale(
  stations: Array<{
    point: Point2
    prevTangent: Point2
    nextTangent: Point2
    prevNormal: Point2
    nextNormal: Point2
  }>,
  outerOffsets: number[],
  innerOffsets: number[],
): number {
  const criticalIndices = getCriticalSampleIndices(outerOffsets, innerOffsets)
  const coarseIndices = getCoarseSampleIndices(outerOffsets.length)

  if (
    profileOffsetsAreValid(stations, outerOffsets, innerOffsets, 1, criticalIndices)
    && profileOffsetsAreValid(stations, outerOffsets, innerOffsets, 1, coarseIndices)
  ) {
    return 1
  }

  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const mid = (low + high) * 0.5
    if (!profileOffsetsAreValid(stations, outerOffsets, innerOffsets, mid, criticalIndices)) {
      high = mid
    } else {
      low = mid
    }
  }

  let candidate = low
  if (!profileOffsetsAreValid(stations, outerOffsets, innerOffsets, candidate)) {
    for (let pass = 0; pass < 8; pass += 1) {
      candidate *= 0.9
      if (profileOffsetsAreValid(stations, outerOffsets, innerOffsets, candidate)) {
        break
      }
    }
  }

  return candidate
}

export function resolveEffectiveZProfilePoints(
  controls: SketchControls,
  zProfile: WallZProfile,
  topHeight?: number,
): { outer: Point2[]; inner: Point2[]; profileScale: number } {
  const rawPath = buildBaseShapePoints(controls, zProfile.wallThickness)
  const path = sanitizeClosedPath(rawPath)
  const profileHeight = Math.max(1, topHeight ?? controls.boxHeight)
  const requested = buildZProfilePoints(zProfile, profileHeight)

  if (path.length < 3 || requested.outer.length < 2 || requested.inner.length < 2) {
    return { outer: requested.outer, inner: requested.inner, profileScale: 1 }
  }

  const isCCW = polygonSignedArea(path) > 0
  const stationCount = path.length
  const stations = path.map((point, index) => {
    const prev = path[(index - 1 + stationCount) % stationCount]
    const next = path[(index + 1) % stationCount]
    const prevTangent = normalize2(point[0] - prev[0], point[1] - prev[1])
    const nextTangent = normalize2(next[0] - point[0], next[1] - point[1])
    const prevNormal = outwardNormalFromTangent(prevTangent[0], prevTangent[1], isCCW)
    const nextNormal = outwardNormalFromTangent(nextTangent[0], nextTangent[1], isCCW)
    return { point, prevTangent, nextTangent, prevNormal, nextNormal }
  })

  const requestedOuterOffsets = requested.outer.map(([offset]) => offset)
  const requestedInnerOffsets = requested.inner.map(([offset]) => offset)
  const profileScale = solveGlobalProfileScale(stations, requestedOuterOffsets, requestedInnerOffsets)

  return {
    outer: requested.outer.map(([offset, y]) => [offset * profileScale, y]),
    inner: requested.inner.map(([offset, y]) => [offset * profileScale, y]),
    profileScale,
  }
}

export function buildWallSweepGeometry(
  controls: SketchControls,
  zProfile: WallZProfile,
): BufferGeometry | null {
  const rawPath = buildBaseShapePoints(controls, zProfile.wallThickness)
  const cleanedPath = sanitizeClosedPath(rawPath)
  const path = cleanedPath
  if (path.length < 3) return null

  const isCCW = polygonSignedArea(path) > 0

  const fullHeight = Math.max(1, controls.boxHeight)
  const { outer, inner } = resolveEffectiveZProfilePoints(controls, zProfile)
  if (outer.length < 2 || inner.length < 2) return null

  const stationCount = path.length
  const sampleCount = outer.length
  const twistDegrees = controls.twistDegrees ?? 0

  const stations = path.map((point, index) => {
    const prev = path[(index - 1 + stationCount) % stationCount]
    const next = path[(index + 1) % stationCount]
    const prevTangent = normalize2(point[0] - prev[0], point[1] - prev[1])
    const nextTangent = normalize2(next[0] - point[0], next[1] - point[1])
    const prevNormal = outwardNormalFromTangent(prevTangent[0], prevTangent[1], isCCW)
    const nextNormal = outwardNormalFromTangent(nextTangent[0], nextTangent[1], isCCW)
    return { point, prevTangent, nextTangent, prevNormal, nextNormal }
  })

  const outerSafeOffsets = outer.map(([offset]) => offset)
  const innerSafeOffsets = inner.map(([offset]) => offset)

  const outerGrid: Point3[][] = stations.map((station) =>
    outer.map(([, y], sampleIndex) => {
      const offset = outerSafeOffsets[sampleIndex]
      const [x, z] = intersectOffsetLines(
        station.point,
        station.prevTangent,
        station.nextTangent,
        station.prevNormal,
        station.nextNormal,
        offset,
      )
      const [tx, tz] = rotateXZAtHeight(x, z, y, twistDegrees, fullHeight)
      return [tx, y, tz] as Point3
    }),
  )

  const innerGrid: Point3[][] = stations.map((station) =>
    inner.map(([, y], sampleIndex) => {
      const offset = innerSafeOffsets[sampleIndex]
      const [x, z] = intersectOffsetLines(
        station.point,
        station.prevTangent,
        station.nextTangent,
        station.prevNormal,
        station.nextNormal,
        offset,
      )
      const [tx, tz] = rotateXZAtHeight(x, z, y, twistDegrees, fullHeight)
      return [tx, y, tz] as Point3
    }),
  )

  const positions: number[] = []
  const floorThickness = Math.max(0.1, zProfile.bottomThickness)
  const includeTopBridge = true

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

    if (includeTopBridge) {
      const topA = outerGrid[i][sampleCount - 1]
      const topB = outerGrid[nextI][sampleCount - 1]
      const topC = innerGrid[nextI][sampleCount - 1]
      const topD = innerGrid[i][sampleCount - 1]
      addQuad(positions, topA, topB, topC, topD)
    }

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
  const floorTopLoop: Point3[] = floorBottomLoop.map(([x, y, z]) => {
    const topY = y + floorThickness
    const [tx, tz] = rotateXZAtHeight(x, z, topY, twistDegrees, fullHeight)
    return [tx, topY, tz]
  })

  if (floorTopLoop.length >= 3) {
    const floorTriangles = triangulateHorizontalLoop(floorTopLoop)
    for (const [ia, ib, ic] of floorTriangles) {
      addHorizontalTriangle(positions, floorTopLoop[ia], floorTopLoop[ib], floorTopLoop[ic], true)
      addHorizontalTriangle(positions, floorBottomLoop[ia], floorBottomLoop[ib], floorBottomLoop[ic], false)
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
