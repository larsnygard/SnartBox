export type WallZProfileType = 'straight' | 'custom'
export type CustomZProfileShape = 'sine' | 'square' | 'customDrawn'
export type WallProfileAnchor = 'outer' | 'middle' | 'inner'

export interface WallZProfile {
  type: WallZProfileType
  // For straight
  insideDraft: number // degrees
  outsideDraft: number // degrees
  straightInnerWall: boolean
  // For custom
  customShape: CustomZProfileShape
  customAmplitude: number // mm
  customFrequency: number // cycles over full height
  profileAnchor: WallProfileAnchor
  // For both
  wallThickness: number // mm
  bottomThickness: number // mm
}

export const DEFAULT_WALL_Z_PROFILE: WallZProfile = {
  type: 'straight',
  insideDraft: 0,
  outsideDraft: 0,
  straightInnerWall: false,
  customShape: 'sine',
  customAmplitude: 3,
  customFrequency: 1,
  profileAnchor: 'outer',
  wallThickness: 2.0,
  bottomThickness: 2.0,
}
export type BaseShape =
  | 'square'
  | 'circleFlat'
  | 'triangle'
  | 'pentagon'
  | 'hexagon'
  | 'customPolygon'

export type CornerMode = 'none' | 'fillet' | 'chamfer'
export type PathWaveShape = 'sine' | 'square' | 'triangle'

export interface SketchControls {
  shape: BaseShape
  scaleX: number
  scaleY: number
  useInnerDimensions: boolean
  boxHeight: number
  boxOpacity: number
  boxColor: string
  cornerMode: CornerMode
  cornerRadius: number  // mm
  circleCenterOffset: number  // mm — signed distance from arc center to hinge line
  pathWaveShape: PathWaveShape
  pathWaveAmplitude: number  // mm
  pathWaveFrequency: number  // whole cycles around the closed path
}

export const DEFAULT_SKETCH_CONTROLS: SketchControls = {
  shape: 'square',
  scaleX: 40,
  scaleY: 40,
  useInnerDimensions: false,
  boxHeight: 40,
  boxOpacity: 0.55,
  boxColor: '#5f87b8',
  cornerMode: 'none',
  cornerRadius: 5,
  circleCenterOffset: 0,
  pathWaveShape: 'sine',
  pathWaveAmplitude: 0,
  pathWaveFrequency: 4,
}

export type LidType = 'none' | 'simple' | 'snap'
export type LipStyle = 'none' | 'inner' | 'outer' | 'both'

export interface LidConfig {
  type: LidType
  topThickness: number      // mm — thickness of the solid top panel
  cutDistFromTop: number    // mm — how far from box top the cut sits
  lipStyle: LipStyle
  lipWidth: number          // mm — how far the lip protrudes inward / outward
  lipThickness: number      // mm — height of the lip
  // hingeEnabled: boolean  // reserved — only valid when hinge line > 10 mm
}

export const DEFAULT_LID_CONFIG: LidConfig = {
  type: 'none',
  topThickness: 2,
  cutDistFromTop: 3,
  lipStyle: 'inner',
  lipWidth: 1.5,
  lipThickness: 5,
}
