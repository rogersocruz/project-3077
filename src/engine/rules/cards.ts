/**
 * Cartas (GDD 7): montagem dos baralhos, custos, jogar carta própria (fase 5), instalar
 * permanente (7.4), entregar (fase 7, teto de recebimento) e revelar (fase 1 do alvo).
 * Cada função `check*` devolve o motivo da ilegalidade ou null; as `apply*` mudam a
 * cópia de trabalho do reducer.
 */
import { discardNeed, protocolAllows } from './factions';
import { receiveCapBonus } from './treatyQueries';
import { RESOURCE_IDS } from '../../data/schemas';
import type { Action, CardUse } from '../actions';
import type { CardDef, EngineContext } from '../context';
import { cardEnabled, effectOf } from '../effects/registry';
import type { ApplyScope, EffectScope, ModifierKind } from '../effects/types';
import type { GameEvent } from '../events';
import { canAfford, findStructure, getPlayer, pay, type ResourceAmounts } from '../queries';
import type { Reason } from '../reasons';
import type { Rng } from '../rng';
import {
  type CardsState,
  type CardTarget,
  type CardUid,
  DRAW_DECKS,
  type DrawDeck,
  type GameState,
  type HexKey,
  type PlayerId,
  type RuleLayers,
} from '../state';
import { discardFromHand, isDrawDeck, shuffleDeck, takeFromHand, toDiscard } from './decks';
import { amplifyFactor, dronesGroundedFor, freeDronesFor, shieldedHex } from './specials';
import { eventParams } from './world';
import {
  cardDefOf,
  freeSlot,
  hasPermanent,
  numParam,
  permanentsWith,
  placePermanent,
  removePermanent,
  slotOf,
} from './permanents';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

const perDeck = <T>(make: () => T): Record<DrawDeck, T> => ({ n1: make(), n2: make(), n3: make() });

// ── Montagem ─────────────────────────────────────────────────────────────────

/**
 * Baralhos n1/n2/n3 da partida: cópias de cada carta habilitada (interpretação U: efeito
 * implementado e camadas ligadas), embaralhadas com a seed.
 */
export function buildDecks(ctx: EngineContext, layers: RuleLayers, rng: Rng): CardsState {
  const defs: string[] = [];
  const decks = perDeck<CardUid[]>(() => []);
  if (layers.cards) {
    for (const def of ctx.data.cards) {
      if (!isDrawDeck(def.deck) || !cardEnabled(def, layers)) continue;
      for (let i = 0; i < def.copies; i++) {
        decks[def.deck].push(defs.length);
        defs.push(def.id);
      }
    }
    for (const deck of DRAW_DECKS) decks[deck] = rng.shuffle(decks[deck]);
  }
  // GDD 4.3: baralho do Tesouro (Escavar), com hexes especiais e cartas.
  const treasure: CardUid[] = [];
  if (layers.cards && layers.specialHexes) {
    for (const def of ctx.data.cards) {
      if (def.deck !== 'treasure' || !cardEnabled(def, layers)) continue;
      for (let i = 0; i < def.copies; i++) {
        treasure.push(defs.length);
        defs.push(def.id);
      }
    }
  }
  return {
    defs,
    decks,
    discards: perDeck<CardUid[]>(() => []),
    removed: [],
    treasure: rng.shuffle(treasure),
    treasureDiscard: [],
  };
}

// ── Custos ───────────────────────────────────────────────────────────────────

/**
 * Custo em recursos da carta: fixo + a alternativa escolhida de `resourcesAny`. Drones
 * (efeito modificador `drone`) ficam mais baratos com Logística Orbital e grátis com o
 * Núcleo de Navegação. null = alternativa inválida.
 */
export function cardResourceCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  def: CardDef,
  payment?: number,
): ResourceAmounts | null {
  const out: ResourceAmounts = { ...def.cost.resources };
  const any = def.cost.resourcesAny;
  if (any) {
    const option = any[payment ?? 0];
    if (!option) return null;
    for (const id of RESOURCE_IDS) {
      const n = option[id];
      if (n) out[id] = (out[id] ?? 0) + n;
    }
  } else if (payment !== undefined && payment !== 0) return null;

  if (effectOf(def).modifier === 'drone') {
    // Núcleo de Navegação e Cânion de Ventos (estrutura no Cânion ativo): Drone grátis.
    if (hasPermanent(ctx, state, player, 'freeDrones') || freeDronesFor(ctx, state, player)) return {};
    for (const d of permanentsWith(ctx, state, player, 'droneDiscount')) {
      const coal = out.coal;
      if (coal) out.coal = Math.max(numParam(d, 'min'), coal - numParam(d, 'coal'));
    }
  }
  return out;
}

export function addAmounts(...list: readonly ResourceAmounts[]): ResourceAmounts {
  const out: ResourceAmounts = {};
  for (const amounts of list) {
    for (const id of RESOURCE_IDS) {
      const n = amounts[id];
      if (n) out[id] = (out[id] ?? 0) + n;
    }
  }
  return out;
}

/** Descarte como custo: exatamente `cost.discard` cartas distintas da mão, fora as já usadas. */
export function checkDiscard(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  def: CardDef,
  discard: readonly CardUid[] | undefined,
  used: readonly CardUid[],
): Reason | null {
  // Saque (Piratas): Sabotagem sem o descarte do custo.
  const need = discardNeed(ctx, state, player, def);
  const list = discard ?? [];
  const hand = getPlayer(state, player).hand;
  const ok =
    list.length === need &&
    new Set(list).size === list.length &&
    list.every((c) => hand.includes(c) && !used.includes(c));
  return ok ? null : { key: 'invalidDiscard', params: { n: need } };
}

/** Ações gastas ao instalar: as da carta ou o padrão do GDD 6.3. */
export function installActions(ctx: EngineContext, def: CardDef): number {
  return def.cost.actions ?? ctx.balance.permanents.installActions;
}

/** Mutável: paga recursos e descarte da carta e a tira da mão (o destino é de quem chama). */
function payCard(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  card: CardUid,
  def: CardDef,
  use: { readonly payment?: number; readonly discard?: readonly CardUid[] },
  events: GameEvent[],
): void {
  const cost = cardResourceCost(ctx, state, player, def, use.payment) ?? {};
  takeFromHand(state, player, card);
  if (RESOURCE_IDS.some((id) => (cost[id] ?? 0) > 0)) {
    pay(getPlayer(state, player).resources, cost);
    events.push({ type: 'resourcesSpent', player, resources: cost });
  }
  if (use.discard?.length) discardFromHand(ctx, state, player, use.discard, 'cost', events);
}

function scope(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  card: CardUid,
  recipient: PlayerId | null,
  stage: EffectScope['stage'],
  sacrifice?: CardUid,
): EffectScope {
  return {
    ctx,
    state,
    player,
    recipient,
    card,
    def: cardDefOf(ctx, state, card),
    stage,
    ...(sacrifice === undefined ? {} : { sacrifice }),
  };
}

/** Comum a jogar/instalar/entregar: carta na mão, momento certo, camada ligada, pagamento. */
function checkCardBasics(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  card: CardUid,
  timing: CardDef['timing'],
  wrongTiming: Reason['key'],
  use: { readonly payment?: number; readonly discard?: readonly CardUid[] },
  actions = 0,
): Reason | null {
  const p = getPlayer(state, player);
  if (!p.hand.includes(card)) return { key: 'cardNotInHand' };
  const def = cardDefOf(ctx, state, card);
  if (def.timing !== timing) return { key: wrongTiming };
  if (!cardEnabled(def, state.layers)) return { key: 'layerDisabled', params: { layer: 'cards' } };
  const cost = cardResourceCost(ctx, state, player, def, use.payment);
  if (!cost) return { key: 'invalidPayment' };
  // Protocolo (Governo): só cartas na faixa de custo da habilidade.
  if (!protocolAllows(ctx, state, player, def)) return { key: 'protocolBand' };
  const discard = checkDiscard(ctx, state, player, def, use.discard, [card]);
  if (discard) return discard;
  if (actions > state.actionsLeft) return { key: 'noActionsLeft' };
  return canAfford(p.resources, cost) ? null : { key: 'cannotAfford' };
}

// ── Carta própria (fase 5) ───────────────────────────────────────────────────

/** Ações gastas por jogar a carta (GDD 6.3: 0, salvo se a carta disser). */
export function playActions(def: CardDef): number {
  return def.cost.actions ?? 0;
}

export function checkPlayCard(ctx: EngineContext, state: GameState, a: ActionOf<'playCard'>): Reason | null {
  const p = getPlayer(state, a.player);
  if (p.hand.includes(a.card)) {
    const def = cardDefOf(ctx, state, a.card);
    if (def.timing === 'own' && effectOf(def).modifier) return { key: 'playWithAction' };
  }
  // Tesouro "instant" se joga como carta própria (interpretação AO).
  const timing =
    p.hand.includes(a.card) && cardDefOf(ctx, state, a.card).timing === 'instant' ? 'instant' : 'own';
  const basics = checkCardBasics(ctx, state, a.player, a.card, timing, 'notPlayable', a, 0);
  if (basics) return basics;
  const def = cardDefOf(ctx, state, a.card);
  return effectOf(def).check(scope(ctx, state, a.player, a.card, null, 'play'), a.target);
}

export function applyPlayCard(
  ctx: EngineContext,
  s: GameState,
  a: ActionOf<'playCard'>,
  events: GameEvent[],
): void {
  const def = cardDefOf(ctx, s, a.card);
  payCard(ctx, s, a.player, a.card, def, a, events);
  events.push({
    type: 'cardPlayed',
    player: a.player,
    card: a.card,
    ...(a.target ? { target: a.target } : {}),
  });
  toDiscard(ctx, s, a.card);
  const sc: ApplyScope = { ...scope(ctx, s, a.player, a.card, null, 'play'), events };
  effectOf(def).apply(sc, a.target);
}

// ── Modificadores de Sondar/Construir ────────────────────────────────────────

/** Carta usada junto com Sondar/Construir: na mão, do tipo certo, pagamento válido. */
export function checkModifier(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  use: CardUse,
  kind: ModifierKind,
  used: readonly CardUid[],
): Reason | null {
  const p = getPlayer(state, player);
  if (!p.hand.includes(use.card) || used.includes(use.card)) return { key: 'cardNotInHand' };
  const def = cardDefOf(ctx, state, use.card);
  if (effectOf(def).modifier !== kind) return { key: 'wrongModifier' };
  if (!cardEnabled(def, state.layers)) return { key: 'layerDisabled', params: { layer: 'cards' } };
  // Tempestade Magnética (todos) e Cânion com dano (quem tem estrutura nele): Drone no chão.
  if (kind === 'drone' && (eventParams(ctx, state, 'dronesOff') || dronesGroundedFor(state, player)))
    return { key: 'dronesGrounded' };
  if (!cardResourceCost(ctx, state, player, def, use.payment)) return { key: 'invalidPayment' };
  if (!protocolAllows(ctx, state, player, def)) return { key: 'protocolBand' };
  return checkDiscard(ctx, state, player, def, use.discard, [...used, use.card]);
}

/** Recursos que a carta modificadora custa (0 se a alternativa for inválida). */
export function modifierCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  use: CardUse,
): ResourceAmounts {
  return cardResourceCost(ctx, state, player, cardDefOf(ctx, state, use.card), use.payment) ?? {};
}

export function droneBonus(ctx: EngineContext, state: GameState, use: CardUse): number {
  return numParam(cardDefOf(ctx, state, use.card), 'bonus');
}

/** Mutável: paga e descarta a carta modificadora. */
export function applyModifier(
  ctx: EngineContext,
  s: GameState,
  player: PlayerId,
  use: CardUse,
  events: GameEvent[],
): void {
  const def = cardDefOf(ctx, s, use.card);
  payCard(ctx, s, player, use.card, def, use, events);
  events.push({ type: 'cardPlayed', player, card: use.card });
  toDiscard(ctx, s, use.card);
}

// ── Permanentes (GDD 7.4) ────────────────────────────────────────────────────

export function checkInstall(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'installPermanent'>,
): Reason | null {
  const p = getPlayer(state, a.player);
  if (!p.hand.includes(a.card)) return { key: 'cardNotInHand' };
  const def = cardDefOf(ctx, state, a.card);
  const basics = checkCardBasics(
    ctx,
    state,
    a.player,
    a.card,
    'install',
    'notInstallable',
    a,
    installActions(ctx, def),
  );
  if (basics) return basics;
  if (a.replace !== undefined) {
    if (slotOf(state, a.player, a.replace) < 0) return { key: 'notInstalled' };
  } else if (freeSlot(state, a.player) < 0) {
    return { key: 'slotsFull', params: { slots: p.permanents.length } };
  }
  return effectOf(def).check(scope(ctx, state, a.player, a.card, null, 'play'), undefined);
}

export function applyInstall(
  ctx: EngineContext,
  s: GameState,
  a: ActionOf<'installPermanent'>,
  events: GameEvent[],
): void {
  const def = cardDefOf(ctx, s, a.card);
  payCard(ctx, s, a.player, a.card, def, a, events);
  const slot =
    a.replace !== undefined
      ? removePermanent(s, a.player, a.replace, 'replaced', events)
      : freeSlot(s, a.player);
  placePermanent(s, a.player, a.card, events, slot);
  effectOf(def).onInstall({ ...scope(ctx, s, a.player, a.card, null, 'play'), events });
}

// ── Entrega (fase 7) e Revelação (fase 1 do alvo) ────────────────────────────

/** Hex do alvo da carta (hex ou estrutura); null para alvos sem lugar no mapa. */
export function targetHex(state: GameState, target: CardTarget | undefined): HexKey | null {
  if (!target) return null;
  if (target.kind === 'hex') return target.hex;
  if (target.kind === 'structure') return findStructure(state, target.uid)?.key ?? null;
  return null;
}

export function checkDeliver(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'deliverCard'>,
): Reason | null {
  const p = getPlayer(state, a.player);
  const basics = checkCardBasics(ctx, state, a.player, a.card, 'delivered', 'notDeliverable', a, 0);
  if (basics) return basics;
  if (p.deliveredThisTurn >= ctx.balance.cards.deliverPerTurn) return { key: 'alreadyDelivered' };
  const to = state.players[a.to];
  if (!to || a.to === a.player) return { key: 'invalidRecipient' };
  if (to.eliminated && !to.neutral) return { key: 'playerEliminated' };
  // Anomalia Magnética: Sabotagem não alveja o hex nem os vizinhos (sem a inversão).
  const target = targetHex(state, a.target);
  const def0 = cardDefOf(ctx, state, a.card);
  if (def0.valence === 'sabotage' && target && shieldedHex(ctx, state, target)) return { key: 'shielded' };
  // Canal Aberto (GDD 10): entre os signatários o teto sobe.
  const cap = ctx.balance.cards.receiveCapPerRound + receiveCapBonus(state, a.player, a.to);
  if (to.receivedThisRound >= cap) return { key: 'receiveCapReached', params: { cap } };
  const def = cardDefOf(ctx, state, a.card);
  return effectOf(def).check(scope(ctx, state, a.player, a.card, a.to, 'play', a.sacrifice), a.target);
}

export function applyDeliver(
  ctx: EngineContext,
  s: GameState,
  a: ActionOf<'deliverCard'>,
  events: GameEvent[],
): void {
  const def = cardDefOf(ctx, s, a.card);
  payCard(ctx, s, a.player, a.card, def, a, events);
  const to = getPlayer(s, a.to);
  to.incoming.push({
    card: a.card,
    from: a.player,
    round: s.round,
    ...(a.target ? { target: a.target } : {}),
    ...(a.sacrifice === undefined ? {} : { sacrifice: a.sacrifice }),
  });
  to.receivedThisRound += 1;
  getPlayer(s, a.player).deliveredThisTurn += 1;
  events.push({ type: 'cardDelivered', from: a.player, to: a.to, card: a.card });
}

/**
 * GDD 6.2 fase 1: as cartas recebidas viram e resolvem na ordem de entrega. Se o alvo
 * escolhido na entrega deixou de valer, a carta fica sem efeito (interpretação X).
 */
export function revealIncoming(
  ctx: EngineContext,
  s: GameState,
  player: PlayerId,
  events: GameEvent[],
): void {
  const p = getPlayer(s, player);
  const queue = p.incoming;
  p.incoming = [];
  for (const d of queue) {
    events.push({
      type: 'cardRevealed',
      from: d.from,
      to: player,
      card: d.card,
      ...(d.target ? { target: d.target } : {}),
    });
    const sc = scope(ctx, s, d.from, d.card, player, 'resolve', d.sacrifice);
    const handler = effectOf(sc.def);
    const reason = handler.check(sc, d.target);
    const at = targetHex(s, d.target);
    if (!reason && sc.def.valence === 'sabotage' && at && shieldedHex(ctx, s, at)) {
      events.push({ type: 'cardFizzled', from: d.from, to: player, card: d.card, reason: 'shielded' });
    } else if (reason)
      events.push({ type: 'cardFizzled', from: d.from, to: player, card: d.card, reason: reason.key });
    else {
      // Anomalia invertida: carta que alveja a área tem o efeito dobrado (aplica N vezes).
      const times = at ? amplifyFactor(ctx, s, at) : 1;
      for (let i = 0; i < times; i++) {
        if (i > 0 && handler.check(sc, d.target)) break;
        handler.apply({ ...sc, events }, d.target);
      }
    }
    toDiscard(ctx, s, d.card);
  }
}

// ── Escolha pendente (Requisição Prioritária) ────────────────────────────────

export function checkResolveChoice(state: GameState, a: ActionOf<'resolveChoice'>): Reason | null {
  const pending = state.pending;
  if (!pending || pending.kind !== 'tutor') return { key: 'invalidChoice' };
  if (a.player !== pending.player) return { key: 'notYourTurn' };
  return pending.options.includes(a.card) ? null : { key: 'invalidChoice' };
}

/** Mutável: a carta escolhida vai para a mão, revelada a todos; o baralho é embaralhado. */
export function applyResolveChoice(s: GameState, a: ActionOf<'resolveChoice'>, events: GameEvent[]): void {
  const pending = s.pending;
  if (!pending || pending.kind !== 'tutor') return;
  const deck = s.cards.decks[pending.deck];
  deck.splice(deck.indexOf(a.card), 1);
  getPlayer(s, a.player).hand.push(a.card);
  events.push({ type: 'cardTaken', player: a.player, card: a.card, deck: pending.deck });
  shuffleDeck(s, pending.deck);
  s.pending = null;
}

/** Alvos válidos de uma carta da mão (destaque na interface e enumeração da IA). */
export function cardTargets(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  card: CardUid,
  recipient: PlayerId | null = null,
  sacrifice?: CardUid,
): CardTarget[] {
  const sc = scope(ctx, state, player, card, recipient, 'play', sacrifice);
  const handler = effectOf(sc.def);
  return handler.candidates(sc).filter((t) => handler.check(sc, t) === null);
}
