/**
 * Gerador de números aleatórios com seed (mulberry32).
 * Única fonte de aleatoriedade do jogo: mesma seed + mesma sequência de chamadas
 * = mesmos resultados. O estado é um único uint32, serializável no estado da partida.
 */

export type Seed = number | string;

/** FNV-1a 32 bits: transforma seeds textuais ("partida-42") em uint32. */
export function hashSeed(seed: Seed): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private s: number;

  private constructor(state: number) {
    this.s = state >>> 0;
  }

  static fromSeed(seed: Seed): Rng {
    return new Rng(hashSeed(seed));
  }

  /** Retoma exatamente do ponto salvo por `state`. */
  static fromState(state: number): Rng {
    return new Rng(state);
  }

  get state(): number {
    return this.s;
  }

  clone(): Rng {
    return new Rng(this.s);
  }

  /** Float uniforme em [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro uniforme em [min, max] (inclusivo). */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.int: intervalo inválido [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: lista vazia');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Escolha ponderada; pesos devem ser ≥ 0 com soma > 0. */
  weightedPick<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const item of items) {
      const w = weight(item);
      if (w < 0 || !Number.isFinite(w)) throw new RangeError('Rng.weightedPick: peso inválido');
      total += w;
    }
    if (total <= 0) throw new RangeError('Rng.weightedPick: soma de pesos zero');
    let roll = this.next() * total;
    for (const item of items) {
      roll -= weight(item);
      if (roll < 0) return item;
    }
    return items[items.length - 1] as T;
  }

  /** Fisher–Yates; devolve uma nova lista, não altera a original. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

/**
 * Seed nova para uma partida ("dado" da tela de nova partida). É a única entrada não
 * determinística do jogo e nunca é chamada pelo motor: a partida em si só usa a seed.
 */
export function freshSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] ?? 1) % 1_000_000;
}
