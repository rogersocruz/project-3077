/**
 * Topos pintados dos tiles (ART_DIRECTION 5): substitutos procedurais por terreno,
 * no estilo das ilustrações — gradiente com luz cima-esquerda, ruído, pinceladas e
 * detalhes próprios de cada terreno. Nada de cor chapada.
 *
 * Coordenadas da pintura: (u, v) em 0–1, centro (0.5, 0.5); o hex (pointy-top) fica
 * inscrito no quadrado com os vértices em v = 0 e v = 1.
 */
import { palette, scene, type TerrainPaletteKey } from '../../ui/theme/tokens';
import {
  blotch,
  brushStrokes,
  crack,
  hexToRgb,
  hexVignette,
  litGround,
  makeCanvas,
  makePainter,
  mix,
  noiseTint,
  organicPath,
  type Painter,
  type RGB,
  rgba,
  shade,
  strokePath,
} from './paint';

export interface TerrainPainting {
  readonly color: HTMLCanvasElement;
  /** Áreas que brilham sozinhas (lava, campo magnético); alimenta o bloom. */
  readonly emissive?: HTMLCanvasElement;
}

interface Pal {
  readonly dark: RGB;
  readonly base: RGB;
  readonly light: RGB;
  readonly detail: RGB;
}

/** Tons emprestados de outros terrenos/tokens para detalhes (capim, musgo, madeira). */
const GRASS = (): Pal => pal('forest');
const WOOD = () => hexToRgb(scene.wood.dark);
const PAPER = () => hexToRgb(palette.paper[100]);

function pal(id: TerrainPaletteKey): Pal {
  const [dark = '#000000', base = '#000000', light = '#000000', detail = '#000000'] = scene.terrain[id];
  return { dark: hexToRgb(dark), base: hexToRgb(base), light: hexToRgb(light), detail: hexToRgb(detail) };
}

/** Distribui pontos sem cair muito perto da borda do hex. */
function scatter(p: Painter, n: number, maxR = 0.42): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = p.rng.next() * Math.PI * 2;
    const r = Math.sqrt(p.rng.next()) * maxR;
    out.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
  }
  return out;
}

function ground(p: Painter, k: Pal, tint: RGB, tintStrength = 0.35): void {
  litGround(p, k.light, k.base, k.dark);
  noiseTint(p, tint, tintStrength, 5);
  brushStrokes(p, [k.light, k.base, k.dark], 260, 0.05, 0.012, 0.18);
}

function pebble(p: Painter, u: number, v: number, r: number, color: RGB): void {
  const { c } = p;
  c.fillStyle = rgba(shade(color, -0.45), 0.55);
  c.beginPath();
  c.ellipse(p.px(u + r * 0.25), p.px(v + r * 0.3), p.px(r), p.px(r * 0.75), 0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = rgba(color);
  c.beginPath();
  c.ellipse(p.px(u), p.px(v), p.px(r), p.px(r * 0.78), 0.3, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = rgba(shade(color, 0.35), 0.8);
  c.beginPath();
  c.ellipse(p.px(u - r * 0.3), p.px(v - r * 0.3), p.px(r * 0.4), p.px(r * 0.3), 0.3, 0, Math.PI * 2);
  c.fill();
}

/** Copa de árvore vista de cima: sombra, volume e brilho. */
function canopy(p: Painter, u: number, v: number, r: number, k: Pal): void {
  blotch(p, u + r * 0.45, v + r * 0.55, r * 1.3, shade(k.dark, -0.6), 0.55);
  const { c } = p;
  const col = mix(k.base, k.dark, p.rng.next() * 0.5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + p.rng.next();
    c.fillStyle = rgba(shade(col, -0.05 * i));
    c.beginPath();
    c.arc(p.px(u + Math.cos(a) * r * 0.35), p.px(v + Math.sin(a) * r * 0.35), p.px(r * 0.7), 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = rgba(mix(col, k.detail, 0.55), 0.9);
  c.beginPath();
  c.arc(p.px(u - r * 0.25), p.px(v - r * 0.25), p.px(r * 0.45), 0, Math.PI * 2);
  c.fill();
  c.fillStyle = rgba(shade(k.detail, 0.3), 0.6);
  c.beginPath();
  c.arc(p.px(u - r * 0.35), p.px(v - r * 0.38), p.px(r * 0.18), 0, Math.PI * 2);
  c.fill();
}

function paintEmpty(p: Painter): void {
  const k = pal('empty');
  ground(p, k, k.detail, 0.55);
  for (const [u, v] of scatter(p, 26, 0.45)) blotch(p, u, v, 0.05 + p.rng.next() * 0.05, k.detail, 0.35);
  // Tufos de capim.
  p.c.lineCap = 'round';
  for (const [u, v] of scatter(p, 90, 0.46)) {
    const col = mix(k.detail, k.light, p.rng.next() * 0.6);
    for (let i = 0; i < 4; i++) {
      p.c.strokeStyle = rgba(i % 2 ? shade(col, -0.25) : col, 0.85);
      p.c.lineWidth = p.px(0.004);
      p.c.beginPath();
      p.c.moveTo(p.px(u), p.px(v));
      p.c.lineTo(p.px(u + (p.rng.next() - 0.5) * 0.03), p.px(v - 0.012 - p.rng.next() * 0.02));
      p.c.stroke();
    }
  }
  for (const [u, v] of scatter(p, 14, 0.44))
    pebble(p, u, v, 0.008 + p.rng.next() * 0.012, shade(k.light, -0.1));
  // Trilha de terra batida.
  strokePath(p.c, crack(p, 0.08, 0.62, -0.35, 0.9, 14, 0.5), p.px(0.025), rgba(shade(k.light, 0.1), 0.35));
}

function paintForest(p: Painter): void {
  const k = pal('forest');
  ground(p, k, k.dark, 0.5);
  const trees = scatter(p, 70, 0.47).sort((a, b) => a[1] - b[1]);
  for (const [u, v] of trees) canopy(p, u, v, 0.035 + p.rng.next() * 0.03, k);
  // Clareira pequena.
  blotch(p, 0.56, 0.44, 0.08, shade(k.detail, -0.1), 0.35);
}

function paintLagoon(p: Painter): void {
  const k = pal('lagoon');
  const sand = k.detail;
  litGround(p, shade(sand, 0.15), sand, shade(sand, -0.3));
  noiseTint(p, GRASS().detail, 0.45, 5);
  brushStrokes(p, [sand, shade(sand, -0.2), GRASS().light], 200, 0.05, 0.012, 0.2);
  const { c } = p;
  // Margem molhada.
  organicPath(p, 0.5, 0.5, 0.36, 0.2);
  c.fillStyle = rgba(shade(sand, -0.35), 0.7);
  c.fill();
  // Água: fundo escuro no centro, raso claro na borda.
  organicPath(p, 0.5, 0.5, 0.32, 0.2);
  const g = c.createRadialGradient(p.px(0.45), p.px(0.45), p.px(0.02), p.px(0.5), p.px(0.5), p.px(0.36));
  g.addColorStop(0, rgba(shade(k.dark, -0.2)));
  g.addColorStop(0.55, rgba(k.base));
  g.addColorStop(1, rgba(k.light));
  c.fillStyle = g;
  c.fill();
  c.save();
  organicPath(p, 0.5, 0.5, 0.32, 0.2);
  c.clip();
  // Ondulações e reflexo do céu.
  for (let i = 0; i < 26; i++) {
    const u = 0.25 + p.rng.next() * 0.5;
    const v = 0.25 + p.rng.next() * 0.5;
    c.strokeStyle = rgba([255, 255, 255], 0.15 + p.rng.next() * 0.25);
    c.lineWidth = p.px(0.004);
    c.beginPath();
    c.arc(p.px(u), p.px(v), p.px(0.02 + p.rng.next() * 0.03), Math.PI * 1.1, Math.PI * 1.7);
    c.stroke();
  }
  blotch(p, 0.38, 0.36, 0.12, [255, 255, 255], 0.22);
  c.restore();
  // Juncos na margem.
  for (let i = 0; i < 40; i++) {
    const a = p.rng.next() * Math.PI * 2;
    const r = 0.31 + p.rng.next() * 0.06;
    const u = 0.5 + Math.cos(a) * r;
    const v = 0.5 + Math.sin(a) * r;
    c.strokeStyle = rgba(mix(GRASS().base, GRASS().detail, p.rng.next()), 0.9);
    c.lineWidth = p.px(0.004);
    c.beginPath();
    c.moveTo(p.px(u), p.px(v));
    c.lineTo(p.px(u + (p.rng.next() - 0.5) * 0.02), p.px(v - 0.03));
    c.stroke();
  }
  for (const [u, v] of scatter(p, 8, 0.46))
    if (Math.hypot(u - 0.5, v - 0.5) > 0.37) pebble(p, u, v, 0.012, pal('mountain').light);
}

/** Maciço visto de cima: face iluminada (cima-esquerda) e face na sombra. */
function peak(p: Painter, u: number, v: number, r: number, k: Pal): void {
  const { c } = p;
  const n = 7;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + p.rng.next() * 0.4;
    const rr = r * (0.75 + p.rng.next() * 0.4);
    pts.push([p.px(u + Math.cos(a) * rr), p.px(v + Math.sin(a) * rr)]);
  }
  const top: [number, number] = [p.px(u - r * 0.12), p.px(v - r * 0.12)];
  blotch(p, u + r * 0.4, v + r * 0.5, r * 1.4, shade(k.dark, -0.7), 0.45);
  pts.forEach((pt, i) => {
    const next = pts[(i + 1) % n] ?? pt;
    const mid = Math.atan2((pt[1] + next[1]) / 2 - top[1], (pt[0] + next[0]) / 2 - top[0]);
    // Faces voltadas para cima-esquerda (≈ −135°) ficam claras.
    const lit = Math.cos(mid + (3 * Math.PI) / 4);
    c.fillStyle = rgba(mix(k.dark, k.light, 0.5 + lit * 0.5));
    c.beginPath();
    c.moveTo(top[0], top[1]);
    c.lineTo(pt[0], pt[1]);
    c.lineTo(next[0], next[1]);
    c.closePath();
    c.fill();
    c.strokeStyle = rgba(shade(k.dark, -0.3), 0.35);
    c.lineWidth = p.px(0.003);
    c.stroke();
  });
  // Neve no cume.
  c.fillStyle = rgba(k.detail, 0.95);
  c.beginPath();
  c.arc(top[0], top[1], p.px(r * 0.22), 0, Math.PI * 2);
  c.fill();
  blotch(p, u - r * 0.2, v - r * 0.2, r * 0.45, k.detail, 0.45);
}

function paintMountain(p: Painter): void {
  const k = pal('mountain');
  ground(p, k, GRASS().dark, 0.3);
  for (const [u, v] of scatter(p, 30, 0.45)) pebble(p, u, v, 0.008 + p.rng.next() * 0.01, k.light);
  const peaks: [number, number, number][] = [
    [0.4, 0.38, 0.17],
    [0.64, 0.52, 0.14],
    [0.42, 0.66, 0.12],
    [0.7, 0.28, 0.09],
    [0.26, 0.55, 0.09],
  ];
  for (const [u, v, r] of peaks.sort((a, b) => a[1] - b[1])) peak(p, u, v, r, k);
}

function paintVein(p: Painter, id: 'vein_iron' | 'vein_coal' | 'vein_gold'): void {
  const k = pal(id);
  ground(p, k, shade(k.base, -0.15), 0.4);
  for (const [u, v] of scatter(p, 40, 0.45))
    pebble(p, u, v, 0.01 + p.rng.next() * 0.018, mix(k.base, k.light, p.rng.next()));
  // Veios: faixas sinuosas na cor do minério.
  const glint = id === 'vein_coal' ? shade(PAPER(), -0.15) : shade(k.detail, 0.4);
  for (let i = 0; i < 5; i++) {
    const pts = crack(
      p,
      0.12 + p.rng.next() * 0.2,
      0.2 + p.rng.next() * 0.6,
      -0.4 + p.rng.next() * 0.8,
      0.75,
      18,
      0.7,
    );
    strokePath(p.c, pts, p.px(id === 'vein_coal' ? 0.03 : 0.02), rgba(shade(k.detail, -0.3), 0.8));
    strokePath(p.c, pts, p.px(id === 'vein_coal' ? 0.018 : 0.011), rgba(k.detail));
    strokePath(
      p.c,
      pts.map(([x, y]) => [x - 1.5, y - 1.5] as [number, number]),
      p.px(0.004),
      rgba(glint as RGB, 0.7),
    );
  }
  for (const [u, v] of scatter(p, id === 'vein_gold' ? 50 : 25, 0.44)) {
    p.c.fillStyle = rgba(glint as RGB, 0.9);
    p.c.beginPath();
    p.c.arc(p.px(u), p.px(v), p.px(0.003 + p.rng.next() * 0.004), 0, Math.PI * 2);
    p.c.fill();
  }
  if (id === 'vein_iron') {
    // Cristais azulados de minério.
    for (const [u, v] of scatter(p, 7, 0.35)) pebble(p, u, v, 0.022, k.detail);
  }
}

function paintTemple(p: Painter): void {
  const k = pal('temple');
  ground(p, { ...k, base: mix(k.base, GRASS().light, 0.5) }, GRASS().light, 0.5);
  const { c } = p;
  // Praça circular de pedra.
  c.fillStyle = rgba(k.base);
  c.beginPath();
  c.arc(p.px(0.5), p.px(0.5), p.px(0.3), 0, Math.PI * 2);
  c.fill();
  for (let ring = 0; ring < 4; ring++) {
    const r = 0.08 + ring * 0.065;
    c.strokeStyle = rgba(shade(k.dark, -0.2), 0.45);
    c.lineWidth = p.px(0.004);
    c.beginPath();
    c.arc(p.px(0.5), p.px(0.5), p.px(r), 0, Math.PI * 2);
    c.stroke();
    const n = 8 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring;
      c.beginPath();
      c.moveTo(p.px(0.5 + Math.cos(a) * r), p.px(0.5 + Math.sin(a) * r));
      c.lineTo(p.px(0.5 + Math.cos(a) * (r + 0.065)), p.px(0.5 + Math.sin(a) * (r + 0.065)));
      c.stroke();
    }
  }
  noiseTint(p, k.dark, 0.25, 9, 0.1);
  // Altar central dourado.
  blotch(p, 0.5, 0.5, 0.09, k.detail, 0.6);
  c.fillStyle = rgba(k.light);
  c.fillRect(p.px(0.465), p.px(0.465), p.px(0.07), p.px(0.07));
  c.strokeStyle = rgba(shade(k.dark, -0.3));
  c.strokeRect(p.px(0.465), p.px(0.465), p.px(0.07), p.px(0.07));
  // Musgo e trepadeiras.
  for (const [u, v] of scatter(p, 18, 0.3)) blotch(p, u, v, 0.03, GRASS().base, 0.35);
}

function paintRuin(p: Painter): void {
  const k = pal('ruin');
  ground(p, k, k.detail, 0.5);
  const { c } = p;
  // Fundações quebradas.
  const walls: [number, number, number, number][] = [
    [0.25, 0.3, 0.3, 0.035],
    [0.25, 0.3, 0.035, 0.25],
    [0.6, 0.35, 0.18, 0.035],
    [0.4, 0.62, 0.32, 0.035],
    [0.7, 0.45, 0.035, 0.2],
  ];
  for (const [u, v, w, h] of walls) {
    c.fillStyle = rgba(shade(k.dark, -0.7), 0.45);
    c.fillRect(p.px(u + 0.01), p.px(v + 0.012), p.px(w), p.px(h));
    c.fillStyle = rgba(k.light);
    c.fillRect(p.px(u), p.px(v), p.px(w), p.px(h));
    c.fillStyle = rgba(shade(k.light, 0.25), 0.8);
    c.fillRect(p.px(u), p.px(v), p.px(w), p.px(Math.min(h, 0.01)));
  }
  for (const [u, v] of scatter(p, 45, 0.42))
    pebble(p, u, v, 0.006 + p.rng.next() * 0.01, mix(k.base, k.light, p.rng.next()));
  for (const [u, v] of scatter(p, 22, 0.44)) blotch(p, u, v, 0.03, k.detail, 0.45);
}

function paintVolcano(p: Painter, e: CanvasRenderingContext2D): void {
  const k = pal('volcano');
  ground(p, k, shade(k.base, 0.1), 0.35);
  const { c } = p;
  // Encosta clara do cone, cratera escura, lava no centro.
  const g = c.createRadialGradient(p.px(0.42), p.px(0.42), p.px(0.05), p.px(0.5), p.px(0.5), p.px(0.4));
  g.addColorStop(0, rgba(k.light));
  g.addColorStop(0.6, rgba(k.base));
  g.addColorStop(1, rgba(k.dark, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, p.size, p.size);
  organicPath(p, 0.5, 0.5, 0.13, 0.15);
  c.fillStyle = rgba(shade(k.dark, -0.5));
  c.fill();
  const lava = k.detail;
  const lavaPaths: [number, number][][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + p.rng.next() * 0.6;
    lavaPaths.push(crack(p, 0.5 + Math.cos(a) * 0.1, 0.5 + Math.sin(a) * 0.1, a, 0.32, 10, 0.6));
  }
  for (const ctx of [c, e]) {
    for (const pts of lavaPaths) {
      strokePath(ctx, pts, p.px(0.022), rgba(shade(lava, -0.4), ctx === c ? 0.9 : 0.5));
      strokePath(ctx, pts, p.px(0.009), rgba(shade(lava, 0.3)));
    }
    organicPath({ ...p, c: ctx }, 0.5, 0.5, 0.075, 0.2, 3);
    const lg = ctx.createRadialGradient(p.px(0.5), p.px(0.5), 0, p.px(0.5), p.px(0.5), p.px(0.09));
    lg.addColorStop(0, rgba(shade(lava, 0.6)));
    lg.addColorStop(0.5, rgba(lava));
    lg.addColorStop(1, rgba(shade(lava, -0.5)));
    ctx.fillStyle = lg;
    ctx.fill();
  }
  brushStrokes(p, [k.base, k.light], 120, 0.02, 0.006, 0.25);
}

function paintGeyser(p: Painter): void {
  const k = pal('geyser');
  ground(p, k, pal('empty').light, 0.4);
  const { c } = p;
  // Terraços minerais em degraus.
  for (let i = 6; i >= 1; i--) {
    organicPath(p, 0.5, 0.52, 0.06 * i, 0.15, i);
    c.fillStyle = rgba(mix(k.light, pal('empty').light, (i % 2) * 0.35));
    c.fill();
    c.strokeStyle = rgba(shade(k.dark, -0.1), 0.5);
    c.lineWidth = p.px(0.004);
    c.stroke();
  }
  // Poças turquesa.
  for (const [u, v, r] of [
    [0.5, 0.5, 0.06],
    [0.34, 0.38, 0.035],
    [0.64, 0.66, 0.03],
  ] as const) {
    const g = c.createRadialGradient(p.px(u), p.px(v), 0, p.px(u), p.px(v), p.px(r));
    g.addColorStop(0, rgba(shade(k.detail, -0.4)));
    g.addColorStop(1, rgba(shade(k.detail, 0.3)));
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.px(u), p.px(v), p.px(r), 0, Math.PI * 2);
    c.fill();
  }
  blotch(p, 0.47, 0.47, 0.16, [255, 255, 255], 0.35);
}

function paintAcidSwamp(p: Painter, e: CanvasRenderingContext2D): void {
  const k = pal('acid_swamp');
  ground(p, k, k.dark, 0.5);
  const { c } = p;
  const pools: [number, number, number][] = [
    [0.42, 0.42, 0.14],
    [0.63, 0.6, 0.1],
    [0.36, 0.66, 0.07],
    [0.66, 0.34, 0.06],
  ];
  pools.forEach(([u, v, r], i) => {
    for (const ctx of [c, e]) {
      organicPath({ ...p, c: ctx }, u, v, r, 0.3, i * 7);
      const g = ctx.createRadialGradient(p.px(u), p.px(v), 0, p.px(u), p.px(v), p.px(r));
      g.addColorStop(0, rgba(k.detail, ctx === c ? 1 : 0.45));
      g.addColorStop(1, rgba(k.light, ctx === c ? 1 : 0));
      ctx.fillStyle = g;
      ctx.fill();
    }
  });
  for (let i = 0; i < 40; i++) {
    const [u, v] = pools[i % pools.length] ?? [0.5, 0.5, 0.1];
    c.strokeStyle = rgba(PAPER(), 0.5);
    c.lineWidth = p.px(0.003);
    c.beginPath();
    c.arc(
      p.px(u + (p.rng.next() - 0.5) * 0.12),
      p.px(v + (p.rng.next() - 0.5) * 0.12),
      p.px(0.005 + p.rng.next() * 0.008),
      0,
      Math.PI * 2,
    );
    c.stroke();
  }
  // Troncos mortos.
  for (let i = 0; i < 6; i++) {
    const pts = crack(
      p,
      0.15 + p.rng.next() * 0.7,
      0.15 + p.rng.next() * 0.7,
      p.rng.next() * 6,
      0.12,
      4,
      0.8,
    );
    strokePath(c, pts, p.px(0.01), rgba(WOOD(), 0.9));
  }
}

function paintWindCanyon(p: Painter): void {
  const k = pal('wind_canyon');
  const { c, size, noise } = p;
  // Estratos de arenito em faixas onduladas.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x += 2) {
      const n = noise.fbm((x / size) * 3, (y / size) * 3, 3);
      const band = Math.sin((y / size) * 26 + n * 7);
      const col = band > 0.3 ? k.light : band > -0.3 ? k.base : k.dark;
      c.fillStyle = rgba(mix(col, k.base, 0.25));
      c.fillRect(x, y, 2, 1);
    }
  }
  noiseTint(p, k.light, 0.2, 6, 0.08);
  // O cânion: fenda funda em diagonal.
  const pts = crack(p, 0.08, 0.72, -0.62, 0.95, 12, 0.35);
  strokePath(c, pts, p.px(0.12), rgba(shade(k.base, -0.3)));
  strokePath(c, pts, p.px(0.07), rgba(k.detail));
  strokePath(
    c,
    pts.map(([x, y]) => [x + 3, y + 3] as [number, number]),
    p.px(0.03),
    rgba(shade(k.detail, -0.5)),
  );
  strokePath(
    c,
    pts.map(([x, y]) => [x - p.px(0.05), y - p.px(0.03)] as [number, number]),
    p.px(0.008),
    rgba(shade(k.light, 0.3), 0.8),
  );
  // Rajadas de vento.
  for (let i = 0; i < 14; i++) {
    const u = p.rng.next() * 0.8 + 0.1;
    const v = p.rng.next() * 0.8 + 0.1;
    c.strokeStyle = rgba(PAPER(), 0.35);
    c.lineWidth = p.px(0.004);
    c.beginPath();
    c.moveTo(p.px(u), p.px(v));
    c.quadraticCurveTo(p.px(u + 0.06), p.px(v - 0.02), p.px(u + 0.13), p.px(v));
    c.stroke();
  }
}

function paintThinCrust(p: Painter, e: CanvasRenderingContext2D): void {
  const k = pal('thin_crust');
  ground(p, k, k.light, 0.3);
  // Placas trincadas sobre o magma.
  for (let i = 0; i < 16; i++) {
    const pts = crack(
      p,
      0.5 + (p.rng.next() - 0.5) * 0.3,
      0.5 + (p.rng.next() - 0.5) * 0.3,
      p.rng.next() * Math.PI * 2,
      0.4,
      10,
      0.9,
    );
    strokePath(p.c, pts, p.px(0.014), rgba(shade(k.dark, -0.5)));
    strokePath(p.c, pts, p.px(0.006), rgba(k.detail));
    strokePath(e, pts, p.px(0.014), rgba(k.detail, 0.6));
    strokePath(e, pts, p.px(0.005), rgba(shade(k.detail, 0.4)));
  }
  for (const [u, v] of scatter(p, 25, 0.42)) blotch(p, u, v, 0.04, shade(k.light, 0.15), 0.3);
}

function paintFreePort(p: Painter): void {
  const k = pal('free_port');
  ground(p, k, k.dark, 0.25);
  const { c } = p;
  // Plataforma octogonal de pouso.
  const oct = (r: number) => {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = p.px(0.5 + Math.cos(a) * r);
      const y = p.px(0.5 + Math.sin(a) * r);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  oct(0.3);
  c.fillStyle = rgba(k.light);
  c.fill();
  oct(0.3);
  c.save();
  c.clip();
  // Faixas de alerta na borda.
  for (let i = -20; i < 20; i++) {
    c.fillStyle = rgba(i % 2 ? k.detail : k.dark);
    c.beginPath();
    c.moveTo(p.px(i * 0.04), 0);
    c.lineTo(p.px(i * 0.04 + 0.02), 0);
    c.lineTo(p.px(i * 0.04 + 0.02 + 1), p.size);
    c.lineTo(p.px(i * 0.04 + 1), p.size);
    c.fill();
  }
  oct(0.26);
  c.fillStyle = rgba(k.base);
  c.fill();
  c.restore();
  noiseTint(p, k.dark, 0.2, 10, 0.08);
  c.strokeStyle = rgba(PAPER(), 0.85);
  c.lineWidth = p.px(0.012);
  c.beginPath();
  c.arc(p.px(0.5), p.px(0.5), p.px(0.15), 0, Math.PI * 2);
  c.stroke();
  // "H" de pouso desenhado como forma.
  c.fillStyle = rgba(PAPER(), 0.9);
  c.fillRect(p.px(0.45), p.px(0.43), p.px(0.025), p.px(0.14));
  c.fillRect(p.px(0.525), p.px(0.43), p.px(0.025), p.px(0.14));
  c.fillRect(p.px(0.45), p.px(0.488), p.px(0.1), p.px(0.024));
  // Contêineres ao lado.
  const crates: [number, number, RGB][] = [
    [0.14, 0.4, hexToRgb(palette.faction.revolutionaries.color)],
    [0.14, 0.5, hexToRgb(palette.faction.government.color)],
    [0.8, 0.55, hexToRgb(palette.faction.helix.color)],
  ];
  for (const [u, v, col] of crates) {
    c.fillStyle = rgba(shade(k.dark, -0.8), 0.4);
    c.fillRect(p.px(u + 0.008), p.px(v + 0.01), p.px(0.07), p.px(0.045));
    c.fillStyle = rgba(col);
    c.fillRect(p.px(u), p.px(v), p.px(0.07), p.px(0.045));
    c.fillStyle = rgba(shade(col, 0.3));
    c.fillRect(p.px(u), p.px(v), p.px(0.07), p.px(0.008));
  }
}

function paintMagnetic(p: Painter, e: CanvasRenderingContext2D): void {
  const k = pal('magnetic_anomaly');
  ground(p, k, k.dark, 0.45);
  // Linhas de campo concêntricas e pulsantes.
  for (let i = 1; i <= 7; i++) {
    for (const ctx of [p.c, e]) {
      organicPath({ ...p, c: ctx }, 0.5, 0.5, 0.055 * i, 0.08, i * 3);
      ctx.strokeStyle = rgba(k.detail, ctx === p.c ? 0.5 : 0.35 - i * 0.03);
      ctx.lineWidth = p.px(0.006);
      ctx.stroke();
    }
  }
  for (const [u, v] of scatter(p, 30, 0.44))
    pebble(p, u, v, 0.008 + p.rng.next() * 0.01, mix(k.base, k.light, p.rng.next()));
  blotch(p, 0.5, 0.5, 0.12, k.detail, 0.4);
}

/** Pintura do topo de um terreno; tamanho em pixels. */
export function paintTerrain(id: string, size: number): TerrainPainting {
  const { canvas, c } = makeCanvas(size);
  const p = makePainter(c, size, `terrain:${id}`);
  let emissive: HTMLCanvasElement | undefined;
  const glow = () => {
    const e = makeCanvas(size);
    e.c.fillStyle = '#000';
    e.c.fillRect(0, 0, size, size);
    emissive = e.canvas;
    return e.c;
  };

  switch (id) {
    case 'empty':
      paintEmpty(p);
      break;
    case 'forest':
      paintForest(p);
      break;
    case 'lagoon':
      paintLagoon(p);
      break;
    case 'mountain':
      paintMountain(p);
      break;
    case 'vein_iron':
    case 'vein_coal':
    case 'vein_gold':
      paintVein(p, id);
      break;
    case 'temple':
      paintTemple(p);
      break;
    case 'ruin':
      paintRuin(p);
      break;
    case 'volcano':
      paintVolcano(p, glow());
      break;
    case 'geyser':
      paintGeyser(p);
      break;
    case 'acid_swamp':
      paintAcidSwamp(p, glow());
      break;
    case 'wind_canyon':
      paintWindCanyon(p);
      break;
    case 'thin_crust':
      paintThinCrust(p, glow());
      break;
    case 'free_port':
      paintFreePort(p);
      break;
    case 'magnetic_anomaly':
      paintMagnetic(p, glow());
      break;
    default: {
      // Terreno sem pintura dedicada: nunca quebra (CLAUDE.md regra 7).
      const k = pal('empty');
      ground(p, k, k.detail);
    }
  }
  hexVignette(p);
  return { color: canvas, emissive };
}

/** Verso do tile (névoa): metal escuro escovado, grade hexagonal gravada e "?". */
export function paintFog(size: number): TerrainPainting {
  const { canvas, c } = makeCanvas(size);
  const p = makePainter(c, size, 'fog');
  const f = scene.fog;
  const base = hexToRgb(f.base);
  litGround(p, shade(base, 0.15), base, shade(base, -0.3));
  // Escovado horizontal.
  for (let i = 0; i < 400; i++) {
    const y = p.rng.next() * size;
    c.strokeStyle = rgba(p.rng.next() < 0.5 ? shade(base, 0.25) : shade(base, -0.3), 0.12);
    c.lineWidth = 1;
    c.beginPath();
    const x = p.rng.next() * size;
    c.moveTo(x, y);
    c.lineTo(x + p.px(0.1 + p.rng.next() * 0.3), y);
    c.stroke();
  }
  // Grade hexagonal gravada (sulco escuro + borda clara).
  const grid = hexToRgb(f.grid);
  const cell = 0.07;
  const hexPath = (cx: number, cy: number, r: number) => {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const x = p.px(cx + Math.cos(a) * r);
      const y = p.px(cy + Math.sin(a) * r);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  };
  for (let row = -1; row < 1 / (cell * 1.5) + 1; row++) {
    for (let col = -1; col < 1 / (cell * Math.sqrt(3)) + 1; col++) {
      const cx = col * cell * Math.sqrt(3) + (row % 2) * cell * (Math.sqrt(3) / 2);
      const cy = row * cell * 1.5;
      hexPath(cx + 0.002, cy + 0.002, cell * 0.92);
      c.strokeStyle = rgba(shade(grid, 0.35), 0.35);
      c.lineWidth = p.px(0.003);
      c.stroke();
      hexPath(cx, cy, cell * 0.92);
      c.strokeStyle = rgba(shade(base, -0.55), 0.7);
      c.stroke();
    }
  }
  // "?" gravado no centro (desenhado como forma, sem fonte).
  const e = makeCanvas(size);
  e.c.fillStyle = '#000';
  e.c.fillRect(0, 0, size, size);
  const glyph = (ctx: CanvasRenderingContext2D, dx: number, dy: number, style: string, w: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = p.px(w);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(p.px(0.5 + dx), p.px(0.42 + dy), p.px(0.1), Math.PI * 1.05, Math.PI * 0.45, false);
    ctx.quadraticCurveTo(p.px(0.5 + dx), p.px(0.52 + dy), p.px(0.5 + dx), p.px(0.58 + dy));
    ctx.stroke();
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.arc(p.px(0.5 + dx), p.px(0.67 + dy), p.px(w * 0.62), 0, Math.PI * 2);
    ctx.fill();
  };
  glyph(c, 0.004, 0.004, rgba(shade(hexToRgb(f.glyph), 0.4), 0.6), 0.045);
  glyph(c, 0, 0, rgba(shade(base, -0.6)), 0.045);
  glyph(c, 0, 0, rgba(hexToRgb(f.glyph), 0.9), 0.03);
  glyph(e.c, 0, 0, rgba(hexToRgb(f.glyphGlow), 0.35), 0.03);
  // Rebites perto dos vértices.
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6 + Math.PI / 6;
    const u = 0.5 + Math.cos(a) * 0.36;
    const v = 0.5 + Math.sin(a) * 0.36;
    pebble(p, u, v, 0.012, hexToRgb(scene.structure.metal));
  }
  hexVignette(p, 0.45);
  return { color: canvas, emissive: e.canvas };
}
