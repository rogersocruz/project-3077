/**
 * Medição de texto para o layout da carta. No navegador mede no canvas com as fontes
 * do jogo (ART_DIRECTION 3); sem DOM (testes) ou antes das fontes carregarem, usa uma
 * aproximação por número de caracteres.
 */
import { useEffect, useState } from 'react';
import { fonts } from '../theme/tokens';
import type { Measure } from './layout';

export interface Measurer {
  /** Barlow 500 / 700 (texto de efeito). */
  readonly body: Measure;
  /** Barlow Condensed 700 (título, fita). */
  display(text: string, size: number): number;
  /** Rajdhani 700 (números do custo, selo). */
  numeric(text: string, size: number): number;
}

export const approxMeasurer: Measurer = {
  body: (text, bold, size) => text.length * size * (bold ? 0.55 : 0.51),
  display: (text, size) => text.length * size * 0.47,
  numeric: (text, size) => text.length * size * 0.52,
};

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

function width(font: string, text: string): number {
  const key = `${font}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return text.length * 10;
  ctx.font = font;
  const w = ctx.measureText(text).width;
  cache.set(key, w);
  return w;
}

const canvasMeasurer: Measurer = {
  body: (text, bold, size) => width(`${bold ? 700 : 500} ${size}px ${fonts.body}`, text),
  display: (text, size) => width(`700 ${size}px ${fonts.display}`, text),
  numeric: (text, size) => width(`700 ${size}px ${fonts.numeric}`, text),
};

const FACES = [
  `500 20px ${fonts.body}`,
  `700 20px ${fonts.body}`,
  `italic 400 20px ${fonts.body}`,
  `700 20px ${fonts.display}`,
  `700 20px ${fonts.numeric}`,
];

let loading: Promise<void> | null = null;
let ready = false;

/** Carrega as faces da carta (uma vez) e zera o cache de medidas feitas antes delas. */
export function loadCardFonts(): Promise<void> {
  loading ??= (async () => {
    if (typeof document !== 'undefined' && document.fonts) {
      await Promise.all(FACES.map((f) => document.fonts.load(f)));
    }
    cache.clear();
    ready = true;
  })();
  return loading;
}

export function currentMeasurer(): Measurer {
  return ready && typeof document !== 'undefined' ? canvasMeasurer : approxMeasurer;
}

/** O medidor certo para o componente; re-renderiza quando as fontes chegam. */
export function useMeasurer(): Measurer {
  const [, setReady] = useState(ready);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void loadCardFonts().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  return currentMeasurer();
}
