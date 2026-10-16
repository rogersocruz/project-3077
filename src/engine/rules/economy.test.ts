import { describe, expect, it } from 'vitest';
import { checkAction } from '../legal';
import { applyAction } from '../reducer';
import { edit, key, makeContext, place, run, setResources, setTerrain, startedGame } from '../testing';
import { bankPrices, bankQuote } from './economy';

const ctx = makeContext(3);
const base = startedGame(ctx);
const V = key(0, 0, 0);
const N = key(0, 1, 0);

/** Passa a vez de todos e volta ao jogador 0 (dispara Produção e Manutenção dele). */
const fullRound = [0, 1, 2].map((p) => ({ type: 'endPhase' as const, player: p }));

describe('Produção (GDD 4.1, 6.2 fase 3)', () => {
  it.each([1, 2, 3])('Parque nível %i em Floresta produz a Comida do nível', (level) => {
    const s = edit(base, (d) => {
      setResources(d, 0, {});
      setTerrain(d, N, 'forest');
      place(d, N, 'park', 0, level);
    });
    const { state } = run(ctx, s, fullRound);
    expect(state.players[0]!.resources.food).toBe(ctx.balance.production.parkYieldByLevel[level - 1]);
  });

  it('Lagoa é a única fonte dupla: Comida + Pedregulho', () => {
    const s = edit(base, (d) => {
      setResources(d, 0, {});
      setTerrain(d, N, 'lagoon');
      place(d, N, 'park', 0, 2);
    });
    const { state } = run(ctx, s, fullRound);
    expect(state.players[0]!.resources).toMatchObject({ food: 2, stone: 2 });
  });

  it('Pedreira em Montanha produz Pedregulho; Veio de Ouro com Parque produz Ouro', () => {
    const s = edit(base, (d) => {
      setResources(d, 0, {});
      setTerrain(d, N, 'mountain');
      place(d, N, 'quarry', 0, 2);
      setTerrain(d, key(0, 0, 1), 'vein_gold');
      place(d, key(0, 0, 1), 'park', 0, 1);
    });
    const { state } = run(ctx, s, fullRound);
    expect(state.players[0]!.resources).toMatchObject({ stone: 2, gold: 1 });
  });

  it('só o jogador ativo produz, e só no próprio turno', () => {
    const s = edit(base, (d) => {
      setResources(d, 1, {});
      setTerrain(d, key(1, 1, 0), 'forest');
      place(d, key(1, 1, 0), 'park', 1, 1);
    });
    const r = run(ctx, s, [{ type: 'endPhase', player: 0 }]);
    expect(r.state.players[1]!.resources.food).toBe(1);
    expect(r.events.filter((e) => e.type === 'produced')).toHaveLength(1);
  });
});

describe('Mina (GDD 4.2): multiplicador, tokens e upkeep de Carvão', () => {
  const withMine = (coal: number, extra = {}) =>
    edit(base, (d) => {
      setResources(d, 0, { coal });
      setTerrain(d, N, 'empty', 'sub_iron');
      place(d, N, 'mine', 0, 1, { tokens: ctx.balance.production.mineTokens, ...extra });
    });

  it('produz multiplicador × 1 do recurso do subsolo e paga 1 Carvão na Manutenção', () => {
    const { state, events } = run(ctx, withMine(1), fullRound);
    expect(state.players[0]!.resources.iron).toBe(ctx.balance.production.mineMultiplier);
    expect(state.players[0]!.resources.coal).toBe(0);
    expect(events.some((e) => e.type === 'upkeepPaid')).toBe(true);
    expect(state.hexes[N]!.structures[0]!.tokens).toBe(ctx.balance.production.mineTokens - 1);
  });

  it('sem Carvão na Manutenção, a Mina não produz no próximo turno e depois volta', () => {
    let { state } = run(ctx, withMine(0), fullRound);
    expect(state.players[0]!.resources.iron).toBe(3); // produziu antes da manutenção
    expect(state.hexes[N]!.structures[0]!.idle).toBe(true);

    state = edit(state, (d) => setResources(d, 0, { coal: 5 }));
    const r = run(ctx, state, fullRound);
    expect(r.state.players[0]!.resources.iron).toBe(0); // ociosa
    expect(r.events.some((e) => e.type === 'mineIdle')).toBe(true);
    expect(r.state.hexes[N]!.structures[0]!.idle).toBe(false);

    const r2 = run(ctx, r.state, fullRound);
    expect(r2.state.players[0]!.resources.iron).toBe(3);
  });

  it('ao gastar o último token a Mina sai e o subsolo fica esgotado', () => {
    const { state, events } = run(ctx, withMine(5, { tokens: 1 }), fullRound);
    expect(state.hexes[N]!.structures).toHaveLength(0);
    expect(state.hexes[N]!.depleted).toBe(true);
    expect(events.some((e) => e.type === 'mineDepleted')).toBe(true);
  });

  it('Mina nível 2 usa o multiplicador do nível (structures.json)', () => {
    const s = edit(withMine(1), (d) => {
      d.hexes[N]!.structures[0]!.level = 2;
    });
    const { state } = run(ctx, s, fullRound);
    expect(state.players[0]!.resources.iron).toBe(ctx.structure('mine').levels[1]!.multiplier);
  });

  it('várias Minas pagam em ordem de construção; a que falta fica ociosa', () => {
    const s = edit(withMine(1), (d) => {
      setTerrain(d, key(0, 0, 1), 'empty', 'sub_stone');
      place(d, key(0, 0, 1), 'mine', 0, 1, { tokens: 4 });
    });
    const { state } = run(ctx, s, fullRound);
    // As duas produziram 3; o Carvão (1) pagou a primeira.
    expect(state.hexes[N]!.structures[0]!.idle).toBeFalsy();
    expect(state.hexes[key(0, 0, 1)]!.structures[0]!.idle).toBe(true);
  });
});

describe('Banca (GDD 5.2)', () => {
  it('compra pelo valor −1, vende pelo valor +1', () => {
    for (const r of ctx.data.resources) {
      expect(bankPrices(ctx, base, 0, r.id)).toEqual({ sell: r.value - 1, buy: r.value + 1 });
    }
  });

  it('troco arredonda a favor da banca', () => {
    // 2 Ouro → crédito 10; Ferro custa 3 → recebe 3, perde 1 de crédito.
    expect(bankQuote(ctx, base, 0, 'gold', 2, 'iron')).toEqual({ received: 3, lostCredit: 1 });
    const s = edit(base, (d) => setResources(d, 0, { gold: 2 }));
    const { state, events } = applyAction(ctx, s, {
      type: 'bankTrade',
      player: 0,
      give: 'gold',
      amount: 2,
      receive: 'iron',
    });
    expect(state.players[0]!.resources).toMatchObject({ gold: 0, iron: 3 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'bankTraded', lostCredit: 1 }));
  });

  it('comércio com a banca não gasta ação', () => {
    const { state } = applyAction(ctx, base, {
      type: 'bankTrade',
      player: 0,
      give: 'stone',
      amount: 2,
      receive: 'food',
    });
    expect(state.actionsLeft).toBe(base.actionsLeft);
  });

  it('crédito insuficiente é ilegal com motivo; Comida vale 0 para a banca', () => {
    expect(
      checkAction(ctx, base, { type: 'bankTrade', player: 0, give: 'food', amount: 4, receive: 'stone' }),
    ).toEqual({
      ok: false,
      reason: { key: 'bankCreditTooLow' },
    });
    expect(
      checkAction(ctx, base, { type: 'bankTrade', player: 0, give: 'iron', amount: 9, receive: 'food' }),
    ).toEqual({
      ok: false,
      reason: { key: 'cannotAfford' },
    });
  });

  it('Mercado reduz o spread do dono em 1 por nível, primeiro do lado da venda', () => {
    const s1 = edit(base, (d) => place(d, V, 'market', 0, 1));
    expect(bankPrices(ctx, s1, 0, 'gold')).toEqual({ sell: 5, buy: 6 });
    const s2 = edit(base, (d) => place(d, V, 'market', 0, 2));
    expect(bankPrices(ctx, s2, 0, 'gold')).toEqual({ sell: 6, buy: 6 });
    // Só o dono: os outros pagam o spread cheio.
    expect(bankPrices(ctx, s2, 1, 'gold')).toEqual({ sell: 5, buy: 7 });
  });
});
