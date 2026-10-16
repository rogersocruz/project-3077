import { describe, expect, it } from 'vitest';
import { actionTargets } from './legal';
import { applyAction } from './reducer';
import { edit, key, makeContext, RICH, run, setResources, setTerrain, startedGame } from './testing';
import { canUndo, undo } from './undo';

const ctx = makeContext(3);
const options = { seed: 1 };
const N = key(0, 1, 0);

// Partida montada só por ações (sem edição): o replay do desfazer a reproduz.
const realGame = () => startedGame(ctx, options);

describe('Desfazer na fase de Ações (UX_SPEC 3.3, interpretação P da Fase 3)', () => {
  it('desfaz a última troca com a banca e devolve exatamente o estado anterior', () => {
    const s0 = realGame();
    const s1 = applyAction(ctx, s0, {
      type: 'bankTrade',
      player: 0,
      give: 'stone',
      amount: 2,
      receive: 'food',
    }).state;
    expect(canUndo(s1)).toBe(true);
    expect(undo(ctx, options, s1)).toEqual(s0);
  });

  it('desfaz várias seguidas, até a última informação revelada', () => {
    const s0 = realGame();
    const target = actionTargets(ctx, s0, 0, { type: 'explore' })[0];
    if (!target) throw new Error('sem hex para explorar');
    const explored = applyAction(ctx, s0, { type: 'explore', player: 0, hex: target }).state;
    expect(canUndo(explored)).toBe(false);
    const { state: s2 } = run(ctx, explored, [
      { type: 'bankTrade', player: 0, give: 'stone', amount: 2, receive: 'food' },
      { type: 'bankTrade', player: 0, give: 'iron', amount: 2, receive: 'food' },
    ]);
    const s1 = undo(ctx, options, s2);
    expect(canUndo(s1)).toBe(true);
    const back = undo(ctx, options, s1);
    expect(back).toEqual(explored);
    expect(canUndo(back)).toBe(false);
  });

  it('não desfaz Explorar, Sondar, troca entre jogadores nem encerramento de fase', () => {
    const s0 = realGame();
    expect(canUndo(s0)).toBe(false);
    expect(canUndo(applyAction(ctx, s0, { type: 'endPhase', player: 0 }).state)).toBe(false);
    expect(canUndo(applyAction(ctx, s0, { type: 'survey', player: 0, hex: key(0, 0, 0) }).state)).toBe(false);
    const offer = { type: 'proposeTrade' as const, player: 0, to: 1, give: { food: 1 }, receive: {} };
    expect(canUndo(applyAction(ctx, s0, offer).state)).toBe(false);
    expect(canUndo(run(ctx, s0, [offer, { type: 'acceptTrade', player: 1 }]).state)).toBe(false);
  });

  it('Construir e Melhorar são desfazíveis; sem nada a desfazer, undo falha', () => {
    const s = edit(realGame(), (d) => {
      setResources(d, 0, RICH);
      setTerrain(d, N, 'forest');
    });
    const built = applyAction(ctx, s, { type: 'build', player: 0, structure: 'park', hex: N }).state;
    expect(canUndo(built)).toBe(true);
    const withShop = applyAction(ctx, built, {
      type: 'build',
      player: 0,
      structure: 'workshop',
      hex: N,
    }).state;
    const uid = withShop.hexes[N]?.structures.find((x) => x.type === 'park')?.uid ?? -1;
    expect(canUndo(applyAction(ctx, withShop, { type: 'upgrade', player: 0, uid }).state)).toBe(true);
    expect(() => undo(ctx, options, realGame())).toThrow();
  });
});
