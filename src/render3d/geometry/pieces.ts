/**
 * Tropas, símbolos de facção, estrelas de nível e tokens de recurso.
 * ART_DIRECTION 5 (Tropas, Tokens) e 2.4 / 2.5 (formas).
 */
import { BufferGeometry, ExtrudeGeometry, Shape } from 'three';
import type { palette } from '../../ui/theme/tokens';
import { TOKEN } from '../constants';
import type { TroopKind } from '../model';
import { ball, box, cyl, lathe, merge, prism } from './primitives';

export type TroopRole = 'body' | 'metal' | 'dark';
export type TroopGeometry = Record<TroopRole, BufferGeometry>;

/** Linha: peão estilizado com escudo. Artilharia: canhão sobre esteira. */
function line(): Record<TroopRole, BufferGeometry[]> {
  const pawn: [number, number][] = [
    [0, 0],
    [0.085, 0],
    [0.085, 0.02],
    [0.06, 0.035],
    [0.045, 0.08],
    [0.05, 0.13],
    [0.035, 0.15],
    [0, 0.155],
  ];
  return {
    body: [lathe(pawn, 12, { y: 0.02 }), ball(0.042, 10, 8, { y: 0.21 })],
    metal: [
      // Escudo curvo à frente (+z) e capacete.
      shield(),
      cyl(0.045, 0.045, 0.012, 10, { y: 0.225 }),
    ],
    dark: [cyl(0.095, 0.1, 0.02, 16)],
  };
}

function shield(): BufferGeometry {
  // Placa curva: fatia de cilindro aberto.
  const g = cyl(0.07, 0.065, 0.11, 8, { y: 0.055 });
  g.scale(1, 1, 0.35);
  g.translate(0, 0, 0.065);
  return g;
}

function artillery(): Record<TroopRole, BufferGeometry[]> {
  const track = (x: number) => [
    box(0.04, 0.05, 0.2, { x, y: 0.005 }),
    cyl(0.025, 0.025, 0.04, 8, { x, y: 0.005, z: 0.1, rz: Math.PI / 2 }),
    cyl(0.025, 0.025, 0.04, 8, { x, y: 0.005, z: -0.1, rz: Math.PI / 2 }),
  ];
  return {
    dark: [...track(-0.075), ...track(0.075)],
    body: [box(0.13, 0.05, 0.18, { y: 0.03 }), cyl(0.055, 0.06, 0.05, 10, { y: 0.08 })],
    metal: [
      cyl(0.014, 0.018, 0.2, 8, { y: 0.105, z: 0.1, rx: Math.PI / 2 - 0.25 }),
      cyl(0.02, 0.02, 0.03, 8, { y: 0.105, z: 0.2, rx: Math.PI / 2 - 0.25 }),
    ],
  };
}

const troopCache = new Map<TroopKind, TroopGeometry>();

export function troopGeometry(kind: TroopKind): TroopGeometry {
  const hit = troopCache.get(kind);
  if (hit) return hit;
  const parts = kind === 'line' ? line() : artillery();
  const g = { body: merge(parts.body), metal: merge(parts.metal), dark: merge(parts.dark) };
  troopCache.set(kind, g);
  return g;
}

/** Topo das tropas (onde vai o símbolo e de onde as estrelas flutuam). */
export const TROOP_TOP: Record<TroopKind, number> = { line: 0.27, artillery: 0.14 };

type FactionSymbol = (typeof palette.faction)[keyof typeof palette.faction]['symbol'];

/** Distintivo plano com o símbolo da facção (forma redundante à cor — ART_DIRECTION 1.3). */
export function symbolGeometry(symbol: FactionSymbol, r = 0.035, h = 0.014): BufferGeometry {
  const sides: Record<FactionSymbol, number> = {
    circle: 16,
    square: 4,
    triangle: 3,
    rhombus: 4,
    hexagon: 6,
    pentagon: 5,
  };
  const g = cyl(r, r, h, sides[symbol]);
  // Quadrado alinhado aos eixos; losango apoiado no vértice.
  if (symbol === 'square') g.rotateY(Math.PI / 4);
  if (symbol === 'rhombus') g.scale(0.75, 1, 1.15);
  return g;
}

/** Estrela de 5 pontas extrudada (nível das tropas). */
export function starGeometry(r = 0.035): BufferGeometry {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const s = new Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: r * 0.3,
    bevelEnabled: true,
    bevelSize: r * 0.08,
    bevelThickness: r * 0.08,
    bevelSegments: 1,
  });
  g.center();
  return g;
}

type TokenShape = (typeof palette.resource)[keyof typeof palette.resource]['shape'];

function outline(shape: TokenShape, r: number): [number, number][] {
  const poly = (n: number, rot: number, sx = 1, sz = 1): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + rot;
      return [Math.cos(a) * r * sx, Math.sin(a) * r * sz] as [number, number];
    });
  switch (shape) {
    case 'disc':
      return poly(24, 0);
    case 'roundedCube': {
      // Quadrado de cantos arredondados.
      const out: [number, number][] = [];
      const k = r * 0.78;
      const rc = r * 0.22;
      for (const [cx, cz, a0] of [
        [k - rc, k - rc, 0],
        [-(k - rc), k - rc, Math.PI / 2],
        [-(k - rc), -(k - rc), Math.PI],
        [k - rc, -(k - rc), (3 * Math.PI) / 2],
      ] as const) {
        for (let i = 0; i <= 4; i++) {
          const a = a0 + (i / 4) * (Math.PI / 2);
          out.push([cx + Math.cos(a) * rc, cz + Math.sin(a) * rc]);
        }
      }
      return out;
    }
    case 'hexPrism':
      return poly(6, 0);
    case 'rhombus':
      return poly(4, 0, 0.72, 1.1);
    case 'drop': {
      // Gota alongada: meia-volta arredondada + ponta.
      const out: [number, number][] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI * 0.15 + (i / 16) * Math.PI * 1.7;
        out.push([Math.cos(a) * r * 0.75 - r * 0.2, Math.sin(a) * r * 0.75]);
      }
      out.push([r * 1.05, 0]);
      return out.map(([x, z]) => [z, x] as [number, number]);
    }
    case 'octagon':
      return poly(8, Math.PI / 8);
  }
}

const tokenCache = new Map<TokenShape, BufferGeometry>();

/** Token de recurso: moeda metálica na forma do recurso, deitada, base em y = 0. */
export function tokenGeometry(shape: TokenShape): BufferGeometry {
  const hit = tokenCache.get(shape);
  if (hit) return hit;
  const g = prism(outline(shape, TOKEN.radius), TOKEN.thickness, {}, TOKEN.thickness * 0.22);
  tokenCache.set(shape, g);
  return g;
}
