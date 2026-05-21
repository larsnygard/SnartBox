// ─────────────────────────────────────────────────────────────────────────────
// App.tsx
//
// Minimal shell layout:
//   - Empty left panel (fixed width)
//   - Viewport on the right (fills remaining area)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { ParameterPanel } from '@/components/ParameterPanel/ParameterPanel'
import { Viewport } from '@/components/Viewport/Viewport'
import {
  DEFAULT_SKETCH_CONTROLS,
  DEFAULT_WALL_Z_PROFILE,
  type BaseShape,
  type CornerMode,
  type CustomZProfileShape,
  type SketchControls,
  type WallZProfile,
  type WallZProfileType,
} from '@/types/sketch'

export default function App() {
  const [controls, setControls] = useState<SketchControls>(DEFAULT_SKETCH_CONTROLS)
  const [zProfile, setZProfile] = useState<WallZProfile>(DEFAULT_WALL_Z_PROFILE)

  const setShape = (shape: BaseShape) => {
    setControls((prev) => ({ ...prev, shape }))
  }

  const setScaleX = (scaleX: number) => {
    setControls((prev) => ({ ...prev, scaleX }))
  }

  const setScaleY = (scaleY: number) => {
    setControls((prev) => ({ ...prev, scaleY }))
  }

  const setUseInnerDimensions = (useInnerDimensions: boolean) => {
    setControls((prev) => ({ ...prev, useInnerDimensions }))
  }

  const setHingeWidth = (hingeWidth: number) => {
    setControls((prev) => ({ ...prev, hingeWidth }))
  }

  const setBoxOpacity = (boxOpacity: number) => {
    setControls((prev) => ({ ...prev, boxOpacity }))
  }

  const setBoxColor = (boxColor: string) => {
    setControls((prev) => ({ ...prev, boxColor }))
  }

  const setCornerMode = (cornerMode: CornerMode) => {
    setControls((prev) => ({ ...prev, cornerMode }))
  }

  const setCornerRadius = (cornerRadius: number) => {
    setControls((prev) => ({ ...prev, cornerRadius }))
  }

  const setCircleCenterOffset = (circleCenterOffset: number) => {
    setControls((prev) => ({ ...prev, circleCenterOffset }))
  }

  const setZProfileType = (type: WallZProfileType) => {
    setZProfile((prev) => ({ ...prev, type }))
  }

  const setInsideDraft = (insideDraft: number) => {
    setZProfile((prev) => ({ ...prev, insideDraft }))
  }

  const setOutsideDraft = (outsideDraft: number) => {
    setZProfile((prev) => ({ ...prev, outsideDraft }))
  }

  const setCustomShape = (customShape: CustomZProfileShape) => {
    setZProfile((prev) => ({ ...prev, customShape }))
  }

  const setWallThickness = (wallThickness: number) => {
    setZProfile((prev) => ({ ...prev, wallThickness }))
  }

  const setBottomThickness = (bottomThickness: number) => {
    setZProfile((prev) => ({ ...prev, bottomThickness }))
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <ParameterPanel
        controls={controls}
        onShapeChange={setShape}
        onScaleXChange={setScaleX}
        onScaleYChange={setScaleY}
        onUseInnerDimensionsChange={setUseInnerDimensions}
        onHingeWidthChange={setHingeWidth}
        onBoxOpacityChange={setBoxOpacity}
        onBoxColorChange={setBoxColor}
        onCornerModeChange={setCornerMode}
        onCornerRadiusChange={setCornerRadius}
        onCircleCenterOffsetChange={setCircleCenterOffset}
        zProfile={zProfile}
        onZProfileTypeChange={setZProfileType}
        onInsideDraftChange={setInsideDraft}
        onOutsideDraftChange={setOutsideDraft}
        onCustomShapeChange={setCustomShape}
        onWallThicknessChange={setWallThickness}
        onBottomThicknessChange={setBottomThickness}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Viewport controls={controls} zProfile={zProfile} />
      </div>
    </div>
  )
}
