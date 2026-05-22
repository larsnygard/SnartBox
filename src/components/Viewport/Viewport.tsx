// ─────────────────────────────────────────────────────────────────────────────
// components/Viewport/Viewport.tsx
//
// 3D viewport component. Renders a @react-three/fiber Canvas with the
// preview / CAD mode toggle, STL/STEP export panel, and three R3F sub-components:
//   - WallSweepPreview  — the solid 3D mesh
//   - BasePathPreview   — 2D base-shape outline + orange hinge line
//   - ZProfileGuide     — wall Z-profile cross-section guide lines
//
// All geometry math lives in src/geometry/. Props: controls + zProfile.
// ─────────────────────────────────────────────────────────────────────────────

import { Canvas } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { Mesh, DoubleSide } from 'three'
import { exportStepBlob, rebuildOpenCascadeStepCache } from '@/geometry/export/exportSTEP'
import type { LidConfig, SketchControls, WallZProfile } from '@/types/sketch'
import { buildBaseShapePoints, getEffectiveBaseDimensions } from '@/geometry/baseShape'
import { buildZProfilePoints } from '@/geometry/zProfile'
import { buildWallSweepGeometry } from '@/geometry/wallSweep'
import { buildLidGeometry } from '@/geometry/lid'
import { SceneSetup } from './SceneSetup'

interface ViewportProps {
  controls: SketchControls
  zProfile: WallZProfile
  lidConfig: LidConfig
}

type RenderStyle = 'shaded' | 'wireframe'

function BasePathPreview({ controls, zProfile }: { controls: SketchControls; zProfile: WallZProfile }) {
  const { pathPoints, hingeLine3D } = useMemo(() => {
    const path = buildBaseShapePoints(controls, zProfile.wallThickness)
    const { outerX } = getEffectiveBaseDimensions(controls, zProfile.wallThickness)
    // Hinge endpoints are always at ±outerX/2 on Y=0 after centering, regardless of corner mods.
    const hx = outerX / 2
    return {
      pathPoints: path,
      hingeLine3D: [[-hx, 0, 0], [hx, 0, 0]] as [number, number, number][],
    }
  }, [controls, zProfile.wallThickness])

  if (pathPoints.length < 2) return null

  // Map to [x, 0, y] so the shape lies flat on the XY plane (z=0)
  const outlinePoints3D = pathPoints.map(([x, y]) => [x, 0, y] as [number, number, number])
  const closedOutline3D = [...outlinePoints3D, outlinePoints3D[0]]

  return (
    <group>
      <Line points={closedOutline3D} color="#7db7ff" lineWidth={2.5} depthTest={false} />
      <Line points={hingeLine3D} color="#ff8b3d" lineWidth={4} depthTest={false} />
    </group>
  )
}

function ZProfileGuide({ controls, zProfile }: { controls: SketchControls; zProfile: WallZProfile }) {
  const { outerLine, innerLine, topLine, bottomLine } = useMemo(() => {
    const profileHeight = Math.max(20, controls.boxHeight)
    const { outer, inner } = buildZProfilePoints(zProfile, profileHeight)
    // Hinge midpoint is always at the origin after centering.
    const hingeMidX = 0

    return {
      outerLine: outer.map(([z, y]) => [hingeMidX, y, z] as [number, number, number]),
      innerLine: inner.map(([z, y]) => [hingeMidX, y, z] as [number, number, number]),
      topLine: [
        [hingeMidX, outer[outer.length - 1][1], outer[outer.length - 1][0]] as [number, number, number],
        [hingeMidX, inner[inner.length - 1][1], inner[inner.length - 1][0]] as [number, number, number],
      ],
      bottomLine: [
        [hingeMidX, outer[0][1], outer[0][0]] as [number, number, number],
        [hingeMidX, inner[0][1], inner[0][0]] as [number, number, number],
      ],
    }
  }, [controls, zProfile])

  return (
    <group>
      <Line points={outerLine} color="#7db7ff" lineWidth={2.5} depthTest={false} />
      <Line points={innerLine} color="#8ef0b5" lineWidth={2.5} depthTest={false} />
      <Line points={topLine} color="#ffd166" lineWidth={2.5} depthTest={false} />
      <Line points={bottomLine} color="#ffd166" lineWidth={2.5} depthTest={false} />
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
  cutHeight,
  renderStyle,
}: {
  controls: SketchControls
  zProfile: WallZProfile
  cutHeight?: number
  renderStyle: RenderStyle
}) {
  const geometry = useMemo(() => {
    return buildWallSweepGeometry(controls, zProfile, cutHeight)
  }, [controls, zProfile, cutHeight])

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

function LidPreview({
  controls,
  zProfile,
  lidConfig,
  cutHeight,
  renderStyle,
}: {
  controls: SketchControls
  zProfile: WallZProfile
  lidConfig: LidConfig
  cutHeight: number
  renderStyle: RenderStyle
}) {
  const geometry = useMemo(
    () => buildLidGeometry(controls, zProfile, lidConfig),
    [controls, zProfile, lidConfig],
  )

  if (!geometry) return null

  return (
    <group position={[0, cutHeight, 0]}>
      <mesh geometry={geometry} position={[0, -cutHeight, 0]}>
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
    </group>
  )
}

export function Viewport({ controls, zProfile, lidConfig }: ViewportProps) {
  const [renderMode, setRenderMode] = useState<'preview' | 'cad'>('preview')
  const [exportFormat, setExportFormat] = useState<'stl' | 'step'>('stl')
  const [exporting, setExporting] = useState(false)
  const [cadControls, setCadControls] = useState(controls)
  const [cadZProfile, setCadZProfile] = useState(zProfile)
  const [cadLidConfig, setCadLidConfig] = useState(lidConfig)
  const [isCadUpdating, setIsCadUpdating] = useState(false)
  const [cadStatus, setCadStatus] = useState('')
  const [showBox, setShowBox] = useState(true)
  const [showLid, setShowLid] = useState(true)
  const [renderStyle, setRenderStyle] = useState<RenderStyle>('shaded')
  const [showGrid, setShowGrid] = useState(true)
  const [showAxes, setShowAxes] = useState(true)

  useEffect(() => {
    if (renderMode !== 'cad') return

    let cancelled = false
    setIsCadUpdating(true)
    setCadStatus('Queued OpenCascade rebuild...')

    const timer = window.setTimeout(() => {
      setCadControls(controls)
      setCadZProfile(zProfile)
      setCadLidConfig(lidConfig)

      void rebuildOpenCascadeStepCache(controls, zProfile)
        .then((result) => {
          if (cancelled) return
          if (result.errorMessage) {
            console.warn('OpenCascade rebuild failed, using fallback STEP cache:', result.errorMessage)
          }
          setCadStatus(
            result.fromOpenCascade
              ? 'OpenCascade rebuild complete.'
              : 'OpenCascade unavailable, using fallback STEP cache.',
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
  }, [controls, zProfile, lidConfig, renderMode])

  const activeControls = renderMode === 'preview' ? controls : cadControls
  const activeZProfile = renderMode === 'preview' ? zProfile : cadZProfile
  const activeLidConfig = renderMode === 'preview' ? lidConfig : cadLidConfig

  const activeCutHeight = useMemo(() => {
    if (activeLidConfig.type === 'none') return undefined
    const bh = Math.max(20, activeControls.boxHeight)
    return bh - Math.min(Math.max(0, activeLidConfig.cutDistFromTop), bh - 1)
  }, [activeLidConfig, activeControls.boxHeight])

  const exportGeometry = useMemo(
    () => buildWallSweepGeometry(activeControls, activeZProfile, activeCutHeight),
    [activeControls, activeZProfile, activeCutHeight],
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
        {`Mode: ${renderMode === 'preview' ? 'Preview' : 'CAD'}\nShape: ${activeControls.shape}\nSize: ${activeControls.scaleX.toFixed(0)} mm x ${activeControls.scaleY.toFixed(0)} mm${activeControls.useInnerDimensions ? ' (inner)' : ' (outer)'}\nBox Height: ${activeControls.boxHeight} mm\nLid: ${activeLidConfig.type}${activeCutHeight !== undefined ? ` (cut at ${activeCutHeight.toFixed(1)} mm)` : ''}\nWall Profile: ${activeZProfile.type}\nWall Thickness: ${activeZProfile.wallThickness.toFixed(2)} mm\nBottom Thickness: ${activeZProfile.bottomThickness.toFixed(2)} mm\nOpacity: ${Math.round(activeControls.boxOpacity * 100)}%\nColor: ${activeControls.boxColor.toUpperCase()}`}
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
            <button
              onClick={() => setShowLid((v) => !v)}
              disabled={activeLidConfig.type === 'none'}
              style={{
                flex: 1,
                borderRadius: 6,
                border: showLid && activeLidConfig.type !== 'none' ? '2px solid #5f83b1' : '1px solid #2b3747',
                background: showLid && activeLidConfig.type !== 'none' ? '#243447' : '#151d27',
                color: activeLidConfig.type === 'none' ? '#4a5568' : showLid ? '#edf4ff' : '#b0bfce',
                padding: '6px 8px',
                fontSize: 12,
                cursor: activeLidConfig.type === 'none' ? 'not-allowed' : 'pointer',
              }}
            >
              Lid
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
      </div>

      <Canvas
        camera={{
          fov: 50,
          near: 0.1,
          far: 2000,
          position: [120, 120, 120], // default is Y-up
        }}
        style={{ background: '#1b232d' }}
      >
        <SceneSetup showGrid={showGrid} showAxes={showAxes} />
        {showBox && (
          <WallSweepPreview
            controls={activeControls}
            zProfile={activeZProfile}
            cutHeight={activeCutHeight}
            renderStyle={renderStyle}
          />
        )}
        {showLid && activeCutHeight !== undefined && (
          <LidPreview
            controls={activeControls}
            zProfile={activeZProfile}
            lidConfig={activeLidConfig}
            cutHeight={activeCutHeight}
            renderStyle={renderStyle}
          />
        )}
        <BasePathPreview controls={activeControls} zProfile={activeZProfile} />
        <ZProfileGuide controls={activeControls} zProfile={activeZProfile} />
      </Canvas>
    </div>
  )
}
