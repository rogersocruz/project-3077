/**
 * Primitivas posicionadas para montar miniaturas low-poly por composição.
 * Convenção: y = 0 é o chão (topo do tile); cada peça recebe a posição da BASE.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Shape,
  ExtrudeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

function place(g: BufferGeometry, p: Place, lift: number): BufferGeometry {
  if (p.rx) g.rotateX(p.rx);
  if (p.rz) g.rotateZ(p.rz);
  if (p.ry) g.rotateY(p.ry);
  g.translate(p.x ?? 0, (p.y ?? 0) + lift, p.z ?? 0);
  return g;
}

/** Caixa com a base em y. */
export const box = (w: number, h: number, d: number, p: Place = {}) =>
  place(new BoxGeometry(w, h, d), p, h / 2);

/** Cilindro/tronco com a base em y. */
export const cyl = (rTop: number, rBottom: number, h: number, seg: number, p: Place = {}) =>
  place(new CylinderGeometry(rTop, rBottom, h, seg), p, h / 2);

export const cone = (r: number, h: number, seg: number, p: Place = {}) =>
  place(new ConeGeometry(r, h, seg), p, h / 2);

/** Esfera com o centro em y. */
export const ball = (r: number, wSeg: number, hSeg: number, p: Place = {}) =>
  place(new SphereGeometry(r, wSeg, hSeg), p, 0);

/** Cúpula (meia esfera) com a base em y. */
export const dome = (r: number, seg: number, p: Place = {}) =>
  place(new SphereGeometry(r, seg, Math.max(3, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2), p, 0);

/** Anel deitado no chão (eixo vertical), centro em y. */
export const ring = (r: number, tube: number, seg: number, p: Place = {}) => {
  const g = new TorusGeometry(r, tube, 6, seg);
  g.rotateX(Math.PI / 2);
  return place(g, p, 0);
};

/** Anel em pé (roda, aro), centro em y. */
export const wheel = (r: number, tube: number, seg: number, p: Place = {}) =>
  place(new TorusGeometry(r, tube, 6, seg), p, 0);

export const rock = (r: number, p: Place = {}) => place(new IcosahedronGeometry(r, 0), p, r * 0.6);

/** Sólido de revolução a partir de um perfil [raio, altura]. */
export const lathe = (profile: [number, number][], seg: number, p: Place = {}) =>
  place(
    new LatheGeometry(
      profile.map(([x, y]) => new Vector2(x, y)),
      seg,
    ),
    p,
    0,
  );

/** Prisma de um contorno 2D (no plano xz), base em y. */
export function prism(points: [number, number][], h: number, p: Place = {}, bevel = 0): BufferGeometry {
  const s = new Shape();
  points.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)));
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: h - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return place(g, p, 0);
}

/** Telhado de duas águas (prisma triangular) ao longo de x, base em y. */
export function gable(w: number, h: number, d: number, p: Place = {}): BufferGeometry {
  const s = new Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return place(g, p, 0);
}

/** Junta peças (todas convertidas para não indexadas, com normal e uv). */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const norm = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.getAttribute('uv')) {
      n.setAttribute(
        'uv',
        new Float32BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2),
      );
    }
    for (const name of Object.keys(n.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) n.deleteAttribute(name);
    }
    return n;
  });
  const out = mergeGeometries(norm, false);
  if (!out) throw new Error('merge de geometrias falhou');
  out.computeBoundingSphere();
  return out;
}

/** Pinta uma peça com cor de vértice (para props instanciados de várias cores). */
export function tint(g: BufferGeometry, hex: string): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  const c = new Color(hex);
  const count = n.getAttribute('position').count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  n.setAttribute('color', new Float32BufferAttribute(arr, 3));
  return n;
}
