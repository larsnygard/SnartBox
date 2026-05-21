// ─────────────────────────────────────────────────────────────────────────────
// components/Viewport/BoxMesh.tsx
//
// Simple static placeholder mesh. This intentionally contains no generation
// logic so the viewport stays stable while the builder is being rewritten.
// ─────────────────────────────────────────────────────────────────────────────

export function BoxMesh() {
  return (
    <group>
      <mesh position={[0, 0, 20]} castShadow receiveShadow>
        <boxGeometry args={[60, 40, 40]} />
        <meshStandardMaterial color="#9db4c9" metalness={0.1} roughness={0.7} />
      </mesh>
    </group>
  )
}
