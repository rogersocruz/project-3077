/**
 * SVG da carta → canvas, para as cartas 3D (ART_DIRECTION 4: "o mesmo SVG é rasterizado
 * para textura"). Uma imagem SVG não enxerga as fontes da página: as faces usadas vão
 * embutidas em base64 dentro do próprio SVG.
 */
import barlow400i from '@fontsource/barlow/files/barlow-latin-400-italic.woff2?url';
import barlow500 from '@fontsource/barlow/files/barlow-latin-500-normal.woff2?url';
import barlow700 from '@fontsource/barlow/files/barlow-latin-700-normal.woff2?url';
import condensed700 from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2?url';
import rajdhani700 from '@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2?url';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadCardFonts } from './measure';

const FONT_FILES = [
  { family: 'Barlow', weight: 500, style: 'normal', url: barlow500 },
  { family: 'Barlow', weight: 700, style: 'normal', url: barlow700 },
  { family: 'Barlow', weight: 400, style: 'italic', url: barlow400i },
  { family: 'Barlow Condensed', weight: 700, style: 'normal', url: condensed700 },
  { family: 'Rajdhani', weight: 700, style: 'normal', url: rajdhani700 },
] as const;

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

let fontCss: Promise<string> | null = null;

/** @font-face com as fontes em data URI (carregadas uma vez). */
function embeddedFonts(): Promise<string> {
  fontCss ??= Promise.all(
    FONT_FILES.map(async (f) => {
      const buf = await (await fetch(f.url)).arrayBuffer();
      return `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};src:url(data:font/woff2;base64,${base64(buf)}) format("woff2");}`;
    }),
  ).then((rules) => rules.join(''));
  return fontCss;
}

/** Marcação SVG autossuficiente (fontes embutidas) de um elemento <svg>. */
export async function svgMarkup(element: ReactElement): Promise<string> {
  await loadCardFonts();
  const css = await embeddedFonts();
  const markup = renderToStaticMarkup(element);
  return markup.replace(/<svg([^>]*)>/, `<svg$1><style>${css}</style>`);
}

/** Desenha o SVG num canvas de `width` × `height` px. */
export async function rasterize(
  element: ReactElement,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const markup = await svgMarkup(element);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('canvas 2D indisponível');
    c.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
