// ─────────────────────────────────────────────────────────────────────────────
// components/ParameterPanel/ParameterPanel.tsx
//
// The left sidebar containing all box design parameters.
// Renders collapsible sections for each sub-panel.
//
// Layout:
//   - Fixed-width scrollable sidebar (~320px)
//   - Each section is a collapsible accordion item
//   - Sections in order:
//       1. ShapePanel        (box profile selector)
//       2. DimensionsPanel   (width, depth, height sliders)
//       3. WallPanel         (wall thickness, floor thickness, corner radius)
//       4. LidPanel          (lid cut profile selector and tuning)
//       5. WallZProfilePanel (profile type, anchor, and profile-specific controls)
//
// The panel should have a dark theme to contrast with the bright viewport.
// All user interactions call the appropriate Zustand store setters.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import type {
  BaseShape,
  CornerMode,
  CustomZProfileShape,
  LidConfig,
  LidCutType,
  PathWaveScope,
  PathWaveShape,
  SketchControls,
  WallProfileAnchor,
  WallZProfile,
  WallZProfileType,
} from '@/types/sketch'
import { getBaseShapeSideCount } from '@/geometry/baseShape'

interface ParameterPanelProps {
  controls: SketchControls
  zProfile: WallZProfile
  lidConfig: LidConfig
  onControlsChange: (patch: Partial<SketchControls>) => void
  onZProfileChange: (patch: Partial<WallZProfile>) => void
  onLidConfigChange: (patch: Partial<LidConfig>) => void
}

const SHAPE_OPTIONS: Array<{ value: BaseShape; label: string }> = [
  { value: 'square', label: 'Square' },
  { value: 'circle', label: 'Circle' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'customPolygon', label: 'Custom Polygon' },
]

const PATH_WAVE_OPTIONS: Array<{ value: PathWaveShape; label: string }> = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
]

const PATH_WAVE_SCOPE_OPTIONS: Array<{ value: PathWaveScope; label: string }> = [
  { value: 'whole', label: 'Whole Shape' },
  { value: 'perSide', label: 'Per Side' },
]

const CUSTOM_SHAPE_OPTIONS: Array<{ value: CustomZProfileShape; label: string }> = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'customDrawn', label: 'Custom (Drawn)' },
]

const PROFILE_ANCHOR_OPTIONS: Array<{ value: WallProfileAnchor; label: string }> = [
  { value: 'outer', label: 'Outer' },
  { value: 'middle', label: 'Middle' },
  { value: 'inner', label: 'Inner' },
]

const LID_CUT_OPTIONS: Array<{ value: LidCutType; label: string }> = [
  { value: 'straight', label: 'Straight' },
  { value: 'lip', label: 'Lip' },
  { value: 'snap', label: 'Snap' },
  { value: 'round', label: 'Round' },
]

type AccordionSection = 'baseShape' | 'pathWave' | 'lid' | 'zProfile'

const COLLAPSIBLE_SECTIONS: AccordionSection[] = ['baseShape', 'pathWave', 'lid', 'zProfile']

export function ParameterPanel({
  controls,
  zProfile,
  lidConfig,
  onControlsChange,
  onZProfileChange,
  onLidConfigChange,
}: ParameterPanelProps) {
  const [openSections, setOpenSections] = useState<Record<AccordionSection, boolean>>({
    baseShape: true,
    pathWave: false,
    lid: false,
    zProfile: false,
  })
  const pathSideCount = getBaseShapeSideCount(controls.shape)
  const twistDegrees = controls.twistDegrees ?? 0
  const pathWavePhaseShift = controls.pathWavePhaseShift ?? 0
  const customProfilePhaseShift = zProfile.customPhaseShift ?? 0
  const allPathSides = pathSideCount === null
    ? []
    : Array.from({ length: pathSideCount }, (_, index) => index)

  const sectionTitleStyle: CSSProperties = {
    color: '#dce6f5',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 12,
  }

  const sliderRowStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 8,
    alignItems: 'center',
  }

  const valueBadgeStyle: CSSProperties = {
    minWidth: 58,
    textAlign: 'right',
    color: '#aab8cc',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  }

  const accordionHeaderStyle = (active: boolean): CSSProperties => ({
    ...sectionTitleStyle,
    marginBottom: active ? 12 : 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    userSelect: 'none',
  })

  const setAllSections = (isOpen: boolean) => {
    setOpenSections({
      baseShape: isOpen,
      pathWave: isOpen,
      lid: isOpen,
      zProfile: isOpen,
    })
  }

  const toggleSection = (section: AccordionSection) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const profileButtonStyle = (active: boolean): CSSProperties => ({
    borderRadius: 8,
    border: active ? '2px solid #5f83b1' : '1px solid #2b3747',
    background: active ? '#243447' : '#151d27',
    color: active ? '#edf4ff' : '#b0bfce',
    padding: '8px 14px',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    outline: 'none',
    minWidth: 0,
  })

  const compactTopButtonStyle = (active: boolean): CSSProperties => ({
    borderRadius: 7,
    border: active ? '2px solid #5f83b1' : '1px solid #2b3747',
    background: active ? '#243447' : '#151d27',
    color: active ? '#edf4ff' : '#b0bfce',
    padding: '5px 10px',
    fontWeight: active ? 700 : 600,
    fontSize: 12,
    lineHeight: 1.1,
    cursor: 'pointer',
    outline: 'none',
    minWidth: 0,
  })

  return (
    <aside
      style={{
        width: 320,
        height: '100%',
        background: '#11161d',
        borderRight: '1px solid #202833',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: 16,
        color: '#8c97a8',
        fontSize: 13,
        overflowY: 'auto',
      }}
    >
      <section className="sb-logo sb-logo-panel" aria-label="SnartBox logo">
        <svg viewBox="0 0 64 64" className="sb-logo-icon" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="sbLogoFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6EA8D7" />
              <stop offset="100%" stopColor="#3F6F97" />
            </linearGradient>
          </defs>
          <path
            d="M8 22 32 9l24 13-24 13z"
            fill="url(#sbLogoFill)"
            stroke="#9BC3E6"
            strokeWidth="1.5"
          />
          <path d="M8 22v20l24 13V35z" fill="#264661" stroke="#9BC3E6" strokeWidth="1.5" />
          <path d="M56 22v20L32 55V35z" fill="#315C7E" stroke="#9BC3E6" strokeWidth="1.5" />
          <path d="M20 28h24" stroke="#E6F3FF" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        </svg>
        <div className="sb-logo-wordmark">
          <span className="sb-logo-snart">Snart</span>
          <span className="sb-logo-box">Box</span>
        </div>
      </section>

      <section style={{ width: '100%', marginTop: -4 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setAllSections(true)}
            style={compactTopButtonStyle(COLLAPSIBLE_SECTIONS.every((section) => openSections[section]))}
          >
            Expand All
          </button>
          <button
            onClick={() => setAllSections(false)}
            style={compactTopButtonStyle(COLLAPSIBLE_SECTIONS.every((section) => !openSections[section]))}
          >
            Close All
          </button>
        </div>
      </section>

      <section style={{ width: '100%' }}>
        <div
          style={accordionHeaderStyle(openSections.baseShape)}
          onClick={() => toggleSection('baseShape')}
        >
          <span>Base Shape</span>
          <span>{openSections.baseShape ? '−' : '+'}</span>
        </div>
        {openSections.baseShape && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {SHAPE_OPTIONS.map((option) => {
            const isActive = controls.shape === option.value
            return (
              <button
                key={option.value}
                onClick={() => onControlsChange({ shape: option.value as BaseShape })}
                style={{
                  borderRadius: 8,
                  border: isActive ? '2px solid #5f83b1' : '1px solid #2b3747',
                  background: isActive ? '#243447' : '#151d27',
                  color: isActive ? '#edf4ff' : '#b0bfce',
                  padding: '8px 14px',
                  minWidth: 0,
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  outline: 'none',
                  boxShadow: isActive ? '0 2px 8px #1a2a3a33' : undefined,
                  transition: 'border 0.15s, background 0.15s',
                }}
              >
                {option.label}
              </button>
            )
          })}
          </div>
        )}
      </section>

      <section style={{ width: '100%' }}>
        <div
          style={accordionHeaderStyle(openSections.pathWave)}
          onClick={() => toggleSection('pathWave')}
        >
          <span>Path Wave Modifier</span>
          <span>{openSections.pathWave ? '−' : '+'}</span>
        </div>
        {openSections.pathWave && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {PATH_WAVE_OPTIONS.map((option) => {
            const isActive = controls.pathWaveShape === option.value
            return (
              <button
                key={option.value}
                onClick={() => onControlsChange({ pathWaveShape: option.value })}
                style={profileButtonStyle(isActive)}
              >
                {option.label}
              </button>
            )
          })}
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Amplitude</span>
              <span style={valueBadgeStyle}>{controls.pathWaveAmplitude.toFixed(1)} mm</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={0.1}
              value={controls.pathWaveAmplitude}
              onChange={(e) => onControlsChange({ pathWaveAmplitude: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Frequency</span>
              <span style={valueBadgeStyle}>{controls.pathWaveFrequency.toFixed(0)} cycles</span>
            </div>
            <input
              type="range"
              min={0}
              max={32}
              step={1}
              value={controls.pathWaveFrequency}
              onChange={(e) => onControlsChange({ pathWaveFrequency: Number(e.target.value) })}
            />
            <div style={{ fontSize: 11, color: '#637080' }}>
              Whole cycles keep the seam in phase and avoid artifacts.
            </div>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Phase Shift</span>
              <span style={valueBadgeStyle}>{pathWavePhaseShift.toFixed(0)}&deg;</span>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={pathWavePhaseShift}
              onChange={(e) => onControlsChange({ pathWavePhaseShift: Number(e.target.value) })}
            />
          </label>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ color: '#b8c6d8' }}>Scope</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PATH_WAVE_SCOPE_OPTIONS.map((option) => {
                const isActive = controls.pathWaveScope === option.value
                const isDisabled = option.value === 'perSide' && pathSideCount === null
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (isDisabled) return
                      onControlsChange(
                        option.value === 'perSide'
                          ? { pathWaveScope: option.value, pathWaveSelectedSides: allPathSides }
                          : { pathWaveScope: option.value },
                      )
                    }}
                    disabled={isDisabled}
                    style={{
                      ...profileButtonStyle(isActive),
                      opacity: isDisabled ? 0.5 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            {pathSideCount === null && (
              <div style={{ fontSize: 11, color: '#637080' }}>
                Per-side mode is only available for polygon shapes.
              </div>
            )}
          </div>

          {controls.pathWaveScope === 'perSide' && pathSideCount !== null && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ color: '#b8c6d8' }}>Modified Sides</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {allPathSides.map((sideIndex) => {
                  const isActive = controls.pathWaveSelectedSides.includes(sideIndex)
                  return (
                    <button
                      key={`path-side-${sideIndex}`}
                      onClick={() => {
                        const nextSides = isActive
                          ? controls.pathWaveSelectedSides.filter((index) => index !== sideIndex)
                          : [...controls.pathWaveSelectedSides, sideIndex].sort((a, b) => a - b)
                        onControlsChange({ pathWaveSelectedSides: nextSides })
                      }}
                      style={profileButtonStyle(isActive)}
                    >
                      {`Side ${sideIndex + 1}`}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#b8c6d8' }}>
            <input
              type="checkbox"
              checked={controls.pathWaveCornerMatched}
              onChange={(e) => onControlsChange({ pathWaveCornerMatched: e.target.checked })}
            />
            <span>Flip Wave at Corners</span>
          </label>
          <div style={{ fontSize: 11, color: '#637080', marginTop: -8 }}>
            Alternates wave polarity at each corner to avoid convex/concave corner buildup.
          </div>
            </div>
          </>
        )}
      </section>

      {/* Shape Modifiers — polygon corners */}
      {['square', 'triangle', 'pentagon', 'hexagon', 'customPolygon'].includes(controls.shape) && (
        <section style={{ width: '100%' }}>
          <div style={sectionTitleStyle}>Corner Modifier</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['none', 'fillet', 'chamfer'] as CornerMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onControlsChange({ cornerMode: mode })}
                style={profileButtonStyle(controls.cornerMode === mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {controls.cornerMode !== 'none' && (
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={sliderRowStyle}>
                <span style={{ color: '#b8c6d8' }}>
                  {controls.cornerMode === 'fillet' ? 'Fillet Radius' : 'Chamfer Length'}
                </span>
                <span style={valueBadgeStyle}>{controls.cornerRadius.toFixed(1)} mm</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={controls.cornerRadius}
                onChange={(e) => onControlsChange({ cornerRadius: Number(e.target.value) })}
              />
            </label>
          )}
        </section>
      )}

      <section style={{ width: '100%' }}>
        <div style={sectionTitleStyle}>Dimensions</div>
        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>X Dimension</span>
              <span style={valueBadgeStyle}>{controls.scaleX.toFixed(0)} mm</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={1}
              value={controls.scaleX}
              onChange={(e) => onControlsChange({ scaleX: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Y Dimension</span>
              <span style={valueBadgeStyle}>{controls.scaleY.toFixed(0)} mm</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={1}
              value={controls.scaleY}
              onChange={(e) => onControlsChange({ scaleY: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Box Height</span>
              <span style={valueBadgeStyle}>{controls.boxHeight} mm</span>
            </div>
            <input
              type="range"
              min={10}
              max={300}
              step={1}
              value={controls.boxHeight}
              onChange={(e) => onControlsChange({ boxHeight: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Twist</span>
              <span style={valueBadgeStyle}>{twistDegrees.toFixed(0)}&deg;</span>
            </div>
            <input
              type="range"
              min={-360}
              max={360}
              step={1}
              value={twistDegrees}
              onChange={(e) => onControlsChange({ twistDegrees: Number(e.target.value) })}
            />
            <div style={{ fontSize: 11, color: '#637080' }}>
              Total rotation from bottom to top.
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#b8c6d8' }}>
            <input
              type="checkbox"
              checked={controls.useInnerDimensions}
              onChange={(e) => onControlsChange({ useInnerDimensions: e.target.checked })}
            />
            <span>Inner</span>
          </label>
          <div style={{ fontSize: 11, color: '#637080', marginTop: -6 }}>
            X and Y are treated as exact inner measurements when enabled.
          </div>
        </div>
      </section>

      <section style={{ width: '100%' }}>
        <div
          style={accordionHeaderStyle(openSections.lid)}
          onClick={() => toggleSection('lid')}
        >
          <span>Lid</span>
          <span>{openSections.lid ? '−' : '+'}</span>
        </div>
        {openSections.lid && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#b8c6d8', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={lidConfig.enabled}
                onChange={(e) => onLidConfigChange({ enabled: e.target.checked })}
              />
              <span>Enable Lid Cut Profile</span>
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {LID_CUT_OPTIONS.map((option) => {
                const isActive = lidConfig.cutType === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => onLidConfigChange({ cutType: option.value })}
                    style={profileButtonStyle(isActive)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#b8c6d8', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={lidConfig.showCutProfile}
                onChange={(e) => onLidConfigChange({ showCutProfile: e.target.checked })}
              />
              <span>Show Cut Profile Guide</span>
            </label>

            <div style={{ display: 'grid', gap: 10 }}>
              {(() => {
                const cutAngle = lidConfig.cutAngle ?? 0
                return (
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={sliderRowStyle}>
                      <span style={{ color: '#b8c6d8' }}>Cut Angle</span>
                      <span style={valueBadgeStyle}>{cutAngle.toFixed(1)}&deg;</span>
                    </div>
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      step={0.1}
                      value={cutAngle}
                      onChange={(e) => onLidConfigChange({ cutAngle: Number(e.target.value) })}
                    />
                  </label>
                )
              })()}

              <label style={{ display: 'grid', gap: 6 }}>
                <div style={sliderRowStyle}>
                  <span style={{ color: '#b8c6d8' }}>Offset From Top</span>
                  <span style={valueBadgeStyle}>{lidConfig.cutOffsetFromTop.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={0.1}
                  value={lidConfig.cutOffsetFromTop}
                  onChange={(e) => onLidConfigChange({ cutOffsetFromTop: Number(e.target.value) })}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <div style={sliderRowStyle}>
                  <span style={{ color: '#b8c6d8' }}>Tolerance (Thickness)</span>
                  <span style={valueBadgeStyle}>{lidConfig.cutThickness.toFixed(2)} mm</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={2}
                  step={0.01}
                  value={lidConfig.cutThickness}
                  onChange={(e) => onLidConfigChange({ cutThickness: Number(e.target.value) })}
                />
              </label>

              {lidConfig.cutType === 'straight' && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={sliderRowStyle}>
                    <span style={{ color: '#b8c6d8' }}>Angle</span>
                    <span style={valueBadgeStyle}>{lidConfig.straightAngle.toFixed(1)}&deg;</span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={0.05}
                    value={lidConfig.straightAngle}
                    onChange={(e) => onLidConfigChange({ straightAngle: Number(e.target.value) })}
                  />
                </label>
              )}

              {lidConfig.cutType === 'lip' && (
                <>
                  {(() => {
                    const lipChamferSize = lidConfig.lipChamferSize ?? 0.3
                    return (
                      <>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={sliderRowStyle}>
                      <span style={{ color: '#b8c6d8' }}>Lip Height</span>
                      <span style={valueBadgeStyle}>{lidConfig.lipHeight.toFixed(2)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={8}
                      step={0.05}
                      value={lidConfig.lipHeight}
                      onChange={(e) => onLidConfigChange({ lipHeight: Number(e.target.value) })}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={sliderRowStyle}>
                      <span style={{ color: '#b8c6d8' }}>Chamfer Size</span>
                      <span style={valueBadgeStyle}>{lipChamferSize.toFixed(2)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0.01}
                      max={2}
                      step={0.01}
                      value={lipChamferSize}
                      onChange={(e) => onLidConfigChange({ lipChamferSize: Number(e.target.value) })}
                    />
                  </label>
                      </>
                    )
                  })()}
                </>
              )}

              {lidConfig.cutType === 'snap' && (
                <>
                  {(() => {
                    const snapFilletRadius = lidConfig.snapFilletRadius ?? 0.3
                    return (
                      <>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={sliderRowStyle}>
                      <span style={{ color: '#b8c6d8' }}>Snap Height</span>
                      <span style={valueBadgeStyle}>{lidConfig.snapHeight.toFixed(2)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={6}
                      step={0.05}
                      value={lidConfig.snapHeight}
                      onChange={(e) => onLidConfigChange({ snapHeight: Number(e.target.value) })}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={sliderRowStyle}>
                      <span style={{ color: '#b8c6d8' }}>Fillet Radius</span>
                      <span style={valueBadgeStyle}>{snapFilletRadius.toFixed(2)} mm</span>
                    </div>
                    <input
                      type="range"
                      min={0.01}
                      max={2}
                      step={0.01}
                      value={snapFilletRadius}
                      onChange={(e) => onLidConfigChange({ snapFilletRadius: Number(e.target.value) })}
                    />
                  </label>
                      </>
                    )
                  })()}
                </>
              )}

              {lidConfig.cutType === 'round' && (
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={sliderRowStyle}>
                    <span style={{ color: '#b8c6d8' }}>Round Radius</span>
                    <span style={valueBadgeStyle}>{lidConfig.roundRadius.toFixed(2)} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={8}
                    step={0.05}
                    value={lidConfig.roundRadius}
                    onChange={(e) => onLidConfigChange({ roundRadius: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          </>
        )}
      </section>

      <section style={{ width: '100%' }}>
        <div
          style={accordionHeaderStyle(openSections.zProfile)}
          onClick={() => toggleSection('zProfile')}
        >
          <span>Wall Z Profile</span>
          <span>{openSections.zProfile ? '−' : '+'}</span>
        </div>
        {openSections.zProfile && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => onZProfileChange({ type: 'straight' as WallZProfileType })}
            style={profileButtonStyle(zProfile.type === 'straight')}
          >
            Straight
          </button>
          <button
            onClick={() => onZProfileChange({ type: 'custom' as WallZProfileType })}
            style={profileButtonStyle(zProfile.type === 'custom')}
          >
            Custom
          </button>
            </div>

            <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          <div style={sliderRowStyle}>
            <span style={{ color: '#b8c6d8' }}>Sweep Anchor</span>
            <span style={valueBadgeStyle}>
              {PROFILE_ANCHOR_OPTIONS.find((option) => option.value === zProfile.profileAnchor)?.label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PROFILE_ANCHOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onZProfileChange({ profileAnchor: option.value })}
                style={profileButtonStyle(zProfile.profileAnchor === option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#b8c6d8', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={zProfile.straightInnerWall}
            onChange={(e) => onZProfileChange({ straightInnerWall: e.target.checked })}
          />
          <span>Straight Inner Wall</span>
            </label>

            <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Outside Draft Angle</span>
              <span style={valueBadgeStyle}>{zProfile.outsideDraft}&deg;</span>
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={zProfile.outsideDraft}
              onChange={(e) => onZProfileChange({ outsideDraft: Number(e.target.value) })}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Inside Draft Angle</span>
              <span style={valueBadgeStyle}>{zProfile.straightInnerWall ? 0 : zProfile.insideDraft}&deg;</span>
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.5}
              value={zProfile.straightInnerWall ? 0 : zProfile.insideDraft}
              disabled={zProfile.straightInnerWall}
              onChange={(e) => onZProfileChange({ insideDraft: Number(e.target.value) })}
            />
          </label>
            </div>

            {zProfile.type === 'custom' && (
              <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={sliderRowStyle}>
                <span style={{ color: '#b8c6d8' }}>Custom Profile</span>
                <span style={valueBadgeStyle}>
                  {CUSTOM_SHAPE_OPTIONS.find((option) => option.value === zProfile.customShape)?.label}
                </span>
              </div>
              <select
                value={zProfile.customShape}
                onChange={(e) => onZProfileChange({ customShape: e.target.value as CustomZProfileShape })}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: '#151d27',
                  color: '#b0bfce',
                  border: '1px solid #2b3747',
                  fontSize: 13,
                }}
              >
                {CUSTOM_SHAPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div style={sliderRowStyle}>
                <span style={{ color: '#b8c6d8' }}>Profile Amplitude</span>
                <span style={valueBadgeStyle}>{zProfile.customAmplitude.toFixed(1)} mm</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={0.1}
                value={zProfile.customAmplitude}
                onChange={(e) => onZProfileChange({ customAmplitude: Number(e.target.value) })}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div style={sliderRowStyle}>
                <span style={{ color: '#b8c6d8' }}>Profile Frequency</span>
                <span style={valueBadgeStyle}>{zProfile.customFrequency.toFixed(2)} cycles</span>
              </div>
              <input
                type="range"
                min={0.25}
                max={10}
                step={0.25}
                value={zProfile.customFrequency}
                onChange={(e) => onZProfileChange({ customFrequency: Number(e.target.value) })}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div style={sliderRowStyle}>
                <span style={{ color: '#b8c6d8' }}>Profile Phase Shift</span>
                <span style={valueBadgeStyle}>{customProfilePhaseShift.toFixed(0)}&deg;</span>
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={customProfilePhaseShift}
                onChange={(e) => onZProfileChange({ customPhaseShift: Number(e.target.value) })}
              />
            </label>
              </div>
            )}

            <label style={{ display: 'grid', gap: 6 }}>
          <div style={sliderRowStyle}>
            <span style={{ color: '#b8c6d8' }}>Wall Thickness</span>
            <span style={valueBadgeStyle}>{zProfile.wallThickness.toFixed(2)} mm</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.01}
            value={zProfile.wallThickness}
            onChange={(e) => onZProfileChange({ wallThickness: Number(e.target.value) })}
          />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
          <div style={sliderRowStyle}>
            <span style={{ color: '#b8c6d8' }}>Bottom Thickness</span>
            <span style={valueBadgeStyle}>{zProfile.bottomThickness.toFixed(2)} mm</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.01}
            value={zProfile.bottomThickness}
            onChange={(e) => onZProfileChange({ bottomThickness: Number(e.target.value) })}
          />
            </label>
          </>
        )}
      </section>

    </aside>
  )
}
