import type { SketchControls, BaseShape, CornerMode, PathWaveShape, PathWaveScope } from '@/types/sketch'
import type { Point2 } from './types'

export function getBaseShapeSideCount(shape: BaseShape): number | null {
  if (shape === 'circle') return null
  if (shape === 'square') return 4
  if (shape === 'triangle') return 3
  if (shape === 'pentagon') return 5
  if (shape === 'hexagon') return 6
  return 8
}

export function getEffectiveBaseDimensions(controls: SketchControls, wallThickness = 0) {
  const dimensionX = Math.max(1, controls.scaleX)
  const dimensionY = Math.max(1, controls.scaleY)
  const growBy = controls.useInnerDimensions ? wallThickness * 2 : 0

  return {
    outerX: dimensionX + growBy,
    outerY: dimensionY + growBy,
  }
}

export function centerPathOnBoundsCenter(path: Point2[]): Point2[] {
  if (path.length < 1) return path

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const [x, y] of path) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const centerX = (minX + maxX) * 0.5
  const centerY = (minY + maxY) * 0.5

  return path.map(([x, y]) => [x - centerX, y - centerY] as Point2)
}

export function sanitizeClosedPath(path: Point2[]): Point2[] {
  if (path.length < 2) return path

  const [fx, fz] = path[0]
  const [lx, lz] = path[path.length - 1]
  const isDuplicateEnd = Math.hypot(lx - fx, lz - fz) < 1e-6

  return isDuplicateEnd ? path.slice(0, -1) : path
}

export function polygonSignedArea(path: Point2[]): number {
  if (path.length < 3) return 0
  let area2 = 0
  for (let i = 0; i < path.length; i += 1) {
    const [x1, z1] = path[i]
    const [x2, z2] = path[(i + 1) % path.length]
    area2 += x1 * z2 - x2 * z1
  }
  return area2 * 0.5
}

export function applyCornerModifier(pts: Point2[], mode: CornerMode, radius: number): Point2[] {
  if (mode === 'none') return pts

  const n = pts.length
  const result: Point2[] = []

  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i + n - 1) % n]
    const curr = pts[i]
    const next = pts[(i + 1) % n]

    const ax = prev[0] - curr[0]
    const ay = prev[1] - curr[1]
    const bx = next[0] - curr[0]
    const by = next[1] - curr[1]

    const lenA = Math.hypot(ax, ay)
    const lenB = Math.hypot(bx, by)
    if (lenA < 1e-9 || lenB < 1e-9) {
      result.push(curr)
      continue
    }

    const uax = ax / lenA
    const uay = ay / lenA
    const ubx = bx / lenB
    const uby = by / lenB

    const r = Math.min(radius, lenA / 2, lenB / 2)
    const t1: Point2 = [curr[0] + uax * r, curr[1] + uay * r]
    const t2: Point2 = [curr[0] + ubx * r, curr[1] + uby * r]

    if (mode === 'chamfer') {
      result.push(t1, t2)
    } else {
      const dot = uax * ubx + uay * uby
      const cross = uax * uby - uay * ubx
      const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2

      if (halfAngle < 1e-6) {
        result.push(curr)
        continue
      }

      const bisX = uax + ubx
      const bisY = uay + uby
      const bisLen = Math.hypot(bisX, bisY)
      if (bisLen < 1e-9) {
        result.push(t1, t2)
        continue
      }
      const centerDist = r / Math.sin(halfAngle)
      const cx = curr[0] + (bisX / bisLen) * centerDist
      const cy = curr[1] + (bisY / bisLen) * centerDist

      const arcSamples = 8
      const startAngle = Math.atan2(t1[1] - cy, t1[0] - cx)
      const endAngle = Math.atan2(t2[1] - cy, t2[0] - cx)

      let sweep = endAngle - startAngle
      if (cross > 0) {
        if (sweep > 0) sweep -= 2 * Math.PI
      } else {
        if (sweep < 0) sweep += 2 * Math.PI
      }

      for (let s = 0; s <= arcSamples; s += 1) {
        const a = startAngle + (s / arcSamples) * sweep
        result.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
    }
  }

  return result
}

function getWaveValue(shape: PathWaveShape, phase: number): number {
  if (shape === 'sine') {
    return Math.sin(phase)
  }

  if (shape === 'square') {
    const sine = Math.sin(phase)
    return Math.abs(sine) < 1e-9 ? 0 : Math.sign(sine)
  }

  return (2 / Math.PI) * Math.asin(Math.sin(phase))
}

export function applyPathWaveModifier(
  pts: Point2[],
  shape: PathWaveShape,
  amplitude: number,
  frequency: number,
  phaseShiftDegrees: number,
  scope: PathWaveScope,
  selectedSides: number[],
  cornerMatched = false,
): Point2[] {
  if (pts.length < 2 || amplitude <= 0 || frequency <= 0) {
    return pts
  }

  const cycles = Math.max(1, Math.round(frequency))
  const selectedSet = new Set(selectedSides)
  const useSideSelection = scope === 'perSide' && selectedSet.size > 0
  const perimeter = pts.reduce((total, point, index) => {
    const next = pts[(index + 1) % pts.length]
    return total + Math.hypot(next[0] - point[0], next[1] - point[1])
  }, 0)

  if (perimeter < 1e-9) {
    return pts
  }

  const samplesPerCycle = 32
  const targetStep = perimeter / (cycles * samplesPerCycle)
  const orientation = polygonSignedArea(pts) >= 0 ? 1 : -1
  const phaseShiftRad = ((phaseShiftDegrees ?? 0) * Math.PI) / 180
  const wavePts: Point2[] = []

  let distanceAlong = 0
  for (let i = 0; i < pts.length; i += 1) {
    const start = pts[i]
    const end = pts[(i + 1) % pts.length]
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const segmentLength = Math.hypot(dx, dy)
    if (segmentLength < 1e-9) {
      continue
    }

    const stepCount = Math.max(1, Math.ceil(segmentLength / targetStep))
    const normalX = orientation > 0 ? dy / segmentLength : -dy / segmentLength
    const normalY = orientation > 0 ? -dx / segmentLength : dx / segmentLength
    const cornerFlip = cornerMatched && i % 2 === 1 ? -1 : 1

    for (let step = 0; step < stepCount; step += 1) {
      const t = step / stepCount
      const wholePhase = ((distanceAlong + t * segmentLength) / perimeter) * cycles * 2 * Math.PI
      const sidePhase = t * cycles * 2 * Math.PI
      const phase = (scope === 'perSide' ? sidePhase : wholePhase) + phaseShiftRad
      const isSideEnabled = !useSideSelection || selectedSet.has(i)
      const waveValue = isSideEnabled ? getWaveValue(shape, phase) * cornerFlip : 0
      const baseX = start[0] + dx * t
      const baseY = start[1] + dy * t
      wavePts.push([
        baseX + normalX * amplitude * waveValue,
        baseY + normalY * amplitude * waveValue,
      ])
    }

    distanceAlong += segmentLength
  }

  return wavePts.length >= 3 ? wavePts : pts
}

export function buildBaseShapePoints(controls: SketchControls, wallThickness = 0): Point2[] {
  const { outerX, outerY } = getEffectiveBaseDimensions(controls, wallThickness)

  if (controls.shape === 'circle') {
    const radiusX = outerX * 0.5
    const radiusY = outerY * 0.5
    const arcSegments = 96
    const circlePoints: Point2[] = []
    for (let i = 0; i < arcSegments; i += 1) {
      const angle = (i / arcSegments) * Math.PI * 2
      circlePoints.push([radiusX * Math.cos(angle), radiusY * Math.sin(angle)])
    }

    const centered = centerPathOnBoundsCenter(circlePoints)
    return applyPathWaveModifier(
      centered,
      controls.pathWaveShape,
      controls.pathWaveAmplitude,
      controls.pathWaveFrequency,
      controls.pathWavePhaseShift ?? 0,
      controls.pathWaveScope,
      controls.pathWaveSelectedSides,
      controls.pathWaveCornerMatched,
    )
  }

  let raw: Point2[]
  if (controls.shape === 'square') {
    raw = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
  } else {
    const sides =
      controls.shape === 'triangle' ? 3 :
      controls.shape === 'pentagon' ? 5 :
      controls.shape === 'hexagon' ? 6 : 8
    const r = 1 / (2 * Math.sin(Math.PI / sides))
    const centerY = r * Math.cos(Math.PI / sides)
    const startAngle = -Math.PI / 2 - Math.PI / sides
    raw = []
    for (let i = 0; i < sides; i += 1) {
      const angle = startAngle + (i * 2 * Math.PI) / sides
      raw.push([0.5 + r * Math.cos(angle), centerY + r * Math.sin(angle)])
    }
  }

  let pts: Point2[] = raw.map(([x, y]) => [x * outerX, y * outerY])
  pts = centerPathOnBoundsCenter(pts)

  if (controls.cornerMode !== 'none' && controls.cornerRadius > 0) {
    pts = applyCornerModifier(pts, controls.cornerMode, controls.cornerRadius)
  }

  pts = applyPathWaveModifier(
    pts,
    controls.pathWaveShape,
    controls.pathWaveAmplitude,
    controls.pathWaveFrequency,
    controls.pathWavePhaseShift ?? 0,
    controls.pathWaveScope,
    controls.pathWaveSelectedSides,
    controls.pathWaveCornerMatched,
  )

  return pts
}
