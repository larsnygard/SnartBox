import type { SketchControls, CornerMode } from '@/types/sketch'
import type { Point2 } from './types'

export function getEffectiveBaseDimensions(controls: SketchControls, wallThickness = 0) {
  const dimensionX = Math.max(1, controls.scaleX)
  const dimensionY = Math.max(1, controls.scaleY)
  const growBy = controls.useInnerDimensions ? wallThickness * 2 : 0

  return {
    outerX: dimensionX + growBy,
    outerY: dimensionY + growBy,
  }
}

export function centerPathOnHingeMidpoint(path: Point2[]): Point2[] {
  if (path.length < 2) return path

  const hingeMidX = (path[0][0] + path[1][0]) * 0.5
  const hingeMidY = (path[0][1] + path[1][1]) * 0.5

  return path.map(([x, y]) => [x - hingeMidX, y - hingeMidY] as Point2)
}

export function sanitizeClosedPath(path: Point2[]): Point2[] {
  if (path.length < 2) return path

  const [fx, fz] = path[0]
  const [lx, lz] = path[path.length - 1]
  const isDuplicateEnd = Math.hypot(lx - fx, lz - fz) < 1e-6

  return isDuplicateEnd ? path.slice(0, -1) : path
}

export function moveSeamToHingeMidpoint(path: Point2[]): Point2[] {
  if (path.length < 3) return path

  // The hinge midpoint is always at the origin (path is centered on it).
  // Find the edge that contains (0, 0) and start the loop from there.
  const n = path.length
  for (let i = 0; i < n; i += 1) {
    const a = path[i]
    const b = path[(i + 1) % n]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const lenSq = dx * dx + dz * dz
    if (lenSq < 1e-12) continue
    const t = (-a[0] * dx + -a[1] * dz) / lenSq
    if (t < -1e-6 || t > 1 + 1e-6) continue
    const px = a[0] + t * dx
    const pz = a[1] + t * dz
    if (Math.hypot(px, pz) > 0.5) continue
    // Origin lies on edge i → (i+1). Rearrange so the loop starts from (0, 0).
    const nextIdx = (i + 1) % n
    return [[0, 0] as Point2, ...path.slice(nextIdx), ...path.slice(0, nextIdx)]
  }

  // Fallback: no edge contains origin, use midpoint of first segment.
  const p0 = path[0]
  const p1 = path[1]
  const hingeMid: Point2 = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5]
  return [hingeMid, ...path.slice(1), p0]
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

export function buildBaseShapePoints(controls: SketchControls, wallThickness = 0): Point2[] {
  const { outerX, outerY } = getEffectiveBaseDimensions(controls, wallThickness)

  if (controls.shape === 'circleFlat') {
    const chordWidth = outerX
    const halfChord = chordWidth / 2
    const centerOffset = Math.max(-halfChord, controls.circleCenterOffset)
    const centerX = halfChord
    const centerY = centerOffset
    const radius = Math.hypot(halfChord, centerOffset)
    const startAngle = Math.atan2(-centerY, chordWidth - centerX)
    let endAngle = Math.atan2(-centerY, -centerX)

    if (endAngle <= startAngle) {
      endAngle += 2 * Math.PI
    }

    const arcSegments = 64
    const circlePoints: Point2[] = [[0, 0], [chordWidth, 0]]
    for (let i = 1; i <= arcSegments; i += 1) {
      const t = i / arcSegments
      const angle = startAngle + (endAngle - startAngle) * t
      circlePoints.push([
        centerX + radius * Math.cos(angle),
        centerY + radius * Math.sin(angle),
      ])
    }

    return centerPathOnHingeMidpoint(circlePoints)
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
  pts = centerPathOnHingeMidpoint(pts)

  if (controls.cornerMode !== 'none' && controls.cornerRadius > 0) {
    pts = applyCornerModifier(pts, controls.cornerMode, controls.cornerRadius)
  }

  return pts
}
