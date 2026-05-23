import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { SketchControls, WallZProfile, LidConfig } from '@/types/sketch'
import type { Point2, Point3 } from './types'
import {
  buildBaseShapePoints,
  sanitizeClosedPath,
  polygonSignedArea,
} from './baseShape'
import {
  normalize2,
  outwardNormalFromTangent,
  intersectOffsetLines,
  addTriangle,
  addQuad,
} from './wallSweep'

// ─── Internal helpers ──────────────────────────────────────────────────────

type Station = {
  point: Point2
  prevTangent: Point2
  nextTangent: Point2
  prevNormal: Point2
  nextNormal: Point2
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

function buildStations(path: Point2[], isCCW: boolean): Station[] {
  const n = path.length
  return path.map((point, index) => {
    const prev = path[(index - 1 + n) % n]
    const next = path[(index + 1) % n]
    const prevTangent = normalize2(point[0] - prev[0], point[1] - prev[1])
    const nextTangent = normalize2(next[0] - point[0], next[1] - point[1])
    const prevNormal = outwardNormalFromTangent(prevTangent[0], prevTangent[1], isCCW)
    const nextNormal = outwardNormalFromTangent(nextTangent[0], nextTangent[1], isCCW)
    return { point, prevTangent, nextTangent, prevNormal, nextNormal }
  })
}

/** 3-D point at (offset, y) for a given station using mitered intersection. */
function stationPoint(
  st: Station,
  offset: number,
  y: number,
  twistDegrees: number,
  fullHeight: number,
): Point3 {
  const [x, z] = intersectOffsetLines(
    st.point, st.prevTangent, st.nextTangent, st.prevNormal, st.nextNormal, offset,
  )
  const [tx, tz] = rotateXZAtHeight(x, z, y, twistDegrees, fullHeight)
  return [tx, y, tz]
}

/**
 * Inner wall offset at absolute y, matching the continuous Z-profile formula.
 */
function innerOffsetAt(zProfile: WallZProfile, y: number): number {
  const thickness = Math.max(0.6, zProfile.wallThickness)
  const slope = zProfile.straightInnerWall ? 0 : Math.tan((zProfile.insideDraft * Math.PI) / 180)
  return thickness + slope * y
}

function outerOffsetAt(zProfile: WallZProfile, y: number): number {
  const slope = Math.tan((zProfile.outsideDraft * Math.PI) / 180)
  return slope * y
}

/** Fan-fill a closed polygon loop (must be convex for correct results). */
function fanFill(positions: number[], loop: Point3[], faceUp: boolean): void {
  for (let i = 1; i < loop.length - 1; i += 1) {
    if (faceUp) {
      addTriangle(positions, loop[0], loop[i], loop[i + 1])
    } else {
      addTriangle(positions, loop[0], loop[i + 1], loop[i])
    }
  }
}

// ─── Top cap (solid panel at cut plane with configurable thickness) ───────

function addTopCap(
  positions: number[],
  stations: Station[],
  zProfile: WallZProfile,
  cutHeight: number,
  topThickness: number,
  twistDegrees: number,
  fullHeight: number,
): void {
  const capBottomY = cutHeight
  const capTopY = cutHeight + Math.max(0.1, topThickness)
  const capOffset = outerOffsetAt(zProfile, cutHeight)

  const capTopLoop = stations.map((st) => stationPoint(st, capOffset, capTopY, twistDegrees, fullHeight))
  const capBottomLoop = stations.map((st) => stationPoint(st, capOffset, capBottomY, twistDegrees, fullHeight))

  fanFill(positions, capTopLoop, true)
  fanFill(positions, capBottomLoop, false)

  const n = stations.length
  for (let i = 0; i < n; i += 1) {
    const ni = (i + 1) % n
    addQuad(positions, capTopLoop[i], capTopLoop[ni], capBottomLoop[ni], capBottomLoop[i])
  }
}

// ─── Lip geometry ─────────────────────────────────────────────────────────

/**
 * Builds a swept ring (lip) using a 2-D profile defined as an array of
 * [outerOffset, innerOffset, y] rows.  Consecutive rows are connected with
 * quads on the outer face, inner face, and cap faces at the first/last rows.
 */
function addLipRing(
  positions: number[],
  stations: Station[],
  profile: Array<[outerOffset: number, innerOffset: number, y: number]>,
  twistDegrees: number,
  fullHeight: number,
): void {
  if (profile.length < 2) return

  const n = stations.length

  // Build grid: profile.length rows × n stations
  const outerLoops: Point3[][] = profile.map(([outerOff, , y]) =>
    stations.map((st) => stationPoint(st, outerOff, y, twistDegrees, fullHeight)),
  )
  const innerLoops: Point3[][] = profile.map(([, innerOff, y]) =>
    stations.map((st) => stationPoint(st, innerOff, y, twistDegrees, fullHeight)),
  )

  // Sweep walls between consecutive profile rows
  for (let r = 0; r < profile.length - 1; r += 1) {
    for (let i = 0; i < n; i += 1) {
      const ni = (i + 1) % n
      // Outer face (facing away from axis)
      addQuad(
        positions,
        outerLoops[r][i], outerLoops[r][ni],
        outerLoops[r + 1][ni], outerLoops[r + 1][i],
      )
      // Inner face (facing toward axis)
      addQuad(
        positions,
        innerLoops[r][i], innerLoops[r + 1][i],
        innerLoops[r + 1][ni], innerLoops[r][ni],
      )
    }
  }

  // Top ring: closes the gap between outer and inner at first profile row
  const topOuter = outerLoops[0]
  const topInner = innerLoops[0]
  for (let i = 0; i < n; i += 1) {
    const ni = (i + 1) % n
    addQuad(positions, topInner[ni], topInner[i], topOuter[i], topOuter[ni])
  }

  // Bottom cap: closes at last profile row
  const btmOuter = outerLoops[outerLoops.length - 1]
  const btmInner = innerLoops[innerLoops.length - 1]
  for (let i = 0; i < n; i += 1) {
    const ni = (i + 1) % n
    addQuad(positions, btmOuter[i], btmOuter[ni], btmInner[ni], btmInner[i])
  }
}

/**
 * Inner lip — hangs downward from cutHeight, fitting inside the box opening.
 *
 *   Outer face: flush with box inner wall (innerOffsetAt(cutH))
 *   Inner face: innerOffsetAt(cutH) + lipWidth  (further toward axis)
 *
 * For snap: the outer face has a small bead at mid-height that protrudes
 * outward, creating a friction-click fit.
 */
function addInnerLip(
  positions: number[],
  stations: Station[],
  zProfile: WallZProfile,
  cutHeight: number,
  lid: LidConfig,
  twistDegrees: number,
  fullHeight: number,
): void {
  const wallInnerAtCut = innerOffsetAt(zProfile, cutHeight)
  const lipTolerance = lid.lipTolerance ?? 0.25
  const baseOffset = wallInnerAtCut + Math.max(0, lipTolerance)
  const lipInner = baseOffset + lid.lipWidth
  const topY = cutHeight
  const btmY = cutHeight - lid.lipThickness

  let profile: Array<[number, number, number]>

  if (lid.type === 'snap') {
    const snapOverhang = Math.min(0.35, Math.max(0.1, lipTolerance + 0.1))
    const midY = cutHeight - lid.lipThickness * 0.5
    const snapY = cutHeight - lid.lipThickness * 0.75
    profile = [
      [baseOffset, lipInner, topY],
      [baseOffset - snapOverhang, lipInner, midY],
      [baseOffset - snapOverhang, lipInner, snapY],
      [baseOffset, lipInner, btmY],
    ]
  } else {
    profile = [
      [baseOffset, lipInner, topY],
      [baseOffset, lipInner, btmY],
    ]
  }

  addLipRing(positions, stations, profile, twistDegrees, fullHeight)
}

// ─── Public export ────────────────────────────────────────────────────────

export function buildLidGeometry(
  controls: SketchControls,
  zProfile: WallZProfile,
  lid: LidConfig,
): BufferGeometry | null {
  if (lid.type === 'none') return null

  const lipStyle: 'none' | 'inner' = lid.lipStyle === 'inner' ? 'inner' : 'none'
  const boxHeight = Math.max(20, controls.boxHeight)
  const twistDegrees = controls.twistDegrees ?? 0
  const cutDistFromTop = Math.min(Math.max(0, lid.cutDistFromTop), boxHeight - 1)
  const cutHeight = boxHeight - cutDistFromTop

  const rawPath = buildBaseShapePoints(controls, zProfile.wallThickness)
  const cleanedPath = sanitizeClosedPath(rawPath)
  const path = cleanedPath
  if (path.length < 3) return null

  const isCCW = polygonSignedArea(path) > 0
  const stations = buildStations(path, isCCW)

  const positions: number[] = []

  // 1. Top cap built at the cut plane with explicit panel thickness.
  addTopCap(positions, stations, zProfile, cutHeight, lid.topThickness, twistDegrees, boxHeight)

  // 2. Optional inner lip only (outer lip disabled by design).
  if (lipStyle === 'inner') {
    addInnerLip(positions, stations, zProfile, cutHeight, lid, twistDegrees, boxHeight)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}
