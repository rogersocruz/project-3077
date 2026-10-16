import { describe, expect, it } from 'vitest';
import { checkAction } from './legal';
import { applyAction } from './reducer';
import { TURN_PHASES } from './state';
import { makeContext, run, startedGame } from './testing';

const ctx = makeContext(3);
const base = startedGame(ctx);

describe('Rodada e turno (GDD 6.1, 6.2)', () => {
  it('cada turno passa pelas 7 fases na ordem e para em Ações com 3 ações', () => {
    const { state, events } = applyAction(ctx, base, { type: 'endPhase', player: 0 });
    const phases = events
      .filter((e) => e.type === 'phaseChanged')
      .map((e) => (e.type === 'phaseChanged' ? e : null));
    expect(phases.slice(0, 2).map((e) => e?.phase)).toEqual(['combat', 'delivery']);
    expect(phases.slice(2).map((e) => [e?.player, e?.phase])).toEqual(
      TURN_PHASES.slice(0, 5).map((ph) => [1, ph]),
    );
    expect(state.activePlayer).toBe(1);
    expect(state.phase).toBe('actions');
    expect(state.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn);
  });

  it('depois do último jogador a rodada termina e a próxima começa pelo primeiro', () => {
    const { state, events } = run(
      ctx,
      base,
      [0, 1, 2].map((p) => ({ type: 'endPhase' as const, player: p })),
    );
    expect(state.round).toBe(2);
    expect(state.activePlayer).toBe(0);
    const types = events.map((e) => e.type);
    expect(types.indexOf('roundEnded')).toBeLessThan(types.indexOf('roundStarted'));
  });

  it('só o jogador ativo age', () => {
    expect(checkAction(ctx, base, { type: 'endPhase', player: 1 })).toMatchObject({
      reason: { key: 'notYourTurn' },
    });
  });

  it('ações de setup são recusadas durante a partida', () => {
    expect(checkAction(ctx, base, { type: 'chooseVillage', player: 0, hex: '0:0,0' })).toMatchObject({
      reason: { key: 'wrongStage' },
    });
  });

  it('com a camada de cartas, o turno espera a decisão na Entrega (fase 7)', () => {
    const withCards = startedGame(ctx, { layers: { cards: true } });
    const s = applyAction(ctx, withCards, { type: 'endPhase', player: 0 }).state;
    expect(s.phase).toBe('delivery');
    expect(s.activePlayer).toBe(0);
    expect(checkAction(ctx, s, { type: 'explore', player: 0, hex: '0:2,0' })).toMatchObject({
      reason: { key: 'wrongPhase' },
    });
    expect(applyAction(ctx, s, { type: 'endPhase', player: 0 }).state.activePlayer).toBe(1);
  });

  it('o estado de entrada nunca é alterado (motor puro)', () => {
    const snapshot = structuredClone(base);
    applyAction(ctx, base, { type: 'explore', player: 0, hex: '0:2,0' });
    expect(base).toEqual(snapshot);
  });

  it('ação ilegal lança erro com o motivo', () => {
    expect(() => applyAction(ctx, base, { type: 'endPhase', player: 2 })).toThrow(/notYourTurn/);
  });
});
