/**
 * Tile hexagonal (ART_DIRECTION 5): prisma com bisel no topo, base grossa.
 * Grupos de material: 0 = topo pintado, 1 = bisel (filete), 2 = lateral e fundo.
 * Faces planas (normais por face), como papelão cortado.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { HEX_RADIUS, TILE_BEVEL, TILE_HEIGHT, TILE_SCALE } from '../constants';
import { hexCorner } from '../layout';

export const TILE_GROUP = { top: 0, bevel: 1, side: 2 } as const;

class Builder {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];

  /** Triângulo com a normal virada para `outward` (troca a ordem se preciso). */
  tri(a: Vector3, b: Vector3, c: Vector3, outward: Vector3, uvs?: [number, number][]): void {
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    let verts = [a, b, c];
    let uvv = uvs ?? [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    if (n.dot(outward) < 0) {
      n.negate();
      verts = [a, c, b];
      uvv = [uvv[0] ?? [0, 0], uvv[2] ?? [0, 0], uvv[1] ?? [0, 0]];
    }
    verts.forEach((v, i) => {
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(n.x, n.y, n.z);
      const t = uvv[i] ?? [0, 0];
      this.uv.push(t[0], t[1]);
    });
  }

  get count(): number {
    return this.pos.length / 3;
  }
}

export interface HexPrismOptions {
  radius?: number;
  height?: number;
  bevel?: number;
}

export function createHexTileGeometry(opts: HexPrismOptions = {}): BufferGeometry {
  const r = opts.radius ?? HEX_RADIUS * TILE_SCALE;
  const h = opts.height ?? TILE_HEIGHT;
  const b = opts.bevel ?? TILE_BEVEL;
  const rin = r - b;
  const up = new Vector3(0, 1, 0);
  const down = new Vector3(0, -1, 0);
  const B = new Builder();
  const v3 = (radius: number, i: number, y: number) => {
    const c = hexCorner(i % 6, radius);
    return new Vector3(c.x, y, c.z);
  };
  // UV planar do topo: o hex interno ocupa a pintura inteira (vértices em v = 0 e 1).
  const uvOf = (p: Vector3): [number, number] => [p.x / (2 * rin) + 0.5, 0.5 - p.z / (2 * rin)];

  const groups: { start: number; count: number; index: number }[] = [];
  const begin = () => B.count;
  const end = (start: number, index: number) => groups.push({ start, count: B.count - start, index });

  // Topo.
  let s = begin();
  const center = new Vector3(0, h, 0);
  for (let i = 0; i < 6; i++) {
    const a = v3(rin, i, h);
    const c = v3(rin, i + 1, h);
    B.tri(center, a, c, up, [uvOf(center), uvOf(a), uvOf(c)]);
  }
  end(s, TILE_GROUP.top);

  // Bisel.
  s = begin();
  for (let i = 0; i < 6; i++) {
    const a = v3(rin, i, h);
    const c = v3(rin, i + 1, h);
    const a2 = v3(r, i, h - b);
    const c2 = v3(r, i + 1, h - b);
    const mid = hexCorner(i, 1);
    const mid2 = hexCorner(i + 1, 1);
    const out = new Vector3(mid.x + mid2.x, 1, mid.z + mid2.z).normalize();
    B.tri(a, a2, c2, out);
    B.tri(a, c2, c, out);
  }
  end(s, TILE_GROUP.bevel);

  // Lateral e fundo.
  s = begin();
  for (let i = 0; i < 6; i++) {
    const a = v3(r, i, h - b);
    const c = v3(r, i + 1, h - b);
    const a0 = v3(r, i, 0);
    const c0 = v3(r, i + 1, 0);
    const mid = hexCorner(i, 1);
    const mid2 = hexCorner(i + 1, 1);
    const out = new Vector3(mid.x + mid2.x, 0, mid.z + mid2.z).normalize();
    B.tri(a, a0, c0, out);
    B.tri(a, c0, c, out);
    B.tri(new Vector3(0, 0, 0), a0, c0, down);
  }
  end(s, TILE_GROUP.side);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(B.nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(B.uv, 2));
  for (const gr of groups) g.addGroup(gr.start, gr.count, gr.index);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Anel hexagonal plano (contorno de hover/seleção e filete dourado dos hazards). */
export function createHexRingGeometry(outer: number, inner: number): BufferGeometry {
  const B = new Builder();
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < 6; i++) {
    const o1 = hexCorner(i, outer);
    const o2 = hexCorner(i + 1, outer);
    const i1 = hexCorner(i, inner);
    const i2 = hexCorner(i + 1, inner);
    const O1 = new Vector3(o1.x, 0, o1.z);
    const O2 = new Vector3(o2.x, 0, o2.z);
    const I1 = new Vector3(i1.x, 0, i1.z);
    const I2 = new Vector3(i2.x, 0, i2.z);
    B.tri(I1, O1, O2, up);
    B.tri(I1, O2, I2, up);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(B.nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(B.uv, 2));
  return g;
}
