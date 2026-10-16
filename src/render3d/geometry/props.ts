/**
 * Micro-geometria de terreno (ART_DIRECTION 5: "montanhas e árvores podem ter
 * micro-geometria para paralaxe"). Kits com cor de vértice, instanciados por tipo.
 * Posições determinísticas por hex; deixam o centro livre quando há estruturas.
 */
import type { BufferGeometry } from 'three';
import { Rng } from '../../engine/rng';
import { scene } from '../../ui/theme/tokens';
import type { SceneHex } from '../model';
import { box, cone, cyl, merge, rock, tint } from './primitives';

export type PropKind = 'tree' | 'peak' | 'ironRock' | 'coalRock' | 'goldRock' | 'pillar' | 'brokenPillar';

const T = scene.terrain;

function tree(): BufferGeometry {
  return merge([
    tint(cyl(0.012, 0.016, 0.05, 5), scene.wood.light),
    tint(cone(0.065, 0.1, 7, { y: 0.04 }), T.forest[1]),
    tint(cone(0.05, 0.08, 7, { y: 0.1 }), T.forest[2]),
    tint(cone(0.03, 0.05, 7, { y: 0.16 }), T.forest[3]),
  ]);
}

function peak(): BufferGeometry {
  return merge([
    tint(cone(0.16, 0.26, 6), T.mountain[1]),
    tint(cone(0.065, 0.1, 6, { y: 0.16 }), T.mountain[3]),
    tint(cone(0.09, 0.14, 5, { x: 0.1, z: 0.06 }), T.mountain[0]),
  ]);
}

const veinRock = (id: 'vein_iron' | 'vein_coal' | 'vein_gold') => () =>
  merge([
    tint(rock(0.05, { rx: 0.4, ry: 0.3 }), T[id][1]),
    tint(rock(0.032, { x: 0.05, z: 0.03, ry: 1.2 }), T[id][3]),
    tint(rock(0.022, { x: -0.04, z: 0.04 }), T[id][3]),
  ]);

function pillar(): BufferGeometry {
  return merge([
    tint(box(0.06, 0.02, 0.06), T.temple[0]),
    tint(cyl(0.02, 0.022, 0.16, 8, { y: 0.02 }), T.temple[2]),
    tint(box(0.055, 0.018, 0.055, { y: 0.18 }), T.temple[3]),
  ]);
}

function brokenPillar(): BufferGeometry {
  return merge([
    tint(box(0.06, 0.02, 0.06), T.ruin[0]),
    tint(cyl(0.02, 0.022, 0.08, 7, { y: 0.02, rz: 0.08 }), T.ruin[2]),
    tint(cyl(0.02, 0.02, 0.07, 7, { x: 0.07, y: 0.02, z: 0.02, rz: Math.PI / 2, ry: 0.6 }), T.ruin[1]),
  ]);
}

const KITS: Record<PropKind, () => BufferGeometry> = {
  tree,
  peak,
  ironRock: veinRock('vein_iron'),
  coalRock: veinRock('vein_coal'),
  goldRock: veinRock('vein_gold'),
  pillar,
  brokenPillar,
};

const cache = new Map<PropKind, BufferGeometry>();
export function propGeometry(kind: PropKind): BufferGeometry {
  const hit = cache.get(kind);
  if (hit) return hit;
  const g = KITS[kind]();
  cache.set(kind, g);
  return g;
}

export interface PropInstance {
  readonly kind: PropKind;
  /** Deslocamento local no hex. */
  readonly x: number;
  readonly z: number;
  readonly rotY: number;
  readonly scale: number;
}

/** Pontos dentro do hex numa faixa de raio, sem se amontoar. */
function ringPoints(rng: Rng, n: number, rMin: number, rMax: number, minGap: number): [number, number][] {
  const out: [number, number][] = [];
  for (let tries = 0; out.length < n && tries < n * 12; tries++) {
    const a = rng.next() * Math.PI * 2;
    const r = rMin + Math.sqrt(rng.next()) * (rMax - rMin);
    const p: [number, number] = [Math.cos(a) * r, Math.sin(a) * r];
    if (out.every(([x, z]) => Math.hypot(x - p[0], z - p[1]) >= minGap)) out.push(p);
  }
  return out;
}

export function propsForHex(hex: SceneHex): PropInstance[] {
  if (!hex.revealed) return [];
  const rng = Rng.fromSeed(`props:${hex.key}`);
  const busy = hex.structures.length > 0 || hex.troops.length > 0;
  const rMin = busy ? 0.56 : 0.12;
  const rMax = 0.7;
  const at = (kind: PropKind, pts: [number, number][], s0: number, s1: number) =>
    pts.map(([x, z]) => ({ kind, x, z, rotY: rng.next() * Math.PI * 2, scale: s0 + rng.next() * (s1 - s0) }));

  switch (hex.terrain) {
    case 'forest':
      return at('tree', ringPoints(rng, busy ? 6 : 11, rMin, rMax, 0.13), 0.8, 1.3);
    case 'mountain':
      return at(
        'peak',
        ringPoints(rng, busy ? 2 : 3, busy ? rMin : 0.2, 0.62, 0.3),
        busy ? 0.6 : 0.85,
        busy ? 0.8 : 1.25,
      );
    case 'vein_iron':
      return at('ironRock', ringPoints(rng, 3, rMin, rMax, 0.18), 0.9, 1.3);
    case 'vein_coal':
      return at('coalRock', ringPoints(rng, 3, rMin, rMax, 0.18), 0.9, 1.3);
    case 'vein_gold':
      return at('goldRock', ringPoints(rng, 3, rMin, rMax, 0.18), 0.9, 1.3);
    case 'temple':
      return Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return { kind: 'pillar' as const, x: Math.cos(a) * 0.36, z: Math.sin(a) * 0.36, rotY: a, scale: 1.2 };
      });
    case 'ruin':
      return at('brokenPillar', ringPoints(rng, 4, 0.2, 0.62, 0.2), 0.9, 1.3);
    default:
      return [];
  }
}
