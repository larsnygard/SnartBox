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
  const outsideSlope = Math.tan(degreesToRadians(zProfile.outsideDraft))
  const insideSlope = Math.tan(degreesToRadians(zProfile.insideDraft))
  const customAmplitude = Math.max(1, (height + yStart) * 0.08)

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples
    const y = yStart + t * height

    // Profile convention (inward-positive):
    // - Outer wall starts on path at 0
    // - Inner wall starts at +wallThickness
    let outerOffset = outsideSlope * y
    let innerOffset = thickness + insideSlope * y

    if (zProfile.type === 'custom') {
      if (zProfile.customShape === 'sine') {
        const wave = Math.sin(t * Math.PI) * customAmplitude
        outerOffset += wave
        innerOffset += wave
      } else if (zProfile.customShape === 'square') {
        const step = t < 0.33 ? 0 : t < 0.66 ? customAmplitude * 0.6 : customAmplitude * 1.2
        outerOffset += step
        innerOffset += step
      } else {
        const notch =
          t < 0.3 ? 0 :
          t < 0.5 ? customAmplitude * 0.8 :
          t < 0.78 ? -customAmplitude * 0.35 : customAmplitude
        outerOffset += notch
        innerOffset += notch
      }
    }

    outer.push([outerOffset, y])
    inner.push([innerOffset, y])
  }

  return { outer, inner }
}
