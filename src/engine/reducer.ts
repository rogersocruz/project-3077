/**
 * applyAction(ctx, state, action) → { state, events }. Puro: não altera o estado de
 * entrada; trabalha numa cópia. Ação ilegal lança IllegalActionError com o motivo.
 */
import { ACTION_COST, type Action } from './actions';
import type { EngineContext } from './context';
import type { GameEvent } from './events';
import { checkAction } from './legal';
import { advanceSetup, continueTurn, endCurrentPhase } from './phases';
import { gain, getPlayer, pay, sameBoardNeighbors } from './queries';
import { IllegalActionError } from './reasons';
import { buildCost, raiseLevel, upgradeCost } from './rules/build';
import { applyDeliver, applyInstall, applyModifier, applyPlayCard, applyResolveChoice } from './rules/cards';
import { discardFromHand, drawCards, drawRow, drawRows } from './rules/decks';
import { bankQuote } from './rules/economy';
import { autoSurveyAdjacent, permanentsWith, sumParam } from './rules/permanents';
import { createGame, type GameOptions } from './setup';
import type { GameState, HexKey, PlayerId } from './state';

export interface ApplyResult {
  readonly state: GameState;
  readonly events: GameEvent[];
}

function reveal(state: GameState, key: HexKey, by: PlayerId | null, events: GameEvent[]): void {
  const hex = state.hexes[key];
  if (!hex || hex.revealed) return;
  hex.revealed = true;
  events.push({ type: 'hexRevealed', hex: key, surface: hex.surface, by });
}

function apply(ctx: EngineContext, s: GameState, action: Action, events: GameEvent[]): void {
  const player = getPlayer(s, action.player);
  s.actionsLeft -= ACTION_COST[action.type];

  switch (action.type) {
    case 'chooseCompensation': {
      const option = ctx.balance.setup.noSpecialCompensation.choose[action.option];
      const resources = option && 'resourcesOfChoice' in option ? (action.resources ?? {}) : {};
      gain(player.resources, resources);
      if (option && 'drawFromDeck' in option) {
        drawCards(s, player.id, option.drawFromDeck, option.count, events);
      }
      player.compensation = 'done';
      events.push({ type: 'compensationChosen', player: player.id, option: action.option, resources });
      advanceSetup(ctx, s, events);
      return;
    }
    case 'chooseVillage': {
      const hex = s.hexes[action.hex];
      if (!hex) return;
      hex.structures.push({ uid: s.nextUid++, type: 'village', level: 1, owner: player.id });
      player.villageHex = action.hex;
      events.push({ type: 'villageFounded', player: player.id, hex: action.hex });
      // GDD 3.3: Vila e adjacentes começam revelados.
      reveal(s, action.hex, player.id, events);
      for (const n of sameBoardNeighbors(ctx, hex)) reveal(s, n, player.id, events);
      advanceSetup(ctx, s, events);
      return;
    }
    case 'chooseDraw': {
      drawRow(s, player.id, drawRows(ctx, s, player.id)[action.row] ?? [], events);
      continueTurn(ctx, s, events);
      return;
    }
    case 'explore':
      reveal(s, action.hex, player.id, events);
      return;
    case 'survey': {
      const hex = s.hexes[action.hex];
      if (!hex) return;
      if (action.drone) applyModifier(ctx, s, player.id, action.drone, events);
      hex.surveyedBy.push(player.id);
      events.push({ type: 'subsoilSurveyed', hex: action.hex, player: player.id, subsoil: hex.subsoil });
      return;
    }
    case 'build': {
      const hex = s.hexes[action.hex];
      if (!hex) return;
      if (action.drone) applyModifier(ctx, s, player.id, action.drone, events);
      if (action.halfCost) applyModifier(ctx, s, player.id, action.halfCost, events);
      const cost = buildCost(ctx, action.structure, !!action.halfCost);
      pay(player.resources, cost);
      events.push({ type: 'resourcesSpent', player: player.id, resources: cost });
      const def = ctx.structure(action.structure);
      const uid = s.nextUid++;
      // Perfuração Profunda: Minas novas ganham tokens extras.
      const tokens =
        (def.tokens ?? ctx.balance.production.mineTokens) +
        sumParam(permanentsWith(ctx, s, player.id, 'mineTokensBonus'), 'amount');
      hex.structures.push({
        uid,
        type: action.structure,
        level: 1,
        owner: player.id,
        ...(action.structure === 'mine' ? { tokens } : {}),
      });
      events.push({
        type: 'structureBuilt',
        player: player.id,
        hex: action.hex,
        uid,
        structure: action.structure,
      });
      autoSurveyAdjacent(ctx, s, player.id, events);
      return;
    }
    case 'upgrade': {
      const cost = upgradeCost(ctx, s, player.id, action.uid);
      pay(player.resources, cost);
      events.push({ type: 'resourcesSpent', player: player.id, resources: cost });
      raiseLevel(ctx, s, action.uid, events);
      return;
    }
    case 'bankTrade': {
      const quote = bankQuote(ctx, s, player.id, action.give, action.amount, action.receive);
      player.resources[action.give] -= action.amount;
      player.resources[action.receive] += quote.received;
      events.push({
        type: 'bankTraded',
        player: player.id,
        give: action.give,
        amount: action.amount,
        receive: action.receive,
        received: quote.received,
        lostCredit: quote.lostCredit,
      });
      return;
    }
    case 'proposeTrade':
      s.pendingTrade = { from: player.id, to: action.to, give: action.give, receive: action.receive };
      events.push({ type: 'tradeProposed', from: player.id, to: action.to });
      return;
    case 'counterTrade': {
      const t = s.pendingTrade;
      if (!t) return;
      s.pendingTrade = { from: player.id, to: t.from, give: action.give, receive: action.receive };
      events.push({ type: 'tradeCountered', from: player.id, to: t.from });
      return;
    }
    case 'acceptTrade': {
      const t = s.pendingTrade;
      if (!t) return;
      const from = getPlayer(s, t.from);
      const to = getPlayer(s, t.to);
      pay(from.resources, t.give);
      gain(to.resources, t.give);
      pay(to.resources, t.receive);
      gain(from.resources, t.receive);
      s.pendingTrade = null;
      events.push({ type: 'tradeAccepted', from: t.from, to: t.to });
      return;
    }
    case 'rejectTrade':
    case 'cancelTrade': {
      const t = s.pendingTrade;
      if (!t) return;
      s.pendingTrade = null;
      events.push({
        type: action.type === 'rejectTrade' ? 'tradeRejected' : 'tradeCancelled',
        from: t.from,
        to: t.to,
      });
      return;
    }
    case 'playCard':
      applyPlayCard(ctx, s, action, events);
      return;
    case 'installPermanent':
      applyInstall(ctx, s, action, events);
      return;
    case 'clearSeal': {
      const hex = s.hexes[action.hex];
      if (!hex?.seal) return;
      s.actionsLeft -= hex.seal.clearActions;
      hex.seal = null;
      events.push({ type: 'subsoilCleared', hex: action.hex, player: player.id });
      return;
    }
    case 'deliverCard':
      applyDeliver(ctx, s, action, events);
      return;
    case 'discardCards':
      discardFromHand(ctx, s, player.id, action.cards, 'limit', events);
      return;
    case 'resolveChoice':
      applyResolveChoice(s, action, events);
      return;
    case 'endPhase':
      endCurrentPhase(ctx, s, events);
      return;
  }
}

export function applyAction(ctx: EngineContext, state: GameState, action: Action): ApplyResult {
  const check = checkAction(ctx, state, action);
  if (!check.ok) throw new IllegalActionError(check.reason);
  // O log só cresce e suas ações nunca mudam: copia o estado sem ele e reaproveita as
  // entradas (copiar o histórico inteiro a cada ação deixava a partida O(n²)).
  const next = structuredClone<GameState>({ ...state, log: [] });
  const events: GameEvent[] = [];
  apply(ctx, next, action, events);
  next.log = [...state.log, structuredClone(action)];
  return { state: next, events };
}

/** Recria a partida a partir da seed e do log (base do salvamento). */
export function replay(ctx: EngineContext, options: GameOptions, log: readonly Action[]): GameState {
  let state = createGame(ctx, options);
  for (const action of log) state = applyAction(ctx, state, action).state;
  return state;
}
