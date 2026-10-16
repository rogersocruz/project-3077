import { describe, expect, it } from 'vitest';
import { checkAction } from '../legal';
import { createContext } from '../context';
import { edit, key, makeContext, place, run, setResources, startedGame } from '../testing';
import { expansionCount, progress } from './victory';

const ctx = makeContext(3);
const base = startedGame(ctx);
const endRound = (from = 0) => [0, 1, 2].slice(from).map((p) => ({ type: 'endPhase' as const, player: p }));

describe('Vitória (GDD 13.1)', () => {
  it('acúmulo: atingir o limiar não encerra na hora — a rodada termina e então se verifica', () => {
    const s = edit(base, (d) => setResources(d, 1, { gold: ctx.balance.victory.resourceThresholds.gold }));
    const mid = run(ctx, s, endRound().slice(0, 2)).state;
    expect(mid.stage).toBe('playing');
    const { state, events } = run(ctx, mid, endRound(2));
    expect(state.stage).toBe('over');
    expect(state.winners).toEqual([1]);
    expect(state.endReason).toBe('condition');
    expect(events.at(-1)).toEqual({ type: 'gameOver', winners: [1], reason: 'condition' });
    expect(checkAction(ctx, state, { type: 'endPhase', player: 0 })).toMatchObject({
      reason: { key: 'gameOver' },
    });
  });

  it('expansão: estruturas em N hexes distintos (a Vila conta; duas no mesmo hex contam 1)', () => {
    const s = edit(base, (d) => {
      place(d, key(0, 0, 0), 'workshop', 0);
      place(d, key(0, 1, 0), 'outpost', 0);
    });
    expect(expansionCount(s, 0)).toBe(2);
    const many = edit(base, (d) => {
      const hexes = ctx.planet.hexes
        .filter((h) => h.boardId === 0)
        .slice(0, ctx.balance.victory.expansionHexes);
      for (const h of hexes) place(d, key(0, h.q, h.r), 'wall', 0);
    });
    expect(progress(ctx, many, 0).met).toContain('expansion');
    expect(run(ctx, many, endRound()).state.winners).toEqual([0]);
  });

  it('dois jogadores atingem condição: vence o maior progresso somado', () => {
    const t = ctx.balance.victory.resourceThresholds;
    const s = edit(base, (d) => {
      setResources(d, 0, { gold: t.gold });
      setResources(d, 2, { gold: t.gold, iron: 5 });
    });
    expect(run(ctx, s, endRound()).state.winners).toEqual([2]);
  });

  it('empate persistente: vitória compartilhada (victory.finalTie = shared)', () => {
    const t = ctx.balance.victory.resourceThresholds;
    const s = edit(base, (d) => {
      setResources(d, 0, { gold: t.gold });
      setResources(d, 2, { gold: t.gold });
      setResources(d, 1, {});
    });
    expect(run(ctx, s, endRound()).state.winners).toEqual([0, 2]);

    const data = structuredClone(ctx.data);
    data.balance.victory.finalTie = 'seatOrder';
    const ctxSeat = createContext(data, 3);
    expect(run(ctxSeat, s, endRound()).state.winners).toEqual([0]);
  });

  it('o progresso de cada trilha tem teto de 100%', () => {
    const s = edit(base, (d) => setResources(d, 0, { food: 1000 }));
    expect(progress(ctx, s, 0).tracks.food).toBe(1);
  });

  it('limite de rodadas: sem condição, vence o maior progresso', () => {
    const s = edit(base, (d) => {
      d.round = ctx.balance.turn.roundLimit;
      setResources(d, 0, { stone: 3 });
      setResources(d, 1, { stone: 9 });
      setResources(d, 2, { stone: 1 });
    });
    const { state } = run(ctx, s, endRound());
    expect(state.stage).toBe('over');
    expect(state.endReason).toBe('roundLimit');
    expect(state.winners).toEqual([1]);
  });
});
