/**
 * Contornos sobre os tiles: hex sob o mouse (laranja), hex selecionado (pulsa) e, ao
 * escolher uma ação, os alvos válidos com contorno animado na cor da ação enquanto os
 * inválidos escurecem (ART_DIRECTION 8).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CircleGeometry, Color, type Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { scene } from '../../ui/theme/tokens';
import { HEX_RADIUS, TILE_SCALE, TILE_TOP_Y } from '../constants';
import { createHexRingGeometry } from '../geometry/hexTile';
import { GLOW_INTENSITY, highlightMaterial } from '../materials';
import { useFxStore } from '../fxStore';
import type { SceneHex } from '../model';
import { type TargetKind, useSceneStore } from '../sceneStore';
import { type InstanceXform, useInstanceMatrices } from './instancing';

const TILE_R = HEX_RADIUS * TILE_SCALE;

function Targets({
  hexes,
  kind,
  keys,
  color: override,
  reducedMotion,
}: {
  hexes: readonly SceneHex[];
  kind: TargetKind;
  keys: ReadonlySet<string>;
  color?: string;
  reducedMotion: boolean;
}) {
  const ringGeo = useMemo(() => createHexRingGeometry(TILE_R * 0.97, TILE_R * 0.86), []);
  // Hexágono pointy-top cobrindo o topo do tile.
  const capGeo = useMemo(() => new CircleGeometry(TILE_R, 6, Math.PI / 6).rotateX(-Math.PI / 2), []);
  const ringMat = useMemo(() => {
    const color = override ?? scene.action[kind];
    return new MeshStandardMaterial({
      color,
      emissive: new Color(color),
      emissiveIntensity: GLOW_INTENSITY,
      toneMapped: false,
      transparent: true,
      depthWrite: false,
    });
  }, [kind, override]);
  const dimMat = useMemo(
    () => new MeshBasicMaterial({ color: scene.dim, transparent: true, opacity: 0.5, depthWrite: false }),
    [],
  );
  useEffect(
    () => () => {
      ringMat.dispose();
      dimMat.dispose();
    },
    [ringMat, dimMat],
  );

  const { on, off } = useMemo(() => {
    const on: InstanceXform[] = [];
    const off: InstanceXform[] = [];
    for (const h of hexes) {
      (keys.has(h.key) ? on : off).push({ x: h.world.x, y: TILE_TOP_Y + 0.007, z: h.world.z });
    }
    return { on, off };
  }, [hexes, keys]);
  const onRef = useInstanceMatrices(on);
  const offRef = useInstanceMatrices(off);

  useFrame(({ clock }) => {
    const w = reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(clock.elapsedTime * 5);
    ringMat.opacity = 0.35 + 0.6 * w;
    ringMat.emissiveIntensity = GLOW_INTENSITY * (0.6 + 0.4 * w);
  });

  return (
    <group>
      {on.length > 0 && (
        <instancedMesh
          key={`on:${on.length}`}
          ref={onRef}
          args={[ringGeo, ringMat, on.length]}
          renderOrder={2}
        />
      )}
      {off.length > 0 && (
        <instancedMesh
          key={`off:${off.length}`}
          ref={offRef}
          args={[capGeo, dimMat, off.length]}
          renderOrder={1}
        />
      )}
    </group>
  );
}

export function Highlight({ hexes, reducedMotion }: { hexes: readonly SceneHex[]; reducedMotion: boolean }) {
  const byKey = useMemo(() => new Map(hexes.map((h) => [h.key, h])), [hexes]);
  const hovered = useSceneStore((s) => s.hovered);
  const selected = useSceneStore((s) => s.selected);
  const targets = useSceneStore((s) => s.targets);
  // Tile animado (fora do lote): o contorno não fica boiando no lugar vazio.
  const hidden = useFxStore((s) => s.hiddenHexes);
  const hoverGeo = useMemo(() => createHexRingGeometry(TILE_R, TILE_R * 0.9), []);
  const selectGeo = useMemo(() => createHexRingGeometry(TILE_R * 1.02, TILE_R * 0.84), []);
  const selRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const m = selRef.current;
    if (!m || reducedMotion) return;
    const k = 1 + Math.sin(clock.elapsedTime * 4) * 0.015;
    m.scale.set(k, 1, k);
  });

  const h = hovered && !hidden.has(hovered) ? byKey.get(hovered) : undefined;
  const s = selected && !hidden.has(selected) ? byKey.get(selected) : undefined;
  return (
    <group>
      {targets && (
        <Targets
          hexes={hexes}
          kind={targets.kind}
          keys={targets.keys}
          color={targets.color}
          reducedMotion={reducedMotion}
        />
      )}
      {h && h.key !== s?.key && (
        <mesh
          geometry={hoverGeo}
          material={highlightMaterial('hover')}
          position={[h.world.x, TILE_TOP_Y + 0.009, h.world.z]}
          renderOrder={3}
        />
      )}
      {s && (
        <mesh
          ref={selRef}
          geometry={selectGeo}
          material={highlightMaterial('select')}
          position={[s.world.x, TILE_TOP_Y + 0.011, s.world.z]}
          renderOrder={3}
        />
      )}
    </group>
  );
}
