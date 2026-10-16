/**
 * Fluxo das cartas: baralhos, compra pela Universidade, mão, entrega, revelação e
 * permanentes (GDD 6.2, 6.4, 7). Os efeitos de cada carta estão em effects/effects.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { cardEnabled } from '../effects/registry';
import { actionCost, checkAction, decider, legalActions } from '../legal';
import { applyAction, replay } from '../reducer';
import { createGame } from '../setup';
import { DRAW_DECKS, type GameState } from '../state';
import {
  cardsGame,
  edit,
  giveCard,
  installCard,
  key,
  makeContext,
  passTurn,
  place,
  RICH,
  run,
  setResources,
  setTerrain,
  untilTurnOf,
} from '../testing';
import { canUndo, undo, UNDOABLE_ACTIONS } from '../undo';
import { cardDefOf } from './permanents';
import { handLimit } from './decks';

const ctx = makeContext(3);

const reason = (s: GameState, a: Action) => {
  const r = checkAction(ctx, s, a);
  return r.ok ? null : r.reason.key;
};

const deckOf = (s: GameState, uid: number) => cardDefOf(ctx, s, uid).deck;

/** Recursos para pagar cartas sem atingir limiar de vitória no fim da rodada. */
const PLENTY = { food: 5, stone: 5, iron: 5, coal: 5, oil: 2, gold: 3 };

/** Todas as instâncias estão em exatamente um lugar (baralho, descarte, mão, slot, envelope, fora). */
function assertConservation(s: GameState): void {
  const places: number[] = [...s.cards.removed];
  for (const d of DRAW_DECKS) places.push(...s.cards.decks[d], ...s.cards.discards[d]);
  for (const p of s.players) {
    places.push(...p.hand, ...p.incoming.map((i) => i.card));
    for (const c of p.permanents) if (c !== null) places.push(c);
  }
  expect(places.sort((a, b) => a - b)).toEqual(s.cards.defs.map((_, i) => i));
}

describe('baralhos e mão inicial (GDD 6.4, 7)', () => {
  it('monta n1/n2/n3 só com cartas habilitadas: com Economia + Cartas, 31/28/9 (interpretação U)', () => {
    const s = createGame(ctx, { seed: 7, layers: { cards: true } });
    const total = (deck: string) =>
      ctx.data.cards
        .filter((c) => c.deck === deck && cardEnabled(c, s.layers))
        .reduce((sum, c) => sum + c.copies, 0);
    expect([total('n1'), total('n2'), total('n3')]).toEqual([31, 28, 9]);
    const inGame = (deck: string) => s.cards.defs.filter((id) => ctx.card(id).deck === deck).length;
    expect([inGame('n1'), inGame('n2'), inGame('n3')]).toEqual([31, 28, 9]);
    // Cartas de tropa (camada de conflito, Fase 7) não entram.
    expect(s.cards.defs).not.toContain('reinforcement_orbital');
    expect(s.cards.defs).not.toContain('tech_antigrav');
    assertConservation(s);
  });

  it('mão inicial de 3 cartas n1 por jogador (interpretação W)', () => {
    const s = createGame(ctx, { seed: 7, layers: { cards: true } });
    for (const p of s.players) {
      expect(p.hand).toHaveLength(ctx.balance.setup.startingHand);
      for (const c of p.hand) expect(deckOf(s, c)).toBe('n1');
    }
  });

  it('mesma seed = mesmas mãos; seed diferente embaralha diferente', () => {
    const a = createGame(ctx, { seed: 11, layers: { cards: true } });
    const b = createGame(ctx, { seed: 11, layers: { cards: true } });
    const c = createGame(ctx, { seed: 12, layers: { cards: true } });
    expect(a.cards).toEqual(b.cards);
    expect(a.cards.decks.n1).not.toEqual(c.cards.decks.n1);
  });

  it('sem a camada de cartas: nada de baralho nem mão, e o planeta é o mesmo de antes', () => {
    const off = createGame(ctx, { seed: 7 });
    const on = createGame(ctx, { seed: 7, layers: { cards: true } });
    expect(off.cards.defs).toHaveLength(0);
    expect(off.players.every((p) => p.hand.length === 0)).toBe(true);
    expect(on.hexes).toEqual(off.hexes);
  });
});

describe('Compra pela Universidade (GDD 6.4)', () => {
  it('sem Universidade: compra 1 n1 sozinha no início do turno', () => {
    const s = cardsGame(ctx);
    expect(s.phase).toBe('actions');
    expect(s.players[0]?.hand).toHaveLength(ctx.balance.setup.startingHand + 1);
  });

  it('Universidade 2: para na Compra, só aceita a escolha da linha, e 1 n2 entra na mão', () => {
    let s = edit(cardsGame(ctx), (x) => {
      place(x, key(1, 1, 0), 'university', 1, 2);
    });
    s = run(ctx, s, [
      { type: 'endPhase', player: 0 },
      { type: 'endPhase', player: 0 },
    ]).state;
    expect(s.activePlayer).toBe(1);
    expect(s.phase).toBe('draw');
    expect(decider(s)).toBe(1);
    expect(reason(s, { type: 'explore', player: 1, hex: key(1, 2, 0) })).toBe('drawChoicePending');
    expect(legalActions(ctx, s, 1).map((a) => a.type)).toEqual(['chooseDraw', 'chooseDraw']);
    const before = s.players[1]?.hand.length ?? 0;
    s = applyAction(ctx, s, { type: 'chooseDraw', player: 1, row: 1 }).state;
    const hand = s.players[1]?.hand ?? [];
    expect(hand).toHaveLength(before + 1);
    expect(deckOf(s, hand.at(-1) ?? -1)).toBe('n2');
    expect(s.phase).toBe('actions');
  });

  it('Universidade 3 oferece 3 linhas: 3 n1, 1 n2 + 1 n1, ou 1 n3', () => {
    let s = edit(cardsGame(ctx), (x) => {
      place(x, key(1, 1, 0), 'university', 1, 3);
    });
    s = run(ctx, s, [
      { type: 'endPhase', player: 0 },
      { type: 'endPhase', player: 0 },
    ]).state;
    expect(legalActions(ctx, s, 1)).toHaveLength(3);
    const before = s.players[1]?.hand.length ?? 0;
    const after = applyAction(ctx, s, { type: 'chooseDraw', player: 1, row: 0 }).state;
    expect(after.players[1]?.hand.length).toBe(before + 3);
    const n3 = applyAction(ctx, s, { type: 'chooseDraw', player: 1, row: 2 }).state;
    expect(deckOf(n3, n3.players[1]?.hand.at(-1) ?? -1)).toBe('n3');
    expect(reason(s, { type: 'chooseDraw', player: 1, row: 3 })).toBe('invalidOption');
  });

  it('baralho vazio rebaralha o próprio descarte (interpretação V)', () => {
    const s = edit(cardsGame(ctx), (x) => {
      x.cards.discards.n1 = x.cards.decks.n1.splice(0);
    });
    const r = passTurn(ctx, s);
    expect(r.events.some((e) => e.type === 'deckReshuffled' && e.deck === 'n1')).toBe(true);
    expect(r.events.some((e) => e.type === 'cardDrawn' && e.player === 1)).toBe(true);
    assertConservation(r.state);
  });
});

describe('limite de mão e descarte (GDD 6.4, 6.2 fase 7)', () => {
  it('Entrega não encerra com a mão acima do limite; descarta exatamente o excesso', () => {
    let s = edit(cardsGame(ctx), (x) => {
      for (let i = 0; i < 3; i++) giveCard(x, 0, 'convoy');
    });
    const hand = s.players[0]?.hand ?? [];
    expect(hand.length).toBe(7);
    s = applyAction(ctx, s, { type: 'endPhase', player: 0 }).state;
    expect(s.phase).toBe('delivery');
    expect(reason(s, { type: 'endPhase', player: 0 })).toBe('handOverLimit');
    expect(reason(s, { type: 'discardCards', player: 0, cards: hand.slice(0, 2) })).toBe('invalidDiscard');
    s = applyAction(ctx, s, { type: 'discardCards', player: 0, cards: hand.slice(0, 1) }).state;
    expect(reason(s, { type: 'endPhase', player: 0 })).toBeNull();
    expect(reason(s, { type: 'discardCards', player: 0, cards: s.players[0]?.hand.slice(0, 1) ?? [] })).toBe(
      'notOverLimit',
    );
    assertConservation(s);
  });

  it('Arquivo amplia o limite pelo maior nível (interpretação AG)', () => {
    const s = edit(cardsGame(ctx), (x) => {
      place(x, key(0, 1, 0), 'archive', 0, 2);
    });
    expect(handLimit(ctx, s, 0)).toBe(ctx.balance.cards.handLimit + 2);
  });
});

describe('entrega e revelação (GDD 6.2 fases 1 e 7, 7.1)', () => {
  const inDelivery = (fn?: (x: GameState) => void) =>
    applyAction(
      ctx,
      edit(cardsGame(ctx), (x) => {
        setResources(x, 0, PLENTY);
        fn?.(x);
      }),
      { type: 'endPhase', player: 0 },
    ).state;

  it('1 entrega por turno, nunca para si mesmo, e só na fase de Entrega', () => {
    let card = -1;
    let card2 = -1;
    let s = inDelivery((x) => {
      card = giveCard(x, 0, 'political_coup');
      card2 = giveCard(x, 0, 'political_coup');
    });
    expect(reason(s, { type: 'deliverCard', player: 0, card, to: 0 })).toBe('invalidRecipient');
    s = applyAction(ctx, s, { type: 'deliverCard', player: 0, card, to: 1 }).state;
    expect(s.players[1]?.incoming).toHaveLength(1);
    expect(reason(s, { type: 'deliverCard', player: 0, card: card2, to: 2 })).toBe('alreadyDelivered');
    const inActions = edit(cardsGame(ctx), (x) => {
      card = giveCard(x, 0, 'political_coup');
    });
    expect(reason(inActions, { type: 'deliverCard', player: 0, card, to: 1 })).toBe('wrongPhase');
  });

  it('carta própria não se entrega; carta entregue não se joga para si', () => {
    let own = -1;
    let sab = -1;
    const s = inDelivery((x) => {
      own = giveCard(x, 0, 'transmutation');
      sab = giveCard(x, 0, 'political_coup');
    });
    expect(reason(s, { type: 'deliverCard', player: 0, card: own, to: 1 })).toBe('notDeliverable');
    const actions = edit(cardsGame(ctx), (x) => {
      sab = giveCard(x, 0, 'political_coup');
    });
    expect(reason(actions, { type: 'playCard', player: 0, card: sab })).toBe('notPlayable');
  });

  it('teto de 2 recebidas por rodada bloqueia a entrega com motivo (interpretação X)', () => {
    let card = -1;
    const s = inDelivery((x) => {
      card = giveCard(x, 0, 'political_coup');
      const p1 = x.players[1];
      if (p1) p1.receivedThisRound = ctx.balance.cards.receiveCapPerRound;
    });
    expect(reason(s, { type: 'deliverCard', player: 0, card, to: 1 })).toBe('receiveCapReached');
    expect(reason(s, { type: 'deliverCard', player: 0, card, to: 2 })).toBeNull();
  });

  it('o custo é pago na entrega e a carta resolve na Revelação do alvo, na ordem de entrega', () => {
    let a = -1;
    let b = -1;
    let s = inDelivery((x) => {
      a = giveCard(x, 0, 'political_coup');
      setResources(x, 1, PLENTY);
      b = giveCard(x, 1, 'diplomatic_support');
    });
    const gold = s.players[0]?.resources.gold ?? 0;
    s = applyAction(ctx, s, { type: 'deliverCard', player: 0, card: a, to: 2 }).state;
    expect(s.players[0]?.resources.gold).toBe(gold - 1);
    s = applyAction(ctx, s, { type: 'endPhase', player: 0 }).state;
    // Turno de P1: entrega a P2 também.
    s = run(ctx, s, [
      { type: 'endPhase', player: 1 },
      { type: 'deliverCard', player: 1, card: b, to: 2 },
    ]).state;
    const r = passTurn(ctx, s);
    const revealed = r.events.filter((e) => e.type === 'cardRevealed').map((e) => e.card);
    expect(revealed).toEqual([a, b]);
    // Golpe (−1) e Apoio (+1): fica com as 3 ações do turno.
    expect(r.state.activePlayer).toBe(2);
    expect(r.state.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn);
    expect(r.state.players[2]?.incoming).toHaveLength(0);
    expect(r.state.cards.discards.n2).toEqual(expect.arrayContaining([a]));
    assertConservation(r.state);
  });

  it('alvo que deixou de valer até a Revelação: carta sem efeito, registrada (interpretação X)', () => {
    let card = -1;
    let park = -1;
    let s = inDelivery((x) => {
      card = giveCard(x, 0, 'demolition');
      setTerrain(x, key(2, 1, 0), 'forest');
      park = place(x, key(2, 1, 0), 'park', 2);
    });
    const discard = s.players[0]?.hand.filter((c) => c !== card).slice(0, 1) ?? [];
    s = applyAction(ctx, s, {
      type: 'deliverCard',
      player: 0,
      card,
      to: 2,
      target: { kind: 'structure', uid: park },
      discard,
    }).state;
    s = applyAction(ctx, s, { type: 'endPhase', player: 0 }).state;
    // Antes da Revelação de P2, o Parque some.
    s = edit(s, (x) => {
      const hex = x.hexes[key(2, 1, 0)];
      if (hex) hex.structures = [];
    });
    const r = passTurn(ctx, s);
    expect(r.state.activePlayer).toBe(2);
    expect(r.events).toContainEqual({ type: 'cardFizzled', from: 0, to: 2, card, reason: 'invalidTarget' });
    expect(r.state.cards.discards.n2).toContain(card);
  });

  it('o registro de recebidas zera no início da rodada', () => {
    let card = -1;
    let s = inDelivery((x) => {
      card = giveCard(x, 0, 'political_coup');
    });
    s = applyAction(ctx, s, { type: 'deliverCard', player: 0, card, to: 1 }).state;
    expect(s.players[1]?.receivedThisRound).toBe(1);
    s = untilTurnOf(ctx, applyAction(ctx, s, { type: 'endPhase', player: 0 }).state, 0).state;
    expect(s.round).toBe(2);
    expect(s.players[1]?.receivedThisRound).toBe(0);
  });
});

describe('permanentes (GDD 7.4)', () => {
  it('instalar custa 1 ação e os recursos, ocupa o primeiro slot livre', () => {
    let card = -1;
    let s = edit(cardsGame(ctx), (x) => {
      setResources(x, 0, { stone: 1 });
      card = giveCard(x, 0, 'tech_silos');
    });
    const install: Action = { type: 'installPermanent', player: 0, card };
    expect(actionCost(ctx, s, install)).toBe(1);
    s = applyAction(ctx, s, install).state;
    expect(s.players[0]?.permanents[0]).toBe(card);
    expect(s.players[0]?.resources.stone).toBe(0);
    expect(s.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn - 1);
  });

  it('com os 5 slots cheios, instalar exige substituir um, que sai do jogo', () => {
    let card = -1;
    let out = -1;
    let s = edit(cardsGame(ctx), (x) => {
      setResources(x, 0, RICH);
      out = installCard(x, 0, 'tech_silos');
      for (let i = 0; i < 4; i++) installCard(x, 0, 'tech_sensor_network');
      card = giveCard(x, 0, 'tech_orbital_logistics');
    });
    expect(reason(s, { type: 'installPermanent', player: 0, card })).toBe('slotsFull');
    s = applyAction(ctx, s, { type: 'installPermanent', player: 0, card, replace: out }).state;
    expect(s.players[0]?.permanents[0]).toBe(card);
    expect(s.cards.removed).toContain(out);
    assertConservation(s);
  });

  it('instalar pode ser desfeito; jogar ou entregar carta não (interpretação AI)', () => {
    expect(UNDOABLE_ACTIONS.has('installPermanent')).toBe(true);
    expect(UNDOABLE_ACTIONS.has('playCard')).toBe(false);
    expect(UNDOABLE_ACTIONS.has('deliverCard')).toBe(false);
    // Partida real (sem edição), para o desfazer poder refazer pelo log: procura uma seed
    // em que P0 comece com uma tecnologia que consiga instalar.
    for (let seed = 1; seed < 200; seed++) {
      const options = { seed, layers: { cards: true } } as const;
      let s0 = createGame(ctx, options);
      for (let p = 0; p < 3; p++) {
        s0 = applyAction(ctx, s0, { type: 'chooseVillage', player: p, hex: key(p, 0, 0) }).state;
      }
      const install = legalActions(ctx, s0, 0).find((a) => a.type === 'installPermanent');
      if (!install) continue;
      const s1 = applyAction(ctx, s0, install).state;
      expect(canUndo(s1)).toBe(true);
      expect(undo(ctx, options, s1)).toEqual(s0);
      return;
    }
    throw new Error('nenhuma seed com tecnologia instalável na mão inicial');
  });
});

describe('determinismo com cartas', () => {
  it('replay do log reproduz o estado (seed + log)', () => {
    const options = { seed: 5, layers: { cards: true } } as const;
    let s = createGame(ctx, options);
    for (let p = 0; p < 3; p++)
      s = applyAction(ctx, s, { type: 'chooseVillage', player: p, hex: key(p, 0, 0) }).state;
    for (let i = 0; i < 6; i++) s = passTurn(ctx, s).state;
    expect(replay(ctx, options, s.log)).toEqual(s);
    assertConservation(s);
  });
});
