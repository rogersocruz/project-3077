/**
 * Alcance e alvos de cartas (interpretação T). RAIO N = área a ≤ N de uma origem do
 * jogador (Vila ou Posto), atravessando fronteira se `cards.radiusCrossesBorder`.
 * DRONE em carta entregue = alvo no tabuleiro do destinatário; GLOBAL = qualquer alvo
 * do destinatário.
 */
import { findStructure, getPlayer, hexKeyOf, ownedStructures } from '../queries';
import type { Reason } from '../reasons';
import { rangeSources } from '../rules/build';
import type { GameState, HexKey, HexState, PlayerId } from '../state';
import { type EffectScope, subjectOf } from './types';
import type { EngineContext } from '../context';

export const boardOf = (state: GameState, player: PlayerId): number => getPlayer(state, player).boardId;

export function boardHexKeys(ctx: EngineContext, boardId: number): HexKey[] {
  return ctx.planet.hexes.filter((h) => h.boardId === boardId).map(hexKeyOf);
}

/** Hexes do tabuleiro de quem sofre o efeito (próprio ou do destinatário). */
export function subjectBoardHexes(s: EffectScope): HexKey[] {
  return boardHexKeys(s.ctx, boardOf(s.state, subjectOf(s)));
}

/** Origens de alcance do jogador (Centro da Vila e Postos). */
export function rangeOrigins(ctx: EngineContext, state: GameState, player: PlayerId): HexKey[] {
  return rangeSources(ctx, state, player).map((src) => hexKeyOf(src.hex));
}

export function checkOrigin(s: EffectScope, hex: HexKey): Reason | null {
  return rangeOrigins(s.ctx, s.state, s.player).includes(hex) ? null : { key: 'notRangeOrigin' };
}

/** Área de RAIO N a partir da origem. */
export function radiusArea(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  origin: HexState,
  radius: number,
): HexKey[] {
  const cross = ctx.balance.cards.radiusCrossesBorder;
  const board = boardOf(state, player);
  return ctx.planet.hexes
    .filter((h) => (cross || h.boardId === board) && ctx.planet.distance(origin, h) <= radius)
    .map(hexKeyOf);
}

/** Hex alvo de carta entregue com alcance DRONE: tem de ficar no tabuleiro do destinatário. */
export function checkSubjectHex(s: EffectScope, key: HexKey): Reason | null {
  const hex = s.state.hexes[key];
  if (!hex) return { key: 'noSuchHex' };
  if (s.def.range !== 'global' && hex.boardId !== boardOf(s.state, subjectOf(s))) {
    return { key: s.recipient === null ? 'notOwnBoard' : 'notTargetBoard' };
  }
  return null;
}

/** Estrutura de quem sofre o efeito, dentro do alcance da carta. */
export function checkSubjectStructure(s: EffectScope, uid: number): Reason | null {
  const where = findStructure(s.state, uid);
  if (!where) return { key: 'invalidTarget' };
  const subject = subjectOf(s);
  if (where.structure.owner !== subject) {
    return { key: s.recipient === null ? 'notYourStructure' : 'invalidTarget' };
  }
  return checkSubjectHex(s, where.key);
}

export function subjectStructureTargets(s: EffectScope): { kind: 'structure'; uid: number }[] {
  return ownedStructures(s.state, subjectOf(s)).map(({ structure }) => ({
    kind: 'structure' as const,
    uid: structure.uid,
  }));
}

export function otherPlayers(state: GameState, player: PlayerId): PlayerId[] {
  return state.players.filter((p) => p.id !== player).map((p) => p.id);
}
