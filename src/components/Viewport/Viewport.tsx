// ─────────────────────────────────────────────────────────────────────────────
// components/Viewport/Viewport.tsx
//
// The main 3D viewport component. Renders a @react-three/fiber Canvas that
// fills the available space and contains the full 3D scene.
//
// Responsibilities:
//   - Render a <Canvas> with a perspective camera (fov 50, near 0.1, far 2000)
//   - Provide ambient + directional lighting for a clean CAD-style look
//   - Render <SceneSetup /> for environment, grid, and camera controls
//   - Keep the scene empty while the next construction pipeline is implemented
//   - Show a spinner overlay while isBuilding === true (from store)
//   - Show an error overlay if buildError is set
//   - Display a "OCCT Loading..." overlay while occtReady === false
//   - The Canvas background should be a neutral dark grey (#1a1a2e or similar)
//
// Props: none (reads everything from Zustand store)
//
// Layout note: This component takes up the right ~70% of the screen.
// The left 30% is the ParameterPanel. Both are arranged by App.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import { Canvas } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three'
import { DoubleSide } from 'three'
import { exportStepBlob } from '@/geometry/export/exportSTEP'
import type { SketchControls, WallZProfile } from '@/types/sketch'
import { SceneSetup } from './SceneSetup'

interface ViewportProps {
  controls: SketchControls
  zProfile: WallZProfile
}

type Point2 = [number, number]
type Point3 = [number, number, number]

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}

function getEffectiveBaseDimensions(controls: SketchControls, wallThickness = 0) {
  const dimensionX = Math.max(1, controls.scaleX)
  const dimensionY = Math.max(1, controls.scaleY)
  const growBy = controls.useInnerDimensions ? wallThickness * 2 : 0

  return {
    outerX: dimensionX + growBy,
    outerY: dimensionY + growBy,
  }
}

function buildZProfilePoints(zProfile: WallZProfile, height: number) {
  const samples = 32
  const outer: Point2[] = []
  const inner: Point2[] = []
  const thickness = Math.max(0.6, zProfile.wallThickness)
  const outsideSlope = Math.tan(degreesToRadians(zProfile.outsideDraft))
  const insideSlope = Math.tan(degreesToRadians(zProfile.insideDraft))
  const customAmplitude = Math.max(1, height * 0.08)

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples
    const y = t * height

    // Profile convention (inward-positive):
    // - Outer wall starts on path at 0
    // - Inner wall starts at +wallThickness
    let outerOffset = outsideSlope * y
    let innerOffset = thickness + insideSlope * y

    if (zProfile.type === 'custom') {
      if (zProfile.customShape === 'sine') {
        const wave = Math.sin(t * Math.PI) * customAmplitude
        outerOffset += wave
        innerOffset += wave
      } else if (zProfile.customShape === 'square') {
        const step = t < 0.33 ? 0 : t < 0.66 ? customAmplitude * 0.6 : customAmplitude * 1.2
        outerOffset += step
        innerOffset += step
      } else {
        const notch =
          t < 0.3 ? 0 :
          t < 0.5 ? customAmplitude * 0.8 :
          t < 0.78 ? -customAmplitude * 0.35 : customAmplitude
        outerOffset += notch
        innerOffset += notch
      }
    }

    outer.push([outerOffset, y])
    inner.push([innerOffset, y])
  }

  return { outer, inner }
}

function buildBaseShapePoints(controls: SketchControls, wallThickness = 0): Point2[] {
  const { outerX, outerY } = getEffectiveBaseDimensions(controls, wallThickness)

  if (controls.shape === 'circleFlat') {
    // Keep hinge chord fixed on y=0 before recentering on its midpoint.
    // circleCenterOffset is the signed center distance to hinge line (mm).
    const chordWidth = outerX
    const halfChord = chordWidth / 2
    const centerOffset = Math.max(-halfChord, controls.circleCenterOffset)
    const centerX = halfChord
    const centerY = centerOffset
    const radius = Math.hypot(halfChord, centerOffset)
    const startAngle = Math.atan2(-centerY, chordWidth - centerX)
    let endAngle = Math.atan2(-centerY, -centerX)

    if (endAngle <= startAngle) {
      endAngle += 2 * Math.PI
    }

    const arcSegments = 64
    const circlePoints: Point2[] = [[0, 0], [chordWidth, 0]]
    for (let i = 1; i <= arcSegments; i += 1) {
      const t = i / arcSegments
      const angle = startAngle + (endAngle - startAngle) * t
      circlePoints.push([
        centerX + radius * Math.cos(angle),
        centerY + radius * Math.sin(angle),
      ])
    }

    return centerPathOnHingeMidpoint(circlePoints)
  }

  let raw: Point2[]
  if (controls.shape === 'square') {
    raw = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]
  } else {
    const sides =
      controls.shape === 'triangle' ? 3 :
      controls.shape === 'pentagon' ? 5 :
      controls.shape === 'hexagon' ? 6 : 8
    const radius = 1 / (2 * Math.sin(Math.PI / sides))
    const centerY = radius * Math.cos(Math.PI / sides)
    const startAngle = -Math.PI / 2 - Math.PI / sides
    raw = []
    for (let i = 0; i < sides; i += 1) {
      const angle = startAngle + (i * 2 * Math.PI) / sides
      raw.push([0.5 + radius * Math.cos(angle), centerY + radius * Math.sin(angle)])
    }
  }

  // Scale
  let pts: Point2[] = raw.map(([x, y]) => [x * outerX, y * outerY])

  // Center the hinge midpoint on the origin.
  pts = centerPathOnHingeMidpoint(pts)

  // Apply fillet or chamfer to polygon corners (not circleFlat)
  if (controls.cornerMode !== 'none' && controls.cornerRadius > 0) {
    pts = applyCornerModifier(pts, controls.cornerMode, controls.cornerRadius)
  }

  return pts
}

function applyCornerModifier(pts: Point2[], mode: 'fillet' | 'chamfer', radius: number): Point2[] {
  const n = pts.length
  const result: Point2[] = []

  for (let i = 0; i < n; i += 1) {
    // Keep the hinge edge anchored at its original endpoints.
    // The first two vertices define the hinge line and must not move.
    if (i === 0 || i === 1) {
      result.push(pts[i])
      continue
    }

    const prev = pts[(i + n - 1) % n]
    const curr = pts[i]
    const next = pts[(i + 1) % n]

    // Vectors from curr to prev and curr to next
    const ax = prev[0] - curr[0]
    const ay = prev[1] - curr[1]
    const bx = next[0] - curr[0]
    const by = next[1] - curr[1]

    const lenA = Math.hypot(ax, ay)
    const lenB = Math.hypot(bx, by)
    if (lenA < 1e-9 || lenB < 1e-9) {
      result.push(curr)
      continue
    }

    // Unit vectors
    const uax = ax / lenA
    const uay = ay / lenA
    const ubx = bx / lenB
    const uby = by / lenB

    // Clamp radius so it doesn't exceed half the edge lengths
    const r = Math.min(radius, lenA / 2, lenB / 2)

    // Tangent points (moving back r along each edge)
    const t1: Point2 = [curr[0] + uax * r, curr[1] + uay * r]
    const t2: Point2 = [curr[0] + ubx * r, curr[1] + uby * r]

    if (mode === 'chamfer') {
      result.push(t1, t2)
    } else {
      // Fillet: arc from t1 to t2
      // Find angle of turn
      const dot = uax * ubx + uay * uby
      const cross = uax * uby - uay * ubx
      const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2

      if (halfAngle < 1e-6) {
        result.push(curr)
        continue
      }

      // Arc center is r / sin(halfAngle) from corner along bisector
      const bisX = (uax + ubx)
      const bisY = (uay + uby)
      const bisLen = Math.hypot(bisX, bisY)
      if (bisLen < 1e-9) {
        result.push(t1, t2)
        continue
      }
      const centerDist = r / Math.sin(halfAngle)
      const cx = curr[0] + (bisX / bisLen) * centerDist
      const cy = curr[1] + (bisY / bisLen) * centerDist

      // Arc from t1 to t2 around (cx, cy)
      const arcSamples = 8
      const startAngle = Math.atan2(t1[1] - cy, t1[0] - cx)
      const endAngle = Math.atan2(t2[1] - cy, t2[0] - cx)

      // Choose sweep direction based on cross product sign
      let sweep = endAngle - startAngle
      if (cross > 0) {
        // Turn left — arc sweeps clockwise (negative)
        if (sweep > 0) sweep -= 2 * Math.PI
      } else {
        // Turn right — arc sweeps counter-clockwise (positive)
        if (sweep < 0) sweep += 2 * Math.PI
      }

      for (let s = 0; s <= arcSamples; s += 1) {
        const a = startAngle + (s / arcSamples) * sweep
        result.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
    }
  }

  return result
}

function sanitizeClosedPath(path: Point2[]): Point2[] {
  if (path.length < 2) return path

  const [fx, fz] = path[0]
  const [lx, lz] = path[path.length - 1]
  const isDuplicateEnd = Math.hypot(lx - fx, lz - fz) < 1e-6

  return isDuplicateEnd ? path.slice(0, -1) : path
}

function centerPathOnHingeMidpoint(path: Point2[]): Point2[] {
  if (path.length < 2) return path

  const hingeMidX = (path[0][0] + path[1][0]) * 0.5
  const hingeMidY = (path[0][1] + path[1][1]) * 0.5

  return path.map(([x, y]) => [x - hingeMidX, y - hingeMidY] as Point2)
}

function moveSeamToHingeMidpoint(path: Point2[]): Point2[] {
  if (path.length < 3) return path

  const p0 = path[0]
  const p1 = path[1]
  const hingeMid: Point2 = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5]

  // Start the loop from the hinge midpoint instead of corner p0.
  // This keeps sweep stitching away from a corner.
  return [hingeMid, ...path.slice(1), p0]
}

function polygonSignedArea(path: Point2[]) {
  if (path.length < 3) return 0
  let area2 = 0
  for (let i = 0; i < path.length; i += 1) {
    const [x1, z1] = path[i]
    const [x2, z2] = path[(i + 1) % path.length]
    area2 += x1 * z2 - x2 * z1
  }
  return area2 * 0.5
}

function normalize2(dx: number, dz: number): Point2 {
  const length = Math.hypot(dx, dz)
  if (length < 1e-9) {
    return [1, 0]
  }
  return [dx / length, dz / length]
}

function outwardNormalFromTangent(tx: number, tz: number, isCCW: boolean): Point2 {
  return isCCW ? [tz, -tx] : [-tz, tx]
}

function intersectOffsetLines(
  point: Point2,
  prevTangent: Point2,
  nextTangent: Point2,
  prevNormal: Point2,
  nextNormal: Point2,
  offset: number,
): Point2 {
  const aPoint: Point2 = [point[0] - prevNormal[0] * offset, point[1] - prevNormal[1] * offset]
  const bPoint: Point2 = [point[0] - nextNormal[0] * offset, point[1] - nextNormal[1] * offset]

  const det = prevTangent[0] * nextTangent[1] - prevTangent[1] * nextTangent[0]
  if (Math.abs(det) < 1e-9) {
    const avgNormal = normalize2(prevNormal[0] + nextNormal[0], prevNormal[1] + nextNormal[1])
    return [point[0] - avgNormal[0] * offset, point[1] - avgNormal[1] * offset]
  }

  const deltaX = bPoint[0] - aPoint[0]
  const deltaZ = bPoint[1] - aPoint[1]
  const t = (deltaX * nextTangent[1] - deltaZ * nextTangent[0]) / det

  return [
    aPoint[0] + prevTangent[0] * t,
    aPoint[1] + prevTangent[1] * t,
  ]
}

function addTriangle(positions: number[], a: Point3, b: Point3, c: Point3) {
  positions.push(a[0], a[1], a[2])
  positions.push(b[0], b[1], b[2])
  positions.push(c[0], c[1], c[2])
}

function addQuad(positions: number[], a: Point3, b: Point3, c: Point3, d: Point3) {
  addTriangle(positions, a, b, c)
  addTriangle(positions, a, c, d)
}

function BasePathPreview({ controls, zProfile }: { controls: SketchControls; zProfile: WallZProfile }) {
  const pathPoints = useMemo(() => buildBaseShapePoints(controls, zProfile.wallThickness), [controls, zProfile.wallThickness])

  if (pathPoints.length < 2) return null

  // Map to [x, 0, y] so the shape lies flat on the XY plane (z=0)
  const outlinePoints3D = pathPoints.map(([x, y]) => [x, 0, y] as [number, number, number])
  const closedOutline3D = [...outlinePoints3D, outlinePoints3D[0]]
  const hingeLine3D = [outlinePoints3D[0], outlinePoints3D[1]]

  return (
    <group>
      <Line points={closedOutline3D} color="#7db7ff" lineWidth={2.5} depthTest={false} />
      <Line points={hingeLine3D} color="#ff8b3d" lineWidth={4} depthTest={false} />
    </group>
  )
}

function ZProfileGuide({ controls, zProfile }: { controls: SketchControls; zProfile: WallZProfile }) {
  const { outerLine, innerLine, topLine, bottomLine } = useMemo(() => {
    const profileHeight = Math.max(20, controls.hingeWidth * 0.9)
    const { outer, inner } = buildZProfilePoints(zProfile, profileHeight)
    const basePath = buildBaseShapePoints(controls, zProfile.wallThickness)
    const hingeMidX = basePath.length >= 2 ? (basePath[0][0] + basePath[1][0]) * 0.5 : 0

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

function buildWallSweepGeometry(controls: SketchControls, zProfile: WallZProfile) {
  const rawPath = buildBaseShapePoints(controls, zProfile.wallThickness)
  const cleanedPath = sanitizeClosedPath(rawPath)
  const path = moveSeamToHingeMidpoint(cleanedPath)
  if (path.length < 3) return null

  const isCCW = polygonSignedArea(path) > 0

  const profileHeight = Math.max(20, controls.hingeWidth * 0.9)
  const { outer, inner } = buildZProfilePoints(zProfile, profileHeight)
  if (outer.length < 2 || inner.length < 2) return null

  const stationCount = path.length
  const sampleCount = outer.length

  const stations = path.map((point, index) => {
    const prev = path[(index - 1 + stationCount) % stationCount]
    const next = path[(index + 1) % stationCount]
    const prevTangent = normalize2(point[0] - prev[0], point[1] - prev[1])
    const nextTangent = normalize2(next[0] - point[0], next[1] - point[1])
    const prevNormal = outwardNormalFromTangent(prevTangent[0], prevTangent[1], isCCW)
    const nextNormal = outwardNormalFromTangent(nextTangent[0], nextTangent[1], isCCW)

    return {
      point,
      prevTangent,
      nextTangent,
      prevNormal,
      nextNormal,
    }
  })

  const outerGrid: Point3[][] = stations.map((station) => {
    return outer.map(([offset, y]) => {
      const [x, z] = intersectOffsetLines(
        station.point,
        station.prevTangent,
        station.nextTangent,
        station.prevNormal,
        station.nextNormal,
        offset,
      )

      return [x, y, z]
    })
  })

  const innerGrid: Point3[][] = stations.map((station) => {
    return inner.map(([offset, y]) => {
      const [x, z] = intersectOffsetLines(
        station.point,
        station.prevTangent,
        station.nextTangent,
        station.prevNormal,
        station.nextNormal,
        offset,
      )

      return [x, y, z]
    })
  })

  const positions: number[] = []
  const floorThickness = Math.max(0.1, zProfile.bottomThickness)

  for (let i = 0; i < stationCount; i += 1) {
    const nextI = (i + 1) % stationCount

    for (let j = 0; j < sampleCount - 1; j += 1) {
      const a = outerGrid[i][j]
      const b = outerGrid[nextI][j]
      const c = outerGrid[nextI][j + 1]
      const d = outerGrid[i][j + 1]
      addQuad(positions, a, b, c, d)

      const ia = innerGrid[i][j]
      const ib = innerGrid[nextI][j]
      const ic = innerGrid[nextI][j + 1]
      const id = innerGrid[i][j + 1]
      addQuad(positions, ia, id, ic, ib)
    }

    const topA = outerGrid[i][sampleCount - 1]
    const topB = outerGrid[nextI][sampleCount - 1]
    const topC = innerGrid[nextI][sampleCount - 1]
    const topD = innerGrid[i][sampleCount - 1]
    addQuad(positions, topA, topB, topC, topD)

    const bottomA = outerGrid[i][0]
    const bottomB = outerGrid[nextI][0]
    const bottomC = innerGrid[nextI][0]
    const bottomD = innerGrid[i][0]
    addQuad(positions, bottomA, bottomD, bottomC, bottomB)
  }

  const floorBottomLoop: Point3[] = innerGrid.map((column) => {
    const p = column[0]
    return [p[0], 0, p[2]]
  })
  const floorTopLoop: Point3[] = floorBottomLoop.map(([x, y, z]) => [x, y + floorThickness, z])

  if (floorTopLoop.length >= 3) {
    for (let i = 1; i < floorTopLoop.length - 1; i += 1) {
      addTriangle(positions, floorTopLoop[0], floorTopLoop[i], floorTopLoop[i + 1])
      addTriangle(positions, floorBottomLoop[0], floorBottomLoop[i + 1], floorBottomLoop[i])
    }

    for (let i = 0; i < floorTopLoop.length; i += 1) {
      const nextI = (i + 1) % floorTopLoop.length
      const a = floorTopLoop[i]
      const b = floorTopLoop[nextI]
      const c = floorBottomLoop[nextI]
      const d = floorBottomLoop[i]
      addQuad(positions, a, b, c, d)
    }
  }

  const meshGeometry = new BufferGeometry()
  meshGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  meshGeometry.computeVertexNormals()
  return meshGeometry
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.URL.revokeObjectURL(url)
}

function WallSweepPreview({ controls, zProfile }: { controls: SketchControls; zProfile: WallZProfile }) {
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
        side={DoubleSide}
      />
    </mesh>
  )
}

export function Viewport({ controls, zProfile }: ViewportProps) {
  const [renderMode, setRenderMode] = useState<'preview' | 'cad'>('preview')
  const [exportFormat, setExportFormat] = useState<'stl' | 'step'>('stl')
  const [exporting, setExporting] = useState(false)
  const [cadControls, setCadControls] = useState(controls)
  const [cadZProfile, setCadZProfile] = useState(zProfile)
  const [isCadUpdating, setIsCadUpdating] = useState(false)

  useEffect(() => {
    if (renderMode !== 'cad') return

    setIsCadUpdating(true)
    const timer = window.setTimeout(() => {
      setCadControls(controls)
      setCadZProfile(zProfile)
      setIsCadUpdating(false)
    }, 300)

    return () => window.clearTimeout(timer)
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
        {`Mode: ${renderMode === 'preview' ? 'Preview' : 'CAD'}\nShape: ${activeControls.shape}\nSize: ${activeControls.scaleX.toFixed(0)} mm x ${activeControls.scaleY.toFixed(0)} mm${activeControls.useInnerDimensions ? ' (inner)' : ' (outer)'}\nHinge Width: ${activeControls.hingeWidth} mm\nWall Profile: ${activeZProfile.type}\nWall Thickness: ${activeZProfile.wallThickness.toFixed(2)} mm\nBottom Thickness: ${activeZProfile.bottomThickness.toFixed(2)} mm\nOpacity: ${Math.round(activeControls.boxOpacity * 100)}%\nColor: ${activeControls.boxColor.toUpperCase()}`}
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
              : 'CAD mode ready. Hook OpenCascade rebuild here.'}
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
        <SceneSetup />
        <WallSweepPreview controls={activeControls} zProfile={activeZProfile} />
        <BasePathPreview controls={activeControls} zProfile={activeZProfile} />
        <ZProfileGuide controls={activeControls} zProfile={activeZProfile} />
      </Canvas>
    </div>
  )
}
