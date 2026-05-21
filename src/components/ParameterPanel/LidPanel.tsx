import type { CSSProperties } from 'react'
import type { LidConfig, LidType, LipStyle } from '@/types/sketch'

interface LidPanelProps {
  lid: LidConfig
  onChange: (patch: Partial<LidConfig>) => void
}

const LID_TYPE_OPTIONS: Array<{ value: LidType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'simple', label: 'Simple' },
  { value: 'snap', label: 'Snap' },
]

const LIP_STYLE_OPTIONS: Array<{ value: LipStyle; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'inner', label: 'Inner' },
  { value: 'outer', label: 'Outer' },
  { value: 'both', label: 'Both' },
]

export function LidPanel({ lid, onChange }: LidPanelProps) {
  const sectionTitleStyle: CSSProperties = {
    color: '#dce6f5',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 12,
  }

  const subLabelStyle: CSSProperties = {
    color: '#dce6f5',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
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

  const typeButtonStyle = (active: boolean): CSSProperties => ({
    borderRadius: 8,
    border: active ? '2px solid #5f83b1' : '1px solid #2b3747',
    background: active ? '#243447' : '#151d27',
    color: active ? '#edf4ff' : '#b0bfce',
    padding: '8px 14px',
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    outline: 'none',
    minWidth: 0,
    fontSize: 13,
    boxShadow: active ? '0 2px 8px #1a2a3a33' : undefined,
    transition: 'border 0.15s, background 0.15s',
  })

  return (
    <section style={{ width: '100%' }}>
      <div style={sectionTitleStyle}>Lid</div>

      {/* Type selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        {LID_TYPE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onChange({ type: value })}
            style={typeButtonStyle(lid.type === value)}
          >
            {label}
          </button>
        ))}
      </div>

      {lid.type !== 'none' && (
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>

          {/* Cut distance from top */}
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Cut from Top</span>
              <span style={valueBadgeStyle}>{lid.cutDistFromTop.toFixed(1)} mm</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.5}
              value={lid.cutDistFromTop}
              onChange={(e) => onChange({ cutDistFromTop: Number(e.target.value) })}
            />
            <div style={{ fontSize: 11, color: '#637080' }}>
              Distance from the top where the box is cut
            </div>
          </label>

          {/* Top panel thickness */}
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={sliderRowStyle}>
              <span style={{ color: '#b8c6d8' }}>Top Thickness</span>
              <span style={valueBadgeStyle}>{lid.topThickness.toFixed(1)} mm</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={10}
              step={0.5}
              value={lid.topThickness}
              onChange={(e) => onChange({ topThickness: Number(e.target.value) })}
            />
          </label>

          {/* Lip section */}
          <div style={subLabelStyle}>Lip</div>

          {/* Lip style selector */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {LIP_STYLE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onChange({ lipStyle: value })}
                style={typeButtonStyle(lid.lipStyle === value)}
              >
                {label}
              </button>
            ))}
          </div>

          {lid.lipStyle !== 'none' && (
            <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <div style={sliderRowStyle}>
                  <span style={{ color: '#b8c6d8' }}>Lip Width</span>
                  <span style={valueBadgeStyle}>{lid.lipWidth.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={6}
                  step={0.1}
                  value={lid.lipWidth}
                  onChange={(e) => onChange({ lipWidth: Number(e.target.value) })}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <div style={sliderRowStyle}>
                  <span style={{ color: '#b8c6d8' }}>Lip Height</span>
                  <span style={valueBadgeStyle}>{lid.lipThickness.toFixed(1)} mm</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={lid.lipThickness}
                  onChange={(e) => onChange({ lipThickness: Number(e.target.value) })}
                />
                {lid.type === 'snap' && (
                  <div style={{ fontSize: 11, color: '#637080' }}>
                    Snap bead sits at mid-height of the lip
                  </div>
                )}
              </label>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
