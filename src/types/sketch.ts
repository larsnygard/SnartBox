export type WallZProfileType = 'straight' | 'custom'
export type CustomZProfileShape = 'sine' | 'square' | 'customDrawn'
export type WallProfileAnchor = 'outer' | 'middle' | 'inner'
export type LidCutType = 'straight' | 'lip' | 'snap' | 'round'

export interface LidConfig {
  enabled: boolean
  cutType: LidCutType
  showCutProfile: boolean
  cutOffsetFromTop: number // mm down from top edge
  cutAngle: number // degrees, rotates the whole cut profile
  cutThickness: number // mm profile thickness; used as tolerance
  straightAngle: number // degrees, for straight style
  lipHeight: number // mm, for lip style
  lipChamferSize: number // mm, chamfer size at lip transition corners
  snapHeight: number // mm, step height for snap style
  snapFilletRadius: number // mm, fillet radius at snap transition corners
  roundRadius: number // mm radius for round style
}

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
  customPhaseShift: number // degrees
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
  customPhaseShift: 0,
  profileAnchor: 'outer',
  wallThickness: 2.0,
  bottomThickness: 2.0,
}

export const DEFAULT_LID_CONFIG: LidConfig = {
  enabled: true,
  cutType: 'straight',
  showCutProfile: true,
  cutOffsetFromTop: 6,
  cutAngle: 10,
  cutThickness: 0.35,
  straightAngle: 0,
  lipHeight: 2,
  lipChamferSize: 0.3,
  snapHeight: 1.2,
  snapFilletRadius: 0.3,
  roundRadius: 1.8,
}
export type BaseShape =
  | 'square'
  | 'circle'
  | 'triangle'
  | 'pentagon'
  | 'hexagon'
  | 'customPolygon'

export type CornerMode = 'none' | 'fillet' | 'chamfer'
export type PathWaveShape = 'sine' | 'square' | 'triangle'
export type PathWaveScope = 'whole' | 'perSide'

export interface SketchControls {
  shape: BaseShape
  scaleX: number
  scaleY: number
  useInnerDimensions: boolean
  boxHeight: number
  twistDegrees: number // total rotation from bottom to top, in degrees
  boxOpacity: number
  boxColor: string
  cornerMode: CornerMode
  cornerRadius: number  // mm
  pathWaveShape: PathWaveShape
  pathWaveScope: PathWaveScope
  pathWaveAmplitude: number  // mm
  pathWaveFrequency: number  // whole cycles around the closed path
  pathWavePhaseShift: number // degrees
  pathWaveCornerMatched: boolean // taper wave into corners using corner-angle ramps
  pathWaveSelectedSides: number[] // side indices to affect when scope is per-side
}

export const DEFAULT_SKETCH_CONTROLS: SketchControls = {
  shape: 'square',
  scaleX: 40,
  scaleY: 40,
  useInnerDimensions: false,
  boxHeight: 40,
  twistDegrees: 0,
  boxOpacity: 0.55,
  boxColor: '#5f87b8',
  cornerMode: 'none',
  cornerRadius: 5,
  pathWaveShape: 'sine',
  pathWaveScope: 'whole',
  pathWaveAmplitude: 0,
  pathWaveFrequency: 4,
  pathWavePhaseShift: 0,
  pathWaveCornerMatched: false,
  pathWaveSelectedSides: [],
}
