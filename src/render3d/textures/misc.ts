/**
 * Outras pinturas procedurais: tampo de madeira, metal escovado da bandeja,
 * face substituta de carta permanente e tampa da caixa do jogo.
 */
import { palette, scene, type CardCategoryKey } from '../../ui/theme/tokens';
import { hexToRgb, makeCanvas, makePainter, mix, rgba, shade } from './paint';

/** Tábuas de madeira quente com veios (ART_DIRECTION 6). */
export function paintWood(size: number): HTMLCanvasElement {
  const { canvas, c } = makeCanvas(size);
  const p = makePainter(c, size, 'wood');
  const w = scene.wood;
  const dark = hexToRgb(w.dark);
  const mid = hexToRgb(w.mid);
  const light = hexToRgb(w.light);
  const grain = hexToRgb(w.grain);
  const planks = 4;
  const ph = size / planks;
  const img = c.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const plank = Math.floor(y / ph);
    const tone = p.noise.value(plank * 7.3, 3.1);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Veios: senoide deformada por ruído, alongada no sentido da tábua.
      const n = p.noise.fbm(u * 2 + plank * 11, v * 10, 4);
      const ring = Math.sin(v * 22 + n * 9 + plank * 3);
      const fine = p.noise.value(u * 90, v * 40 + plank * 5);
      let col = mix(mid, light, 0.25 + tone * 0.45);
      col = mix(col, dark, Math.max(0, ring) * 0.35);
      col = mix(col, grain, Math.max(0, fine - 0.72) * 0.9);
      const edge = Math.min(y % ph, ph - (y % ph));
      if (edge < 1.5) col = mix(col, grain, 0.75);
      const i = (y * size + x) * 4;
      d[i] = col[0];
      d[i + 1] = col[1];
      d[i + 2] = col[2];
      d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  return canvas;
}

/** Metal escuro escovado (bandejas, molduras). */
export function paintBrushedMetal(size: number): HTMLCanvasElement {
  const { canvas, c } = makeCanvas(size);
  const p = makePainter(c, size, 'metal');
  const base = hexToRgb(palette.frame[800]);
  c.fillStyle = rgba(base);
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 3; i++) {
    const y = p.rng.next() * size;
    const x = p.rng.next() * size;
    c.strokeStyle = rgba(p.rng.next() < 0.5 ? shade(base, 0.22) : shade(base, -0.35), 0.18);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + size * (0.05 + p.rng.next() * 0.2), y);
    c.stroke();
  }
  return canvas;
}

/**
 * Face substituta de carta permanente (até a Fase 4 trazer o SVG da carta):
 * moldura, header na cor da categoria, área de ilustração em gradiente, painel creme.
 */
export function paintCardFace(category: CardCategoryKey, width: number): HTMLCanvasElement {
  const h = Math.round((width * 88) / 63);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('canvas 2D indisponível');
  const cat = palette.card[category];
  const frame = hexToRgb(palette.frame[800]);
  c.fillStyle = rgba(frame);
  c.fillRect(0, 0, width, h);
  const m = width * 0.05;
  // Header.
  const hg = c.createLinearGradient(0, 0, width, 0);
  hg.addColorStop(0, cat.headerFrom);
  hg.addColorStop(1, cat.headerTo);
  c.fillStyle = hg;
  c.fillRect(m, m, width - 2 * m, h * 0.1);
  // Ilustração substituta: gradiente da categoria + ícone circular.
  const ig = c.createLinearGradient(0, h * 0.14, width, h * 0.55);
  ig.addColorStop(0, rgba(shade(hexToRgb(cat.headerFrom), 0.25)));
  ig.addColorStop(1, rgba(shade(hexToRgb(cat.headerTo), -0.3)));
  c.fillStyle = ig;
  c.fillRect(m, h * 0.13, width - 2 * m, h * 0.42);
  c.strokeStyle = rgba(hexToRgb(palette.paper[100]), 0.55);
  c.lineWidth = width * 0.025;
  c.beginPath();
  c.arc(width / 2, h * 0.34, width * 0.16, 0, Math.PI * 2);
  c.stroke();
  // Fita do tipo.
  c.fillStyle = cat.ribbon;
  c.beginPath();
  c.moveTo(width * 0.2, h * 0.55);
  c.lineTo(width * 0.8, h * 0.55);
  c.lineTo(width * 0.75, h * 0.6);
  c.lineTo(width * 0.25, h * 0.6);
  c.closePath();
  c.fill();
  // Painel de texto creme com linhas.
  c.fillStyle = palette.paper[100];
  c.fillRect(m, h * 0.61, width - 2 * m, h * 0.33);
  c.fillStyle = rgba(hexToRgb(palette.ink[600]), 0.45);
  for (let i = 0; i < 4; i++)
    c.fillRect(m * 2, h * (0.66 + i * 0.06), (width - 4 * m) * (i === 3 ? 0.6 : 1), h * 0.012);
  // Etiqueta de versão (canto laranja).
  c.fillStyle = palette.accent.orange;
  c.beginPath();
  c.moveTo(width - m, h - m);
  c.lineTo(width - m - width * 0.1, h - m);
  c.lineTo(width - m, h - m - width * 0.1);
  c.closePath();
  c.fill();
  return canvas;
}

/** Tampa da caixa: placa "PROJETO 3077" (texto vindo do i18n). */
export function paintBoxLid(
  size: number,
  word: string,
  number: string,
  fontDisplay: string,
): HTMLCanvasElement {
  const { canvas, c } = makeCanvas(size);
  const base = hexToRgb(scene.props.box);
  const g = c.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, rgba(shade(base, 0.12)));
  g.addColorStop(1, rgba(shade(base, -0.3)));
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  c.strokeStyle = palette.frame.edge;
  c.lineWidth = size * 0.012;
  c.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = palette.paper[100];
  c.font = `700 ${size * 0.1}px ${fontDisplay}`;
  c.fillText(word.toUpperCase(), size / 2, size * 0.4);
  c.fillStyle = palette.accent.orange;
  c.font = `700 ${size * 0.22}px ${fontDisplay}`;
  c.fillText(number, size / 2, size * 0.58);
  return canvas;
}
