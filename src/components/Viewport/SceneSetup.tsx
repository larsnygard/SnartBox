// ─────────────────────────────────────────────────────────────────────────────
// components/Viewport/SceneSetup.tsx
//
// Sets up the Three.js scene environment inside the r3f Canvas context.
//
// Contents:
//   - <OrbitControls> from @react-three/drei
//       enableDamping, dampingFactor: 0.05
//       minDistance: 10, maxDistance: 1000
//   - <ambientLight> intensity 0.4
//   - <directionalLight> at [100, 200, 150] intensity 0.8 (main key light)
//   - <directionalLight> at [-100, 50, -100] intensity 0.3 (fill light)
//   - <gridHelper> 500x500, 50 divisions, colour #333355 — snaps to XY plane (rotate -π/2)
//   - <axesHelper> size 30 — shows X/Y/Z orientation
//   - <GizmoHelper> from @react-three/drei, positioned bottom-right, alignment 'bottom-right'
//     Shows a 3D orientation cube gizmo for easy axis reference
//
// No props — pure scene decoration.
// ─────────────────────────────────────────────────────────────────────────────

import { OrbitControls, GizmoHelper, GizmoViewcube, Text } from '@react-three/drei'

const AXIS_TICKS = [-100, -50, 0, 50, 100]

function AxisScaleLabels() {
  return (
    <group>
      {AXIS_TICKS.map((tick) => (
        <Text
          key={`x-${tick}`}
          position={[tick, 0.6, -3]}
          fontSize={2.5}
          color="#ff8080"
          anchorX="center"
          anchorY="middle"
        >
          {tick}
        </Text>
      ))}

      {AXIS_TICKS.map((tick) => (
        <Text
          key={`z-${tick}`}
          position={[-3, 0.6, tick]}
          fontSize={2.5}
          color="#7db7ff"
          anchorX="center"
          anchorY="middle"
        >
          {tick}
        </Text>
      ))}

      {AXIS_TICKS.map((tick) => (
        <Text
          key={`y-${tick}`}
          position={[3, tick, 0]}
          fontSize={2.5}
          color="#8ef0b5"
          anchorX="center"
          anchorY="middle"
        >
          {tick}
        </Text>
      ))}
    </group>
  )
}

interface SceneSetupProps {
  showGrid: boolean
  showAxes: boolean
}

export function SceneSetup({ showGrid, showAxes }: SceneSetupProps) {
  return (
    <>
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={10} maxDistance={1000} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[100, 200, 150]} intensity={0.8} />
      <directionalLight position={[-100, 50, -100]} intensity={0.3} />

      {showGrid && <gridHelper args={[500, 50, '#333355', '#222233']} />}
      {showAxes && (
        <>
          <axesHelper args={[30]} />
          <AxisScaleLabels />
        </>
      )}

      {showAxes && (
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewcube />
        </GizmoHelper>
      )}
    </>
  )
}
