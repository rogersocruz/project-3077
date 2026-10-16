/**
 * Miniaturas sobre os tiles: estruturas (faixas da facção, anéis de nível na base) e
 * tropas (corpo na cor da facção, símbolo no topo, estrelas de nível flutuando).
 * Todas viradas para o dono do tabuleiro.
 *
 * Desempenho: tudo instanciado por (peça, papel de material) — a cor da facção entra
 * como cor de instância. Algumas dezenas de draw calls, qualquer que seja o número de
 * peças na mesa.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type BufferGeometry, type InstancedMesh, type Material, Matrix4, Quaternion, Vector3 } from 'three';
import { palette } from '../../ui/theme/tokens';
import { TILE_TOP_Y } from '../constants';
import { starGeometry, symbolGeometry, TROOP_TOP, troopGeometry } from '../geometry/pieces';
import {
  levelRingGeometry,
  levelRingRadius,
  STRUCTURE_ROLES,
  structureGeometry,
} from '../geometry/structures';
import { instancedAccentMaterial, starMaterial, structureMaterial } from '../materials';
import type { SceneHex } from '../model';
import { structureSlots, troopSlots } from '../placement';
import { useInstanceBatch } from './instancing';

type Faction = keyof typeof palette.faction;

interface Batch {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  readonly castShadow: boolean;
  readonly items: { matrix: Matrix4; color?: string }[];
}

interface StarAnchor {
  readonly position: Vector3;
  readonly count: number;
  readonly scale: number;
  readonly phase: number;
}

const UP = new Vector3(0, 1, 0);
const ONE = new Vector3(1, 1, 1);

function xform(x: number, y: number, z: number, rotY = 0, s = 1): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(UP, rotY),
    s === 1 ? ONE : new Vector3(s, s, s),
  );
}

function buildBatches(hexes: readonly SceneHex[], factions: readonly Faction[], facing: readonly number[]) {
  const batches = new Map<string, Batch>();
  const stars: StarAnchor[] = [];
  const add = (
    key: string,
    geometry: BufferGeometry,
    material: Material,
    matrix: Matrix4,
    color?: string,
    castShadow = true,
  ) => {
    let b = batches.get(key);
    if (!b) {
      b = { geometry, material, castShadow, items: [] };
      batches.set(key, b);
    }
    b.items.push({ matrix, color });
  };
  const colorOf = (owner: number) => palette.faction[factions[owner] ?? 'revolutionaries'].color;

  for (const h of hexes) {
    if (h.structures.length === 0 && h.troops.length === 0) continue;
    const base = xform(h.world.x, TILE_TOP_Y, h.world.z, facing[h.boardId] ?? 0);

    const sSlots = structureSlots(h.structures.map((s) => s.type));
    h.structures.forEach((s, i) => {
      const slot = sSlots[i] ?? { x: 0, z: 0, scale: 1 };
      const m = base.clone().multiply(xform(slot.x, 0, slot.z, 0, slot.scale));
      const geo = structureGeometry(s.type);
      const color = colorOf(s.owner);
      for (const role of STRUCTURE_ROLES) {
        const g = geo[role];
        if (!g) continue;
        if (role === 'accent') add(`s:${s.type}:accent`, g, instancedAccentMaterial(), m, color);
        else add(`s:${s.type}:${role}`, g, structureMaterial(role), m);
      }
      // Nível = anéis concêntricos na base (ART_DIRECTION 5).
      for (let k = 0; k < s.level; k++) {
        const r = levelRingRadius(s.type, k);
        add(`ring:${r.toFixed(3)}`, levelRingGeometry(r), instancedAccentMaterial(), m, color, false);
      }
    });

    const tSlots = troopSlots(h);
    h.troops.forEach((t, i) => {
      const slot = tSlots[i] ?? { x: 0, z: 0, scale: 1 };
      const m = base.clone().multiply(xform(slot.x, 0, slot.z, 0, slot.scale));
      const geo = troopGeometry(t.kind);
      const faction = factions[t.owner] ?? 'revolutionaries';
      add(`t:${t.kind}:body`, geo.body, instancedAccentMaterial(), m, colorOf(t.owner));
      add(`t:${t.kind}:metal`, geo.metal, structureMaterial('metal'), m);
      add(`t:${t.kind}:dark`, geo.dark, structureMaterial('dark'), m);
      const top = TROOP_TOP[t.kind];
      const symbol = palette.faction[faction].symbol;
      add(
        `sym:${symbol}`,
        symbolGeometry(symbol),
        structureMaterial('body'),
        m.clone().multiply(xform(0, top, 0)),
      );
      stars.push({
        position: new Vector3(0, top + 0.14, 0).applyMatrix4(m),
        count: t.level,
        scale: slot.scale,
        phase: stars.length * 1.7,
      });
    });
  }
  return { batches: [...batches.entries()], stars };
}

function BatchMesh({ batch }: { batch: Batch }) {
  const ref = useInstanceBatch(batch.items);
  return (
    <instancedMesh
      ref={ref}
      args={[batch.geometry, batch.material, batch.items.length]}
      castShadow={batch.castShadow}
      receiveShadow
    />
  );
}

const STAR_SPACING = 0.075;
const sm = new Matrix4();
const sp = new Vector3();
const right = new Vector3();
const ss = new Vector3();

/** Estrelas de nível: sempre de frente para a câmera, flutuando de leve. Um draw call. */
function StarField({ anchors, reducedMotion }: { anchors: readonly StarAnchor[]; reducedMotion: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => starGeometry(), []);
  const total = anchors.reduce((n, a) => n + a.count, 0);
  useFrame(({ camera, clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    let i = 0;
    for (const a of anchors) {
      const bob = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 2 + a.phase) * 0.012;
      for (let k = 0; k < a.count; k++) {
        sp.copy(a.position)
          .addScaledVector(right, (k - (a.count - 1) / 2) * STAR_SPACING * a.scale)
          .addScaledVector(UP, bob);
        ss.setScalar(a.scale);
        sm.compose(sp, camera.quaternion, ss);
        mesh.setMatrixAt(i++, sm);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (total === 0) return null;
  return <instancedMesh key={total} ref={ref} args={[geo, starMaterial(), total]} frustumCulled={false} />;
}

interface PiecesProps {
  hexes: readonly SceneHex[];
  /** Facção visual de cada jogador. */
  factions: readonly Faction[];
  /** Rotação de cada tabuleiro (peças de frente para o dono). */
  facing: readonly number[];
  reducedMotion: boolean;
}

export function Pieces({ hexes, factions, facing, reducedMotion }: PiecesProps) {
  const { batches, stars } = useMemo(() => buildBatches(hexes, factions, facing), [hexes, factions, facing]);
  return (
    <group>
      {batches.map(([key, b]) => (
        <BatchMesh key={`${key}:${b.items.length}`} batch={b} />
      ))}
      <StarField anchors={stars} reducedMotion={reducedMotion} />
    </group>
  );
}
