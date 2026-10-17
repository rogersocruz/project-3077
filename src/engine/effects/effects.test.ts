/**
 * Um teste por efeito de carta (GDD 7, cards.json, PROMPTS Fase 4 item 4). Cenários
 * montados por edição do estado; cartas entregues resolvem na Revelação do alvo.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../data';
import type { Action } from '../actions';
import { createContext } from '../context';
import type { GameEvent } from '../events';
import { hexKeyOf } from '../queries';
import { checkAction } from '../legal';
import { applyAction } from '../reducer';
import { rangeSources } from '../rules/build';
import { cardResourceCost } from '../rules/cards';
import { cardDefOf } from '../rules/permanents';
import type { CardTarget, CardUid, GameState, HexKey, PlayerId } from '../state';
import {
  cardsGame,
  edit,
  giveCard,
  installCard,
  key,
  makeContext,
  passTurn,
  place,
  run,
  setResources,
  setTerrain,
  untilTurnOf,
} from '../testing';
import { CARD_EFFECTS, effectIssues, effectOf } from './registry';
import { radiusArea } from './targets';
import { type ApplyScope } from './types';

const ctx = makeContext(3);
/** Paga cartas sem atingir limiar de vitória no fim da rodada. */
const PLENTY = { food: 5, stone: 5, iron: 5, coal: 5, oil: 2, gold: 3 };

const play = (s: GameState, a: Action) => applyAction(ctx, s, a);
const why = (s: GameState, a: Action) => {
  const r = checkAction(ctx, s, a);
  return r.ok ? null : r.reason.key;
};
const res = (s: GameState, p: PlayerId) => s.players[p]?.resources ?? PLENTY;
const others = (s: GameState, p: PlayerId, except: readonly CardUid[], n: number) =>
  (s.players[p]?.hand ?? []).filter((c) => !except.includes(c)).slice(0, n);
const producedBy = (events: GameEvent[], uid: number) =>
  events.filter((e) => e.type === 'produced' && e.uid === uid);

/** Partida com cartas, P0 nas Ações com recursos e a carta `id` na mão. */
function withCard(id: string, setup?: (x: GameState) => void): { s: GameState; card: CardUid } {
  let card = -1;
  const s = edit(cardsGame(ctx), (x) => {
    setResources(x, 0, PLENTY);
    setup?.(x);
    card = giveCard(x, 0, id);
  });
  return { s, card };
}

/** Jogar carta própria com o descarte de custo escolhido automaticamente. */
function playCard(s: GameState, card: CardUid, target?: CardTarget, extra: Partial<Action> = {}): Action {
  const n = cardDefOf(ctx, s, card).cost.discard ?? 0;
  return {
    type: 'playCard',
    player: 0,
    card,
    ...(target ? { target } : {}),
    ...(n ? { discard: others(s, 0, [card], n) } : {}),
    ...extra,
  } as Action;
}

/**
 * P0 entrega `id` a `to` com o alvo dado e encerra o turno; devolve o estado logo depois
 * da Revelação do destinatário (com os eventos até lá).
 */
function deliverAndReveal(
  id: string,
  to: PlayerId,
  targetOf: CardTarget | undefined | ((s: GameState) => CardTarget),
  setup?: (x: GameState) => void,
  extra: { sacrifice?: CardUid } = {},
): { state: GameState; events: GameEvent[]; card: CardUid } {
  const { s: s0, card } = withCard(id, setup);
  let s = play(s0, { type: 'endPhase', player: 0 }).state;
  const target = typeof targetOf === 'function' ? targetOf(s) : targetOf;
  const n = ctx.card(id).cost.discard ?? 0;
  s = play(s, {
    type: 'deliverCard',
    player: 0,
    card,
    to,
    ...(target ? { target } : {}),
    ...(n ? { discard: others(s, 0, [card], n) } : {}),
    ...extra,
  }).state;
  let r = run(ctx, s, [{ type: 'endPhase', player: 0 }]);
  if (r.state.phase === 'draw') {
    const d = run(ctx, r.state, [{ type: 'chooseDraw', player: r.state.activePlayer, row: 0 }]);
    r = { state: d.state, events: [...r.events, ...d.events] };
  }
  if (to === 1) return { state: r.state, events: r.events, card };
  const r2 = passTurn(ctx, r.state);
  return { state: r2.state, events: [...r.events, ...r2.events], card };
}

function scopeOf(
  s: GameState,
  player: PlayerId,
  card: CardUid,
  recipient: PlayerId | null = null,
): ApplyScope {
  return { ctx, state: s, player, recipient, card, def: cardDefOf(ctx, s, card), stage: 'play', events: [] };
}

/** Par de hexes vizinhos através da fronteira: [tabuleiro 0, outro tabuleiro]. */
function borderPair(): [HexKey, HexKey, number] {
  for (const a of ctx.planet.hexes) {
    if (a.boardId !== 0) continue;
    for (const b of ctx.planet.neighbors(a)) {
      if (b.boardId !== 0) return [hexKeyOf(a), hexKeyOf(b), b.boardId];
    }
  }
  throw new Error('sem fronteira');
}

/** Hex de outro tabuleiro a até `d` da Vila de P0. */
function otherBoardWithin(d: number): HexKey {
  const village = ctx.planet.hexes.find((h) => h.boardId === 0 && h.q === 0 && h.r === 0);
  const h = ctx.planet.hexes.find((x) => village && x.boardId !== 0 && ctx.planet.distance(village, x) <= d);
  if (!h) throw new Error(`nenhum hex de outro tabuleiro a ${d}`);
  return hexKeyOf(h);
}

const forestPark = (x: GameState, hex: HexKey, owner: PlayerId, level = 1) => {
  setTerrain(x, hex, 'forest');
  return place(x, hex, 'park', owner, level);
};

/** Alvo: a estrutura do tipo dado no hex. */
const structureAt =
  (hex: HexKey, type: string) =>
  (s: GameState): CardTarget => ({
    kind: 'structure',
    uid: s.hexes[hex]?.structures.find((st) => st.type === type)?.uid ?? -1,
  });

/** Alvo: o permanente no slot do jogador. */
const permanentAt =
  (player: PlayerId, slot: number) =>
  (s: GameState): CardTarget => ({
    kind: 'permanent',
    player,
    card: s.players[player]?.permanents[slot] ?? -1,
  });

const ownMine = (x: GameState, hex: HexKey, owner: PlayerId, subsoil = 'sub_iron') => {
  const h = x.hexes[hex];
  if (h) {
    h.subsoil = subsoil;
    h.surveyedBy.push(owner);
  }
  return place(x, hex, 'mine', owner, 1, { tokens: 4 });
};

// ── Recursos e ações do turno ────────────────────────────────────────────────

describe('Comboio / Cofre Precursor (gainResourceChoice)', () => {
  it('Comboio: descarta 1 e recebe 2 de um recurso escolhido, menos Ouro e Petróleo', () => {
    const { s, card } = withCard('convoy');
    expect(why(s, playCard(s, card, { kind: 'resource', resource: 'gold' }))).toBe('resourceNotAllowed');
    expect(why(s, playCard(s, card))).toBe('targetRequired');
    expect(why(s, playCard(s, card, { kind: 'resource', resource: 'iron' }, { discard: [] }))).toBe(
      'invalidDiscard',
    );
    const a = playCard(s, card, { kind: 'resource', resource: 'iron' });
    const after = play(s, a).state;
    expect(res(after, 0).iron).toBe(PLENTY.iron + 2);
    expect(after.players[0]?.hand).not.toContain(card);
    expect(after.cards.discards.n1).toEqual(expect.arrayContaining([card]));
    expect(after.actionsLeft).toBe(s.actionsLeft);
  });

  it('Cofre Precursor: só Ouro ou Petróleo, 4 unidades', () => {
    const s = edit(cardsGame(ctx), (x) => {
      giveCard(x, 0, 'treasure_cache');
    });
    const card = s.players[0]?.hand.at(-1) ?? -1;
    const sc = scopeOf(s, 0, card);
    const h = effectOf(sc.def);
    expect(h.check(sc, { kind: 'resource', resource: 'food' })?.key).toBe('resourceNotAllowed');
    const x = structuredClone(s);
    h.apply({ ...scopeOf(x, 0, card) }, { kind: 'resource', resource: 'oil' });
    expect(res(x, 0).oil).toBe(res(s, 0).oil + 4);
  });
});

describe('Transmutação (gainResource)', () => {
  it('4 Ferro viram 1 Ouro; sem o Ferro, recusa', () => {
    const { s, card } = withCard('transmutation');
    const after = play(s, playCard(s, card)).state;
    expect(res(after, 0).iron).toBe(PLENTY.iron - 4);
    expect(res(after, 0).gold).toBe(PLENTY.gold + 1);
    const poor = edit(s, (x) => setResources(x, 0, { iron: 3 }));
    expect(why(poor, playCard(poor, card))).toBe('cannotAfford');
  });
});

describe('Pilhagem (stealResource, interpretação Y)', () => {
  it('o alvo perde até 2 do recurso escolhido na entrega; o remetente recebe 1', () => {
    const r = deliverAndReveal('plunder', 1, { kind: 'resource', resource: 'iron' }, (x) =>
      setResources(x, 1, { iron: 5 }),
    );
    expect(res(r.state, 1).iron).toBe(3);
    // Pagou 1 Comida na entrega e recebeu 1 Ferro na Revelação.
    expect(res(r.state, 0).food).toBe(PLENTY.food - 1);
    expect(res(r.state, 0).iron).toBe(PLENTY.iron + 1);
  });

  it('alvo com 1 perde 1; alvo sem nada não dá nada', () => {
    const one = deliverAndReveal('plunder', 1, { kind: 'resource', resource: 'gold' }, (x) =>
      setResources(x, 1, { gold: 1 }),
    );
    expect(res(one.state, 1).gold).toBe(0);
    expect(res(one.state, 0).gold).toBe(PLENTY.gold + 1);
    const none = deliverAndReveal('plunder', 1, { kind: 'resource', resource: 'oil' }, (x) =>
      setResources(x, 1, {}),
    );
    expect(res(none.state, 0).oil).toBe(PLENTY.oil);
    expect(none.events.some((e) => e.type === 'resourcesLost')).toBe(false);
  });
});

describe('Apoio Diplomático e Golpe Político (extraAction / loseAction)', () => {
  it('Apoio: +1 ação no turno em que o alvo revela a carta', () => {
    const r = deliverAndReveal('diplomatic_support', 1, undefined);
    expect(r.state.activePlayer).toBe(1);
    expect(r.state.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn + 1);
  });

  it('Golpe: −1 ação no turno do alvo', () => {
    const r = deliverAndReveal('political_coup', 1, undefined);
    expect(r.state.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn - 1);
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'actionsChanged', player: 1, delta: -1 }),
    );
  });
});

// ── Estruturas e hexes ───────────────────────────────────────────────────────

describe('Sobrecarga (overload, interpretação Z)', () => {
  it('produz de novo na hora e fica inativa na próxima Produção do dono', () => {
    let park = -1;
    const { s, card } = withCard('overload', (x) => {
      park = forestPark(x, key(0, 1, 0), 0);
    });
    const after = play(s, playCard(s, card, { kind: 'structure', uid: park })).state;
    expect(res(after, 0).food).toBe(PLENTY.food + 1);
    const second = edit(after, (x) => void giveCard(x, 0, 'overload'));
    const another = second.players[0]?.hand.at(-1) ?? -1;
    expect(why(second, playCard(second, another, { kind: 'structure', uid: park }))).toBe(
      'alreadyOverloaded',
    );
    const next = untilTurnOf(ctx, after, 0);
    expect(producedBy(next.events, park)).toHaveLength(0);
    expect(next.events).toContainEqual({
      type: 'structureInactive',
      player: 0,
      hex: key(0, 1, 0),
      uid: park,
    });
    const again = untilTurnOf(ctx, next.state, 0);
    expect(producedBy(again.events, park)).toHaveLength(1);
  });

  it('só estrutura de extração própria, que tenha o que produzir', () => {
    const { s, card } = withCard('overload');
    const village = s.hexes[key(0, 0, 0)]?.structures[0]?.uid ?? -1;
    expect(why(s, playCard(s, card, { kind: 'structure', uid: village }))).toBe('notExtraction');
    const theirs = edit(s, (x) => void forestPark(x, key(1, 1, 0), 1));
    const uid = theirs.hexes[key(1, 1, 0)]?.structures[0]?.uid ?? -1;
    expect(why(theirs, playCard(theirs, card, { kind: 'structure', uid }))).toBe('notYourStructure');
  });
});

describe('Pane Induzida (structureNoProduce)', () => {
  it('a estrutura de extração do alvo não produz no turno da Revelação; volta no seguinte', () => {
    let park = -1;
    const r = deliverAndReveal('induced_failure', 1, structureAt(key(1, 1, 0), 'park'), (x) => {
      park = forestPark(x, key(1, 1, 0), 1);
    });
    expect(producedBy(r.events, park)).toHaveLength(0);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'structureInactive', uid: park }));
    const later = untilTurnOf(ctx, r.state, 1);
    expect(producedBy(later.events, park)).toHaveLength(1);
  });

  it('alvo precisa ser estrutura de extração do destinatário', () => {
    let park = -1;
    let card = -1;
    let s = edit(cardsGame(ctx), (x) => {
      setResources(x, 0, PLENTY);
      park = forestPark(x, key(0, 1, 0), 0);
      card = giveCard(x, 0, 'induced_failure');
    });
    s = play(s, { type: 'endPhase', player: 0 }).state;
    const village1 = s.hexes[key(1, 0, 0)]?.structures[0]?.uid ?? -1;
    const deliver = (uid: number): Action => ({
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'structure', uid },
    });
    expect(why(s, deliver(village1))).toBe('notExtraction');
    expect(why(s, deliver(park))).toBe('invalidTarget');
  });
});

describe('Bomba de Íons (ionPulse, interpretação AB)', () => {
  it('Minas no hex e vizinhos ficam desligadas na rodada: não produzem nem pagam, sem ficar ociosas', () => {
    let mine = -1;
    let park = -1;
    const r = deliverAndReveal('ion_bomb', 1, { kind: 'hex', hex: key(1, 0, 0) }, (x) => {
      mine = ownMine(x, key(1, 1, 0), 1);
      park = forestPark(x, key(1, 0, 1), 1);
      setResources(x, 1, { coal: 3 });
    });
    expect(producedBy(r.events, mine)).toHaveLength(0);
    expect(producedBy(r.events, park)).toHaveLength(1);
    expect(
      r.events.some((e) => (e.type === 'upkeepPaid' || e.type === 'upkeepMissed') && e.uid === mine),
    ).toBe(false);
    expect(res(r.state, 1).coal).toBe(3);
    const later = untilTurnOf(ctx, r.state, 1);
    expect(producedBy(later.events, mine)).toHaveLength(1);
  });

  it('o hex precisa ficar no tabuleiro do destinatário (alcance DRONE, interpretação T)', () => {
    const { s: s0, card } = withCard('ion_bomb');
    const s = play(s0, { type: 'endPhase', player: 0 }).state;
    const a: Action = {
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'hex', hex: key(0, 1, 0) },
      discard: others(s, 0, [card], 2),
    };
    expect(why(s, a)).toBe('notTargetBoard');
  });
});

describe('Terraformação (hexYieldBonus, interpretação AC)', () => {
  it('+1 em cada recurso do hex: Floresta rende 2 Comida; Lagoa 2 Comida e 2 Pedregulho', () => {
    let forest = -1;
    let lagoon = -1;
    const { s, card } = withCard('terraform', (x) => {
      forest = forestPark(x, key(0, 1, 0), 0);
      setTerrain(x, key(0, 0, 1), 'lagoon');
      lagoon = place(x, key(0, 0, 1), 'park', 0);
    });
    let after = play(s, playCard(s, card, { kind: 'hex', hex: key(0, 1, 0) })).state;
    after = edit(after, (x) => {
      const h = x.hexes[key(0, 0, 1)];
      if (h) h.yieldBonus += 1;
    });
    const r = untilTurnOf(ctx, after, 0);
    expect(producedBy(r.events, forest)).toEqual([expect.objectContaining({ resource: 'food', amount: 2 })]);
    expect(producedBy(r.events, lagoon).map((e) => (e.type === 'produced' ? e.amount : 0))).toEqual([2, 2]);
  });

  it('só hex revelado do próprio tabuleiro que produza algo', () => {
    const { s, card } = withCard('terraform', (x) => {
      setTerrain(x, key(0, 1, 0), 'empty');
      setTerrain(x, key(0, 2, 0), 'forest', undefined, false);
    });
    expect(why(s, playCard(s, card, { kind: 'hex', hex: key(0, 1, 0) }))).toBe('noYield');
    expect(why(s, playCard(s, card, { kind: 'hex', hex: key(0, 2, 0) }))).toBe('hexHidden');
    expect(why(s, playCard(s, card, { kind: 'hex', hex: key(1, 1, 0) }))).toBe('notOwnBoard');
  });
});

describe('Colapso de Galeria (sealSubsoil, interpretação AA)', () => {
  it('sela o subsolo: a Mina para e não paga; não se constrói Mina; o dono limpa com 2 ações', () => {
    let mine = -1;
    const r = deliverAndReveal('gallery_collapse', 1, { kind: 'hex', hex: key(1, 1, 0) }, (x) => {
      mine = ownMine(x, key(1, 1, 0), 1);
      setResources(x, 1, { coal: 2, stone: 5, iron: 5, food: 5 });
      place(x, key(1, -1, 0), 'university', 1, 2); // Mina é r2
      const h = x.hexes[key(1, 0, 1)];
      if (h) {
        h.subsoil = 'sub_gold';
        h.surveyedBy.push(1);
      }
    });
    const s = r.state;
    expect(s.hexes[key(1, 1, 0)]?.seal).toEqual({ clearActions: 2 });
    expect(producedBy(r.events, mine)).toHaveLength(0);
    expect(res(s, 1).coal).toBe(2);
    // Outro hex selado à mão: Construir Mina recusa.
    const sealed = edit(s, (x) => {
      const h = x.hexes[key(1, 0, 1)];
      if (h) h.seal = { clearActions: 2 };
    });
    expect(why(sealed, { type: 'build', player: 1, structure: 'mine', hex: key(1, 0, 1) })).toBe(
      'subsoilSealed',
    );
    const clear: Action = { type: 'clearSeal', player: 1, hex: key(1, 1, 0) };
    const cleared = play(s, clear).state;
    expect(cleared.hexes[key(1, 1, 0)]?.seal).toBeNull();
    expect(cleared.actionsLeft).toBe(s.actionsLeft - 2);
    expect(why(cleared, clear)).toBe('notSealed');
  });

  it('não sela de novo um subsolo já selado', () => {
    const { s: s0, card } = withCard('gallery_collapse', (x) => {
      const h = x.hexes[key(1, 1, 0)];
      if (h) h.seal = { clearActions: 2 };
    });
    const s = play(s0, { type: 'endPhase', player: 0 }).state;
    expect(
      why(s, {
        type: 'deliverCard',
        player: 0,
        card,
        to: 1,
        target: { kind: 'hex', hex: key(1, 1, 0) },
        discard: others(s, 0, [card], 1),
      }),
    ).toBe('alreadySealed');
  });
});

describe('Demolição e Ataque Orbital (destroyStructure, interpretação S)', () => {
  const parkAt11 = structureAt(key(1, 1, 0), 'park');

  it('Demolição destrói a estrutura alvo', () => {
    let park = -1;
    const r = deliverAndReveal('demolition', 1, parkAt11, (x) => {
      park = forestPark(x, key(1, 1, 0), 1);
    });
    expect(r.state.hexes[key(1, 1, 0)]?.structures).toHaveLength(0);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'structureDestroyed', uid: park }));
  });

  it('Muro no hex absorve: cai (nível 1 = destruído) e o alvo fica', () => {
    const r = deliverAndReveal('demolition', 1, parkAt11, (x) => {
      forestPark(x, key(1, 1, 0), 1);
      place(x, key(1, 1, 0), 'wall', 1);
    });
    const types = r.state.hexes[key(1, 1, 0)]?.structures.map((st) => st.type);
    expect(types).toEqual(['park']);
  });

  it('Posto nível 2 no hex absorve caindo para o nível 1', () => {
    const r = deliverAndReveal('demolition', 1, parkAt11, (x) => {
      forestPark(x, key(1, 1, 0), 1);
      place(x, key(1, 1, 0), 'outpost', 1, 2);
    });
    const outpost = r.state.hexes[key(1, 1, 0)]?.structures.find((st) => st.type === 'outpost');
    expect(outpost?.level).toBe(1);
    expect(r.state.hexes[key(1, 1, 0)]?.structures).toHaveLength(2);
  });

  it('Ataque Orbital ignora Muro e Posto', () => {
    const r = deliverAndReveal('orbital_strike', 1, parkAt11, (x) => {
      forestPark(x, key(1, 1, 0), 1);
      place(x, key(1, 1, 0), 'wall', 1);
    });
    expect(r.state.hexes[key(1, 1, 0)]?.structures.map((st) => st.type)).toEqual(['wall']);
  });

  it('a Vila não pode ser alvo', () => {
    const { s: s0, card } = withCard('demolition');
    const s = play(s0, { type: 'endPhase', player: 0 }).state;
    const village = s.hexes[key(1, 0, 0)]?.structures[0]?.uid ?? -1;
    expect(
      why(s, {
        type: 'deliverCard',
        player: 0,
        card,
        to: 1,
        target: { kind: 'structure', uid: village },
        discard: others(s, 0, [card], 1),
      }),
    ).toBe('indestructible');
  });
});

describe('Pesquisa Avançada (freeUpgrade, interpretação AD)', () => {
  it('sobe 1 nível sem custo e sem ação; a Oficina continua exigida', () => {
    let park = -1;
    const { s, card } = withCard('advanced_research', (x) => {
      park = forestPark(x, key(0, 1, 0), 0);
    });
    expect(why(s, playCard(s, card, { kind: 'structure', uid: park }))).toBe('needsWorkshop');
    const ok = edit(s, (x) => void place(x, key(0, 0, 1), 'workshop', 0));
    const after = play(ok, playCard(ok, card, { kind: 'structure', uid: park })).state;
    expect(after.hexes[key(0, 1, 0)]?.structures[0]?.level).toBe(2);
    expect(res(after, 0)).toEqual({ ...PLENTY, gold: PLENTY.gold - 1 });
    expect(after.actionsLeft).toBe(ok.actionsLeft);
  });
});

// ── Informação ───────────────────────────────────────────────────────────────

describe('Auditoria (revealStructures)', () => {
  it('relata estruturas na área a partir da Vila/Posto e revela o recurso das Minas (D10)', () => {
    const [mine0, theirs, board] = borderPair();
    const { s, card } = withCard('audit', (x) => {
      place(x, mine0, 'outpost', 0);
      ownMine(x, theirs, board, 'sub_gold');
    });
    expect(why(s, playCard(s, card, { kind: 'hex', hex: key(0, 2, 0) }))).toBe('notRangeOrigin');
    const r = play(s, playCard(s, card, { kind: 'hex', hex: mine0 }));
    expect(r.state.hexes[theirs]?.surveyedBy).toContain(0);
    const intel = r.events.find((e) => e.type === 'intel');
    expect(intel?.type === 'intel' && intel.report.kind === 'structures' && intel.report.structures).toEqual(
      expect.arrayContaining([expect.objectContaining({ hex: theirs, type: 'mine', produces: { gold: 3 } })]),
    );
  });

  it('RAIO atravessa fronteira só com cards.radiusCrossesBorder (interpretação T)', () => {
    const [a, b] = borderPair();
    const s = cardsGame(ctx);
    const origin = s.hexes[a];
    if (!origin) throw new Error('hex');
    expect(radiusArea(ctx, s, 0, origin, 1)).toContain(b);
    const data = loadGameData();
    const closed = createContext(
      { ...data, balance: { ...data.balance, cards: { ...data.balance.cards, radiusCrossesBorder: false } } },
      3,
    );
    expect(radiusArea(closed, s, 0, origin, 1)).not.toContain(b);
  });
});

describe('Sondagem Profunda (revealSubsoilArea)', () => {
  it('revela o subsolo de todos os hexes a até 2 da origem escolhida', () => {
    const { s, card } = withCard('deep_survey');
    const r = play(s, playCard(s, card, { kind: 'hex', hex: key(0, 0, 0) }));
    const village = r.state.hexes[key(0, 0, 0)];
    const area = ctx.planet.hexes.filter((h) => village && ctx.planet.distance(village, h) <= 2);
    expect(area.length).toBe(19);
    for (const h of area) expect(r.state.hexes[hexKeyOf(h)]?.surveyedBy).toContain(0);
    expect(res(r.state, 0).coal).toBe(PLENTY.coal - 1);
  });
});

describe('Reconhecimento, Dossiê e Vazamento de Mercado (relatórios privados)', () => {
  it('Reconhecimento: estruturas do tabuleiro alvo; não vale em si mesmo', () => {
    const { s, card } = withCard('reconnaissance', (x) => void forestPark(x, key(1, 1, 0), 1));
    expect(why(s, playCard(s, card, { kind: 'player', player: 0 }))).toBe('invalidTarget');
    const r = play(s, playCard(s, card, { kind: 'player', player: 1 }));
    const intel = r.events.find((e) => e.type === 'intel');
    const types =
      intel?.type === 'intel' && intel.report.kind === 'structures'
        ? intel.report.structures.map((x) => x.type)
        : [];
    expect(types.sort()).toEqual(['park', 'village']);
  });

  it('Dossiê: a mão do alvo', () => {
    const { s, card } = withCard('dossier');
    const r = play(s, playCard(s, card, { kind: 'player', player: 2 }));
    const intel = r.events.find((e) => e.type === 'intel');
    expect(intel?.type === 'intel' && intel.report).toEqual({
      kind: 'hand',
      target: 2,
      cards: s.players[2]?.hand,
    });
  });

  it('Vazamento de Mercado: estoques de todos', () => {
    const { s, card } = withCard('market_leak');
    const r = play(s, playCard(s, card));
    const intel = r.events.find((e) => e.type === 'intel');
    expect(intel?.type === 'intel' && intel.report.kind === 'stocks' && intel.report.stocks).toHaveLength(3);
  });
});

// ── Baralhos ─────────────────────────────────────────────────────────────────

describe('Requisição Prioritária (tutor)', () => {
  it('vê as 6 do topo de n1/n2, pega uma (revelada a todos) e embaralha', () => {
    const { s, card } = withCard('priority_requisition');
    expect(why(s, playCard(s, card, { kind: 'deck', deck: 'n3' }))).toBe('deckNotAllowed');
    const top = s.cards.decks.n2.slice(0, ctx.balance.cards.tutorRevealTop);
    const r = play(s, playCard(s, card, { kind: 'deck', deck: 'n2' }));
    expect(r.state.pending?.options).toEqual(top);
    expect(why(r.state, { type: 'explore', player: 0, hex: key(0, 2, 0) })).toBe('choicePending');
    expect(why(r.state, { type: 'resolveChoice', player: 0, card: -5 })).toBe('invalidChoice');
    const pick = top[3] ?? -1;
    const done = play(r.state, { type: 'resolveChoice', player: 0, card: pick });
    expect(done.state.pending).toBeNull();
    expect(done.state.players[0]?.hand).toContain(pick);
    expect(done.state.cards.decks.n2).toHaveLength(s.cards.decks.n2.length - 1);
    expect(done.events).toContainEqual({ type: 'cardTaken', player: 0, card: pick, deck: 'n2' });
  });
});

describe('Arquivo Selado (drawFromDeck, Tesouro)', () => {
  it('compra 1 de n2 ou n3', () => {
    const s = edit(cardsGame(ctx), (x) => void giveCard(x, 0, 'treasure_archive'));
    const card = s.players[0]?.hand.at(-1) ?? -1;
    const h = effectOf(cardDefOf(ctx, s, card));
    expect(h.check(scopeOf(s, 0, card), { kind: 'deck', deck: 'n1' })?.key).toBe('deckNotAllowed');
    const x = structuredClone(s);
    h.apply(scopeOf(x, 0, card), { kind: 'deck', deck: 'n3' });
    expect(x.players[0]?.hand).toHaveLength((s.players[0]?.hand.length ?? 0) + 1);
    expect(cardDefOf(ctx, x, x.players[0]?.hand.at(-1) ?? -1).deck).toBe('n3');
  });
});

// ── Modificadores: Drone e Contrato de Obra ──────────────────────────────────

describe('Drone I/II/III (droneRange, GDD 6.5)', () => {
  it('só vale junto com Sondar ou Construir', () => {
    const { s, card } = withCard('drone_1');
    expect(why(s, playCard(s, card))).toBe('playWithAction');
  });

  it('Sondar com Drone I alcança raio +1; paga 2 Carvão ou 1 Petróleo', () => {
    const { s, card } = withCard('drone_1');
    const far = key(0, 3, 0);
    expect(why(s, { type: 'survey', player: 0, hex: far })).toBe('outOfRange');
    const coal = play(s, { type: 'survey', player: 0, hex: far, drone: { card } }).state;
    expect(coal.hexes[far]?.surveyedBy).toContain(0);
    expect(res(coal, 0).coal).toBe(PLENTY.coal - 2);
    const oil = play(s, { type: 'survey', player: 0, hex: far, drone: { card, payment: 1 } }).state;
    expect(res(oil, 0).oil).toBe(PLENTY.oil - 1);
    expect(why(s, { type: 'survey', player: 0, hex: far, drone: { card, payment: 2 } })).toBe(
      'invalidPayment',
    );
  });

  it('Sondar com Drone atravessa a fronteira; Construir não', () => {
    const { s, card } = withCard('drone_3');
    const there = otherBoardWithin(5);
    expect(why(s, { type: 'survey', player: 0, hex: there })).toBe('outOfRange');
    expect(why(s, { type: 'survey', player: 0, hex: there, drone: { card } })).toBeNull();
    const forest = edit(s, (x) => setTerrain(x, there, 'forest'));
    expect(why(forest, { type: 'build', player: 0, structure: 'park', hex: there, drone: { card } })).toBe(
      'outOfRange',
    );
  });

  it('Construir com Drone no próprio tabuleiro, fora do raio normal', () => {
    const { s, card } = withCard('drone_1', (x) => setTerrain(x, key(0, 3, 0), 'forest'));
    const a: Action = { type: 'build', player: 0, structure: 'park', hex: key(0, 3, 0) };
    expect(why(s, a)).toBe('outOfRange');
    const after = play(s, { ...a, drone: { card } } as Action).state;
    expect(after.hexes[key(0, 3, 0)]?.structures[0]?.type).toBe('park');
    expect(after.cards.discards.n1).toContain(card);
  });

  it('Logística Orbital: Drone custa 1 Carvão a menos (mínimo 1); Núcleo de Navegação: grátis', () => {
    const { s, card } = withCard('drone_1', (x) => void installCard(x, 0, 'tech_orbital_logistics'));
    const def = cardDefOf(ctx, s, card);
    expect(cardResourceCost(ctx, s, 0, def, 0)).toEqual({ coal: 1 });
    expect(cardResourceCost(ctx, s, 0, def, 1)).toEqual({ oil: 1 });
    const nav = edit(s, (x) => void installCard(x, 0, 'relic_nav_core'));
    expect(cardResourceCost(ctx, nav, 0, def, 0)).toEqual({});
  });
});

describe('Contrato de Obra (halfCostBuild, interpretação AH)', () => {
  it('a construção paga metade de cada recurso, arredondada para cima; ainda gasta 1 ação', () => {
    const { s, card } = withCard('construction_contract');
    expect(why(s, playCard(s, card))).toBe('playWithAction');
    const half = { card, discard: others(s, 0, [card], 2) };
    const after = play(s, {
      type: 'build',
      player: 0,
      structure: 'university',
      hex: key(0, 1, 0),
      halfCost: half,
    }).state;
    // Universidade 1: 3 Ferro + 1 Ouro → 2 Ferro + 1 Ouro.
    expect(res(after, 0).iron).toBe(PLENTY.iron - 2);
    expect(res(after, 0).gold).toBe(PLENTY.gold - 1);
    expect(after.actionsLeft).toBe(s.actionsLeft - 1);
  });

  it('combina com Drone; descartes não podem repetir cartas usadas', () => {
    let drone = -1;
    const { s, card } = withCard('construction_contract', (x) => {
      drone = giveCard(x, 0, 'drone_1');
      setTerrain(x, key(0, 3, 0), 'empty');
    });
    const base = { type: 'build', player: 0, structure: 'university', hex: key(0, 3, 0) } as const;
    const bad = { card, discard: [drone, ...others(s, 0, [card, drone], 1)] };
    expect(why(s, { ...base, drone: { card: drone }, halfCost: bad })).toBe('invalidDiscard');
    const ok = { card, discard: others(s, 0, [card, drone], 2) };
    expect(why(s, { ...base, drone: { card: drone }, halfCost: ok })).toBeNull();
  });
});

// ── Permanentes ──────────────────────────────────────────────────────────────

describe('Engenharia Reversa e Espionagem Industrial (GDD 7.4)', () => {
  it('Engenharia Reversa destrói 1 permanente do alvo (sai do jogo)', () => {
    let silos = -1;
    const r = deliverAndReveal('reverse_engineering', 1, permanentAt(1, 0), (x) => {
      silos = installCard(x, 1, 'tech_silos');
    });
    expect(r.state.players[1]?.permanents[0]).toBeNull();
    expect(r.state.cards.removed).toContain(silos);
    expect(r.events).toContainEqual({
      type: 'permanentRemoved',
      player: 1,
      card: silos,
      slot: 0,
      cause: 'destroyed',
    });
  });

  it('Espionagem rouba para o primeiro slot livre do remetente', () => {
    const { s: s0, card } = withCard('industrial_espionage', (x) => void installCard(x, 1, 'tech_silos'));
    const silos = s0.players[1]?.permanents[0] ?? -1;
    let s = play(s0, { type: 'endPhase', player: 0 }).state;
    s = play(s, {
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'permanent', player: 1, card: silos },
    }).state;
    const r = run(ctx, s, [{ type: 'endPhase', player: 0 }]);
    expect(r.state.players[0]?.permanents[0]).toBe(silos);
    expect(r.state.players[1]?.permanents[0]).toBeNull();
    expect(r.events).toContainEqual({ type: 'permanentStolen', from: 1, to: 0, card: silos, slot: 0 });
  });

  it('sem slot livre: exige escolher o permanente que sai, e ele sai na Revelação (interpretação AF)', () => {
    let silos = -1;
    let mine: CardUid[] = [];
    const { s: s0, card } = withCard('industrial_espionage', (x) => {
      silos = installCard(x, 1, 'tech_silos');
      mine = [0, 1, 2, 3, 4].map(() => installCard(x, 0, 'tech_sensor_network'));
    });
    let s = play(s0, { type: 'endPhase', player: 0 }).state;
    const deliver: Action = {
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'permanent', player: 1, card: silos },
    };
    expect(why(s, deliver)).toBe('sacrificeRequired');
    s = play(s, { ...deliver, sacrifice: mine[2] } as Action).state;
    const r = run(ctx, s, [{ type: 'endPhase', player: 0 }]);
    expect(r.state.players[0]?.permanents[2]).toBe(silos);
    expect(r.state.cards.removed).toContain(mine[2]);
  });

  it('Contraespionagem impede roubo, não destruição', () => {
    const { s: s0, card } = withCard('industrial_espionage', (x) => {
      installCard(x, 1, 'tech_silos');
      installCard(x, 1, 'tech_counterintel');
    });
    const silos = s0.players[1]?.permanents[0] ?? -1;
    const s = play(s0, { type: 'endPhase', player: 0 }).state;
    expect(
      why(s, {
        type: 'deliverCard',
        player: 0,
        card,
        to: 1,
        target: { kind: 'permanent', player: 1, card: silos },
      }),
    ).toBe('immuneToSteal');
    const r = deliverAndReveal('reverse_engineering', 1, permanentAt(1, 0), (x) => {
      installCard(x, 1, 'tech_silos');
      installCard(x, 1, 'tech_counterintel');
    });
    expect(r.state.players[1]?.permanents[0]).toBeNull();
  });
});

describe('passivos de permanentes', () => {
  it('Rede de Sensores: +1 nos Postos; Lente Ancestral: +1 nos Postos e na Vila', () => {
    const s = edit(cardsGame(ctx), (x) => void place(x, key(0, 2, 0), 'outpost', 0));
    const ranges = (st: GameState) => rangeSources(ctx, st, 0).map((r) => r.range);
    expect(ranges(s)).toEqual([2, 2]);
    const sensors = edit(s, (x) => void installCard(x, 0, 'tech_sensor_network'));
    expect(ranges(sensors)).toEqual([2, 3]);
    const lens = edit(sensors, (x) => void installCard(x, 0, 'relic_ancestral_lens'));
    expect(ranges(lens)).toEqual([3, 4]);
  });

  it('Perfuração Profunda: Mina nova com +2 tokens', () => {
    const s = edit(cardsGame(ctx), (x) => {
      setResources(x, 0, PLENTY);
      installCard(x, 0, 'tech_deep_drilling');
      place(x, key(0, -1, 0), 'university', 0, 2); // Mina é r2
      const h = x.hexes[key(0, 1, 0)];
      if (h) {
        h.subsoil = 'sub_iron';
        h.surveyedBy.push(0);
      }
    });
    const after = play(s, { type: 'build', player: 0, structure: 'mine', hex: key(0, 1, 0) }).state;
    const mine = after.hexes[key(0, 1, 0)]?.structures.find((st) => st.type === 'mine');
    expect(mine?.tokens).toBe(ctx.balance.production.mineTokens + 2);
  });

  it('Silos: +1 do recurso mais produzido; empate vai para o de maior valor (interpretação AE)', () => {
    const s = edit(cardsGame(ctx), (x) => {
      installCard(x, 0, 'tech_silos');
      setTerrain(x, key(0, 1, 0), 'lagoon');
      place(x, key(0, 1, 0), 'park', 0);
    });
    const r = untilTurnOf(ctx, s, 0);
    expect(r.events).toContainEqual({ type: 'resourcesGained', player: 0, resources: { stone: 1 } });
  });

  it('Automação de Extração: +1 nos 3 Parques de maior ganho (interpretação AC)', () => {
    const parks: number[] = [];
    const s = edit(cardsGame(ctx), (x) => {
      installCard(x, 0, 'tech_extraction_automation');
      for (const [q, r] of [
        [1, 0],
        [0, 1],
        [-1, 1],
      ] as const)
        parks.push(forestPark(x, key(0, q, r), 0));
      setTerrain(x, key(0, -1, 0), 'lagoon');
      parks.push(place(x, key(0, -1, 0), 'park', 0));
    });
    const r = untilTurnOf(ctx, s, 0);
    const amounts = parks.map((uid) =>
      producedBy(r.events, uid).map((e) => (e.type === 'produced' ? e.amount : 0)),
    );
    // Lagoa (Comida + Pedregulho) vale mais; depois as Florestas na ordem de construção.
    expect(amounts).toEqual([[2], [2], [1], [2, 2]]);
  });

  it('Mapa Estelar: ao instalar e a cada construção, o subsolo vizinho fica conhecido', () => {
    const { s, card } = withCard('relic_star_map', (x) => setTerrain(x, key(0, 2, 0), 'forest'));
    const installed = play(s, { type: 'installPermanent', player: 0, card }).state;
    for (const n of ctx.planet.neighbors({ boardId: 0, q: 0, r: 0 })) {
      expect(installed.hexes[hexKeyOf(n)]?.surveyedBy).toContain(0);
    }
    const built = play(installed, { type: 'build', player: 0, structure: 'park', hex: key(0, 2, 0) }).state;
    expect(built.hexes[key(0, 3, 0)]?.surveyedBy).toContain(0);
  });
});

// ── Camadas futuras e registro ───────────────────────────────────────────────

describe('effectIds de camadas futuras e registro (CLAUDE.md regra 6)', () => {
  it('todas as camadas têm handler implementado (Fase 8 fechou os tratados)', () => {
    const gatedIds = Object.entries(CARD_EFFECTS)
      .filter(([, h]) => !h.implemented)
      .map(([id]) => id);
    expect(gatedIds).toEqual([]);
  });

  it('todo effectId dos dados é conhecido; effectId ou parâmetro errado falha na carga', () => {
    const data = loadGameData();
    expect(effectIssues(data)).toEqual([]);
    const broken = {
      ...data,
      cards: data.cards.map((c, i) =>
        i === 0 ? { ...c, effectId: 'noSuchEffect' } : i === 1 ? { ...c, params: { wrong: 1 } } : c,
      ),
    };
    const issues = effectIssues(broken);
    expect(issues.map((i) => i.path)).toEqual(['[0].effectId', '[1].params']);
    expect(() => createContext(broken, 3)).toThrow(/effectIds inválidos/);
  });
});
