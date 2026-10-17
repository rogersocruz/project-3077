/**
 * Tratados (GDD 10): contratos SE/ENTÃO e pactos, validação na assinatura (regra fixa do
 * motor, nunca IA), gatilhos, consequências, inadimplência, quebra de pacto, prazos.
 *
 * Interpretações (Fase 8, isoladas aqui; BB–BF decididas pelo usuário):
 * BA) só o jogador ativo propõe, na fase de Ações, 1 proposta por turno, a 1 outro jogador
 *     (tratado bilateral); o destinatário aceita ou recusa na hora; o Ouro sai no aceite;
 * BB) a ação que um pacto proíbe continua legal e ROMPE o pacto (a interface avisa); também há
 *     "Romper pacto"; quem rompe descarta a mão e perde 1 ação. NÃO PODE (consequência de
 *     contrato) é proibição de verdade: o motor recusa a ação;
 * BC) contrato que não dispara expira em pactDurationRounds; PAGA EM VEZ DA TARIFA vale em toda
 *     entrada enquanto durar; as outras consequências disparam uma vez e encerram o contrato;
 *     "N rodadas" contam a rodada atual; "SE NÃO" vence no fim da rodada seguinte à assinatura;
 * BD) papéis: me = quem propôs, you = quem recebeu; otherSignatory (vítima) = o signatário que
 *     não agiu; otherSignatory (obrigado) = o parceiro da vítima; o beneficiário é sempre o
 *     outro signatário (só signatários trocam recurso, carta, permanente);
 * BE) gatilhos vêm dos eventos do motor (quem agiu = jogador da ação, remetente da carta
 *     revelada ou atacante do combate); ATACAR também vale ao mover tropas para hex com tropa
 *     ou Vila da vítima; DESTRUIR inclui rebaixar; carta paga/entregue/descartada é sorteada da
 *     mão; inadimplência = paga o que puder e perde defaultPenalty.loseActions;
 * BF) pactos de comércio = oferta permanente: 1 vez por turno, sem aceite, Livre Comércio pelo
 *     valor base (arredonda a favor de quem cede), Preço Fixo = recurso ⇄ Ouro pelo preço.
 */
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import type { Action } from '../actions';
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import { canAfford, findStructure, getPlayer, isResourceId } from '../queries';
import type { Reason } from '../reasons';
import {
  type CardTarget,
  type ContractTerms,
  type GameState,
  type LayerName,
  type PactTerms,
  type PlayerId,
  type Treaty,
  type TreatyTerms,
  TURN_PHASES,
} from '../state';
import { discardFromHand, withRng } from './decks';
import { cardDefOf, freeSlot, hasPermanent, placePermanent } from './permanents';
import { findTroop, planMove } from './troops';
import {
  activeCount,
  boardOwnerOf,
  hexOwner,
  isParty,
  partnerOf,
  stagingAllies,
  subjectMatches,
  treatiesOf,
  victimMatches,
} from './treatyQueries';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

/** Rascunho do construtor: os campos ainda não escolhidos ficam ausentes. */
export type TreatyDraft =
  | ({ readonly kind: 'pact' } & Partial<Omit<PactTerms, 'kind'>>)
  | ({ readonly kind: 'contract' } & Partial<Omit<ContractTerms, 'kind'>>);

const bad = (part: string): Reason => ({ key: 'treatyInvalid', params: { part } });
const layerOff = (layer: LayerName): Reason => ({ key: 'layerDisabled', params: { layer } });
const off = (state: GameState): Reason | null => (state.layers.treaties ? null : layerOff('treaties'));

const PACT_LAYER: Partial<Record<string, LayerName>> = {
  border: 'conflict',
  military: 'conflict',
  cards: 'cards',
};

/** Camadas que o gatilho precisa para poder acontecer. */
export function triggerLayers(verb: string, object: string): LayerName[] {
  switch (verb) {
    case 'attack':
    case 'enter':
    case 'collect':
      return ['conflict'];
    case 'target':
      return object === 'troop' ? ['cards', 'conflict'] : ['cards'];
    case 'destroy':
      return object === 'troop' ? ['conflict'] : ['cards'];
    case 'steal':
      return ['cards'];
    default:
      return [];
  }
}

/** Camadas que a consequência precisa. */
export function consequenceLayers(verb: string, object: string): LayerName[] {
  if (verb === 'overrideToll') return ['conflict'];
  if (verb === 'forbid') return object === 'target' ? ['cards'] : ['conflict'];
  if (verb === 'loseAction') return [];
  if (verb === 'pay' && object === 'resource') return [];
  return ['cards'];
}

const SIGNATORY_SUBJECTS = new Set(['me', 'you', 'anySignatory']);
const FIXED = new Set(['me', 'you']);

/** Jogadores na partida fora os dois signatários. */
const thirds = (state: GameState, a: PlayerId, b: PlayerId): number =>
  state.players.filter((p) => !p.eliminated && p.id !== a && p.id !== b).length;

const posInt = (n: unknown): boolean => typeof n === 'number' && Number.isInteger(n) && n >= 1;

function checkPactDraft(
  ctx: EngineContext,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  d: Extract<TreatyDraft, { kind: 'pact' }>,
  complete: boolean,
): Reason | null {
  if (d.pact === undefined) return complete ? bad('pact') : null;
  const def = ctx.data.treaties.pacts.find((p) => p.id === d.pact);
  if (!def) return bad('pact');
  const need = PACT_LAYER[def.category];
  if (need && !state.layers[need]) return layerOff(need);
  if (def.params?.length) {
    if (d.resource === undefined) {
      if (complete) return bad('resource');
    } else if (!isResourceId(d.resource) || d.resource === 'gold') return bad('resource');
    if (d.price === undefined) {
      if (complete) return bad('price');
    } else if (!posInt(d.price)) return bad('price');
  } else if (d.resource !== undefined || d.price !== undefined) return bad('params');
  const clash = (a: string, b: string) =>
    a === b || ctx.data.treaties.pactConflicts.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (const t of state.treaties.active) {
    if (t.terms.kind === 'pact' && isParty(t, from) && isParty(t, to) && clash(t.terms.pact, d.pact))
      return { key: 'treatyConflict' };
  }
  return null;
}

function checkContractDraft(
  ctx: EngineContext,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  d: Extract<TreatyDraft, { kind: 'contract' }>,
  complete: boolean,
): Reason | null {
  const k = ctx.data.treaties.contract;
  const missing = (part: string) => (complete ? bad(part) : null);
  const negated = d.negated ?? false;

  // SE: sujeito.
  if (d.subject === undefined) return missing('subject');
  if (!k.subjects.includes(d.subject)) return bad('subject');
  if (d.subject === 'third' && thirds(state, from, to) < 1) return bad('third');
  if (negated && !k.negation.allowed) return bad('negated');
  // "SE NÃO": alguém determinado precisa agir até o prazo.
  if (negated && !FIXED.has(d.subject)) return bad('negated');

  // Verbo e objeto.
  if (d.verb === undefined) return missing('verb');
  const trig = k.triggers.find((t) => t.verb === d.verb);
  if (!trig) return bad('verb');
  if (d.object === undefined) return missing('object');
  if (!trig.objects.includes(d.object)) return bad('object');
  for (const l of triggerLayers(d.verb, d.object)) if (!state.layers[l]) return layerOff(l);

  // De quem.
  if (d.of === undefined) return missing('of');
  if (!k.victims.includes(d.of)) return bad('of');
  if (d.of === 'third' && thirds(state, from, to) < 1) return bad('third');
  if (d.of === 'otherSignatory' && !SIGNATORY_SUBJECTS.has(d.subject)) return bad('of');
  if (FIXED.has(d.of) && d.of === d.subject) return bad('of');

  // ENTÃO: quem cumpre.
  if (d.obligor === undefined) return missing('obligor');
  if (!k.obligors.includes(d.obligor)) return bad('obligor');
  if (d.obligor === 'actor' && !SIGNATORY_SUBJECTS.has(d.subject)) return bad('obligor');
  if (d.obligor === 'otherSignatory') {
    const ok = negated ? FIXED.has(d.of) || d.of === 'otherSignatory' : d.of !== 'third' && d.of !== 'anyone';
    if (!ok) return bad('obligor');
  }

  // Consequência.
  if (d.consequence === undefined) return missing('consequence');
  const cons = k.consequences.find((c) => c.verb === d.consequence);
  if (!cons) return bad('consequence');
  if (d.target === undefined) return missing('target');
  if (!cons.objects.includes(d.target)) return bad('target');
  for (const l of consequenceLayers(d.consequence, d.target)) if (!state.layers[l]) return layerOff(l);

  const needResource =
    (d.consequence === 'pay' && d.target === 'resource') || d.consequence === 'overrideToll';
  if (needResource) {
    if (d.resource === undefined) return missing('resource');
    if (!isResourceId(d.resource)) return bad('resource');
  } else if (d.resource !== undefined) return bad('resource');
  const needAmount = ['pay', 'discard', 'loseAction', 'overrideToll'].includes(d.consequence);
  if (needAmount) {
    if (d.amount === undefined) return missing('amount');
    if (!posInt(d.amount)) return bad('amount');
    if (d.consequence === 'loseAction' && d.amount > ctx.balance.turn.actionsPerTurn) return bad('amount');
  } else if (d.amount !== undefined) return bad('amount');
  if (d.perTroop) {
    if (!needResource || (d.verb !== 'enter' && d.verb !== 'attack')) return bad('perTroop');
  }
  if (d.consequence === 'forbid') {
    if (d.rounds === undefined) return missing('rounds');
    if (!posInt(d.rounds) || d.rounds > ctx.balance.treaties.pactDurationRounds) return bad('rounds');
  } else if (d.rounds !== undefined) return bad('rounds');
  if (d.consequence === 'give' && d.target === 'permanent') {
    if (!FIXED.has(d.obligor)) return bad('obligor');
    if (d.permanent === undefined) return missing('permanent');
    const owner = d.obligor === 'me' ? from : to;
    if (!getPlayer(state, owner).permanents.includes(d.permanent)) return bad('permanent');
  } else if (d.permanent !== undefined) return bad('permanent');
  if (d.consequence === 'overrideToll') {
    // Troca o pedágio de quem entra: precisa de um gatilho de entrada entre signatários.
    if (d.verb !== 'enter' || negated) return bad('consequence');
    if (!SIGNATORY_SUBJECTS.has(d.subject) || !(FIXED.has(d.of) || d.of === 'otherSignatory'))
      return bad('consequence');
    if (d.obligor !== 'actor') return bad('obligor');
  }
  return null;
}

/**
 * Validação do tratado (GDD 10: "validação na assinatura"). Com `complete = false` confere só
 * os campos já escolhidos: o construtor só oferece opções que passam aqui.
 */
export function checkTreatyTerms(
  ctx: EngineContext,
  state: GameState,
  from: PlayerId,
  to: PlayerId,
  draft: TreatyDraft,
  complete = true,
): Reason | null {
  const o = off(state);
  if (o) return o;
  if (draft.kind === 'pact') return checkPactDraft(ctx, state, from, to, draft, complete);
  if (draft.kind === 'contract') return checkContractDraft(ctx, state, from, to, draft, complete);
  return bad('kind');
}

// ── Proposta, aceite, recusa ─────────────────────────────────────────────────

/** Ouro que o jogador paga no aceite (Tratados Livres zera). */
export function treatyGoldCost(ctx: EngineContext, state: GameState, player: PlayerId): number {
  return hasPermanent(ctx, state, player, 'freeTreaties') ? 0 : ctx.balance.treaties.goldCostEach;
}

function partiesReason(ctx: EngineContext, state: GameState, from: PlayerId, to: PlayerId): Reason | null {
  const partner = state.players[to];
  if (!partner || to === from) return { key: 'invalidTradePartner' };
  if (partner.eliminated) return { key: 'playerEliminated' };
  const max = ctx.balance.treaties.maxActivePerPlayer;
  if (activeCount(state, from) >= max || activeCount(state, to) >= max)
    return { key: 'treatyLimit', params: { max } };
  return null;
}

export function checkProposeTreaty(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'proposeTreaty'>,
): Reason | null {
  const o = off(state);
  if (o) return o;
  if (getPlayer(state, a.player).treatyRound === state.round) return { key: 'treatyAlreadyProposed' };
  return partiesReason(ctx, state, a.player, a.to) ?? checkTreatyTerms(ctx, state, a.player, a.to, a.terms);
}

export function applyProposeTreaty(
  state: GameState,
  a: ActionOf<'proposeTreaty'>,
  events: GameEvent[],
): void {
  state.treaties.pending = { from: a.player, to: a.to, terms: a.terms };
  getPlayer(state, a.player).treatyRound = state.round;
  events.push({ type: 'treatyProposed', from: a.player, to: a.to, terms: a.terms });
}

/** Resposta à proposta pendente (aceitar, recusar, retirar). */
export function checkTreatyResponse(ctx: EngineContext, state: GameState, action: Action): Reason | null {
  const p = state.treaties.pending;
  if (!p) return { key: 'noTreatyPending' };
  switch (action.type) {
    case 'acceptTreaty': {
      if (action.player !== p.to) return { key: 'notTreatyRecipient' };
      const r =
        partiesReason(ctx, state, p.from, p.to) ?? checkTreatyTerms(ctx, state, p.from, p.to, p.terms);
      if (r) return r;
      for (const who of [p.from, p.to]) {
        if (!canAfford(getPlayer(state, who).resources, { gold: treatyGoldCost(ctx, state, who) }))
          return { key: 'treatyGold', params: { player: who } };
      }
      return null;
    }
    case 'rejectTreaty':
      return action.player === p.to ? null : { key: 'notTreatyRecipient' };
    case 'cancelTreaty':
      return action.player === p.from ? null : { key: 'notTreatyProposer' };
    default:
      return { key: 'treatyPending' };
  }
}

/** Prazo do tratado assinado agora (BC). */
export function treatyUntil(ctx: EngineContext, state: GameState, terms: TreatyTerms): number {
  const t = ctx.balance.treaties;
  if (terms.kind === 'contract' && terms.negated) return state.round + t.negativeTriggerDeadlineRounds;
  return state.round + t.pactDurationRounds - 1;
}

export function applyTreatyResponse(
  ctx: EngineContext,
  state: GameState,
  action: ActionOf<'acceptTreaty' | 'rejectTreaty' | 'cancelTreaty'>,
  events: GameEvent[],
): void {
  const p = state.treaties.pending;
  if (!p) return;
  state.treaties.pending = null;
  if (action.type === 'rejectTreaty') {
    events.push({ type: 'treatyRejected', from: p.from, to: p.to });
    return;
  }
  if (action.type === 'cancelTreaty') {
    events.push({ type: 'treatyCancelled', from: p.from, to: p.to });
    return;
  }
  for (const who of [p.from, p.to]) {
    const gold = treatyGoldCost(ctx, state, who);
    if (gold > 0) {
      getPlayer(state, who).resources.gold -= gold;
      events.push({ type: 'resourcesSpent', player: who, resources: { gold } });
    }
  }
  const treaty: Treaty = {
    id: state.treaties.nextId++,
    parties: [p.from, p.to],
    terms: p.terms,
    signedRound: state.round,
    until: treatyUntil(ctx, state, p.terms),
  };
  state.treaties.active.push(treaty);
  events.push({
    type: 'treatySigned',
    treaty: treaty.id,
    parties: [p.from, p.to],
    terms: p.terms,
    until: treaty.until,
  });
}

// ── Ações perdidas e quebra de pacto ─────────────────────────────────────────

/** Tira ações agora (no próprio turno, até as Ações) ou no começo do próximo turno. */
export function loseActions(state: GameState, player: PlayerId, n: number, events: GameEvent[]): void {
  if (n <= 0) return;
  const p = getPlayer(state, player);
  const inTurn =
    state.stage === 'playing' &&
    state.activePlayer === player &&
    TURN_PHASES.indexOf(state.phase) <= TURN_PHASES.indexOf('actions');
  const now = inTurn ? Math.min(n, state.actionsLeft) : 0;
  if (now > 0) {
    state.actionsLeft -= now;
    events.push({ type: 'actionsChanged', player, delta: -now, actionsLeft: state.actionsLeft });
  }
  p.actionDebt += n - now;
}

/** Começo do turno: cobra as ações devidas. */
export function payActionDebt(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = getPlayer(state, player);
  if (p.actionDebt <= 0) return;
  const amount = Math.min(p.actionDebt, state.actionsLeft);
  state.actionsLeft -= amount;
  p.actionDebt = 0;
  events.push({ type: 'actionDebtPaid', player, amount });
}

const removeTreaty = (state: GameState, id: number): void => {
  state.treaties.active = state.treaties.active.filter((t) => t.id !== id);
};

/** GDD 10: quem rompe descarta a mão e perde 1 ação. */
export function breakPact(
  ctx: EngineContext,
  state: GameState,
  treaty: Treaty,
  by: PlayerId,
  events: GameEvent[],
): void {
  if (treaty.terms.kind !== 'pact') return;
  removeTreaty(state, treaty.id);
  events.push({ type: 'pactBroken', treaty: treaty.id, by, pact: treaty.terms.pact });
  const pen = ctx.balance.treaties.pactBreakPenalty;
  if (pen.discardHand) discardFromHand(ctx, state, by, [...getPlayer(state, by).hand], 'treaty', events);
  loseActions(state, by, pen.loseActions, events);
}

export function checkBreakTreaty(state: GameState, a: ActionOf<'breakTreaty'>): Reason | null {
  const o = off(state);
  if (o) return o;
  const t = state.treaties.active.find((x) => x.id === a.treaty);
  if (!t) return { key: 'treatyNotFound' };
  if (!isParty(t, a.player)) return { key: 'notTreatyParty' };
  return t.terms.kind === 'pact' ? null : { key: 'invalidOption' };
}

// ── Intenção da ação: o que ela faz contra quem (pactos e NÃO PODE) ──────────

export interface Occurrence {
  readonly verb: string;
  readonly object: string;
  readonly actor: PlayerId;
  readonly victim: PlayerId;
  /** Tropas envolvidas (entrar/atacar movendo). */
  readonly troops: number;
}

const OBJECT_OF_TARGET: Partial<Record<CardTarget['kind'], string>> = {
  structure: 'structure',
  troop: 'troop',
  permanent: 'permanent',
  resource: 'resource',
};

function targetOwner(state: GameState, t: CardTarget, recipient: PlayerId | null): PlayerId | null {
  switch (t.kind) {
    case 'structure':
      return findStructure(state, t.uid)?.structure.owner ?? null;
    case 'troop':
      return findTroop(state, t.uid)?.troop.owner ?? null;
    case 'permanent':
    case 'player':
      return t.player;
    case 'resource':
      return recipient;
    case 'hex':
      return hexOwner(state, t.hex);
    default:
      return null;
  }
}

function targetOccurrences(
  state: GameState,
  actor: PlayerId,
  target: CardTarget | undefined,
  recipient: PlayerId | null,
): Occurrence[] {
  const out: Occurrence[] = [];
  if (recipient !== null && recipient !== actor)
    out.push({ verb: 'target', object: 'card', actor, victim: recipient, troops: 0 });
  if (!target) return out;
  const object = OBJECT_OF_TARGET[target.kind];
  const owner = targetOwner(state, target, recipient);
  if (object && owner !== null && owner !== actor)
    out.push({ verb: 'target', object, actor, victim: owner, troops: 0 });
  return out;
}

/** Entradas em territórios alheios ao longo do caminho e ataques no destino. */
function moveOccurrences(
  state: GameState,
  player: PlayerId,
  path: readonly string[],
  to: string,
  n: number,
): Occurrence[] {
  const out: Occurrence[] = [];
  const seen = new Set<PlayerId>();
  for (let i = 1; i < path.length; i++) {
    const a = state.hexes[path[i - 1] ?? ''];
    const b = state.hexes[path[i] ?? ''];
    if (!a || !b || a.boardId === b.boardId) continue;
    const owner = boardOwnerOf(state, b.boardId);
    if (owner === null || owner === player || seen.has(owner)) continue;
    seen.add(owner);
    out.push({ verb: 'enter', object: 'territory', actor: player, victim: owner, troops: n });
    out.push({ verb: 'enter', object: 'border', actor: player, victim: owner, troops: n });
  }
  const dest = state.hexes[to];
  if (!dest) return out;
  const victims = new Set(
    dest.troops.map((t) => t.owner).filter((o) => o !== player && !stagingAllies(state, player, o)),
  );
  for (const v of victims) {
    out.push({ verb: 'attack', object: 'troop', actor: player, victim: v, troops: n });
    if (hexOwner(state, to) === v)
      out.push({ verb: 'attack', object: 'territory', actor: player, victim: v, troops: n });
    if (dest.structures.some((s) => s.owner === v))
      out.push({ verb: 'attack', object: 'structure', actor: player, victim: v, troops: n });
  }
  for (const p of state.players) {
    if (p.id !== player && p.villageHex === to && !stagingAllies(state, player, p.id))
      out.push({ verb: 'attack', object: 'village', actor: player, victim: p.id, troops: n });
  }
  return out;
}

/** O que a ação faria contra outros jogadores (antes de aplicar). */
export function actionIntents(ctx: EngineContext, state: GameState, action: Action): Occurrence[] {
  switch (action.type) {
    case 'move': {
      const plan = planMove(ctx, state, action.player, action.from, action.to, action.uids.length);
      return plan ? moveOccurrences(state, action.player, plan.path, action.to, action.uids.length) : [];
    }
    case 'deliverCard':
      return targetOccurrences(state, action.player, action.target, action.to);
    case 'playCard':
      return targetOccurrences(state, action.player, action.target, null);
    case 'survey': {
      const owner = hexOwner(state, action.hex);
      if (owner === null || owner === action.player) return [];
      return [
        { verb: 'observe', object: 'subsoil', actor: action.player, victim: owner, troops: 0 },
        { verb: 'observe', object: 'territory', actor: action.player, victim: owner, troops: 0 },
      ];
    }
    default:
      return [];
  }
}

/** Pactos que a ação rompe (BB). */
export function pactsBrokenBy(ctx: EngineContext, state: GameState, action: Action): Treaty[] {
  if (!state.layers.treaties) return [];
  const mine = treatiesOf(state, action.player).filter((t) => t.terms.kind === 'pact');
  if (mine.length === 0) return [];
  const occ = actionIntents(ctx, state, action);
  const against = (verb: string, partner: PlayerId) =>
    occ.some((o) => o.verb === verb && o.victim === partner);
  return mine.filter((t) => {
    const partner = partnerOf(t, action.player);
    switch (t.terms.kind === 'pact' ? t.terms.pact : '') {
      case 'pact_closed_border':
        return against('enter', partner);
      case 'pact_non_aggression':
        return against('attack', partner);
      case 'pact_closed_survey':
        return against('observe', partner);
      case 'pact_no_sabotage':
        return (
          action.type === 'deliverCard' &&
          action.to === partner &&
          cardDefOf(ctx, state, action.card).valence === 'sabotage'
        );
      default:
        return false;
    }
  });
}

/** NÃO PODE em vigor (consequência de contrato): a ação é recusada. */
export function restrictionReason(ctx: EngineContext, state: GameState, action: Action): Reason | null {
  if (!state.layers.treaties) return null;
  const rs = state.treaties.restrictions.filter((r) => r.player === action.player && r.until >= state.round);
  if (rs.length === 0) return null;
  const occ = actionIntents(ctx, state, action);
  const hit = rs.find((r) => occ.some((o) => o.verb === r.verb && o.victim === r.against));
  return hit ? { key: 'treatyForbids', params: { treaty: hit.treaty, player: hit.against } } : null;
}

// ── Gatilhos pelos eventos do motor ──────────────────────────────────────────

interface Cursor {
  index: number;
  actor: PlayerId | null;
  combat: { attacker: PlayerId | null; winner: PlayerId | null } | null;
}

/**
 * Até onde a lista de eventos de uma ação já foi lida (a mesma lista é lida no fim da rodada e
 * no fim da ação). Não é estado da partida: só evita ler o mesmo evento duas vezes.
 */
const cursors = new WeakMap<GameEvent[], Cursor>();

/** Ocorrências que um evento representa (BE). */
function occurrencesOf(state: GameState, e: GameEvent, c: Cursor): Occurrence[] {
  const occ = (verb: string, object: string, actor: PlayerId | null, victim: PlayerId | null, troops = 0) =>
    actor !== null && victim !== null && actor >= 0 && victim >= 0 && actor !== victim
      ? [{ verb, object, actor, victim, troops }]
      : [];
  switch (e.type) {
    case 'roundStarted':
    case 'turnStarted':
      c.actor = null;
      return [];
    case 'phaseChanged':
      c.actor = e.phase === 'actions' || e.phase === 'delivery' ? e.player : null;
      return [];
    case 'cardRevealed':
      c.actor = e.from;
      return targetOccurrences(state, e.from, e.target, e.to);
    case 'cardPlayed':
      c.actor = e.player;
      return targetOccurrences(state, e.player, e.target, null);
    case 'troopsMoved': {
      // O destino só conta como ataque se as tropas da vítima ainda estão lá (estado depois).
      const out = moveOccurrences(state, e.player, e.path, e.to, e.uids.length);
      return out.filter(
        (o) =>
          o.verb === 'enter' ||
          o.object === 'village' ||
          state.hexes[e.to]?.troops.some((t) => t.owner === o.victim),
      );
    }
    case 'combatResolved': {
      const attacker = e.sides.find((s) => s.attacker)?.owner ?? null;
      c.combat = { attacker, winner: e.winner };
      if (attacker === null || attacker < 0) return [];
      const hex = state.hexes[e.hex];
      const out: Occurrence[] = [];
      for (const s of e.sides) {
        if (s.owner === attacker || s.owner < 0) continue;
        out.push(...occ('attack', 'troop', attacker, s.owner));
        if (hexOwner(state, e.hex) === s.owner) out.push(...occ('attack', 'territory', attacker, s.owner));
        if (hex?.structures.some((x) => x.owner === s.owner))
          out.push(...occ('attack', 'structure', attacker, s.owner));
        if (getPlayer(state, s.owner).villageHex === e.hex)
          out.push(...occ('attack', 'village', attacker, s.owner));
      }
      return out;
    }
    case 'troopsLost': {
      const cb = c.combat;
      if (!cb) return [];
      const by = cb.winner !== null && cb.winner >= 0 && cb.winner !== e.player ? cb.winner : cb.attacker;
      return occ('destroy', 'troop', by, e.player);
    }
    case 'villageAttacked':
      return e.by.flatMap((b) => occ('attack', 'village', b, e.player));
    case 'structureDestroyed':
    case 'structureDowngraded':
      return occ('destroy', 'structure', c.actor, e.player);
    case 'permanentRemoved':
      return e.cause === 'destroyed' ? occ('destroy', 'permanent', c.actor, e.player) : [];
    case 'permanentStolen':
      return occ('steal', 'permanent', e.to, e.from);
    case 'resourcesLost':
      return e.card === undefined ? [] : occ('steal', 'resource', c.actor, e.player);
    case 'intel':
      return e.report.kind === 'structures' ? occ('observe', 'territory', e.player, e.report.target) : [];
    case 'subsoilSurveyed': {
      const owner = hexOwner(state, e.hex);
      return [...occ('observe', 'subsoil', e.player, owner), ...occ('observe', 'territory', e.player, owner)];
    }
    case 'produced':
      if (e.uid !== -1) return [];
      return [
        ...occ('collect', 'resource', e.player, hexOwner(state, e.hex)),
        ...occ('collect', 'territory', e.player, hexOwner(state, e.hex)),
      ];
    default:
      return [];
  }
}

/** Sorteia `n` cartas da mão (ou menos, se não tiver). */
function takeRandomCards(state: GameState, player: PlayerId, n: number): number[] {
  const hand = getPlayer(state, player).hand;
  const out: number[] = [];
  for (let i = 0; i < n && hand.length > 0; i++) {
    const at = withRng(state, (rng) => rng.int(0, hand.length - 1));
    out.push(...hand.splice(at, 1));
  }
  return out;
}

/** Quem cumpre a consequência (BD). */
function obligorOf(t: Treaty, c: ContractTerms, o: Occurrence | null): PlayerId | null {
  const role = (r: string): PlayerId | null =>
    r === 'me' ? t.parties[0] : r === 'you' ? t.parties[1] : null;
  switch (c.obligor) {
    case 'me':
    case 'you':
      return role(c.obligor);
    case 'actor':
      return o ? o.actor : role(c.subject);
    case 'otherSignatory': {
      let victim = o ? o.victim : role(c.of);
      // "SE NÃO" com vítima = o outro signatário: o outro em relação ao sujeito.
      if (!o && c.of === 'otherSignatory') {
        const s = role(c.subject);
        victim = s === null ? null : partnerOf(t, s);
      }
      return victim !== null && isParty(t, victim) ? partnerOf(t, victim) : null;
    }
  }
}

/** Dispara a consequência do contrato e o encerra. */
function fireContract(
  ctx: EngineContext,
  state: GameState,
  t: Treaty,
  o: Occurrence | null,
  events: GameEvent[],
): void {
  if (t.terms.kind !== 'contract') return;
  const c = t.terms;
  removeTreaty(state, t.id);
  const obligor = obligorOf(t, c, o);
  if (obligor === null) return;
  const beneficiary = partnerOf(t, obligor);
  const ob = getPlayer(state, obligor);
  const bp = getPlayer(state, beneficiary);
  let defaulted = false;
  let resources: Partial<Record<ResourceId, number>> | undefined;
  let cards: number | undefined;
  const amount = c.amount ?? 1;
  switch (c.consequence) {
    case 'pay':
      if (c.target === 'resource' && c.resource) {
        const due = amount * (c.perTroop ? Math.max(1, o?.troops ?? 1) : 1);
        const paid = Math.min(due, ob.resources[c.resource]);
        ob.resources[c.resource] -= paid;
        bp.resources[c.resource] += paid;
        resources = { [c.resource]: paid };
        defaulted = paid < due;
      } else {
        const moved = takeRandomCards(state, obligor, amount);
        bp.hand.push(...moved);
        cards = moved.length;
        defaulted = moved.length < amount;
      }
      break;
    case 'give':
      if (c.target === 'permanent' && c.permanent !== undefined) {
        const slot = ob.permanents.indexOf(c.permanent);
        if (slot < 0) defaulted = true;
        else {
          ob.permanents[slot] = null;
          if (freeSlot(state, beneficiary) >= 0) placePermanent(state, beneficiary, c.permanent, events);
          else bp.hand.push(c.permanent);
          cards = 1;
        }
      } else {
        const moved = takeRandomCards(state, obligor, 1);
        bp.hand.push(...moved);
        cards = moved.length;
        defaulted = moved.length < 1;
      }
      break;
    case 'discard': {
      const hand = ob.hand;
      const n = Math.min(amount, hand.length);
      const picks: number[] = [];
      for (let i = 0; i < n; i++) {
        const rest = hand.filter((x) => !picks.includes(x));
        picks.push(rest[withRng(state, (rng) => rng.int(0, rest.length - 1))] as number);
      }
      discardFromHand(ctx, state, obligor, picks, 'treaty', events);
      cards = n;
      defaulted = n < amount;
      break;
    }
    case 'loseAction':
      loseActions(state, obligor, amount, events);
      break;
    case 'forbid':
      state.treaties.restrictions.push({
        treaty: t.id,
        player: obligor,
        against: beneficiary,
        verb: c.target,
        until: state.round + (c.rounds ?? 1) - 1,
      });
      break;
  }
  events.push({
    type: 'treatyTriggered',
    treaty: t.id,
    obligor,
    beneficiary,
    consequence: c.consequence,
    ...(resources ? { resources } : {}),
    ...(cards !== undefined ? { cards } : {}),
    defaulted,
  });
  if (defaulted) loseActions(state, obligor, ctx.balance.treaties.defaultPenalty.loseActions, events);
}

/** O contrato reage à ocorrência? */
function matches(t: Treaty, o: Occurrence): boolean {
  if (t.terms.kind !== 'contract' || t.terms.consequence === 'overrideToll') return false;
  const c = t.terms;
  return (
    c.verb === o.verb &&
    c.object === o.object &&
    subjectMatches(t, c.subject, o.actor) &&
    victimMatches(t, c.of, o.actor, o.victim)
  );
}

/**
 * Lê os eventos ainda não lidos da ação e dispara os contratos (BE). `actor` = quem fez a
 * ação (null para fases automáticas).
 */
export function observeTreaties(
  ctx: EngineContext,
  state: GameState,
  events: GameEvent[],
  actor: PlayerId | null,
): void {
  if (!state.layers.treaties) return;
  let c = cursors.get(events);
  if (!c) {
    c = { index: 0, actor, combat: null };
    cursors.set(events, c);
  }
  for (; c.index < events.length; c.index++) {
    const e = events[c.index];
    if (!e || state.treaties.active.length === 0) {
      if (e) occurrencesOf(state, e, c);
      continue;
    }
    for (const o of occurrencesOf(state, e, c)) {
      for (const t of [...state.treaties.active]) {
        if (!state.treaties.active.includes(t) || !matches(t, o)) continue;
        if (t.terms.kind === 'contract' && t.terms.negated) {
          removeTreaty(state, t.id);
          events.push({ type: 'treatyFulfilled', treaty: t.id });
        } else fireContract(ctx, state, t, o, events);
      }
    }
  }
}

/** GDD 6.1 FIM: "SE NÃO" vencido dispara; contratos e pactos vencidos expiram. */
export function endRoundTreaties(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  if (!state.layers.treaties) return;
  observeTreaties(ctx, state, events, null);
  for (const t of [...state.treaties.active]) {
    if (t.until > state.round) continue;
    if (t.terms.kind === 'contract' && t.terms.negated) fireContract(ctx, state, t, null, events);
    else {
      removeTreaty(state, t.id);
      events.push({ type: 'treatyExpired', treaty: t.id });
    }
  }
  state.treaties.restrictions = state.treaties.restrictions.filter((r) => r.until > state.round);
}

// ── Pactos de comércio (BF) ──────────────────────────────────────────────────

/** Quanto o outro signatário entrega pelo que o jogador cede (null = troca não permitida). */
export function commerceQuote(
  ctx: EngineContext,
  t: Treaty,
  give: ResourceId,
  amount: number,
  receive: ResourceId,
): number | null {
  if (t.terms.kind !== 'pact' || give === receive) return null;
  if (t.terms.pact === 'pact_no_spread') {
    return Math.floor((amount * ctx.resourceValue(give)) / ctx.resourceValue(receive));
  }
  if (t.terms.pact === 'pact_fixed_price' && t.terms.resource && t.terms.price) {
    if (give === t.terms.resource && receive === 'gold') return amount * t.terms.price;
    if (give === 'gold' && receive === t.terms.resource) return Math.floor(amount / t.terms.price);
  }
  return null;
}

export const isCommercePact = (t: Treaty): boolean =>
  t.terms.kind === 'pact' && (t.terms.pact === 'pact_no_spread' || t.terms.pact === 'pact_fixed_price');

export function checkUseTreaty(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'useTreaty'>,
): Reason | null {
  const o = off(state);
  if (o) return o;
  const t = state.treaties.active.find((x) => x.id === a.treaty);
  if (!t) return { key: 'treatyNotFound' };
  if (!isParty(t, a.player)) return { key: 'notTreatyParty' };
  if (!isCommercePact(t)) return { key: 'notCommercePact' };
  const idx = t.parties[0] === a.player ? 0 : 1;
  if (t.used?.[idx] === state.round) return { key: 'treatyUsed' };
  if (!RESOURCE_IDS.includes(a.give) || !RESOURCE_IDS.includes(a.receive)) return { key: 'invalidAmounts' };
  if (!posInt(a.amount)) return { key: 'invalidAmounts' };
  if (getPlayer(state, a.player).resources[a.give] < a.amount) return { key: 'cannotAfford' };
  const got = commerceQuote(ctx, t, a.give, a.amount, a.receive);
  if (got === null) return { key: 'invalidOption' };
  if (got < 1) return { key: 'bankCreditTooLow' };
  const partner = partnerOf(t, a.player);
  return getPlayer(state, partner).resources[a.receive] >= got ? null : { key: 'proposerCannotAfford' };
}

export function applyUseTreaty(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'useTreaty'>,
  events: GameEvent[],
): void {
  const t = state.treaties.active.find((x) => x.id === a.treaty);
  if (!t) return;
  const got = commerceQuote(ctx, t, a.give, a.amount, a.receive) ?? 0;
  const partner = partnerOf(t, a.player);
  const me = getPlayer(state, a.player).resources;
  const them = getPlayer(state, partner).resources;
  me[a.give] -= a.amount;
  them[a.give] += a.amount;
  them[a.receive] -= got;
  me[a.receive] += got;
  const used: [number, number] = t.used ? [...t.used] : [0, 0];
  used[t.parties[0] === a.player ? 0 : 1] = state.round;
  t.used = used;
  events.push({
    type: 'treatyTrade',
    treaty: t.id,
    from: a.player,
    to: partner,
    give: { [a.give]: a.amount },
    receive: { [a.receive]: got },
  });
}
