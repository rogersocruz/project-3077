/**
 * Uso de uma carta da mão pela interface (UX_SPEC 2.5, 2.8): o que ela pede (alvo,
 * pagamento alternativo, descarte, destinatário, permanente a trocar) e a ação final.
 * Puro: toda regra vem do motor (cardTargets, checkAction).
 */
import {
  type Action,
  type CardTarget,
  type CardUid,
  type CardUse,
  cardDefOf,
  cardResourceCost,
  cardTargets,
  checkAction,
  type CheckResult,
  type EngineContext,
  effectOf,
  type GameState,
  type HexKey,
  type PlayerId,
  type TargetKind,
} from '../../engine';
import { canAfford, findStructure } from '../../engine/queries';

/** play = carta própria; install = permanente; deliver = entrega; modifier = Drone/Contrato. */
export type FlowMode = 'play' | 'install' | 'deliver' | 'modifier';

export interface CardFlow {
  readonly card: CardUid;
  readonly mode: FlowMode;
  readonly to?: PlayerId;
  readonly target?: CardTarget;
  readonly payment?: number;
  readonly discard: readonly CardUid[];
  readonly sacrifice?: CardUid;
  readonly replace?: CardUid;
}

/** Como a carta é usada agora (null = não nesta fase). */
export function flowModeOf(ctx: EngineContext, state: GameState, card: CardUid): FlowMode | null {
  const def = cardDefOf(ctx, state, card);
  const handler = effectOf(def);
  if (state.phase === 'actions') {
    if (def.timing === 'own') return handler.modifier ? 'modifier' : 'play';
    if (def.timing === 'install') return 'install';
    return null;
  }
  if (state.phase === 'delivery' && def.timing === 'delivered') return 'deliver';
  return null;
}

export function startFlow(ctx: EngineContext, state: GameState, card: CardUid): CardFlow | null {
  const mode = flowModeOf(ctx, state, card);
  if (!mode) return null;
  const def = cardDefOf(ctx, state, card);
  return { card, mode, discard: [], ...(def.cost.resourcesAny ? { payment: 0 } : {}) };
}

export interface FlowNeeds {
  readonly target: TargetKind;
  /** Alternativas de pagamento (0 = custo fixo). */
  readonly payments: number;
  readonly discard: number;
  readonly recipient: boolean;
  /** Espionagem sem slot livre: escolher o permanente próprio que sai. */
  readonly sacrifice: boolean;
  /** Instalar com os slots cheios: escolher o permanente que sai. */
  readonly replace: boolean;
}

export function flowNeeds(ctx: EngineContext, state: GameState, player: PlayerId, flow: CardFlow): FlowNeeds {
  const def = cardDefOf(ctx, state, flow.card);
  const handler = effectOf(def);
  const full = (state.players[player]?.permanents ?? []).every((c) => c !== null);
  return {
    target: flow.mode === 'play' || flow.mode === 'deliver' ? handler.target : 'none',
    payments: def.cost.resourcesAny?.length ?? 0,
    discard: def.cost.discard ?? 0,
    recipient: flow.mode === 'deliver',
    sacrifice: flow.mode === 'deliver' && def.effectId === 'stealPermanent' && full,
    replace: flow.mode === 'install' && full,
  };
}

/** Alvos válidos para a carta (com o destinatário escolhido, na entrega). */
export function flowTargets(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  flow: CardFlow,
): CardTarget[] {
  const needs = flowNeeds(ctx, state, player, flow);
  if (needs.target === 'none') return [];
  if (needs.recipient && flow.to === undefined) return [];
  return cardTargets(ctx, state, player, flow.card, flow.to ?? null, flow.sacrifice);
}

/** Hexes a destacar no mapa para alvos de hex ou estrutura. */
export function targetHexes(state: GameState, targets: readonly CardTarget[]): HexKey[] {
  const out = new Set<HexKey>();
  for (const t of targets) {
    if (t.kind === 'hex') out.add(t.hex);
    else if (t.kind === 'structure') {
      const where = findStructure(state, t.uid);
      if (where) out.add(where.key);
    }
  }
  return [...out];
}

/** Alvos válidos dentro de um hex clicado (estruturas do hex, ou o próprio hex). */
export function targetsAt(state: GameState, targets: readonly CardTarget[], hex: HexKey): CardTarget[] {
  return targets.filter((t) =>
    t.kind === 'hex'
      ? t.hex === hex
      : t.kind === 'structure'
        ? findStructure(state, t.uid)?.key === hex
        : false,
  );
}

/** A carta modificadora como `CardUse` (Drone/Contrato), para armar Sondar/Construir. */
export function flowUse(flow: CardFlow): CardUse {
  return {
    card: flow.card,
    ...(flow.payment === undefined ? {} : { payment: flow.payment }),
    ...(flow.discard.length ? { discard: flow.discard } : {}),
  };
}

/** A ação final da carta (modificador não tem: vai junto com Sondar/Construir). */
export function flowAction(flow: CardFlow, player: PlayerId): Action | null {
  const common = {
    player,
    card: flow.card,
    ...(flow.payment === undefined ? {} : { payment: flow.payment }),
    ...(flow.discard.length ? { discard: flow.discard } : {}),
  };
  switch (flow.mode) {
    case 'play':
      return { type: 'playCard', ...common, ...(flow.target ? { target: flow.target } : {}) };
    case 'install':
      return {
        type: 'installPermanent',
        ...common,
        ...(flow.replace === undefined ? {} : { replace: flow.replace }),
      };
    case 'deliver':
      if (flow.to === undefined) return null;
      return {
        type: 'deliverCard',
        ...common,
        to: flow.to,
        ...(flow.target ? { target: flow.target } : {}),
        ...(flow.sacrifice === undefined ? {} : { sacrifice: flow.sacrifice }),
      };
    case 'modifier':
      return null;
  }
}

/** Motivo de recusa da ação final (ou ok). Modificador: só o pagamento. */
export function flowCheck(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  flow: CardFlow,
): CheckResult {
  const action = flowAction(flow, player);
  if (action) return checkAction(ctx, state, action);
  const def = cardDefOf(ctx, state, flow.card);
  const cost = cardResourceCost(ctx, state, player, def, flow.payment);
  if (!cost) return { ok: false, reason: { key: 'invalidPayment' } };
  if (flow.discard.length !== (def.cost.discard ?? 0)) {
    return { ok: false, reason: { key: 'invalidDiscard', params: { n: def.cost.discard ?? 0 } } };
  }
  const have = state.players[player]?.resources;
  return have && canAfford(have, cost) ? { ok: true } : { ok: false, reason: { key: 'cannotAfford' } };
}

/**
 * Carta "bloqueada" na mão (ART_DIRECTION 4): nenhuma alternativa de pagamento cabe no
 * estoque ou faltam cartas para o descarte.
 */
export function isBlocked(ctx: EngineContext, state: GameState, player: PlayerId, card: CardUid): boolean {
  const def = cardDefOf(ctx, state, card);
  const p = state.players[player];
  if (!p) return true;
  if ((def.cost.discard ?? 0) > p.hand.length - 1) return true;
  const options = def.cost.resourcesAny ? def.cost.resourcesAny.map((_, i) => i) : [undefined];
  return !options.some((payment) => {
    const cost = cardResourceCost(ctx, state, player, def, payment);
    return !!cost && canAfford(p.resources, cost);
  });
}
