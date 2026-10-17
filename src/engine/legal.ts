/**
 * Ações legais. Única fonte de "o que é permitido" para o reducer, a interface e a IA
 * (CLAUDE.md, regra de arquitetura 5). Toda recusa vem com motivo.
 */
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import { ACTION_COST, type Action, type CardUse } from './actions';
import type { EngineContext } from './context';
import { effectOf } from './effects/registry';
import {
  getHex,
  getPlayer,
  hexKeyOf,
  isValidAmounts,
  amountTotal,
  canAfford,
  ownedStructures,
} from './queries';
import type { Reason } from './reasons';
import {
  buildCostAt,
  checkBuild,
  checkExplore,
  checkSurvey,
  checkUpgrade,
  ownBoardHexes,
} from './rules/build';
import {
  addAmounts,
  cardResourceCost,
  cardTargets,
  checkDeliver,
  checkInstall,
  checkModifier,
  checkPlayCard,
  checkResolveChoice,
  droneBonus,
  installActions,
  modifierCost,
} from './rules/cards';
import { drawRows, handLimit } from './rules/decks';
import { bankQuote, minBankAmount } from './rules/economy';
import { cardDefOf, freeSlot } from './rules/permanents';
import { inVillageZone } from './setup';
import { freeSurveyAt } from './rules/specials';
import { autoCasualties, checkCasualtyChoice } from './rules/combat';
import { checkMove, checkRecruit, checkSetTariff, checkUpgradeTroop } from './rules/troops';
import { braceActions, checkBrace, checkCleanHex, checkExcavate, eventParams } from './rules/world';
import {
  checkBreakTreaty,
  checkProposeTreaty,
  checkTreatyResponse,
  checkUseTreaty,
  commerceQuote,
  isCommercePact,
  restrictionReason,
} from './rules/treaties';
import { treatiesOf } from './rules/treatyQueries';
import type {
  CardTarget,
  CardUid,
  ContractTerms,
  GameState,
  HexKey,
  PlayerId,
  Resources,
  TreatyTerms,
} from './state';

export type CheckResult = { readonly ok: true } | { readonly ok: false; readonly reason: Reason };

const OK: CheckResult = { ok: true };
const no = (key: Reason['key'], params?: Reason['params']): CheckResult => ({
  ok: false,
  reason: params ? { key, params } : { key },
});
const fromReason = (r: Reason | null): CheckResult => (r ? { ok: false, reason: r } : OK);

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

/**
 * Quem precisa decidir agora: quem tem uma escolha pendente, o destinatário de uma
 * proposta pendente, senão o jogador ativo.
 */
export function decider(state: GameState): PlayerId {
  if (state.pending) return state.pending.player;
  if (state.treaties.pending) return state.treaties.pending.to;
  return state.pendingTrade ? state.pendingTrade.to : state.activePlayer;
}

/** Ações do turno que a ação gasta (GDD 6.3; Instalar e Limpar galeria variam). */
export function actionCost(ctx: EngineContext, state: GameState, action: Action): number {
  switch (action.type) {
    case 'installPermanent': {
      const def = state.cards.defs[action.card] === undefined ? null : cardDefOf(ctx, state, action.card);
      return def ? installActions(ctx, def) : 0;
    }
    case 'clearSeal':
      return state.hexes[action.hex]?.seal?.clearActions ?? 0;
    case 'brace':
      return braceActions(ctx, state);
    case 'cleanHex':
      return state.hexes[action.hex]?.status.contaminated ?? 0;
    case 'survey':
      // Crosta Fina: sondar o próprio hex é grátis enquanto o bônus vale.
      return freeSurveyAt(ctx, state, action.hex) ? 0 : ACTION_COST.survey;
    default:
      return ACTION_COST[action.type];
  }
}

function checkSetup(ctx: EngineContext, state: GameState, action: Action): CheckResult {
  const p = getPlayer(state, action.player);
  switch (action.type) {
    case 'chooseCompensation': {
      if (p.compensation !== 'pending') return no('noCompensationDue');
      const option = ctx.balance.setup.noSpecialCompensation.choose[action.option];
      if (!option) return no('invalidOption');
      if ('drawFromDeck' in option) return state.layers.cards ? OK : no('layerDisabled', { layer: 'cards' });
      const res = action.resources ?? {};
      if (!isValidAmounts(res) || amountTotal(res) !== option.resourcesOfChoice) {
        return no('invalidAmounts', { total: option.resourcesOfChoice });
      }
      return OK;
    }
    case 'chooseVillage': {
      if (p.compensation === 'pending') return no('compensationPending');
      if (p.villageHex !== null) return no('villageAlreadyChosen');
      const hex = getHex(state, action.hex);
      if (!hex) return no('noSuchHex');
      if (hex.boardId !== p.boardId) return no('notOwnBoard');
      return inVillageZone(ctx, hex) ? OK : no('outsideVillageZone');
    }
    default:
      return no('wrongStage');
  }
}

/** GDD 5.3: proposta (ou contraproposta) de `from` para `to`. */
function checkOffer(
  ctx: EngineContext,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  give: Partial<Resources>,
  receive: Partial<Resources>,
): CheckResult {
  const partner = state.players[to];
  if (!partner || to === from) return no('invalidTradePartner');
  if (partner.eliminated) return no('playerEliminated');
  if (!isValidAmounts(give) || !isValidAmounts(receive)) return no('invalidAmounts');
  if (amountTotal(give) + amountTotal(receive) === 0) return no('emptyTrade');
  if (
    ctx.balance.trade.requiresAdjacentBoard &&
    !ctx.planet.areBoardsAdjacent(getPlayer(state, from).boardId, partner.boardId)
  ) {
    return no('boardsNotAdjacent');
  }
  return canAfford(getPlayer(state, from).resources, give) ? OK : no('cannotAfford');
}

function checkTrade(ctx: EngineContext, state: GameState, action: Action): CheckResult {
  const trade = state.pendingTrade;
  switch (action.type) {
    case 'counterTrade':
      if (!trade) return no('noTradePending');
      if (action.player !== trade.to) return no('notTradeRecipient');
      return checkOffer(ctx, state, action.player, trade.from, action.give, action.receive);
    case 'acceptTrade': {
      if (!trade) return no('noTradePending');
      if (action.player !== trade.to) return no('notTradeRecipient');
      if (!canAfford(getPlayer(state, trade.to).resources, trade.receive)) return no('cannotAfford');
      if (!canAfford(getPlayer(state, trade.from).resources, trade.give)) return no('proposerCannotAfford');
      return OK;
    }
    case 'rejectTrade':
      if (!trade) return no('noTradePending');
      return action.player === trade.to ? OK : no('notTradeRecipient');
    case 'cancelTrade':
      if (!trade) return no('noTradePending');
      return action.player === trade.from ? OK : no('notTradeProposer');
    default:
      return no('tradePending');
  }
}

/** Sondar, com Drone opcional (GDD 6.5). */
function checkSurveyAction(ctx: EngineContext, state: GameState, a: ActionOf<'survey'>): Reason | null {
  if (a.drone) {
    const r = checkModifier(ctx, state, a.player, a.drone, 'drone', []);
    if (r) return r;
  }
  // Crosta Instável: Sondar falha na rodada, exceto com Drone.
  if (!a.drone && eventParams(ctx, state, 'surveyBlocked')) return { key: 'surveyBlocked' };
  const bonus = a.drone ? droneBonus(ctx, state, a.drone) : undefined;
  const r = checkSurvey(ctx, state, a.player, a.hex, bonus);
  if (r) return r;
  if (
    a.drone &&
    !canAfford(getPlayer(state, a.player).resources, modifierCost(ctx, state, a.player, a.drone))
  ) {
    return { key: 'cannotAfford' };
  }
  return null;
}

/** Construir, com Drone e/ou Contrato de Obra opcionais; o total de recursos é conferido junto. */
function checkBuildAction(ctx: EngineContext, state: GameState, a: ActionOf<'build'>): Reason | null {
  const used: CardUid[] = [];
  if (a.drone) {
    const r = checkModifier(ctx, state, a.player, a.drone, 'drone', used);
    if (r) return r;
    used.push(a.drone.card, ...(a.drone.discard ?? []));
  }
  if (a.halfCost) {
    const r = checkModifier(ctx, state, a.player, a.halfCost, 'halfCost', used);
    if (r) return r;
  }
  const r = checkBuild(ctx, state, a.player, a.structure, a.hex, {
    droneBonus: a.drone ? droneBonus(ctx, state, a.drone) : 0,
    halfCost: !!a.halfCost,
  });
  if (r) return r;
  const total = addAmounts(
    buildCostAt(ctx, state, a.structure, a.hex, !!a.halfCost),
    a.drone ? modifierCost(ctx, state, a.player, a.drone) : {},
    a.halfCost ? modifierCost(ctx, state, a.player, a.halfCost) : {},
  );
  return canAfford(getPlayer(state, a.player).resources, total) ? null : { key: 'cannotAfford' };
}

/** Colapso de Galeria: o dono do tabuleiro remove o selo. */
function checkClearSeal(state: GameState, a: ActionOf<'clearSeal'>): Reason | null {
  const hex = getHex(state, a.hex);
  if (!hex) return { key: 'noSuchHex' };
  if (!hex.seal) return { key: 'notSealed' };
  return hex.boardId === getPlayer(state, a.player).boardId ? null : { key: 'notOwnBoard' };
}

function checkActionsPhase(ctx: EngineContext, state: GameState, action: Action): CheckResult {
  const player = action.player;
  if (actionCost(ctx, state, action) > state.actionsLeft) return no('noActionsLeft');
  switch (action.type) {
    case 'explore':
      return fromReason(checkExplore(ctx, state, player, action.hex));
    case 'survey':
      return fromReason(checkSurveyAction(ctx, state, action));
    case 'build':
      return fromReason(checkBuildAction(ctx, state, action));
    case 'upgrade':
      return fromReason(checkUpgrade(ctx, state, player, action.uid));
    case 'bankTrade': {
      if (!RESOURCE_IDS.includes(action.give) || !RESOURCE_IDS.includes(action.receive)) {
        return no('invalidAmounts');
      }
      if (action.give === action.receive) return no('sameResource');
      if (!Number.isInteger(action.amount) || action.amount < 1) return no('invalidAmounts');
      if (getPlayer(state, player).resources[action.give] < action.amount) return no('cannotAfford');
      const quote = bankQuote(ctx, state, player, action.give, action.amount, action.receive);
      return quote.received >= 1 ? OK : no('bankCreditTooLow');
    }
    case 'proposeTrade':
      return checkOffer(ctx, state, player, action.to, action.give, action.receive);
    case 'playCard':
      return state.layers.cards
        ? fromReason(checkPlayCard(ctx, state, action))
        : no('layerDisabled', { layer: 'cards' });
    case 'installPermanent':
      return state.layers.cards
        ? fromReason(checkInstall(ctx, state, action))
        : no('layerDisabled', { layer: 'cards' });
    case 'clearSeal':
      return fromReason(checkClearSeal(state, action));
    case 'excavate':
      return fromReason(checkExcavate(ctx, state, action));
    case 'recruit':
      return fromReason(checkRecruit(ctx, state, action));
    case 'upgradeTroop':
      return fromReason(checkUpgradeTroop(ctx, state, action));
    case 'move':
      return fromReason(checkMove(ctx, state, action));
    case 'setTariff':
      return fromReason(checkSetTariff(state, action));
    case 'proposeTreaty':
      return fromReason(checkProposeTreaty(ctx, state, action));
    case 'breakTreaty':
      return fromReason(checkBreakTreaty(state, action));
    case 'useTreaty':
      return fromReason(checkUseTreaty(ctx, state, action));
    case 'brace':
      return fromReason(checkBrace(ctx, state, action));
    case 'cleanHex':
      return fromReason(checkCleanHex(state, action));
    case 'endPhase':
      return OK;
    default:
      return no('wrongPhase');
  }
}

/** GDD 6.2 fase 7: entregar 1 carta, descartar até o limite, encerrar o turno. */
function checkDeliveryPhase(ctx: EngineContext, state: GameState, action: Action): CheckResult {
  const p = getPlayer(state, action.player);
  const limit = handLimit(ctx, state, action.player);
  switch (action.type) {
    case 'deliverCard':
      return fromReason(checkDeliver(ctx, state, action));
    case 'discardCards': {
      const excess = p.hand.length - limit;
      if (excess <= 0) return no('notOverLimit', { limit });
      const cards = action.cards;
      const ok =
        cards.length === excess &&
        new Set(cards).size === cards.length &&
        cards.every((c) => p.hand.includes(c));
      return ok ? OK : no('invalidDiscard', { n: excess });
    }
    case 'endPhase':
      return p.hand.length > limit ? no('handOverLimit', { limit }) : OK;
    default:
      return no('wrongPhase');
  }
}

/** Valida qualquer ação concreta e explica a recusa. */
export function checkAction(ctx: EngineContext, state: GameState, action: Action): CheckResult {
  const r = checkActionRules(ctx, state, action);
  if (!r.ok) return r;
  // GDD 10: consequência NÃO PODE de contrato em vigor.
  return fromReason(restrictionReason(ctx, state, action));
}

function checkActionRules(ctx: EngineContext, state: GameState, action: Action): CheckResult {
  if (state.stage === 'over') return no('gameOver');
  if (!state.players[action.player]) return no('notYourTurn');

  if (state.stage === 'setup') {
    if (action.player !== state.activePlayer) return no('notYourTurn');
    return checkSetup(ctx, state, action);
  }

  if (state.pending) {
    if (state.pending.kind === 'casualties') {
      if (action.type !== 'chooseCasualties') return no('choicePending');
      if (action.player !== state.pending.player) return no('notYourTurn');
      return checkCasualtyChoice(state.pending, action.uids)
        ? OK
        : no('invalidCasualties', { n: state.pending.need });
    }
    return action.type === 'resolveChoice'
      ? fromReason(checkResolveChoice(state, action))
      : no('choicePending');
  }
  if (action.type === 'chooseCasualties') return no('invalidChoice');
  if (action.type === 'resolveChoice') return no('invalidChoice');
  if (state.treaties.pending) return fromReason(checkTreatyResponse(ctx, state, action));
  if (action.type === 'acceptTreaty' || action.type === 'rejectTreaty' || action.type === 'cancelTreaty')
    return no('noTreatyPending');
  if (state.pendingTrade) return checkTrade(ctx, state, action);
  if (
    action.type === 'acceptTrade' ||
    action.type === 'rejectTrade' ||
    action.type === 'cancelTrade' ||
    action.type === 'counterTrade'
  ) {
    return no('noTradePending');
  }
  if (action.player !== state.activePlayer) return no('notYourTurn');
  if (action.type === 'chooseCompensation' || action.type === 'chooseVillage') return no('wrongStage');

  if (state.phase === 'draw') {
    if (action.type !== 'chooseDraw') return no('drawChoicePending');
    return drawRows(ctx, state, action.player)[action.row] ? OK : no('invalidOption');
  }
  if (action.type === 'chooseDraw') return no('wrongPhase');
  if (state.phase === 'delivery') return checkDeliveryPhase(ctx, state, action);
  if (state.phase !== 'actions') return no('wrongPhase');
  return checkActionsPhase(ctx, state, action);
}

// ── Enumeração (IA e testes) ─────────────────────────────────────────────────

/** As primeiras `n` cartas da mão fora das já usadas (descarte representativo). */
function firstOthers(hand: readonly CardUid[], used: readonly CardUid[], n: number): CardUid[] | null {
  const pick = hand.filter((c) => !used.includes(c)).slice(0, n);
  return pick.length === n ? pick : null;
}

/** Usos representativos de uma carta: cada alternativa de pagamento, descarte das primeiras. */
function cardUses(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  card: CardUid,
  used: readonly CardUid[] = [],
): CardUse[] {
  const def = cardDefOf(ctx, state, card);
  const discard = firstOthers(getPlayer(state, player).hand, [...used, card], def.cost.discard ?? 0);
  if (!discard) return [];
  const payments = def.cost.resourcesAny ? def.cost.resourcesAny.map((_, i) => i) : [undefined];
  return payments
    .filter((payment) => cardResourceCost(ctx, state, player, def, payment) !== null)
    .map((payment) => ({
      card,
      ...(payment === undefined ? {} : { payment }),
      ...(discard.length ? { discard } : {}),
    }));
}

function targetsOrNone(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  card: CardUid,
  recipient: PlayerId | null,
  sacrifice?: CardUid,
): (CardTarget | undefined)[] {
  const def = cardDefOf(ctx, state, card);
  if (effectOf(def).target === 'none') return [undefined];
  return cardTargets(ctx, state, player, card, recipient, sacrifice);
}

function cardCandidates(ctx: EngineContext, state: GameState, player: PlayerId, out: Action[]): void {
  const p = getPlayer(state, player);
  for (const card of p.hand) {
    const def = cardDefOf(ctx, state, card);
    const handler = effectOf(def);
    if ((def.timing === 'own' || def.timing === 'instant') && !handler.modifier) {
      for (const use of cardUses(ctx, state, player, card)) {
        for (const target of targetsOrNone(ctx, state, player, card, null)) {
          out.push({ type: 'playCard', player, ...use, ...(target ? { target } : {}) });
        }
      }
    } else if (def.timing === 'install') {
      const replaces: (CardUid | undefined)[] =
        freeSlot(state, player) >= 0 ? [undefined] : p.permanents.filter((c): c is CardUid => c !== null);
      for (const use of cardUses(ctx, state, player, card)) {
        for (const replace of replaces) {
          out.push({
            type: 'installPermanent',
            player,
            ...use,
            ...(replace === undefined ? {} : { replace }),
          });
        }
      }
    } else if (handler.modifier) {
      // Drone e Contrato de Obra vão junto com Sondar/Construir.
      const own = ownBoardHexes(ctx, state, player);
      for (const use of cardUses(ctx, state, player, card)) {
        if (handler.modifier === 'drone') {
          for (const hex of Object.keys(state.hexes)) out.push({ type: 'survey', player, hex, drone: use });
        }
        for (const hex of own) {
          for (const s of ctx.data.structures) {
            out.push({
              type: 'build',
              player,
              structure: s.id,
              hex,
              ...(handler.modifier === 'drone' ? { drone: use } : { halfCost: use }),
            });
          }
        }
      }
    }
  }
  for (const hex of ownBoardHexes(ctx, state, player)) {
    if (state.hexes[hex]?.seal) out.push({ type: 'clearSeal', player, hex });
  }
}

function deliveryCandidates(ctx: EngineContext, state: GameState, player: PlayerId, out: Action[]): void {
  const p = getPlayer(state, player);
  for (const card of p.hand) {
    if (cardDefOf(ctx, state, card).timing !== 'delivered') continue;
    const first = p.permanents.find((c) => c !== null);
    const sacrifice =
      freeSlot(state, player) < 0 && first !== null && first !== undefined ? first : undefined;
    for (const other of state.players) {
      if (other.id === player) continue;
      for (const use of cardUses(ctx, state, player, card)) {
        for (const target of targetsOrNone(ctx, state, player, card, other.id, sacrifice)) {
          out.push({
            type: 'deliverCard',
            player,
            to: other.id,
            ...use,
            ...(target ? { target } : {}),
            ...(sacrifice === undefined ? {} : { sacrifice }),
          });
        }
      }
    }
  }
  const excess = p.hand.length - handLimit(ctx, state, player);
  if (excess > 0) out.push({ type: 'discardCards', player, cards: p.hand.slice(0, excess) });
}

/**
 * Lista ações legais do jogador. Para ações com quantidades livres (comércio,
 * compensação, descarte) devolve um conjunto representativo; checkAction valida qualquer variante.
 */
export function legalActions(ctx: EngineContext, state: GameState, player: PlayerId): Action[] {
  const candidates: Action[] = [];
  const p = state.players[player];
  if (!p || state.stage === 'over') return [];

  if (state.stage === 'setup') {
    ctx.balance.setup.noSpecialCompensation.choose.forEach((option, i) => {
      if ('resourcesOfChoice' in option) {
        for (const id of RESOURCE_IDS) {
          candidates.push({
            type: 'chooseCompensation',
            player,
            option: i,
            resources: { [id]: option.resourcesOfChoice },
          });
        }
      } else candidates.push({ type: 'chooseCompensation', player, option: i });
    });
    for (const hex of ownBoardHexes(ctx, state, player))
      candidates.push({ type: 'chooseVillage', player, hex });
  } else if (state.pending?.kind === 'casualties') {
    // Representativo: as mais fracas primeiro (o motor aceita qualquer escolha válida).
    const p = state.pending;
    const fighters = p.options.map((o) => ({
      uid: o.uid,
      kind: 'line' as const,
      level: 1,
      strength: o.strength,
    }));
    candidates.push({ type: 'chooseCasualties', player, uids: autoCasualties(fighters, p.need) });
  } else if (state.pending) {
    for (const card of state.pending.options) candidates.push({ type: 'resolveChoice', player, card });
  } else if (state.treaties.pending) {
    candidates.push(
      { type: 'acceptTreaty', player },
      { type: 'rejectTreaty', player },
      { type: 'cancelTreaty', player },
    );
  } else if (state.pendingTrade) {
    const t = state.pendingTrade;
    candidates.push(
      { type: 'acceptTrade', player },
      { type: 'rejectTrade', player },
      { type: 'cancelTrade', player },
    );
    // Contraproposta representativa: dar 1 unidade a menos do que foi pedido.
    const shrunk = shrinkByOne(t.receive);
    if (shrunk) candidates.push({ type: 'counterTrade', player, give: shrunk, receive: t.give });
  } else if (state.phase === 'draw') {
    drawRows(ctx, state, player).forEach((_, row) => candidates.push({ type: 'chooseDraw', player, row }));
  } else {
    candidates.push({ type: 'endPhase', player });
    if (state.phase === 'delivery') deliveryCandidates(ctx, state, player, candidates);
    if (state.phase === 'actions') {
      const ownHexes = ownBoardHexes(ctx, state, player);
      for (const hex of ownHexes) {
        candidates.push({ type: 'explore', player, hex }, { type: 'survey', player, hex });
        for (const def of ctx.data.structures) {
          candidates.push({ type: 'build', player, structure: def.id, hex });
        }
      }
      for (const { structure } of ownedStructures(state, player)) {
        candidates.push({ type: 'upgrade', player, uid: structure.uid });
      }
      // Fase 6: escavar sítios, contra-ação do evento, limpar contaminação.
      if (state.layers.specialHexes) {
        for (const hex of ownHexes) candidates.push({ type: 'excavate', player, hex });
        for (const [hex, h] of Object.entries(state.hexes)) {
          if (h.status.contaminated) candidates.push({ type: 'cleanHex', player, hex });
        }
      }
      if (state.layers.events) candidates.push({ type: 'brace', player });
      if (state.layers.conflict) conflictCandidates(ctx, state, player, candidates);
      if (state.layers.treaties) treatyCandidates(ctx, state, player, candidates);
      for (const give of RESOURCE_IDS) {
        for (const receive of RESOURCE_IDS) {
          if (give === receive) continue;
          const amount = minBankAmount(ctx, state, player, give, receive);
          if (amount !== null) candidates.push({ type: 'bankTrade', player, give, amount, receive });
        }
      }
      for (const other of state.players) {
        if (other.id === player) continue;
        for (const give of RESOURCE_IDS) {
          for (const receive of RESOURCE_IDS as readonly ResourceId[]) {
            if (give === receive || other.resources[receive] < 1) continue;
            candidates.push({
              type: 'proposeTrade',
              player,
              to: other.id,
              give: { [give]: 1 },
              receive: { [receive]: 1 },
            });
          }
        }
      }
      if (state.layers.cards) cardCandidates(ctx, state, player, candidates);
    }
  }
  return candidates.filter((a) => checkAction(ctx, state, a).ok);
}

/**
 * Fase 7: recrutar perto dos Quartéis, subir tropa, tarifa e movimentos representativos
 * (o grupo inteiro de cada hex para hexes a até 2, Vilas inimigas e hexes com inimigos a
 * até 6). checkAction valida qualquer outro destino ou grupo.
 */
function conflictCandidates(ctx: EngineContext, state: GameState, player: PlayerId, out: Action[]): void {
  const barracks = ownedStructures(state, player, 'barracks');
  const near = new Set<HexKey>();
  for (const b of barracks) {
    near.add(b.key);
    for (const n of ctx.planet.neighbors(b.hex)) near.add(hexKeyOf(n));
  }
  for (const hex of near)
    for (const troop of ['line', 'artillery'] as const) out.push({ type: 'recruit', player, hex, troop });
  const groups = new Map<HexKey, number[]>();
  for (const [key, hex] of Object.entries(state.hexes)) {
    for (const t of hex.troops) {
      if (t.owner !== player) continue;
      out.push({ type: 'upgradeTroop', player, uid: t.uid });
      if (t.rootedRound !== state.round) groups.set(key, [...(groups.get(key) ?? []), t.uid]);
    }
  }
  const hot = Object.entries(state.hexes)
    .filter(
      ([k, h]) =>
        h.troops.some((t) => t.owner !== player) ||
        state.players.some((p) => p.id !== player && p.villageHex === k),
    )
    .map(([k, h]) => ({ k, h }));
  for (const [from, uids] of groups) {
    const fh = state.hexes[from];
    if (!fh) continue;
    const dests = new Set<HexKey>();
    for (const [k, h] of Object.entries(state.hexes))
      if (k !== from && ctx.planet.distance(fh, h) <= 2) dests.add(k);
    for (const { k, h } of hot) if (ctx.planet.distance(fh, h) <= 6) dests.add(k);
    for (const to of dests) out.push({ type: 'move', player, from, to, uids });
  }
  for (const resource of RESOURCE_IDS) out.push({ type: 'setTariff', player, resource });
}

/**
 * Fase 8: modelos prontos de treaties.json para cada outro jogador, romper pactos próprios e
 * usos representativos dos pactos de comércio (1 unidade de cada recurso por cada outro).
 */
function treatyCandidates(ctx: EngineContext, state: GameState, player: PlayerId, out: Action[]): void {
  for (const other of state.players) {
    if (other.id === player) continue;
    for (const terms of templateTerms(ctx)) out.push({ type: 'proposeTreaty', player, to: other.id, terms });
  }
  for (const t of treatiesOf(state, player)) {
    if (t.terms.kind === 'pact') out.push({ type: 'breakTreaty', player, treaty: t.id });
    if (!isCommercePact(t)) continue;
    for (const give of RESOURCE_IDS) {
      for (const receive of RESOURCE_IDS) {
        if (give === receive) continue;
        // Menor quantidade que rende 1 unidade.
        for (let amount = 1; amount <= 6; amount++) {
          const got = commerceQuote(ctx, t, give, amount, receive);
          if (got === null) break;
          if (got >= 1) {
            out.push({ type: 'useTreaty', player, treaty: t.id, give, amount, receive });
            break;
          }
        }
      }
    }
  }
}

/** Termos dos modelos prontos (treaties.json → templates), com os papéis do construtor. */
export function templateTerms(ctx: EngineContext): TreatyTerms[] {
  return ctx.data.treaties.templates.map((tpl): TreatyTerms => {
    if (tpl.type === 'pact') return { kind: 'pact', pact: tpl.pact, template: tpl.id };
    const k = ctx.data.treaties.contract;
    const consequence = k.consequences.find((c) => c.verb === tpl.then.verb);
    return {
      kind: 'contract',
      subject: tpl.if.subject as ContractTerms['subject'],
      negated: false,
      verb: tpl.if.verb,
      object: tpl.if.object,
      of: tpl.if.of as ContractTerms['of'],
      obligor: tpl.then.obligor as ContractTerms['obligor'],
      consequence: tpl.then.verb,
      target: tpl.then.object,
      ...(tpl.then.type ? { resource: tpl.then.type } : {}),
      ...(tpl.then.amount !== undefined && consequence?.params?.includes('amount')
        ? { amount: tpl.then.amount }
        : {}),
      ...(tpl.then.perTroop ? { perTroop: true } : {}),
      template: tpl.id,
    };
  });
}

/** A mesma quantia com 1 unidade a menos no maior item (null se ficaria vazia). */
function shrinkByOne(amounts: Partial<Resources>): Partial<Resources> | null {
  const top = RESOURCE_IDS.reduce<ResourceId | null>(
    (best, id) => ((amounts[id] ?? 0) > (best ? (amounts[best] ?? 0) : 0) ? id : best),
    null,
  );
  if (!top || amountTotal(amounts) <= 1) return null;
  return { ...amounts, [top]: (amounts[top] ?? 0) - 1 };
}

// ── Destaque de alvos na interface ───────────────────────────────────────────

/** Ação a escolher antes do alvo: a interface destaca os hexes onde ela é legal. */
export type ActionTemplate =
  | { readonly type: 'explore' }
  | { readonly type: 'survey'; readonly drone?: CardUse }
  | {
      readonly type: 'build';
      readonly structure: string;
      readonly drone?: CardUse;
      readonly halfCost?: CardUse;
    }
  | { readonly type: 'upgrade' }
  | { readonly type: 'chooseVillage' }
  /** Fase 7: mover todas as tropas livres do jogador em `from`. */
  | { readonly type: 'move'; readonly from: HexKey };

/** Ação concreta do molde num hex (Melhorar: a primeira estrutura própria melhorável). */
export function actionAt(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  template: ActionTemplate,
  hex: HexKey,
): Action | null {
  switch (template.type) {
    case 'explore':
    case 'chooseVillage':
      return { type: template.type, player, hex };
    case 'survey':
      return { type: 'survey', player, hex, ...(template.drone ? { drone: template.drone } : {}) };
    case 'build':
      return {
        type: 'build',
        player,
        structure: template.structure,
        hex,
        ...(template.drone ? { drone: template.drone } : {}),
        ...(template.halfCost ? { halfCost: template.halfCost } : {}),
      };
    case 'move': {
      const uids = (state.hexes[template.from]?.troops ?? [])
        .filter((t) => t.owner === player && t.rootedRound !== state.round)
        .map((t) => t.uid);
      return uids.length && hex !== template.from
        ? { type: 'move', player, from: template.from, to: hex, uids }
        : null;
    }
    case 'upgrade': {
      const own = state.hexes[hex]?.structures.filter((s) => s.owner === player) ?? [];
      const ok = own.find((s) => checkAction(ctx, state, { type: 'upgrade', player, uid: s.uid }).ok);
      return ok ? { type: 'upgrade', player, uid: ok.uid } : null;
    }
  }
}

/** Hexes do planeta onde o molde é legal agora para o jogador (destaque de alvos). */
export function actionTargets(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  template: ActionTemplate,
): HexKey[] {
  const out: HexKey[] = [];
  for (const key of Object.keys(state.hexes)) {
    const action = actionAt(ctx, state, player, template, key);
    if (action && checkAction(ctx, state, action).ok) out.push(key);
  }
  return out;
}
