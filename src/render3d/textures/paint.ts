/**
 * Ferramentas de pintura procedural em Canvas 2D: cores, ruído de valor com seed,
 * manchas suaves e pinceladas. Determinístico — toda variação vem de Rng com seed.
 */
import { Rng } from '../../engine/rng';

export type RGB = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(c: RGB, k: number): RGB {
  return k >= 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k);
}

export function rgba(c: RGB, a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

/** Ruído de valor 2D com seed, suavizado, e soma fractal (fbm). */
export class Noise {
  private readonly perm: Uint8Array;

  constructor(seed: string) {
    const rng = Rng.fromSeed(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    this.perm = new Uint8Array(rng.shuffle(p).concat(rng.shuffle(p)));
  }

  private v(ix: number, iy: number): number {
    const p = this.perm;
    return (p[((p[ix & 255] ?? 0) + (iy & 255)) & 511] ?? 0) / 255;
  }

  value(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.v(ix, iy) + (this.v(ix + 1, iy) - this.v(ix, iy)) * sx;
    const b = this.v(ix, iy + 1) + (this.v(ix + 1, iy + 1) - this.v(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  }

  fbm(x: number, y: number, octaves = 4): number {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.value(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}

export interface Painter {
  readonly c: CanvasRenderingContext2D;
  readonly size: number;
  readonly rng: Rng;
  readonly noise: Noise;
  /** Coordenada normalizada (0–1) → pixel. */
  px(u: number): number;
}

export function makeCanvas(size: number): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('canvas 2D indisponível');
  return { canvas, c };
}

export function makePainter(c: CanvasRenderingContext2D, size: number, seed: string): Painter {
  return { c, size, rng: Rng.fromSeed(seed), noise: new Noise(seed), px: (u) => u * size };
}

/** Mancha radial suave (base da pintura). */
export function blotch(p: Painter, u: number, v: number, r: number, color: RGB, alpha: number): void {
  const { c } = p;
  const x = p.px(u);
  const y = p.px(v);
  const rr = p.px(r);
  const g = c.createRadialGradient(x, y, 0, x, y, rr);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
}

/** Pinceladas curtas semitransparentes: dão a textura de tinta. */
export function brushStrokes(
  p: Painter,
  colors: readonly RGB[],
  count: number,
  len: number,
  width: number,
  alpha: number,
): void {
  const { c, rng } = p;
  c.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rng.next() * p.size;
    const y = rng.next() * p.size;
    const a = rng.next() * Math.PI;
    const l = p.px(len) * (0.5 + rng.next());
    c.strokeStyle = rgba(rng.pick(colors), alpha * (0.5 + rng.next() * 0.5));
    c.lineWidth = p.px(width) * (0.6 + rng.next() * 0.8);
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + (rng.next() - 0.5) * l * 0.3,
      y + Math.sin(a) * l * 0.5 + (rng.next() - 0.5) * l * 0.3,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
    );
    c.stroke();
  }
}

/** Gradiente diagonal: luz cima-esquerda, sombra baixo-direita. */
export function litGround(p: Painter, light: RGB, base: RGB, dark: RGB): void {
  const { c, size } = p;
  const g = c.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, rgba(light));
  g.addColorStop(0.45, rgba(base));
  g.addColorStop(1, rgba(dark));
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
}

/** Variação de cor por ruído fractal, pixel a pixel. */
export function noiseTint(p: Painter, toward: RGB, strength: number, scale: number, brightness = 0.12): void {
  const { c, size, noise } = p;
  const img = c.getImageData(0, 0, size, size);
  const d = img.data;
  const k = scale / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise.fbm(x * k, y * k, 4);
      const fine = noise.value(x * k * 9 + 31, y * k * 9 + 17);
      const i = (y * size + x) * 4;
      const t = Math.max(0, (n - 0.45) * 2) * strength;
      const b = 1 + (n - 0.5) * brightness * 2 + (fine - 0.5) * brightness * 0.6;
      d[i] = ((d[i] ?? 0) + (toward[0] - (d[i] ?? 0)) * t) * b;
      d[i + 1] = ((d[i + 1] ?? 0) + (toward[1] - (d[i + 1] ?? 0)) * t) * b;
      d[i + 2] = ((d[i + 2] ?? 0) + (toward[2] - (d[i + 2] ?? 0)) * t) * b;
    }
  }
  c.putImageData(img, 0, 0);
}

/** Escurece a borda do hex: o topo pintado "assenta" no bisel. */
export function hexVignette(p: Painter, strength = 0.35): void {
  const { c, size } = p;
  const h = size / 2;
  const g = c.createRadialGradient(h * 0.85, h * 0.85, h * 0.45, h, h, h * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
}

/** Polígono irregular em volta de (u, v): contornos orgânicos (lagos, poças, crateras). */
export function organicPath(
  p: Painter,
  u: number,
  v: number,
  r: number,
  wobble: number,
  seedShift = 0,
): void {
  const { c, noise } = p;
  const steps = 48;
  c.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const n = noise.fbm(Math.cos(a) * 1.5 + 10 + seedShift, Math.sin(a) * 1.5 + 10 + seedShift, 3);
    const rr = p.px(r * (1 + (n - 0.5) * wobble * 2));
    const x = p.px(u) + Math.cos(a) * rr;
    const y = p.px(v) + Math.sin(a) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

/** Linha sinuosa (veios, rachaduras, rios de lava). */
export function crack(
  p: Painter,
  u0: number,
  v0: number,
  angle: number,
  length: number,
  segments: number,
  jitter: number,
): [number, number][] {
  const pts: [number, number][] = [[p.px(u0), p.px(v0)]];
  let a = angle;
  let x = p.px(u0);
  let y = p.px(v0);
  const step = p.px(length) / segments;
  for (let i = 0; i < segments; i++) {
    a += (p.rng.next() - 0.5) * jitter;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}

export function strokePath(
  c: CanvasRenderingContext2D,
  pts: readonly [number, number][],
  width: number,
  style: string,
): void {
  c.strokeStyle = style;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
  c.stroke();
}
