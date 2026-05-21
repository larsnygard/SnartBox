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
//       4. LidPanel          (lid type, hinge options, snap tab params)
//       5. TexturePanel      (pattern picker, depth/scale sliders, face selector)
//       6. DividersPanel     (column/row count sliders)
//       7. GridfinityPanel   (enable toggle, NxM grid, Zu height, hole options)
//
// The panel should have a dark theme to contrast with the bright viewport.
// All user interactions call the appropriate Zustand store setters.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type {
  BaseShape,
  CornerMode,
  CustomZProfileShape,
  SketchControls,
  WallZProfile,
  WallZProfileType,
} from '@/types/sketch'

interface ParameterPanelProps {
  controls: SketchControls
  onShapeChange: (shape: BaseShape) => void
  onScaleXChange: (value: number) => void
  onScaleYChange: (value: number) => void
  onUseInnerDimensionsChange: (value: boolean) => void
  onHingeWidthChange: (value: number) => void
  onBoxOpacityChange: (value: number) => void
  onBoxColorChange: (value: string) => void
  onCornerModeChange: (mode: CornerMode) => void
  onCornerRadiusChange: (value: number) => void
  onCircleCenterOffsetChange: (value: number) => void
  zProfile: WallZProfile
  onZProfileTypeChange: (type: WallZProfileType) => void
  onInsideDraftChange: (value: number) => void
  onOutsideDraftChange: (value: number) => void
  onCustomShapeChange: (shape: CustomZProfileShape) => void
  onWallThicknessChange: (value: number) => void
  onBottomThicknessChange: (value: number) => void
}

const SHAPE_OPTIONS: Array<{ value: BaseShape; label: string }> = [
  { value: 'square', label: 'Square' },
  { value: 'circleFlat', label: 'Circle + Flat Hinge Side' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'pentagon', label: 'Pentagon' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'customPolygon', label: 'Custom Polygon' },
]

const CUSTOM_SHAPE_OPTIONS: Array<{ value: CustomZProfileShape; label: string }> = [
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Square' },
  { value: 'customDrawn', label: 'Custom (Drawn)' },
]

export function ParameterPanel({
  controls,
  onShapeChange,
  onScaleXChange,
  onScaleYChange,
  onUseInnerDimensionsChange,
  onHingeWidthChange,
  onBoxOpacityChange,
  onBoxColorChange,
  onCornerModeChange,
  onCornerRadiusChange,
  onCircleCenterOffsetChange,
  zProfile,
  onZProfileTypeChange,
  onInsideDraftChange,
  onOutsideDraftChange,
  onCustomShapeChange,
  onWallThicknessChange,
  onBottomThicknessChange,
}: ParameterPanelProps) {
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
      <section style={{ width: '100%' }}>
        <div style={sectionTitleStyle}>Base Shape</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {SHAPE_OPTIONS.map((option) => {
            const isActive = controls.shape === option.value
            return (
              <button
                key={option.value}
                onClick={() => onShapeChange(option.value)}
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
      </section>
      {/* Shape Modifiers — polygon corners */}
      {['square', 'triangle', 'pentagon', 'hexagon', 'customPolygon'].includes(controls.shape) && (
        <section style={{ width: '100%' }}>
          <div style={sectionTitleStyle}>Corner Modifier</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['none', 'fillet', 'chamfer'] as CornerMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onCornerModeChange(mode)}
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
                onChange={(e) => onCornerRadiusChange(Number(e.target.value))}
              />
            </label>
          )}
        </section>
      )}

      {/* Shape Modifiers — circle hinge angle */}
      {controls.shape === 'circleFlat' && (
        <section style={{ width: '100%' }}>
          <div style={sectionTitleStyle}>Circle</div>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Center Offset</span>
              <span style={valueBadgeStyle}>{controls.circleCenterOffset.toFixed(1)} mm</span>
            </div>
            <input
              type="range"
              min={-(controls.scaleX + (controls.useInnerDimensions ? zProfile.wallThickness * 2 : 0)) / 2}
              max={300}
              step={0.5}
              value={controls.circleCenterOffset}
              onChange={(e) => onCircleCenterOffsetChange(Number(e.target.value))}
            />
            <input
              type="number"
              min={-(controls.scaleX + (controls.useInnerDimensions ? zProfile.wallThickness * 2 : 0)) / 2}
              max={300}
              step={0.5}
              value={controls.circleCenterOffset}
              onChange={(e) => onCircleCenterOffsetChange(Number(e.target.value))}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: '#151d27',
                color: '#b0bfce',
                border: '1px solid #2b3747',
                fontSize: 13,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#637080', marginTop: 2 }}>
              <span>Wraps further around</span>
              <span>Flatter arc</span>
            </div>
          </label>
        </section>
      )}
      <section style={{ width: '100%' }}>
        <div style={sectionTitleStyle}>Shape Dimensions</div>
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
              onChange={(e) => onScaleXChange(Number(e.target.value))}
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
              onChange={(e) => onScaleYChange(Number(e.target.value))}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#b8c6d8' }}>
            <input
              type="checkbox"
              checked={controls.useInnerDimensions}
              onChange={(e) => onUseInnerDimensionsChange(e.target.checked)}
            />
            <span>Inner</span>
          </label>
          <div style={{ fontSize: 11, color: '#637080', marginTop: -6 }}>
            X and Y are treated as exact inner measurements when enabled.
          </div>
        </div>
      </section>

      <section style={{ width: '100%' }}>
        <div style={sectionTitleStyle}>Hinge</div>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={sliderRowStyle}>
            <span style={{ color: '#b8c6d8' }}>Hinge Line Width</span>
            <span style={valueBadgeStyle}>{controls.hingeWidth} mm</span>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            step={1}
            value={controls.hingeWidth}
            onChange={(e) => onHingeWidthChange(Number(e.target.value))}
          />
        </label>
      </section>

      <section style={{ width: '100%' }}>
        <div style={sectionTitleStyle}>Appearance</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Box Transparency</span>
              <span style={valueBadgeStyle}>{Math.round((1 - controls.boxOpacity) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={controls.boxOpacity}
              onChange={(e) => onBoxOpacityChange(Number(e.target.value))}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Box Color</span>
              <span style={valueBadgeStyle}>{controls.boxColor.toUpperCase()}</span>
            </div>
            <input
              type="color"
              value={controls.boxColor}
              onChange={(e) => onBoxColorChange(e.target.value)}
              style={{ width: '100%', height: 34, border: '1px solid #2b3747', borderRadius: 6, background: '#151d27' }}
            />
          </label>
        </div>
      </section>

      <section style={{ width: '100%' }}>
        <div style={sectionTitleStyle}>Wall Z Profile</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => onZProfileTypeChange('straight')}
            style={profileButtonStyle(zProfile.type === 'straight')}
          >
            Straight
          </button>
          <button
            onClick={() => onZProfileTypeChange('custom')}
            style={profileButtonStyle(zProfile.type === 'custom')}
          >
            Custom
          </button>
        </div>

        {zProfile.type === 'straight' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={sliderRowStyle}>
                <span style={{ color: '#b8c6d8' }}>Inside Draft Angle</span>
                <span style={valueBadgeStyle}>{zProfile.insideDraft}&deg;</span>
              </div>
              <input
                type="range"
                min={-10}
                max={20}
                step={0.5}
                value={zProfile.insideDraft}
                onChange={(e) => onInsideDraftChange(Number(e.target.value))}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <div style={sliderRowStyle}>
                <span style={{ color: '#b8c6d8' }}>Outside Draft Angle</span>
                <span style={valueBadgeStyle}>{zProfile.outsideDraft}&deg;</span>
              </div>
              <input
                type="range"
                min={-10}
                max={20}
                step={0.5}
                value={zProfile.outsideDraft}
                onChange={(e) => onOutsideDraftChange(Number(e.target.value))}
              />
            </label>
          </div>
        )}

        {zProfile.type === 'custom' && (
          <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Custom Profile</span>
              <span style={valueBadgeStyle}>
                {CUSTOM_SHAPE_OPTIONS.find((option) => option.value === zProfile.customShape)?.label}
              </span>
            </div>
            <select
              value={zProfile.customShape}
              onChange={(e) => onCustomShapeChange(e.target.value as CustomZProfileShape)}
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
            onChange={(e) => onWallThicknessChange(Number(e.target.value))}
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
            onChange={(e) => onBottomThicknessChange(Number(e.target.value))}
          />
        </label>
      </section>
    </aside>
  )
}
