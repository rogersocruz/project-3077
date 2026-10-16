import { describe, expect, it } from 'vitest';
import { createContext } from './context';
import { checkAction, decider, legalActions } from './legal';
import { applyAction } from './reducer';
import { edit, makeContext, run, setResources, startedGame } from './testing';

const ctx = makeContext(3);
const base = edit(startedGame(ctx), (d) => {
  setResources(d, 0, { food: 5, gold: 2 });
  setResources(d, 1, { iron: 4 });
});
const offer = { type: 'proposeTrade' as const, player: 0, to: 1, give: { gold: 1 }, receive: { iron: 3 } };

describe('Comércio entre jogadores (GDD 5.3)', () => {
  it('proposta → aceite troca os recursos dos dois lados, sem gastar ação', () => {
    const { state, events } = run(ctx, base, [offer, { type: 'acceptTrade', player: 1 }]);
    expect(state.players[0]!.resources).toMatchObject({ gold: 1, iron: 3 });
    expect(state.players[1]!.resources).toMatchObject({ gold: 1, iron: 1 });
    expect(state.actionsLeft).toBe(base.actionsLeft);
    expect(state.pendingTrade).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['tradeProposed', 'tradeAccepted']);
  });

  it('recusa e cancelamento não movem recursos', () => {
    for (const close of [
      { type: 'rejectTrade' as const, player: 1 },
      { type: 'cancelTrade' as const, player: 0 },
    ]) {
      const { state } = run(ctx, base, [offer, close]);
      expect(state.players).toEqual(base.players);
      expect(state.pendingTrade).toBeNull();
    }
  });

  it('com proposta pendente, decide o destinatário e o resto do turno espera', () => {
    const s = applyAction(ctx, base, offer).state;
    expect(decider(s)).toBe(1);
    expect(checkAction(ctx, s, { type: 'endPhase', player: 0 })).toMatchObject({
      reason: { key: 'tradePending' },
    });
    expect(checkAction(ctx, s, { type: 'acceptTrade', player: 0 })).toMatchObject({
      reason: { key: 'notTradeRecipient' },
    });
    expect(checkAction(ctx, s, { type: 'acceptTrade', player: 2 })).toMatchObject({
      reason: { key: 'notTradeRecipient' },
    });
    expect(legalActions(ctx, s, 1).map((a) => a.type)).toEqual([
      'acceptTrade',
      'rejectTrade',
      'counterTrade',
    ]);
    expect(legalActions(ctx, s, 0).map((a) => a.type)).toEqual(['cancelTrade']);
  });

  it('contraproposta inverte o sentido: quem propôs passa a decidir (interpretação O)', () => {
    const counter = { type: 'counterTrade' as const, player: 1, give: { iron: 2 }, receive: { gold: 1 } };
    const { state, events } = run(ctx, base, [offer, counter]);
    expect(state.pendingTrade).toEqual({ from: 1, to: 0, give: { iron: 2 }, receive: { gold: 1 } });
    expect(decider(state)).toBe(0);
    expect(events.at(-1)).toEqual({ type: 'tradeCountered', from: 1, to: 0 });
    // O jogador ativo aceita a contraproposta: 1 Ouro por 2 Ferro.
    const done = run(ctx, state, [{ type: 'acceptTrade', player: 0 }]).state;
    expect(done.players[0]!.resources).toMatchObject({ gold: 1, iron: 2 });
    expect(done.players[1]!.resources).toMatchObject({ gold: 1, iron: 2 });
    expect(done.pendingTrade).toBeNull();
  });

  it('contraproposta: só o destinatário, com o que ele tem, e pode ir e voltar', () => {
    const s = applyAction(ctx, base, offer).state;
    const counter = { type: 'counterTrade' as const, player: 1, give: { iron: 2 }, receive: { gold: 1 } };
    expect(checkAction(ctx, s, { ...counter, player: 0 })).toMatchObject({
      reason: { key: 'notTradeRecipient' },
    });
    expect(checkAction(ctx, s, { ...counter, give: { iron: 9 } })).toMatchObject({
      reason: { key: 'cannotAfford' },
    });
    expect(checkAction(ctx, s, { ...counter, give: {}, receive: {} })).toMatchObject({
      reason: { key: 'emptyTrade' },
    });
    expect(checkAction(ctx, base, counter)).toMatchObject({ reason: { key: 'noTradePending' } });
    const back = run(ctx, s, [
      counter,
      { type: 'counterTrade', player: 0, give: { gold: 1 }, receive: { iron: 3 } },
    ]);
    expect(back.state.pendingTrade).toMatchObject({ from: 0, to: 1 });
    expect(decider(back.state)).toBe(1);
  });

  it('o destinatário só aceita se puder pagar', () => {
    const s = applyAction(ctx, base, { ...offer, receive: { iron: 9 } }).state;
    expect(checkAction(ctx, s, { type: 'acceptTrade', player: 1 })).toMatchObject({
      reason: { key: 'cannotAfford' },
    });
  });

  it('proposta inválida: sem recursos, vazia, consigo mesmo ou fora do turno', () => {
    expect(checkAction(ctx, base, { ...offer, give: { gold: 3 } })).toMatchObject({
      reason: { key: 'cannotAfford' },
    });
    expect(checkAction(ctx, base, { ...offer, give: {}, receive: {} })).toMatchObject({
      reason: { key: 'emptyTrade' },
    });
    expect(checkAction(ctx, base, { ...offer, to: 0 })).toMatchObject({
      reason: { key: 'invalidTradePartner' },
    });
    expect(checkAction(ctx, base, { ...offer, give: { gold: -1 } })).toMatchObject({
      reason: { key: 'invalidAmounts' },
    });
    expect(checkAction(ctx, base, { ...offer, player: 1, to: 0 })).toMatchObject({
      reason: { key: 'notYourTurn' },
    });
  });

  it('com trade.requiresAdjacentBoard, só entre tabuleiros vizinhos', () => {
    const data = structuredClone(ctx.data);
    data.balance.trade.requiresAdjacentBoard = true;
    // 6 jogadores em anel: os tabuleiros 0 e 3 ficam em lados opostos.
    const ctx6 = createContext(data, 6);
    const s = edit(startedGame(ctx6), (d) => setResources(d, 0, { gold: 1 }));
    expect(ctx6.planet.areBoardsAdjacent(0, 3)).toBe(false);
    const far = { type: 'proposeTrade' as const, player: 0, to: 3, give: { gold: 1 }, receive: {} };
    expect(checkAction(ctx6, s, far)).toMatchObject({ reason: { key: 'boardsNotAdjacent' } });
    expect(checkAction(ctx6, s, { ...far, to: 1 }).ok).toBe(true);
  });
});
