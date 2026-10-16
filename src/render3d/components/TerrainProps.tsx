/**
 * Micro-geometria sobre os tiles revelados (árvores, picos, rochas de veio, colunas) e
 * as peças únicas de hazard: cone do Vulcão com lava e cristal da Anomalia Magnética.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, type Group, MeshStandardMaterial, OctahedronGeometry } from 'three';
import { scene } from '../../ui/theme/tokens';
import { TILE_TOP_Y } from '../constants';
import { type PropKind, propGeometry, propsForHex } from '../geometry/props';
import { lathe, cyl } from '../geometry/primitives';
import { GLOW_INTENSITY, propMaterial } from '../materials';
import type { SceneHex } from '../model';
import { useInstanceMatrices, type InstanceXform } from './instancing';

function PropGroup({ kind, list }: { kind: PropKind; list: InstanceXform[] }) {
  const ref = useInstanceMatrices(list);
  return (
    <instancedMesh
      ref={ref}
      args={[propGeometry(kind), propMaterial(), list.length]}
      castShadow
      receiveShadow
    />
  );
}

const T = scene.terrain;

function Volcano({ hex }: { hex: SceneHex }) {
  const { cone, lava, rock } = useMemo(() => {
    const profile: [number, number][] = [
      [0.62, 0],
      [0.5, 0.04],
      [0.3, 0.16],
      [0.17, 0.25],
      [0.13, 0.24],
      [0.1, 0.2],
      [0, 0.2],
    ];
    return {
      cone: lathe(profile, 14),
      lava: cyl(0.11, 0.11, 0.015, 14, { y: 0.205 }),
      rock: new MeshStandardMaterial({ color: T.volcano[1], roughness: 0.9, flatShading: true }),
    };
  }, []);
  const lavaMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: T.volcano[3],
        emissive: new Color(T.volcano[3]),
        emissiveIntensity: GLOW_INTENSITY * 1.4,
        toneMapped: false,
      }),
    [],
  );
  return (
    <group position={[hex.world.x, TILE_TOP_Y, hex.world.z]}>
      <mesh geometry={cone} material={rock} castShadow receiveShadow />
      <mesh geometry={lava} material={lavaMat} />
    </group>
  );
}

function MagneticCrystal({ hex, reducedMotion }: { hex: SceneHex; reducedMotion: boolean }) {
  const ref = useRef<Group>(null);
  const { geo, mat } = useMemo(
    () => ({
      geo: new OctahedronGeometry(0.11, 0),
      mat: new MeshStandardMaterial({
        color: T.magnetic_anomaly[3],
        emissive: new Color(T.magnetic_anomaly[3]),
        emissiveIntensity: 1.4,
        metalness: 0.3,
        roughness: 0.2,
        flatShading: true,
        toneMapped: false,
      }),
    }),
    [],
  );
  useFrame(({ clock }) => {
    if (!ref.current || reducedMotion) return;
    ref.current.rotation.y = clock.elapsedTime * 0.6;
    ref.current.position.y = TILE_TOP_Y + 0.42 + Math.sin(clock.elapsedTime * 1.5) * 0.04;
  });
  return (
    <group ref={ref} position={[hex.world.x, TILE_TOP_Y + 0.42, hex.world.z]}>
      <mesh geometry={geo} material={mat} scale={[1, 1.7, 1]} castShadow />
    </group>
  );
}

export function TerrainProps({
  hexes,
  reducedMotion,
}: {
  hexes: readonly SceneHex[];
  reducedMotion: boolean;
}) {
  const groups = useMemo(() => {
    const byKind = new Map<PropKind, InstanceXform[]>();
    for (const h of hexes) {
      for (const p of propsForHex(h)) {
        const list = byKind.get(p.kind) ?? [];
        list.push({ x: h.world.x + p.x, y: TILE_TOP_Y, z: h.world.z + p.z, rotY: p.rotY, sx: p.scale });
        byKind.set(p.kind, list);
      }
    }
    return [...byKind.entries()];
  }, [hexes]);
  const volcanoes = hexes.filter((h) => h.revealed && h.terrain === 'volcano');
  const crystals = hexes.filter((h) => h.revealed && h.terrain === 'magnetic_anomaly');

  return (
    <group>
      {groups.map(([kind, list]) => (
        <PropGroup key={`${kind}:${list.length}`} kind={kind} list={list} />
      ))}
      {volcanoes.map((h) => (
        <Volcano key={h.key} hex={h} />
      ))}
      {crystals.map((h) => (
        <MagneticCrystal key={h.key} hex={h} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}
