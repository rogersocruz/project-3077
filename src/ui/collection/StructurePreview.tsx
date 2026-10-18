/**
 * Prévia 3D de uma estrutura (mesma geometria low-poly da mesa), girando devagar sobre um tile.
 * A cor de destaque é a da facção escolhida; com movimento reduzido fica parada.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type Group, MeshStandardMaterial } from 'three';
import { structureGeometry, STRUCTURE_ROLES } from '../../render3d/geometry/structures';
import { structureMaterial } from '../../render3d/materials';
import { prefersReducedMotion } from '../../settings';
import { palette } from '../theme/tokens';

function Model({ type, color, spin }: { type: string; color: string; spin: boolean }) {
  const ref = useRef<Group>(null);
  const geo = useMemo(() => structureGeometry(type), [type]);
  const accent = useMemo(
    () => new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25, flatShading: true }),
    [color],
  );
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += dt * 0.5;
  });
  return (
    <group ref={ref}>
      {STRUCTURE_ROLES.map((role) => {
        const g = geo[role];
        if (!g) return null;
        return (
          <mesh
            key={role}
            geometry={g}
            material={role === 'accent' ? accent : structureMaterial(role)}
            castShadow
          />
        );
      })}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]} receiveShadow>
        <circleGeometry args={[0.55, 6]} />
        <meshStandardMaterial color={palette.paper[300]} roughness={0.9} />
      </mesh>
    </group>
  );
}

export function StructurePreview({
  type,
  color,
  size = 160,
}: {
  type: string;
  color: string;
  size?: number;
}) {
  const spin = !prefersReducedMotion();
  return (
    <div style={{ width: size, height: size }} data-testid={`preview-${type}`}>
      <Canvas
        camera={{ position: [0.9, 0.85, 0.9], fov: 38 }}
        dpr={[1, 2]}
        frameloop={spin ? 'always' : 'demand'}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 1.5]} intensity={1.6} />
        <group position={[0, -0.18, 0]}>
          <Model type={type} color={color} spin={spin} />
        </group>
      </Canvas>
    </div>
  );
}
