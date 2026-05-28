import { useState } from 'react'
import { ParameterPanel } from '@/components/ParameterPanel/ParameterPanel'
import { Viewport } from '@/components/Viewport/Viewport'
import {
  DEFAULT_LID_CONFIG,
  DEFAULT_SKETCH_CONTROLS,
  DEFAULT_WALL_Z_PROFILE,
  type LidConfig,
  type SketchControls,
  type WallZProfile,
} from '@/types/sketch'
import { getBaseShapeSideCount } from '@/geometry/baseShape'

const APP_VERSION = 'v0.1.0'

export default function App() {
  const [controls, setControls] = useState<SketchControls>(DEFAULT_SKETCH_CONTROLS)
  const [zProfile, setZProfile] = useState<WallZProfile>(DEFAULT_WALL_Z_PROFILE)
  const [lidConfig, setLidConfig] = useState<LidConfig>(DEFAULT_LID_CONFIG)

  const updateControls = (patch: Partial<SketchControls>) => {
    setControls((prev) => {
      const next: SketchControls = { ...prev, ...patch }
      const sideCount = getBaseShapeSideCount(next.shape)

      if (sideCount === null) {
        next.pathWaveScope = 'whole'
        next.pathWaveSelectedSides = []
        return next
      }

      const filtered = next.pathWaveSelectedSides
        .filter((index) => Number.isInteger(index) && index >= 0 && index < sideCount)

      if (next.pathWaveScope === 'perSide') {
        next.pathWaveSelectedSides = filtered.length > 0
          ? filtered
          : Array.from({ length: sideCount }, (_, index) => index)
      } else {
        next.pathWaveSelectedSides = filtered
      }

      return next
    })
  }

  const updateZProfile = (patch: Partial<WallZProfile>) => {
    setZProfile((prev) => {
      const next: WallZProfile = { ...prev, ...patch }

      const outsideDraftChanged = patch.outsideDraft !== undefined
      const insideDraftExplicitlyChanged = patch.insideDraft !== undefined

      // Relative coupling: changing outside draft shifts inside draft by the same delta,
      // unless inside is being changed explicitly in the same update.
      if (outsideDraftChanged && !insideDraftExplicitlyChanged) {
        const outsideDelta = (patch.outsideDraft as number) - prev.outsideDraft
        next.insideDraft = prev.insideDraft + outsideDelta
      }

      return next
    })
  }

  const updateLidConfig = (patch: Partial<LidConfig>) => {
    setLidConfig((prev) => ({ ...prev, ...patch }))
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div className="sb-version">{APP_VERSION}</div>

      <ParameterPanel
        controls={controls}
        zProfile={zProfile}
        lidConfig={lidConfig}
        onControlsChange={updateControls}
        onZProfileChange={updateZProfile}
        onLidConfigChange={updateLidConfig}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Viewport
          controls={controls}
          zProfile={zProfile}
          lidConfig={lidConfig}
          onControlsChange={updateControls}
        />
      </div>
    </div>
  )
}
