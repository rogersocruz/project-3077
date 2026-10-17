/**
 * Vitória (GDD 13.1) nas trilhas da Camada 0: acúmulo de recurso e expansão.
 * Alvo de tribo e eliminação entram com o conflito (Fase 7/9).
 */
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import type { EngineContext } from '../context';
import { getPlayer, ownedStructures } from '../queries';
import type { GameState, PlayerId } from '../state';

export type TrackId = ResourceId | 'expansion';

export interface Progress {
  /** Fração de cada trilha, com teto 1 (interpretação L da Fase 1). */
  readonly tracks: Record<TrackId, number>;
  readonly total: number;
  readonly met: TrackId[];
}

/** GDD 13.1 Expansão: hexes distintos com estrutura do jogador (inclui a Vila). */
export function expansionCount(state: GameState, player: PlayerId): number {
  return new Set(ownedStructures(state, player).map((p) => p.key)).size;
}

export function progress(ctx: EngineContext, state: GameState, player: PlayerId): Progress {
  const v = ctx.balance.victory;
  const res = getPlayer(state, player).resources;
  const raw = {} as Record<TrackId, number>;
  for (const id of RESOURCE_IDS) raw[id] = res[id] / v.resourceThresholds[id];
  raw.expansion = expansionCount(state, player) / v.expansionHexes;

  const tracks = {} as Record<TrackId, number>;
  const met: TrackId[] = [];
  let total = 0;
  for (const [id, value] of Object.entries(raw) as [TrackId, number][]) {
    tracks[id] = Math.min(1, value);
    total += tracks[id];
    if (value >= 1) met.push(id);
  }
  return { tracks, total, met };
}

/** Escolhe vencedores entre candidatos: maior progresso somado; empate final por victory.finalTie. */
function pickByProgress(ctx: EngineContext, state: GameState, candidates: PlayerId[]): PlayerId[] {
  const EPS = 1e-9;
  const scored = candidates.map((p) => ({ p, total: progress(ctx, state, p).total }));
  const best = Math.max(...scored.map((s) => s.total));
  const top = scored.filter((s) => best - s.total < EPS).map((s) => s.p);
  if (top.length > 1 && ctx.balance.victory.finalTie === 'seatOrder') return [Math.min(...top)];
  return top;
}

export interface RoundEndVerdict {
  readonly winners: PlayerId[];
  readonly reason: 'condition' | 'roundLimit';
}

/**
 * GDD 13.1: verificado só no fim da rodada. Quem atingiu condição vence; mais de um,
 * desempate por progresso somado. No limite de rodadas sem condição, vence o maior
 * progresso. Devolve null se a partida continua.
 */
export function checkRoundEnd(ctx: EngineContext, state: GameState): RoundEndVerdict | null {
  // GDD 13.2: eliminado não vence (D11).
  const all = state.players.filter((p) => !p.eliminated).map((p) => p.id);
  if (all.length === 1) return { winners: all, reason: 'condition' };
  const achievers = all.filter((p) => progress(ctx, state, p).met.length > 0);
  if (achievers.length > 0) return { winners: pickByProgress(ctx, state, achievers), reason: 'condition' };
  if (state.round >= ctx.balance.turn.roundLimit) {
    return { winners: pickByProgress(ctx, state, all), reason: 'roundLimit' };
  }
  return null;
}
