/**
 * IA de tratados (PROMPTS Fase 8, item 4): aceita ou recusa por valor estimado em pontos de
 * recurso; propõe só os modelos prontos de treaties.json. A validade é sempre do motor
 * (legal.ts / rules/treaties.ts): a IA só decide se vale a pena.
 */
import type { ResourceId } from '../data/schemas';
import type { Action } from '../engine/actions';
import type { EngineContext } from '../engine/context';
import { checkAction, templateTerms } from '../engine/legal';
import { getPlayer } from '../engine/queries';
import { treatyGoldCost } from '../engine/rules/treaties';
import { tariffOf, troopsOf, troopStrength } from '../engine/rules/troops';
import type { GameState, PlayerId, TreatyTerms } from '../engine/state';
import type { AiWeights } from './weights';

const army = (ctx: EngineContext, state: GameState, p: PlayerId): number =>
  troopsOf(state, p).reduce((s, x) => s + troopStrength(ctx, state, x.troop), 0);

/** Valor do pedágio por tropa do território de `owner` (em pontos de recurso). */
function tollValue(ctx: EngineContext, state: GameState, owner: PlayerId): number {
  return Object.entries(tariffOf(ctx, state, owner)).reduce(
    (s, [r, q]) => s + (q ?? 0) * ctx.resourceValue(r as ResourceId),
    0,
  );
}

/**
 * Quanto o tratado vale para `me` (sem o Ouro). Heurística: paz vale a ameaça do outro;
 * pedágio vale a diferença por tropa vezes as entradas esperadas; pagamentos de contrato
 * valem o valor vezes a chance estimada de disparar.
 */
export function treatyValue(
  ctx: EngineContext,
  state: GameState,
  me: PlayerId,
  partner: PlayerId,
  from: PlayerId,
  terms: TreatyTerms,
  w: AiWeights,
): number {
  const mine = army(ctx, state, me);
  const theirs = army(ctx, state, partner);
  const myTroops = troopsOf(state, me).length;
  const theirTroops = troopsOf(state, partner).length;
  if (terms.kind === 'pact') {
    switch (terms.pact) {
      case 'pact_non_aggression':
        // Vale a ameaça que some menos a liberdade de atacar.
        return w.treatyPeace * (theirs - 0.5 * mine);
      case 'pact_free_passage':
        return (
          w.treatyToll * (myTroops * tollValue(ctx, state, partner) - theirTroops * tollValue(ctx, state, me))
        );
      case 'pact_staging':
        return w.treatyToll * (myTroops - theirTroops);
      default:
        return 0;
    }
  }
  const role = (r: string): PlayerId | null =>
    r === 'me' ? from : r === 'you' ? (from === me ? partner : me) : null;
  const resourceValue = terms.resource ? ctx.resourceValue(terms.resource) : 1;
  const amount = terms.amount ?? 1;
  if (terms.consequence === 'overrideToll') {
    // Quem entra paga `amount` do recurso em vez da tarifa do dono.
    const instead = amount * resourceValue;
    const asInvader = w.treatyToll * myTroops * (tollValue(ctx, state, partner) - instead);
    const asOwner = w.treatyToll * theirTroops * (instead - tollValue(ctx, state, me));
    return asInvader + asOwner;
  }
  const obligor = role(terms.obligor);
  const stake =
    terms.consequence === 'pay' && terms.target === 'resource'
      ? amount * resourceValue
      : terms.consequence === 'loseAction'
        ? amount * 4
        : terms.consequence === 'forbid'
          ? 2
          : amount * 3;
  const odds = w.treatyOdds;
  if (obligor === me) return -odds * stake;
  if (obligor === partner) return odds * stake;
  // "actor"/"otherSignatory": quem paga depende do gatilho — metade para cada lado.
  return 0;
}

/** Ouro do aceite em pontos de recurso. */
const goldValue = (ctx: EngineContext, state: GameState, p: PlayerId): number =>
  treatyGoldCost(ctx, state, p) * ctx.resourceValue('gold');

/** Aceita a proposta pendente se rende mais que o Ouro e a margem. */
export function respondTreaty(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: readonly Action[],
  w: AiWeights,
): Action {
  const p = state.treaties.pending;
  const reject = legal.find((a) => a.type === 'rejectTreaty') ?? { type: 'rejectTreaty', player };
  if (!p || p.to !== player) return legal.find((a) => a.type === 'cancelTreaty') ?? reject;
  const accept = legal.find((a) => a.type === 'acceptTreaty');
  if (!accept) return reject;
  const v = treatyValue(ctx, state, player, p.from, p.from, p.terms, w);
  return v - goldValue(ctx, state, player) > w.treatyMargin ? accept : reject;
}

/** Proposta de modelo pronto que vale para os dois lados (o outro provavelmente aceita). */
export function treatyProposal(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  w: AiWeights,
): Action | null {
  if (!state.layers.treaties || getPlayer(state, player).treatyRound === state.round) return null;
  let best: { action: Action; value: number } | null = null;
  for (const other of state.players) {
    if (other.id === player || other.eliminated) continue;
    // Sem Ouro para o aceite, o outro nem pode assinar.
    const broke = [player, other.id].some(
      (p) => getPlayer(state, p).resources.gold < treatyGoldCost(ctx, state, p),
    );
    if (broke) continue;
    for (const terms of templateTerms(ctx)) {
      const action: Action = { type: 'proposeTreaty', player, to: other.id, terms };
      if (!checkAction(ctx, state, action).ok) continue;
      const mine =
        treatyValue(ctx, state, player, other.id, player, terms, w) - goldValue(ctx, state, player);
      const theirs =
        treatyValue(ctx, state, other.id, player, player, terms, w) - goldValue(ctx, state, other.id);
      if (mine <= w.treatyMargin || theirs <= w.treatyMargin) continue;
      if (!best || mine > best.value) best = { action, value: mine };
    }
  }
  return best?.action ?? null;
}
