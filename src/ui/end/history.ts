/**
 * Histórico da partida para a tela de fim (UX_SPEC 2.16): refaz a partida pelo log (o motor é
 * determinístico) e anota, por rodada, recursos, força militar e cartas jogadas de cada
 * jogador, além da linha do tempo de eventos marcantes. Puro (sem React).
 */
import type { Action, EngineContext, GameEvent, GameOptions, GameState, PlayerId } from '../../engine';
import { applyAction, createGame } from '../../engine';
import { troopsOf, troopStrength } from '../../engine/rules/troops';
import { progress } from '../../engine/rules/victory';
import { RESOURCE_IDS } from '../../data/schemas';

export interface PlayerPoint {
  /** Estoque em pontos de valor (resources.json → value). */
  readonly stock: number;
  readonly military: number;
  /** Cartas jogadas, instaladas ou entregues até aqui. */
  readonly cards: number;
  readonly progress: number;
}

export interface RoundPoint {
  readonly round: number;
  readonly players: readonly PlayerPoint[];
}

export interface TimelineItem {
  readonly round: number;
  readonly event: GameEvent;
}

export interface GameHistory {
  readonly rounds: readonly RoundPoint[];
  readonly timeline: readonly TimelineItem[];
}

/** Eventos que entram na linha do tempo. */
export function isMilestone(e: GameEvent): boolean {
  switch (e.type) {
    case 'eventRevealed':
    case 'combatResolved':
    case 'playerEliminated':
    case 'villageAttacked':
    case 'treatySigned':
    case 'treatyTriggered':
    case 'pactBroken':
    case 'guardianSpawned':
    case 'disaster':
    case 'excavated':
    case 'gameOver':
      return true;
    case 'structureUpgraded':
      return e.level >= 3;
    default:
      return false;
  }
}

function snapshot(ctx: EngineContext, s: GameState, cards: readonly number[]): RoundPoint {
  return {
    round: s.round,
    players: s.players.map((p, i) => ({
      stock: RESOURCE_IDS.reduce((sum, r) => sum + p.resources[r] * ctx.resourceValue(r), 0),
      military: troopsOf(s, p.id).reduce((sum, x) => sum + troopStrength(ctx, s, x.troop), 0),
      cards: cards[i] ?? 0,
      progress: progress(ctx, s, p.id).total,
    })),
  };
}

const cardActor = (e: GameEvent): PlayerId | null =>
  e.type === 'cardPlayed' || e.type === 'permanentInstalled'
    ? e.player
    : e.type === 'cardDelivered'
      ? e.from
      : null;

export function gameHistory(ctx: EngineContext, options: GameOptions, log: readonly Action[]): GameHistory {
  let s = createGame(ctx, options);
  const cards = s.players.map(() => 0);
  const rounds: RoundPoint[] = [];
  const timeline: TimelineItem[] = [];
  for (const action of log) {
    const round = s.round;
    const r = applyAction(ctx, s, action);
    for (const e of r.events) {
      const who = cardActor(e);
      if (who !== null) cards[who] = (cards[who] ?? 0) + 1;
      if (isMilestone(e)) timeline.push({ round: e.type === 'eventRevealed' ? e.round : round, event: e });
    }
    // Fim de rodada: anota o estado com que a rodada terminou.
    if (r.events.some((e) => e.type === 'roundEnded'))
      rounds.push({ ...snapshot(ctx, r.state, cards), round });
    s = r.state;
  }
  if (s.stage === 'over' && rounds.at(-1)?.round !== s.round) rounds.push(snapshot(ctx, s, cards));
  return { rounds, timeline };
}

/** Arquivo exportado (UX_SPEC 2.16 Exportar): o suficiente para refazer a partida. */
export function exportGame(state: GameState, options: GameOptions): string {
  return JSON.stringify(
    {
      format: 'projeto-3077/log',
      rulesVersion: state.rulesVersion,
      seed: state.seed,
      options,
      winners: state.winners,
      endReason: state.endReason,
      rounds: state.round,
      log: state.log,
    },
    null,
    2,
  );
}
