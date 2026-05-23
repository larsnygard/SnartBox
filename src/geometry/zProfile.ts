import type { WallZProfile } from '@/types/sketch'
import type { Point2 } from './types'

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

export function buildZProfilePoints(
  zProfile: WallZProfile,
  height: number,
  yStart = 0,
): { outer: Point2[]; inner: Point2[] } {
  const samples = 32
  const outer: Point2[] = []
  const inner: Point2[] = []
  const thickness = Math.max(0.6, zProfile.wallThickness)
  const rawOutsideSlope = Math.tan(degreesToRadians(zProfile.outsideDraft))
  const rawInsideSlope = zProfile.straightInnerWall ? 0 : Math.tan(degreesToRadians(zProfile.insideDraft))
  const customAmplitude = Math.max(0, zProfile.customAmplitude)
  const customFrequency = Math.max(0.01, zProfile.customFrequency)
  const customPhaseShiftRad = (((zProfile.customPhaseShift ?? 0) * Math.PI) / 180)
  const clearance = 0.05
  const yEnd = yStart + height
  const yLimit = Math.max(Math.abs(yStart), Math.abs(yEnd), 1e-6)

  // Keep a positive wall gap over the full profile span so outer/inner cannot cross.
  const minInsideSlope = rawOutsideSlope + (clearance - thickness) / yLimit
  const maxOutsideSlope = rawInsideSlope + (thickness - clearance) / yLimit
  const insideSlope = zProfile.straightInnerWall
    ? rawInsideSlope
    : Math.max(rawInsideSlope, minInsideSlope)
  const outsideSlope = zProfile.straightInnerWall
    ? Math.min(rawOutsideSlope, maxOutsideSlope)
    : rawOutsideSlope
  const anchorOffset =
    zProfile.profileAnchor === 'inner'
      ? thickness
      : zProfile.profileAnchor === 'middle'
        ? thickness * 0.5
        : 0

  function waveUnit(shape: WallZProfile['customShape'], t: number): number {
    const phase = 2 * Math.PI * customFrequency * t + customPhaseShiftRad

    if (shape === 'sine') {
      return Math.sin(phase)
    }

    if (shape === 'square') {
      const sine = Math.sin(phase)
      return Math.abs(sine) < 1e-9 ? 0 : Math.sign(sine)
    }

    const localT = (t * customFrequency) % 1
    return localT < 0.3 ? 0 : localT < 0.5 ? 0.8 : localT < 0.78 ? -0.35 : 1
  }

  let effectiveAmplitude = customAmplitude
  if (zProfile.type === 'custom' && zProfile.straightInnerWall) {
    let maxAllowedAmplitude = Number.POSITIVE_INFINITY

    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples
      const y = yStart + t * height
      const unit = waveUnit(zProfile.customShape, t)

      if (unit <= 0) continue

      const outerNoWave = outsideSlope * y
      const innerNoWave = thickness
      const availableInwardRoom = innerNoWave - outerNoWave - clearance
      const allowedAtSample = availableInwardRoom <= 0 ? 0 : availableInwardRoom / unit
      maxAllowedAmplitude = Math.min(maxAllowedAmplitude, allowedAtSample)
    }

    if (Number.isFinite(maxAllowedAmplitude)) {
      effectiveAmplitude = Math.max(0, Math.min(customAmplitude, maxAllowedAmplitude))
    }
  }

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples
    const y = yStart + t * height

    // Base convention (inward-positive) before anchor remap:
    // - Outer wall starts on path at 0
    // - Inner wall starts at +wallThickness
    let outerBaseOffset = outsideSlope * y
    let innerBaseOffset = thickness + insideSlope * y

    if (zProfile.type === 'custom') {
      const wave = waveUnit(zProfile.customShape, t) * effectiveAmplitude
      outerBaseOffset += wave
      if (!zProfile.straightInnerWall) {
        innerBaseOffset += wave
      }
    }

    const outerOffset = outerBaseOffset - anchorOffset
    const innerOffset = innerBaseOffset - anchorOffset

    outer.push([outerOffset, y])
    inner.push([innerOffset, y])
  }

  return { outer, inner }
}
