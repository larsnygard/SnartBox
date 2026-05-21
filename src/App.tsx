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

export default function App() {
  const [controls, setControls] = useState<SketchControls>(DEFAULT_SKETCH_CONTROLS)
  const [zProfile, setZProfile] = useState<WallZProfile>(DEFAULT_WALL_Z_PROFILE)
  const [lidConfig, setLidConfig] = useState<LidConfig>(DEFAULT_LID_CONFIG)

  const updateControls = (patch: Partial<SketchControls>) => {
    setControls((prev) => ({ ...prev, ...patch }))
  }

  const updateZProfile = (patch: Partial<WallZProfile>) => {
    setZProfile((prev) => ({ ...prev, ...patch }))
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
      }}
    >
      <ParameterPanel
        controls={controls}
        zProfile={zProfile}
        lidConfig={lidConfig}
        onControlsChange={updateControls}
        onZProfileChange={updateZProfile}
        onLidConfigChange={updateLidConfig}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Viewport controls={controls} zProfile={zProfile} lidConfig={lidConfig} />
      </div>
    </div>
  )
}
