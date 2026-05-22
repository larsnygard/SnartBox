import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { SketchControls, WallZProfile, LidConfig } from '@/types/sketch'
import type { Point2, Point3 } from './types'
import {
  buildBaseShapePoints,
  sanitizeClosedPath,
  moveSeamToHingeMidpoint,
  polygonSignedArea,
} from './baseShape'
import { buildZProfilePoints } from './zProfile'
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
function stationPoint(st: Station, offset: number, y: number): Point3 {
  const [x, z] = intersectOffsetLines(
    st.point, st.prevTangent, st.nextTangent, st.prevNormal, st.nextNormal, offset,
  )
  return [x, y, z]
}

/**
 * Inner wall offset at absolute y, matching the continuous Z-profile formula.
 * Straight draft only — custom shapes use `buildZProfilePoints` for the shell.
 */
function innerOffsetAt(zProfile: WallZProfile, y: number): number {
  const thickness = Math.max(0.6, zProfile.wallThickness)
  const slope = Math.tan((zProfile.insideDraft * Math.PI) / 180)
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

// ─── Lid shell (walls from cutHeight → boxHeight) ─────────────────────────

function addLidShell(
  positions: number[],
  stations: Station[],
  zProfile: WallZProfile,
  cutHeight: number,
  boxHeight: number,
): void {
  const lidH = boxHeight - cutHeight
  if (lidH < 0.1) return

  const { outer, inner } = buildZProfilePoints(zProfile, lidH, cutHeight)
  const sampleCount = outer.length
  const stationCount = stations.length

  const outerGrid: Point3[][] = stations.map((st) =>
    outer.map(([offset, y]) => stationPoint(st, offset, y)),
  )
  const innerGrid: Point3[][] = stations.map((st) =>
    inner.map(([offset, y]) => stationPoint(st, offset, y)),
  )

  for (let i = 0; i < stationCount; i += 1) {
    const ni = (i + 1) % stationCount

    for (let j = 0; j < sampleCount - 1; j += 1) {
      // Outer wall
      addQuad(positions, outerGrid[i][j], outerGrid[ni][j], outerGrid[ni][j + 1], outerGrid[i][j + 1])
      // Inner wall (reversed winding → inward-facing normal)
      addQuad(positions, innerGrid[i][j], innerGrid[i][j + 1], innerGrid[ni][j + 1], innerGrid[ni][j])
    }

    // Top bridge at boxHeight
    addQuad(
      positions,
      outerGrid[i][sampleCount - 1], outerGrid[ni][sampleCount - 1],
      innerGrid[ni][sampleCount - 1], innerGrid[i][sampleCount - 1],
    )
  }
}

// ─── Top cap (solid panel closing the inner cavity) ───────────────────────

function addTopCap(
  positions: number[],
  stations: Station[],
  zProfile: WallZProfile,
  boxHeight: number,
  topThickness: number,
): void {
  const capTopY = boxHeight
  const capBottomY = boxHeight - Math.max(0.1, topThickness)

  const capTopLoop = stations.map((st) => stationPoint(st, innerOffsetAt(zProfile, capTopY), capTopY))
  const capBottomLoop = stations.map((st) => stationPoint(st, innerOffsetAt(zProfile, capBottomY), capBottomY))

  fanFill(positions, capTopLoop, true)   // top face — normal points up
  fanFill(positions, capBottomLoop, false) // bottom face — normal points down

  // Side edge: inner circumference of the cap panel
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
): void {
  if (profile.length < 2) return

  const n = stations.length

  // Build grid: profile.length rows × n stations
  const outerLoops: Point3[][] = profile.map(([outerOff, , y]) =>
    stations.map((st) => stationPoint(st, outerOff, y)),
  )
  const innerLoops: Point3[][] = profile.map(([, innerOff, y]) =>
    stations.map((st) => stationPoint(st, innerOff, y)),
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
): void {
  const baseOffset = innerOffsetAt(zProfile, cutHeight)
  const lipInner = baseOffset + lid.lipWidth
  const topY = cutHeight
  const btmY = cutHeight - lid.lipThickness

  let profile: Array<[number, number, number]>

  if (lid.type === 'snap') {
    const snapOverhang = 0.4
    const midY = cutHeight - lid.lipThickness * 0.5
    const snapY = cutHeight - lid.lipThickness * 0.75
    profile = [
      [baseOffset, lipInner, topY],
      [baseOffset - snapOverhang, lipInner, midY],   // bead peak (protrudes outward)
      [baseOffset - snapOverhang, lipInner, snapY],
      [baseOffset, lipInner, btmY],                  // taper back at bottom
    ]
  } else {
    profile = [
      [baseOffset, lipInner, topY],
      [baseOffset, lipInner, btmY],
    ]
  }

  addLipRing(positions, stations, profile)
}

/**
 * Outer lip — hangs downward from cutHeight, wrapping around the outside
 * of the box.
 *
 *   Inner face: flush with box outer wall (outerOffsetAt(cutH))
 *   Outer face: outerOffsetAt(cutH) − lipWidth  (protrudes outward from box)
 */
function addOuterLip(
  positions: number[],
  stations: Station[],
  zProfile: WallZProfile,
  cutHeight: number,
  lid: LidConfig,
): void {
  const baseOffset = outerOffsetAt(zProfile, cutHeight)
  const lipOuter = baseOffset - lid.lipWidth  // smaller offset = further out
  const topY = cutHeight
  const btmY = cutHeight - lid.lipThickness

  const profile: Array<[number, number, number]> = [
    [lipOuter, baseOffset, topY],
    [lipOuter, baseOffset, btmY],
  ]

  addLipRing(positions, stations, profile)
}

// ─── Public export ────────────────────────────────────────────────────────

export function buildLidGeometry(
  controls: SketchControls,
  zProfile: WallZProfile,
  lid: LidConfig,
): BufferGeometry | null {
  if (lid.type === 'none') return null

  const boxHeight = Math.max(20, controls.boxHeight)
  const cutDistFromTop = Math.min(Math.max(0, lid.cutDistFromTop), boxHeight - 1)
  const cutHeight = boxHeight - cutDistFromTop

  const rawPath = buildBaseShapePoints(controls, zProfile.wallThickness)
  const cleanedPath = sanitizeClosedPath(rawPath)
  const path = moveSeamToHingeMidpoint(cleanedPath)
  if (path.length < 3) return null

  const isCCW = polygonSignedArea(path) > 0
  const stations = buildStations(path, isCCW)

  const positions: number[] = []

  // 1. Lid shell (outer/inner walls + bridges from cutHeight to boxHeight)
  addLidShell(positions, stations, zProfile, cutHeight, boxHeight)

  // 2. Top cap (solid panel at top)
  addTopCap(positions, stations, zProfile, boxHeight, lid.topThickness)

  // 3. Lip(s)
  if (lid.lipStyle === 'inner' || lid.lipStyle === 'both') {
    addInnerLip(positions, stations, zProfile, cutHeight, lid)
  }
  if (lid.lipStyle === 'outer' || lid.lipStyle === 'both') {
    addOuterLip(positions, stations, zProfile, cutHeight, lid)
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}
