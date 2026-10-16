/**
 * Permanentes (GDD 7.4): 5 slots fixos e públicos por jogador, disputados por
 * Tecnologias e Relíquias. Removido = sai do jogo. Os efeitos passivos são lidos pelas
 * regras por `effectId` (Rede de Sensores no alcance, Silos na Produção…).
 */
import type { CardDef, EngineContext } from '../context';
import type { GameEvent, PermanentRemoval } from '../events';
import { getPlayer, hexKeyOf } from '../queries';
import type { CardUid, GameState, PlayerId } from '../state';

export interface InstalledCard {
  readonly card: CardUid;
  readonly def: CardDef;
  readonly slot: number;
}

export function cardDefOf(ctx: EngineContext, state: GameState, card: CardUid): CardDef {
  const id = state.cards.defs[card];
  if (id === undefined) throw new RangeError(`carta inexistente: ${card}`);
  return ctx.card(id);
}

export function installedCards(ctx: EngineContext, state: GameState, player: PlayerId): InstalledCard[] {
  const out: InstalledCard[] = [];
  getPlayer(state, player).permanents.forEach((card, slot) => {
    if (card !== null) out.push({ card, def: cardDefOf(ctx, state, card), slot });
  });
  return out;
}

/** Definições dos permanentes instalados com este efeito (cada cópia conta). */
export function permanentsWith(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  effectId: string,
): CardDef[] {
  return installedCards(ctx, state, player)
    .filter((c) => c.def.effectId === effectId)
    .map((c) => c.def);
}

export function hasPermanent(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  effectId: string,
): boolean {
  return permanentsWith(ctx, state, player, effectId).length > 0;
}

/** Parâmetro numérico de uma carta (o esquema do efeito já o validou na carga). */
export function numParam(def: CardDef, key: string): number {
  const v = def.params[key];
  if (typeof v !== 'number') throw new TypeError(`${def.id}.params.${key} não é número`);
  return v;
}

export function sumParam(defs: readonly CardDef[], key: string): number {
  return defs.reduce((sum, d) => sum + numParam(d, key), 0);
}

export function slotOf(state: GameState, player: PlayerId, card: CardUid): number {
  return getPlayer(state, player).permanents.indexOf(card);
}

export function freeSlot(state: GameState, player: PlayerId): number {
  return getPlayer(state, player).permanents.indexOf(null);
}

/** Mutável: põe a carta no slot indicado (ou no primeiro livre). */
export function placePermanent(
  state: GameState,
  player: PlayerId,
  card: CardUid,
  events: GameEvent[],
  slot = freeSlot(state, player),
): void {
  const p = getPlayer(state, player);
  if (slot < 0 || slot >= p.permanents.length || p.permanents[slot] !== null) {
    throw new RangeError(`slot ${slot} indisponível para o jogador ${player}`);
  }
  p.permanents[slot] = card;
  events.push({ type: 'permanentInstalled', player, card, slot });
}

/** Mutável: tira do slot. Fora `stolen`, a carta sai do jogo (GDD 7.4). Devolve o slot. */
export function removePermanent(
  state: GameState,
  player: PlayerId,
  card: CardUid,
  cause: PermanentRemoval,
  events: GameEvent[],
): number {
  const p = getPlayer(state, player);
  const slot = p.permanents.indexOf(card);
  if (slot < 0) throw new RangeError(`carta ${card} não está instalada pelo jogador ${player}`);
  p.permanents[slot] = null;
  if (cause !== 'stolen') state.cards.removed.push(card);
  events.push({ type: 'permanentRemoved', player, card, slot, cause });
  return slot;
}

/**
 * Mapa Estelar: o subsolo dos hexes vizinhos das estruturas do jogador fica conhecido
 * por ele. Chamado ao instalar e a cada construção.
 */
export function autoSurveyAdjacent(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  events: GameEvent[],
): void {
  if (!hasPermanent(ctx, state, player, 'autoSurveyAdjacent')) return;
  const keys = new Set<string>();
  for (const hex of Object.values(state.hexes)) {
    if (!hex.structures.some((s) => s.owner === player)) continue;
    for (const n of ctx.planet.neighbors(hex)) keys.add(hexKeyOf(n));
  }
  for (const key of [...keys].sort()) {
    const hex = state.hexes[key];
    if (!hex || hex.surveyedBy.includes(player)) continue;
    hex.surveyedBy.push(player);
    events.push({ type: 'subsoilSurveyed', hex: key, player, subsoil: hex.subsoil });
  }
}
