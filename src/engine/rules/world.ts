/**
 * Eventos globais (GDD 9), sítios e Tesouro (GDD 4.3): baralho de eventos, revelação no
 * início da rodada, gatilho dos hazards, fim de rodada, Escavar, contra-ação e limpeza.
 *
 * Interpretações (Fase 6, isoladas aqui):
 * AJ) baralho ativo = cópias embaralhadas com no máximo `maxPerCategoryInActiveDeck` por
 *     categoria, até `activeDeckSize`; acabou, os já revelados voltam embaralhados;
 * AK) Horda e Guardião sem combate (até a Fase 7): ver effects/world.ts;
 * AN) Ruína: escavada uma vez; o bônus passivo é de quem escavou (não acumula);
 * AO) cartas de Tesouro "instant" vão para a mão e se jogam como carta própria; o
 *     Guardião Desperto resolve na hora, no hex escavado;
 * AP) gatilho: todo hazard cuja categoria é a do evento sofre o próprio dano (idempotente).
 */
import type { Action } from '../actions';
import type { EngineContext } from '../context';
import { effectOf } from '../effects/registry';
import { type WorldScope, worldEffect } from '../effects/world';
import type { GameEvent } from '../events';
import { canAfford, getPlayer, pay } from '../queries';
import type { Reason } from '../reasons';
import type { CardUid, GameState, HexKey, PlayerId, WithheldProduction } from '../state';
import { inRange } from './build';
import { withRng } from './decks';
import { hazardAt, hasStructureOn } from './hazards';
import { cardDefOf } from './permanents';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;
type EventDef = EngineContext['data']['events'][number];

const eventDef = (ctx: EngineContext, id: string): EventDef => {
  const e = ctx.data.events.find((x) => x.id === id);
  if (!e) throw new Error(`evento desconhecido: ${id}`);
  return e;
};

/** O evento entra no baralho: efeito implementado e camadas exigidas ligadas. */
export function eventEnabled(ctx: EngineContext, state: Pick<GameState, 'layers'>, id: string): boolean {
  const w = worldEffect(eventDef(ctx, id).effectId);
  return w.implemented && [w.layer, ...w.requires].every((l) => state.layers[l]);
}

/** AJ: baralho ativo da partida (só com a camada de eventos). Usa o RNG do setup. */
export function buildEventDeck(
  ctx: EngineContext,
  state: Pick<GameState, 'layers'>,
  shuffle: <T>(items: readonly T[]) => T[],
): string[] {
  if (!state.layers.events) return [];
  const { maxPerCategoryInActiveDeck: max, activeDeckSize: size } = ctx.balance.events;
  const copies = ctx.data.events
    .filter((e) => eventEnabled(ctx, state, e.id))
    .flatMap((e) => Array.from({ length: e.copies }, () => e.id));
  const perCategory = new Map<string, number>();
  const deck: string[] = [];
  for (const id of shuffle(copies)) {
    if (deck.length >= size) break;
    const cat = eventDef(ctx, id).category;
    if ((perCategory.get(cat) ?? 0) >= max) continue;
    perCategory.set(cat, (perCategory.get(cat) ?? 0) + 1);
    deck.push(id);
  }
  return deck;
}

/** Evento desta rodada (definição), ou null. */
export function currentEvent(ctx: EngineContext, state: GameState): EventDef | null {
  return state.world.current ? eventDef(ctx, state.world.current) : null;
}

/** Parâmetros do evento da rodada se o efeito for `effectId` (passivos lidos pelas regras). */
export function eventParams<T = Record<string, unknown>>(
  ctx: EngineContext,
  state: GameState,
  effectId: string,
): T | null {
  const e = currentEvent(ctx, state);
  return e && e.effectId === effectId ? ((e.params ?? {}) as T) : null;
}

/** O efeito com contra-ação vale para o jogador (não fez a contra-ação). */
export function eventHits(ctx: EngineContext, state: GameState, effectId: string, player: PlayerId): boolean {
  return eventParams(ctx, state, effectId) !== null && !state.world.braced.includes(player);
}

// ── Revelação e fim de rodada ────────────────────────────────────────────────

/** GDD 6.1 INÍCIO: revela o evento, dispara os hazards da categoria e aplica o efeito. */
export function revealEvent(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  const w = state.world;
  w.braced = [];
  w.firstSurveyDone = false;
  w.withheld = [];
  w.current = null;
  if (!state.layers.events) return;
  if (w.deck.length === 0 && w.used.length > 0) {
    w.deck = withRng(state, (rng) => rng.shuffle(w.used));
    w.used = [];
    events.push({ type: 'eventDeckReshuffled', size: w.deck.length });
  }
  const id = w.deck.shift();
  if (!id) return;
  w.used.push(id);
  w.current = id;
  const def = eventDef(ctx, id);
  events.push({ type: 'eventRevealed', round: state.round, event: id, category: def.category });
  const scope: WorldScope = { ctx, state, events };
  // AP: hazards da mesma categoria sofrem o próprio dano antes do efeito do evento.
  // Com balance.events.hazardTriggers (experimento): só os hazards nomeados para o evento.
  const named = ctx.balance.events.hazardTriggers;
  for (const [key, hex] of Object.entries(state.hexes)) {
    const hz = hazardAt(ctx, hex);
    if (!hz) continue;
    if (named ? !(named[id] ?? []).includes(hz.id) : hz.trigger !== def.category) continue;
    events.push({ type: 'hazardTriggered', hex: key, hazard: hz.id, effect: hz.damage.effectId });
    worldEffect(hz.damage.effectId).onDamage?.(scope, key, hz.damage.params);
  }
  worldEffect(def.effectId).onReveal?.(scope, def.params);
}

/** GDD 6.1 FIM: efeitos de fim de rodada do evento (Praga). */
export function endRoundEvent(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  const def = currentEvent(ctx, state);
  if (def) worldEffect(def.effectId).onRoundEnd?.({ ctx, state, events }, def.params);
}

// ── Contra-ação ──────────────────────────────────────────────────────────────

/** Ações da contra-ação do evento da rodada (0 = o evento não tem). */
export function braceActions(ctx: EngineContext, state: GameState): number {
  const def = currentEvent(ctx, state);
  return def ? (worldEffect(def.effectId).counterActions?.(def.params) ?? 0) : 0;
}

export function checkBrace(ctx: EngineContext, state: GameState, a: ActionOf<'brace'>): Reason | null {
  const n = braceActions(ctx, state);
  if (n === 0) return { key: 'noCounterAction' };
  if (state.world.braced.includes(a.player)) return { key: 'alreadyBraced' };
  return n > state.actionsLeft ? { key: 'noActionsLeft' } : null;
}

/**
 * Contra-ação (interpretação AQ): marca o jogador como imune pelo resto da rodada e
 * devolve o que o evento tirou na Produção deste turno — Minas paradas produzem agora
 * (pagando o Carvão de manutenção, se puder) e o corte nos Parques volta.
 */
export function applyBrace(
  state: GameState,
  a: ActionOf<'brace'>,
  events: GameEvent[],
  produceMine: (uid: number) => void,
): void {
  state.world.braced.push(a.player);
  events.push({ type: 'braced', player: a.player, event: state.world.current ?? '' });
  const w = state.world.withheld.find((x) => x.player === a.player);
  if (!w) return;
  state.world.withheld = state.world.withheld.filter((x) => x !== w);
  for (const uid of w.mines) produceMine(uid);
  const lost = Object.fromEntries(Object.entries(w.lost).filter(([, n]) => (n ?? 0) > 0));
  if (Object.keys(lost).length) {
    const res = getPlayer(state, a.player).resources;
    for (const [id, n] of Object.entries(lost)) res[id as keyof typeof res] += n ?? 0;
    events.push({ type: 'resourcesGained', player: a.player, resources: lost });
  }
}

/** Registra o que o evento com contra-ação tirou do jogador neste turno (AQ). */
export function withhold(state: GameState, player: PlayerId): WithheldProduction {
  let w = state.world.withheld.find((x) => x.player === player);
  if (!w) {
    w = { player, mines: [], lost: {} };
    state.world.withheld.push(w);
  }
  return w;
}

// ── Limpar contaminação (Pântano Ácido) ──────────────────────────────────────

/** Quem limpa: dono do tabuleiro ou quem tem estrutura no hex. */
export function checkCleanHex(state: GameState, a: ActionOf<'cleanHex'>): Reason | null {
  const hex = state.hexes[a.hex];
  if (!hex) return { key: 'noSuchHex' };
  const n = hex.status.contaminated ?? 0;
  if (n === 0) return { key: 'notContaminated' };
  if (hex.boardId !== getPlayer(state, a.player).boardId && !hasStructureOn(hex, a.player))
    return { key: 'notOwnBoard' };
  return n > state.actionsLeft ? { key: 'noActionsLeft' } : null;
}

export function applyCleanHex(state: GameState, a: ActionOf<'cleanHex'>, events: GameEvent[]): void {
  const hex = state.hexes[a.hex];
  if (!hex) return;
  delete hex.status.contaminated;
  events.push({ type: 'hexCleaned', hex: a.hex, player: a.player });
}

// ── Escavar e Tesouro ────────────────────────────────────────────────────────

const siteOf = (ctx: EngineContext, surface: string) => {
  const t = ctx.terrain(surface);
  return t.kind === 'site' ? t.def : null;
};

/** GDD 6.3 Escavar: Templo ou Ruína em alcance, 1 ação + custo do sítio. */
export function checkExcavate(ctx: EngineContext, state: GameState, a: ActionOf<'excavate'>): Reason | null {
  if (!state.layers.specialHexes || !state.layers.cards)
    return { key: 'layerDisabled', params: { layer: 'specialHexes' } };
  const hex = state.hexes[a.hex];
  if (!hex) return { key: 'noSuchHex' };
  const site = siteOf(ctx, hex.surface);
  if (!site || site.action !== 'excavate') return { key: 'notASite' };
  if (!hex.revealed) return { key: 'hexHidden' };
  if (hex.guardian !== null) return { key: 'guardianBlocks' };
  if (hex.excavatedBy !== null) return { key: 'alreadyExcavated' };
  if (!inRange(ctx, state, a.player, hex)) return { key: 'outOfRange' };
  if (state.actionsLeft < 1) return { key: 'noActionsLeft' };
  return canAfford(getPlayer(state, a.player).resources, site.excavateCost) ? null : { key: 'cannotAfford' };
}

export function applyExcavate(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'excavate'>,
  events: GameEvent[],
): void {
  const hex = state.hexes[a.hex];
  const site = hex ? siteOf(ctx, hex.surface) : null;
  if (!hex || !site) return;
  pay(getPlayer(state, a.player).resources, site.excavateCost);
  events.push({ type: 'resourcesSpent', player: a.player, resources: site.excavateCost });
  events.push({ type: 'excavated', player: a.player, hex: a.hex, site: site.id });
  if (site.afterExcavate === 'keep') hex.excavatedBy = a.player;
  else {
    hex.surface = site.afterExcavate;
    hex.excavatedBy = a.player;
  }
  drawTreasure(ctx, state, a.player, site.reward.treasureDraw, a.hex, events);
}

/** Compra do Tesouro; o Guardião Desperto resolve na hora no hex (AO). */
export function drawTreasure(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  count: number,
  hex: HexKey,
  events: GameEvent[],
): CardUid[] {
  const c = state.cards;
  const drawn: CardUid[] = [];
  for (let i = 0; i < count; i++) {
    if (c.treasure.length === 0 && c.treasureDiscard.length > 0) {
      c.treasure = withRng(state, (rng) => rng.shuffle(c.treasureDiscard));
      c.treasureDiscard = [];
    }
    const card = c.treasure.shift();
    if (card === undefined) break;
    const def = cardDefOf(ctx, state, card);
    events.push({ type: 'treasureDrawn', player, card });
    if (def.effectId === 'spawnGuardian') {
      effectOf(def).apply(
        { ctx, state, player, recipient: null, card, def, stage: 'play', events },
        { kind: 'hex', hex },
      );
      c.treasureDiscard.push(card);
      continue;
    }
    getPlayer(state, player).hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

/** AN: o jogador escavou alguma Ruína (bônus passivo de compra). */
export function hasRuinBonus(ctx: EngineContext, state: GameState, player: PlayerId): boolean {
  return Object.values(state.hexes).some(
    (h) => h.excavatedBy === player && !!siteOf(ctx, h.surface)?.passive,
  );
}
