import { describe, expect, it } from 'vitest';
import { hashSeed, Rng } from './rng';

const take = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.next());

describe('rng — determinismo (CLAUDE.md, regra de arquitetura 1)', () => {
  it('mesma seed produz a mesma sequência', () => {
    expect(take(Rng.fromSeed(42), 100)).toEqual(take(Rng.fromSeed(42), 100));
    expect(take(Rng.fromSeed('partida'), 50)).toEqual(take(Rng.fromSeed('partida'), 50));
  });

  it('seeds diferentes produzem sequências diferentes', () => {
    expect(take(Rng.fromSeed(1), 10)).not.toEqual(take(Rng.fromSeed(2), 10));
  });

  it('seed textual é estável e equivale ao seu hash numérico', () => {
    expect(hashSeed('3077')).toBe(hashSeed('3077'));
    expect(take(Rng.fromSeed('3077'), 5)).toEqual(take(Rng.fromSeed(hashSeed('3077')), 5));
  });

  it('salvar e retomar pelo estado continua a mesma sequência', () => {
    const a = Rng.fromSeed(7);
    take(a, 13);
    const resumed = Rng.fromState(a.state);
    expect(take(resumed, 20)).toEqual(take(a, 20));
  });

  it('clone é independente do original', () => {
    const a = Rng.fromSeed(9);
    const b = a.clone();
    expect(a.next()).toBe(b.next());
    a.next();
    expect(a.state).not.toBe(b.state);
  });

  it('next() fica em [0, 1)', () => {
    for (const v of take(Rng.fromSeed(5), 10_000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() respeita limites inclusivos e cobre todos os valores', () => {
    const rng = Rng.fromSeed(11);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
    expect(() => rng.int(3, 2)).toThrow();
  });

  it('shuffle é permutação determinística e não altera a entrada', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const a = Rng.fromSeed(3).shuffle(input);
    const b = Rng.fromSeed(3).shuffle(input);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([...input]);
  });

  it('weightedPick respeita pesos (peso zero nunca sai)', () => {
    const rng = Rng.fromSeed(21);
    const counts = { a: 0, b: 0, c: 0 };
    const weights = { a: 3, b: 1, c: 0 } as const;
    for (let i = 0; i < 4000; i++) counts[rng.weightedPick(['a', 'b', 'c'] as const, (k) => weights[k])]++;
    expect(counts.c).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.4);
    expect(counts.a / counts.b).toBeLessThan(3.6);
  });
});
