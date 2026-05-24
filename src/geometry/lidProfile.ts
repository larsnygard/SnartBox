import type { LidConfig } from '@/types/sketch'
import type { Point2 } from './types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalize2(x: number, y: number): Point2 {
  const len = Math.hypot(x, y)
  if (len < 1e-9) return [1, 0]
  return [x / len, y / len]
}

function buildOffsetPolyline(points: Point2[], distance: number): Point2[] {
  if (points.length < 2) return points

  return points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)]
    const next = points[Math.min(points.length - 1, index + 1)]
    const tangent = normalize2(next[0] - prev[0], next[1] - prev[1])
    const normal: Point2 = [-tangent[1], tangent[0]]
    return [point[0] + normal[0] * distance, point[1] + normal[1] * distance]
  })
}

function appendArc(
  points: Point2[],
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number,
) {
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments
    const angle = startAngle + (endAngle - startAngle) * t
    points.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius])
  }
}

export function buildLidCutProfilePoints(lid: LidConfig, wallThickness: number): Point2[] {
  const thickness = Math.max(0.5, wallThickness)
  const wallHalf = thickness * 0.5
  // Auto-depth: always extend beyond both wall faces enough for a reliable cut.
  const autoCutDepth = Math.max(0.35, thickness * 0.6 + lid.cutThickness * 1.5)
  const halfSpan = wallHalf + autoCutDepth

  switch (lid.cutType) {
    case 'straight': {
      const angleRad = (lid.straightAngle * Math.PI) / 180
      const tanA = Math.tan(angleRad)
      const edgeRise = halfSpan * tanA
      return [
        [-halfSpan, -edgeRise],
        [halfSpan, edgeRise],
      ]
    }
    case 'lip': {
      const lipHeight = Math.max(0.1, lid.lipHeight)
      const lowY = -lipHeight * 0.5
      const highY = lipHeight * 0.5
      const lipChamferSize = lid.lipChamferSize ?? 0.3
      const cornerChamfer = clamp(lipChamferSize, 0.01, Math.min(lipHeight * 0.45, halfSpan * 0.45))
      return [
        [-halfSpan, lowY],
        [-cornerChamfer, lowY],
        [0, lowY + cornerChamfer],
        [0, highY - cornerChamfer],
        [cornerChamfer, highY],
        [halfSpan, highY],
      ]
    }
    case 'snap': {
      const snapHeight = Math.max(0.1, lid.snapHeight)
      const lowY = -snapHeight * 0.5
      const highY = snapHeight * 0.5
      const snapFilletRadius = lid.snapFilletRadius ?? 0.3
      const filletRadius = clamp(snapFilletRadius, 0.01, Math.min(snapHeight * 0.45, halfSpan * 0.45))

      const result: Point2[] = [
        [-halfSpan, lowY],
        [-filletRadius, lowY],
      ]

      appendArc(result, 0, lowY, filletRadius, Math.PI, Math.PI * 0.5, 6)
      result.push([0, highY - filletRadius])
      appendArc(result, 0, highY, filletRadius, -Math.PI * 0.5, 0, 6)
      result.push([halfSpan, highY])

      return result
    }
    case 'round': {
      const radius = Math.max(0.2, lid.roundRadius)
      const segments = 20
      const points: Point2[] = []
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments
        const angle = Math.PI * (1 - t)
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        points.push([x, y])
      }
      const tail = Math.max(radius * 0.35, thickness * 0.2)
      points.unshift([-radius - tail, 0])
      points.push([radius + tail, 0])
      return points
    }
    default:
      return [
        [-halfSpan, 0],
        [halfSpan, 0],
      ]
  }
}

export function buildLidCutProfileBand(lid: LidConfig, wallThickness: number): {
  center: Point2[]
  upper: Point2[]
  lower: Point2[]
  startCap: Point2[]
  endCap: Point2[]
} {
  const center = buildLidCutProfilePoints(lid, wallThickness)
  const halfTolerance = Math.max(0.01, lid.cutThickness * 0.5)
  const upper = buildOffsetPolyline(center, halfTolerance)
  const lower = buildOffsetPolyline(center, -halfTolerance)

  const startCap = upper.length > 0 && lower.length > 0
    ? [lower[0], upper[0]]
    : []
  const endCap = upper.length > 0 && lower.length > 0
    ? [upper[upper.length - 1], lower[lower.length - 1]]
    : []

  return { center, upper, lower, startCap, endCap }
}
