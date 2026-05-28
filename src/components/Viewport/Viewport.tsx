// ─────────────────────────────────────────────────────────────────────────────
// components/Viewport/Viewport.tsx
//
// 3D viewport component. Renders a @react-three/fiber Canvas with the
// preview / CAD mode toggle, STL/STEP export panel, and three R3F sub-components:
//   - WallSweepPreview  — the solid 3D mesh
//   - BasePathPreview   — 2D base-shape outline
//   - ZProfileGuide     — wall Z-profile cross-section guide lines
//   - LidCutProfileGuide — preview of the future swept cut profile
//
// All geometry math lives in src/geometry/. Props: controls + zProfile.
// ─────────────────────────────────────────────────────────────────────────────

import { Canvas } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { Mesh, DoubleSide } from 'three'
import { exportStepBlob, rebuildStepCache } from '@/geometry/export/exportSTEP'
import type { LidConfig, SketchControls, WallZProfile } from '@/types/sketch'
import { buildBaseShapePoints } from '@/geometry/baseShape'
import {
  buildWallSweepGeometry,
  buildWallSweepGuideProfile,
  buildBoxAndLidGeometries,
} from '@/geometry/wallSweep'
import { buildLidCutProfileBand } from '@/geometry/lidProfile'
import { SceneSetup } from './SceneSetup'

interface ViewportProps {
  controls: SketchControls
  zProfile: WallZProfile
  lidConfig: LidConfig
  onControlsChange: (patch: Partial<SketchControls>) => void
}

type RenderStyle = 'shaded' | 'wireframe'
type ProjectionMode = 'perspective' | 'orthographic'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function interpolateGuideZAtY(
  profile: Array<[number, number, number]>,
  yTarget: number,
): number {
  if (profile.length === 0) return 0
  if (profile.length === 1) return profile[0][2]

  if (yTarget <= profile[0][1]) return profile[0][2]
  if (yTarget >= profile[profile.length - 1][1]) return profile[profile.length - 1][2]

  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i]
    const b = profile[i + 1]
    if (yTarget < a[1] || yTarget > b[1]) continue

    const dy = b[1] - a[1]
    if (Math.abs(dy) < 1e-9) return a[2]
    const t = (yTarget - a[1]) / dy
    return a[2] + (b[2] - a[2]) * t
  }

  return profile[profile.length - 1][2]
}

function BasePathPreview({ controls, zProfile }: { controls: SketchControls; zProfile: WallZProfile }) {
  const pathPoints = useMemo(() => {
    const path = buildBaseShapePoints(controls, zProfile.wallThickness)
    return path
  }, [controls, zProfile.wallThickness])

  if (pathPoints.length < 2) return null

  // Map to [x, 0, y] so the shape lies flat on the XY plane (z=0)
  const outlinePoints3D = pathPoints.map(([x, y]) => [x, 0, y] as [number, number, number])
  const closedOutline3D = [...outlinePoints3D, outlinePoints3D[0]]

  return (
    <group>
      <Line points={closedOutline3D} color="#7db7ff" lineWidth={2.5} depthTest={false} />
    </group>
  )
}

function ZProfileGuide({ controls, zProfile }: { controls: SketchControls; zProfile: WallZProfile }) {
  const { outerLine, innerLine, topLine, bottomLine } = useMemo(() => {
    const guideProfile = buildWallSweepGuideProfile(controls, zProfile)
    if (!guideProfile || guideProfile.outer.length < 2 || guideProfile.inner.length < 2) {
      return {
        outerLine: [] as [number, number, number][],
        innerLine: [] as [number, number, number][],
        topLine: [] as [number, number, number][],
        bottomLine: [] as [number, number, number][],
      }
    }

    return {
      outerLine: guideProfile.outer.map(([x, y, z]) => [x, y, z] as [number, number, number]),
      innerLine: guideProfile.inner.map(([x, y, z]) => [x, y, z] as [number, number, number]),
      topLine: [
        guideProfile.outer[guideProfile.outer.length - 1] as [number, number, number],
        guideProfile.inner[guideProfile.inner.length - 1] as [number, number, number],
      ],
      bottomLine: [
        guideProfile.outer[0] as [number, number, number],
        guideProfile.inner[0] as [number, number, number],
      ],
    }
  }, [controls, zProfile])

  if (outerLine.length < 2 || innerLine.length < 2) return null

  return (
    <group>
      <Line points={outerLine} color="#7db7ff" lineWidth={2.5} depthTest={false} />
      <Line points={innerLine} color="#8ef0b5" lineWidth={2.5} depthTest={false} />
      <Line points={topLine} color="#ffd166" lineWidth={2.5} depthTest={false} />
      <Line points={bottomLine} color="#ffd166" lineWidth={2.5} depthTest={false} />
    </group>
  )
}

function LidCutProfileGuide({
  controls,
  zProfile,
  lidConfig,
}: {
  controls: SketchControls
  zProfile: WallZProfile
  lidConfig: LidConfig
}) {
  const guide = useMemo(() => {
    const seamY = clamp(controls.boxHeight - lidConfig.cutOffsetFromTop, 0, controls.boxHeight)
    const sweepGuide = buildWallSweepGuideProfile(controls, zProfile)
    if (!sweepGuide || sweepGuide.outer.length < 2 || sweepGuide.inner.length < 2) {
      return {
        center: [] as [number, number, number][],
        upper: [] as [number, number, number][],
        lower: [] as [number, number, number][],
        startCap: [] as [number, number, number][],
        endCap: [] as [number, number, number][],
      }
    }

    const outerAtSeamZ = interpolateGuideZAtY(sweepGuide.outer, seamY)
    const innerAtSeamZ = interpolateGuideZAtY(sweepGuide.inner, seamY)
    const seamCenterZ = (outerAtSeamZ + innerAtSeamZ) * 0.5
    const localWallThickness = Math.max(0.2, Math.abs(innerAtSeamZ - outerAtSeamZ))

    const profile = buildLidCutProfileBand(lidConfig, localWallThickness)
    if (profile.center.length < 2) {
      return {
        center: [] as [number, number, number][],
        upper: [] as [number, number, number][],
        lower: [] as [number, number, number][],
        startCap: [] as [number, number, number][],
        endCap: [] as [number, number, number][],
        }
      }

    const axisX = 0
    const cutAngleRad = ((lidConfig.cutAngle ?? 0) * Math.PI) / 180
    const cosA = Math.cos(cutAngleRad)
    const sinA = Math.sin(cutAngleRad)

    const mapPoints = (points: Array<[number, number]>) =>
      points.map(([z, y]) => {
        const rz = z * cosA - y * sinA
        const ry = z * sinA + y * cosA
        return [axisX, seamY + ry, seamCenterZ + rz] as [number, number, number]
      })

    return {
      center: mapPoints(profile.center),
      upper: mapPoints(profile.upper),
      lower: mapPoints(profile.lower),
      startCap: mapPoints(profile.startCap),
      endCap: mapPoints(profile.endCap),
    }
  }, [controls, zProfile, lidConfig])

  if (guide.center.length < 2) return null

  return (
    <group>
      <Line points={guide.upper} color="#ff7f66" lineWidth={2.5} depthTest={false} />
      <Line points={guide.lower} color="#ff7f66" lineWidth={2.5} depthTest={false} />
      {guide.startCap.length === 2 && <Line points={guide.startCap} color="#ff7f66" lineWidth={2.0} depthTest={false} />}
      {guide.endCap.length === 2 && <Line points={guide.endCap} color="#ff7f66" lineWidth={2.0} depthTest={false} />}
      <Line points={guide.center} color="#ffb199" lineWidth={1.5} depthTest={false} />
    </group>
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.URL.revokeObjectURL(url)
}

function WallSweepPreview({
  controls,
  zProfile,
  renderStyle,
}: {
  controls: SketchControls
  zProfile: WallZProfile
  renderStyle: RenderStyle
}) {
  const geometry = useMemo(() => {
    return buildWallSweepGeometry(controls, zProfile)
  }, [controls, zProfile])

  if (!geometry) return null

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={controls.boxColor}
        opacity={controls.boxOpacity}
        transparent={controls.boxOpacity < 0.999}
        metalness={0.05}
        roughness={0.7}
        wireframe={renderStyle === 'wireframe'}
        side={DoubleSide}
      />
    </mesh>
  )
}

// Visual gap between lid and box in the 3D preview (mm)
const LID_PREVIEW_GAP = 2

function LidSweepPreview({
  controls,
  zProfile,
  lidConfig,
  renderStyle,
}: {
  controls: SketchControls
  zProfile: WallZProfile
  lidConfig: LidConfig
  renderStyle: RenderStyle
}) {
  const geometries = useMemo(() => {
    return buildBoxAndLidGeometries(controls, zProfile, lidConfig)
  }, [controls, zProfile, lidConfig])

  if (!geometries) return null

  const matProps = {
    color: controls.boxColor,
    opacity: controls.boxOpacity,
    transparent: controls.boxOpacity < 0.999,
    metalness: 0.05,
    roughness: 0.7,
    wireframe: renderStyle === 'wireframe',
    side: DoubleSide,
  }

  return (
    <group>
      <mesh geometry={geometries.box}>
        <meshStandardMaterial {...matProps} />
      </mesh>
      <mesh geometry={geometries.lid} position={[0, LID_PREVIEW_GAP, 0]}>
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>
  )
}

export function Viewport({ controls, zProfile, lidConfig, onControlsChange }: ViewportProps) {
  const [renderMode, setRenderMode] = useState<'preview' | 'cad'>('preview')
  const [exportFormat, setExportFormat] = useState<'stl' | 'step'>('stl')
  const [exporting, setExporting] = useState(false)
  const [cadControls, setCadControls] = useState(controls)
  const [cadZProfile, setCadZProfile] = useState(zProfile)
  const [isCadUpdating, setIsCadUpdating] = useState(false)
  const [cadStatus, setCadStatus] = useState('')
  const [showBox, setShowBox] = useState(true)
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('shaded')
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('perspective')
  const [showGrid, setShowGrid] = useState(true)
  const [showAxes, setShowAxes] = useState(true)
  const [showBaseShape, setShowBaseShape] = useState(true)
  const [showWallProfile, setShowWallProfile] = useState(true)
  const [controlsCollapsed, setControlsCollapsed] = useState(false)
  const [appearanceCollapsed, setAppearanceCollapsed] = useState(true)

  const collapsibleHeaderStyle = {
    fontSize: 11,
    color: '#8ea0b8',
    cursor: 'pointer',
    userSelect: 'none' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

  useEffect(() => {
    if (renderMode !== 'cad') return

    let cancelled = false
    setIsCadUpdating(true)
    setCadStatus('Queued STEP cache rebuild...')

    const timer = window.setTimeout(() => {
      setCadControls(controls)
      setCadZProfile(zProfile)

      void rebuildStepCache(controls, zProfile)
        .then((result) => {
          if (cancelled) return
          setCadStatus(
            result.fallbackUsed
              ? 'STEP cache rebuilt with fallback geometry.'
              : 'STEP cache rebuild complete.',
          )
        })
        .finally(() => {
          if (!cancelled) {
            setIsCadUpdating(false)
          }
        })
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [controls, zProfile, renderMode])

  const activeControls = renderMode === 'preview' ? controls : cadControls
  const activeZProfile = renderMode === 'preview' ? zProfile : cadZProfile

  const exportGeometry = useMemo(
    () => buildWallSweepGeometry(activeControls, activeZProfile),
    [activeControls, activeZProfile],
  )

  const handleExport = async () => {
    if (!exportGeometry) {
      window.alert('No geometry available to export yet.')
      return
    }

    setExporting(true)
    try {
      if (exportFormat === 'step') {
        const stepBlob = await exportStepBlob(activeControls, activeZProfile)
        downloadBlob(stepBlob, 'snartbox.step')
      } else {
        const exporter = new STLExporter()
        const mesh = new Mesh(exportGeometry)
        // Match STEP orientation: export as Z-up for CAD/slicers.
        mesh.rotation.x = Math.PI / 2
        mesh.updateMatrixWorld(true)
        const stlText = exporter.parse(mesh) as string
        downloadBlob(new Blob([stlText], { type: 'model/stl' }), 'snartbox.stl')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      window.alert(`Export failed: ${message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          background: '#101722cc',
          border: '1px solid #2a394e',
          borderRadius: 8,
          color: '#b8c8dd',
          padding: '8px 10px',
          fontSize: 12,
          lineHeight: 1.4,
          pointerEvents: 'none',
          whiteSpace: 'pre-line',
        }}
      >
        {`Mode: ${renderMode === 'preview' ? 'Preview' : 'CAD'}\nShape: ${activeControls.shape}\nSize: ${activeControls.scaleX.toFixed(0)} mm x ${activeControls.scaleY.toFixed(0)} mm${activeControls.useInnerDimensions ? ' (inner)' : ' (outer)'}\nBox Height: ${activeControls.boxHeight} mm\nWall Profile: ${activeZProfile.type}\nLid Cut: ${lidConfig.enabled ? lidConfig.cutType : 'off'}\nWall Thickness: ${activeZProfile.wallThickness.toFixed(2)} mm\nBottom Thickness: ${activeZProfile.bottomThickness.toFixed(2)} mm\nOpacity: ${Math.round(activeControls.boxOpacity * 100)}%\nColor: ${activeControls.boxColor.toUpperCase()}`}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 12,
          background: '#101722cc',
          border: '1px solid #2a394e',
          borderRadius: 8,
          color: '#b8c8dd',
          padding: 8,
          display: 'grid',
          gap: 6,
          minWidth: 176,
        }}
      >
        <div
          onClick={() => setControlsCollapsed((value) => !value)}
          style={collapsibleHeaderStyle}
          title={controlsCollapsed ? 'Expand controls' : 'Collapse controls'}
        >
          <span>View Controls</span>
          <span>{controlsCollapsed ? '+' : '−'}</span>
        </div>

        {!controlsCollapsed && (
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setRenderMode('preview')}
                style={{
                  flex: 1,
                  borderRadius: 6,
                  border: renderMode === 'preview' ? '2px solid #5f83b1' : '1px solid #2b3747',
                  background: renderMode === 'preview' ? '#243447' : '#151d27',
                  color: renderMode === 'preview' ? '#edf4ff' : '#b0bfce',
                  padding: '6px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Preview
              </button>
              <button
                onClick={() => setRenderMode('cad')}
                style={{
                  flex: 1,
                  borderRadius: 6,
                  border: renderMode === 'cad' ? '2px solid #5f83b1' : '1px solid #2b3747',
                  background: renderMode === 'cad' ? '#243447' : '#151d27',
                  color: renderMode === 'cad' ? '#edf4ff' : '#b0bfce',
                  padding: '6px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                CAD
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#8ea0b8' }}>
              {renderMode === 'preview'
                ? 'Fast mesh updates while dragging controls.'
                : isCadUpdating
                  ? 'CAD mode updating...'
                  : cadStatus || 'CAD mode ready.'}
            </div>

            <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
              <div
                onClick={() => setAppearanceCollapsed((value) => !value)}
                style={collapsibleHeaderStyle}
                title={appearanceCollapsed ? 'Expand appearance controls' : 'Collapse appearance controls'}
              >
                <span>Appearance</span>
                <span>{appearanceCollapsed ? '+' : '−'}</span>
              </div>
              {!appearanceCollapsed && (
                <>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#b8c6d8', fontSize: 12 }}>Transparency</span>
                      <span style={{ color: '#aab8cc', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round((1 - (controls.boxOpacity ?? 0.55)) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.01}
                      value={controls.boxOpacity ?? 0.55}
                      onChange={(event) => onControlsChange({ boxOpacity: Number(event.target.value) })}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                      <span style={{ color: '#b8c6d8', fontSize: 12 }}>Color</span>
                      <span style={{ color: '#aab8cc', fontSize: 12 }}>{(controls.boxColor ?? '#5f87b8').toUpperCase()}</span>
                    </div>
                    <input
                      type="color"
                      value={controls.boxColor ?? '#5f87b8'}
                      onChange={(event) => onControlsChange({ boxColor: event.target.value })}
                      style={{ width: '100%', height: 30, border: '1px solid #2b3747', borderRadius: 6, background: '#151d27' }}
                    />
                  </label>
                </>
              )}
            </div>

            <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#8ea0b8' }}>Render</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setRenderStyle('shaded')}
              style={{
                flex: 1,
                borderRadius: 6,
                border: renderStyle === 'shaded' ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: renderStyle === 'shaded' ? '#243447' : '#151d27',
                color: renderStyle === 'shaded' ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Shaded Basic
            </button>
            <button
              onClick={() => setRenderStyle('wireframe')}
              style={{
                flex: 1,
                borderRadius: 6,
                border: renderStyle === 'wireframe' ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: renderStyle === 'wireframe' ? '#243447' : '#151d27',
                color: renderStyle === 'wireframe' ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Wireframe
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#8ea0b8' }}>View</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setProjectionMode('perspective')}
              style={{
                flex: 1,
                borderRadius: 6,
                border: projectionMode === 'perspective' ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: projectionMode === 'perspective' ? '#243447' : '#151d27',
                color: projectionMode === 'perspective' ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Perspective
            </button>
            <button
              onClick={() => setProjectionMode('orthographic')}
              style={{
                flex: 1,
                borderRadius: 6,
                border: projectionMode === 'orthographic' ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: projectionMode === 'orthographic' ? '#243447' : '#151d27',
                color: projectionMode === 'orthographic' ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Orthographic
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowGrid((v) => !v)}
              style={{
                flex: 1,
                borderRadius: 6,
                border: showGrid ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: showGrid ? '#243447' : '#151d27',
                color: showGrid ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Grid
            </button>
            <button
              onClick={() => setShowAxes((v) => !v)}
              style={{
                flex: 1,
                borderRadius: 6,
                border: showAxes ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: showAxes ? '#243447' : '#151d27',
                color: showAxes ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Axis
            </button>
          </div>
        </div>

            <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#8ea0b8' }}>Visibility</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowBox((v) => !v)}
              style={{
                flex: 1,
                borderRadius: 6,
                border: showBox ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: showBox ? '#243447' : '#151d27',
                color: showBox ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Box
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowBaseShape((v) => !v)}
              style={{
                flex: 1,
                borderRadius: 6,
                border: showBaseShape ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: showBaseShape ? '#243447' : '#151d27',
                color: showBaseShape ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Base Shape
            </button>
            <button
              onClick={() => setShowWallProfile((v) => !v)}
              style={{
                flex: 1,
                borderRadius: 6,
                border: showWallProfile ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: showWallProfile ? '#243447' : '#151d27',
                color: showWallProfile ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Wall Profile
            </button>
          </div>

        </div>

            <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#8ea0b8' }}>Export</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value as 'stl' | 'step')}
              style={{
                flex: 1,
                borderRadius: 6,
                border: '1px solid #2b3747',
                background: '#151d27',
                color: '#b0bfce',
                fontSize: 12,
                padding: '6px 8px',
              }}
            >
              <option value="stl">STL</option>
              <option value="step">STEP</option>
            </select>
            <button
              onClick={handleExport}
              disabled={exporting || (renderMode === 'cad' && isCadUpdating)}
              style={{
                borderRadius: 6,
                border: '1px solid #2b3747',
                background: '#1e2f41',
                color: '#edf4ff',
                fontSize: 12,
                padding: '6px 10px',
                cursor: exporting ? 'wait' : 'pointer',
                opacity: exporting || (renderMode === 'cad' && isCadUpdating) ? 0.65 : 1,
              }}
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
            </div>
          </>
        )}
      </div>

      <Canvas
        orthographic={projectionMode === 'orthographic'}
        camera={{
          near: 0.1,
          far: 2000,
          position: [120, 120, 120],
          ...(projectionMode === 'orthographic' ? { zoom: 8 } : { fov: 50 }),
        }}
        style={{ background: '#1b232d' }}
      >
        <SceneSetup showGrid={showGrid} showAxes={showAxes} />
        {showBox && lidConfig.enabled
          ? (
            <LidSweepPreview
              controls={activeControls}
              zProfile={activeZProfile}
              lidConfig={lidConfig}
              renderStyle={renderStyle}
            />
          )
          : showBox && (
            <WallSweepPreview
              controls={activeControls}
              zProfile={activeZProfile}
              renderStyle={renderStyle}
            />
          )}
        {showBaseShape && <BasePathPreview controls={activeControls} zProfile={activeZProfile} />}
        {showWallProfile && <ZProfileGuide controls={activeControls} zProfile={activeZProfile} />}
        {lidConfig.enabled && lidConfig.showCutProfile && (
          <LidCutProfileGuide controls={activeControls} zProfile={activeZProfile} lidConfig={lidConfig} />
        )}
      </Canvas>
    </div>
  )
}
