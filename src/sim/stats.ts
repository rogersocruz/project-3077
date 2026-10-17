/** Estatística dos relatórios de simulação: intervalos de confiança de 95% e medianas. */

export interface Interval {
  readonly value: number;
  readonly lo: number;
  readonly hi: number;
}

const Z = 1.959964;

/** Proporção k/n com intervalo de Wilson (bom também perto de 0% e 100%). */
export function wilson(k: number, n: number): Interval {
  if (n === 0) return { value: 0, lo: 0, hi: 0 };
  const p = k / n;
  const z2 = Z * Z;
  const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { value: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/** Média com intervalo t-normal (1,96 · desvio / √n). */
export function meanCI(values: readonly number[]): Interval {
  const n = values.length;
  if (n === 0) return { value: 0, lo: 0, hi: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { value: mean, lo: mean, hi: mean };
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const half = (Z * sd) / Math.sqrt(n);
  return { value: mean, lo: mean - half, hi: mean + half };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const pctN = (x: number) => (x * 100).toFixed(1);

/** "24,0% [18,6–30,4]" */
export function fmtRate(i: Interval): string {
  return `${pctN(i.value)}% [${pctN(i.lo)}–${pctN(i.hi)}]`;
}

/** "8,90 [8,71–9,09]" */
export function fmtMean(i: Interval, digits = 2): string {
  return `${i.value.toFixed(digits)} [${i.lo.toFixed(digits)}–${i.hi.toFixed(digits)}]`;
}
