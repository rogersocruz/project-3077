/** Registro da partida simulada: trajetória por rodada e marcos (experimentos de balanceamento). */
import { describe, expect, it } from 'vitest';
import { RESOURCE_IDS } from '../data/schemas';
import { makeContext } from '../engine/testing';
import { playSimGame } from './game';

describe('trajetória por rodada', { timeout: 60_000 }, () => {
  const ctx = makeContext(3);
  const r = playSimGame(ctx, { seed: 12, levels: ['normal'] });

  it('uma entrada por rodada; o último estoque é o estoque final', () => {
    for (const s of r.seats) {
      expect(s.trajectory).toHaveLength(r.rounds);
      const last = s.trajectory.at(-1);
      expect(last?.stock).toEqual(RESOURCE_IDS.map((id) => s.resources[id]));
    }
  });

  it('fluxos coerentes: produzido do registro = soma das rodadas', () => {
    for (const s of r.seats) {
      RESOURCE_IDS.forEach((id, i) => {
        const sum = s.trajectory.reduce((a, p) => a + (p.produced[i] ?? 0), 0);
        expect(sum).toBe(s.produced[id]);
      });
    }
  });

  it('variante de laboratório: sem vitória antes do limite de rodadas', () => {
    const lab = playSimGame(ctx, { seed: 12, levels: ['normal'], playToRoundLimit: true });
    expect(lab.rounds).toBe(ctx.balance.turn.roundLimit);
    expect(lab.seats.every((s) => s.trajectory.length === ctx.balance.turn.roundLimit)).toBe(true);
  });
});
