/**
 * Texto da carta em SVG (que não quebra linha sozinho): negrito por `**trecho**` e por
 * palavra-chave em MAIÚSCULAS (ART_DIRECTION 3), quebra gulosa com larguras medidas e
 * redução da fonte até caber no número de linhas. Puro: a medição é injetada.
 */

export interface Piece {
  readonly text: string;
  readonly bold: boolean;
}

/** Um pedaço posicionado numa linha (x relativo ao início da linha). */
export interface PlacedPiece extends Piece {
  readonly x: number;
}

export interface TextBlock {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly lines: readonly (readonly PlacedPiece[])[];
  /** true se nem a menor fonte coube nas linhas permitidas. */
  readonly overflow: boolean;
}

export type Measure = (text: string, bold: boolean, fontSize: number) => number;

/** Palavra-chave de regra: só maiúsculas (com acento), ao menos 2 letras. */
const KEYWORD = /^[^a-zà-ÿ]*[A-ZÀ-Þ]{2,}[^a-zà-ÿ]*$/;

/** "**a b** c" → pedaços com estilo. */
export function parseRich(text: string): Piece[] {
  const out: Piece[] = [];
  text.split('**').forEach((part, i) => {
    if (part) out.push({ text: part, bold: i % 2 === 1 });
  });
  return out;
}

/** Palavras (separadas por espaço), cada uma com seus pedaços de estilo. */
export function words(text: string): Piece[][] {
  const out: Piece[][] = [];
  let cur: Piece[] = [];
  for (const run of parseRich(text)) {
    for (const part of run.text.split(/(\s+)/)) {
      if (part === '') continue;
      if (/^\s+$/.test(part)) {
        if (cur.length) out.push(cur);
        cur = [];
        continue;
      }
      cur.push({ text: part, bold: run.bold });
    }
  }
  if (cur.length) out.push(cur);
  // Palavra inteira em maiúsculas sai em negrito, como nas cartas físicas.
  return out.map((w) => {
    const whole = w.map((p) => p.text).join('');
    return KEYWORD.test(whole) ? w.map((p) => ({ ...p, bold: true })) : w;
  });
}

function wordWidth(w: readonly Piece[], size: number, measure: Measure): number {
  return w.reduce((sum, p) => sum + measure(p.text, p.bold, size), 0);
}

/**
 * Quebra gulosa numa largura. Cada pedaço sai com x explícito (o SVG posiciona cada
 * tspan), então o espaço entre palavras é só a distância entre eles.
 */
export function wrap(text: string, width: number, size: number, measure: Measure): PlacedPiece[][] {
  const space = measure(' ', false, size);
  const lines: PlacedPiece[][] = [];
  let line: PlacedPiece[] = [];
  let x = 0;
  for (const w of words(text)) {
    const ww = wordWidth(w, size, measure);
    if (line.length && x + space + ww > width) {
      lines.push(line);
      line = [];
      x = 0;
    }
    let at = line.length ? x + space : 0;
    for (const p of w) {
      line.push({ ...p, x: at });
      at += measure(p.text, p.bold, size);
    }
    x = at;
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Maior fonte (da lista, decrescente) em que o texto cabe em `maxLines`. */
export function layoutText(
  text: string,
  opts: {
    readonly width: number;
    readonly maxLines: number;
    readonly sizes: readonly number[];
    readonly lineHeight: number;
    readonly measure: Measure;
  },
): TextBlock {
  let last: TextBlock | null = null;
  for (const size of opts.sizes) {
    const lines = wrap(text, opts.width, size, opts.measure);
    last = {
      fontSize: size,
      lineHeight: size * opts.lineHeight,
      lines,
      overflow: lines.length > opts.maxLines,
    };
    if (!last.overflow) return last;
  }
  if (!last) throw new RangeError('layoutText: nenhuma fonte');
  return last;
}

/** Maior fonte em que uma linha só cabe na largura (título). */
export function fitLine(
  text: string,
  width: number,
  sizes: readonly number[],
  bold: boolean,
  measure: Measure,
): number {
  for (const size of sizes) if (measure(text, bold, size) <= width) return size;
  return sizes.at(-1) ?? 12;
}
