/**
 * Uma partida IA × IA sem renderização, com o registro do que interessa ao balanceamento
 * (UX_SPEC 2.18). Puro: roda igual no Node (npm run sim) e no Web Worker do Laboratório.
 */
import { createAgent, chooseAction, type AiLevel, type AiWeights, DEFAULT_WEIGHTS } from '../ai';
import { AI_FOCI, type AiFocus } from '../ai/types';
import { Rng } from '../engine/rng';
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import type { EngineContext } from '../engine/context';
import { decider } from '../engine/legal';
import { applyAction } from '../engine/reducer';
import { progress, type TrackId } from '../engine/rules/victory';
import { createGame, type GameOptions } from '../engine/setup';
import type { GameState, Resources } from '../engine/state';

export interface PlayerRecord {
  readonly seat: number;
  readonly level: AiLevel;
  /** Rota perseguida pelo agente (null = equilibrado). */
  readonly focus: AiFocus | null;
  readonly won: boolean;
  /** Trilhas cumpridas no fim (vitória por condição). */
  readonly met: TrackId[];
  readonly progressTotal: number;
  readonly resources: Resources;
  readonly produced: Resources;
  readonly structures: Record<string, number>;
}

export interface GameRecord {
  readonly seed: number;
  readonly players: number;
  readonly rounds: number;
  readonly endReason: 'condition' | 'roundLimit';
  readonly winners: number[];
  /** Trilhas que deram a vitória (de todos os vencedores; vazio no limite de rodadas). */
  readonly winTracks: TrackId[];
  readonly steps: number;
  readonly ms: number;
  readonly seats: PlayerRecord[];
  /** Recursos que mudaram de mão: banca (dados + recebidos) e trocas entre jogadores. */
  readonly bankTraded: Resources;
  readonly playerTraded: Resources;
  readonly tradesAccepted: number;
  /** id da carta → vezes jogada / instalada / entregue. */
  readonly cardsPlayed: Record<string, number>;
  /** id da carta → vezes comprada (para a taxa de uso). */
  readonly cardsDrawn: Record<string, number>;
  /** Fase 6 (D15): hazards no planeta e quantas vezes cada um sofreu dano. */
  readonly hazardsPresent: string[];
  readonly hazardHits: Record<string, number>;
  readonly eventsRevealed: Record<string, number>;
  readonly disasters: number;
  readonly eliminations: number;
  readonly excavations: number;
}

export interface SimGameOptions {
  readonly seed: number;
  readonly levels: readonly AiLevel[];
  readonly layers?: GameOptions['layers'];
  readonly longMap?: boolean;
  readonly weights?: AiWeights;
  /** 'mixed': cada assento sorteia uma rota (explora todas); 'balanced': sem foco. */
  readonly style?: 'mixed' | 'balanced';
  /** Teto de decisões (segurança contra laço). */
  readonly maxSteps?: number;
}

const zero = (): Resources => ({ food: 0, stone: 0, iron: 0, coal: 0, oil: 0, gold: 0 });
const bump = (r: Record<string, number>, k: string, n = 1) => {
  r[k] = (r[k] ?? 0) + n;
};
const now = () => globalThis.performance.now();

export function playSimGame(ctx: EngineContext, opts: SimGameOptions): GameRecord {
  const started = now();
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const options: GameOptions = {
    seed: opts.seed,
    layers: opts.layers ?? { cards: true },
    longMap: opts.longMap ?? false,
  };
  const focusRng = Rng.fromSeed(`${opts.seed}:focus`);
  const agents = Array.from({ length: ctx.playerCount }, (_, i) =>
    createAgent(
      opts.levels[i % opts.levels.length] ?? 'normal',
      `${opts.seed}:ai:${i}`,
      weights,
      (opts.style ?? 'mixed') === 'mixed' ? focusRng.pick(AI_FOCI) : null,
    ),
  );
  const produced = agents.map(zero);
  const bankTraded = zero();
  const playerTraded = zero();
  const cardsPlayed: Record<string, number> = {};
  const cardsDrawn: Record<string, number> = {};
  let tradesAccepted = 0;
  const hazardHits: Record<string, number> = {};
  const eventsRevealed: Record<string, number> = {};
  let disasters = 0;
  let eliminations = 0;
  let excavations = 0;

  let state: GameState = createGame(ctx, options);
  const hazardsPresent = [
    ...new Set(
      Object.values(state.hexes)
        .filter((h) => ctx.terrain(h.surface).kind === 'hazard')
        .map((h) => h.surface),
    ),
  ];
  // Mão inicial conta como compra (o setup não emite eventos).
  for (const p of state.players) for (const c of p.hand) bump(cardsDrawn, state.cards.defs[c] ?? '?');
  let steps = 0;
  const maxSteps = opts.maxSteps ?? 40_000;
  while (state.stage !== 'over') {
    if (++steps > maxSteps) throw new Error(`partida ${opts.seed} não terminou em ${maxSteps} decisões`);
    const who = decider(state);
    const agent = agents[who];
    if (!agent) throw new Error(`sem agente para o jogador ${who}`);
    const action = chooseAction(ctx, state, agent);
    const pendingTrade = state.pendingTrade;
    const { state: next, events } = applyAction(ctx, state, action);
    for (const e of events) {
      switch (e.type) {
        case 'produced':
          produced[e.player]![e.resource] += e.amount;
          break;
        case 'bankTraded':
          bankTraded[e.give] += e.amount;
          bankTraded[e.receive] += e.received;
          break;
        case 'tradeAccepted':
          tradesAccepted++;
          if (pendingTrade) {
            for (const id of RESOURCE_IDS) {
              playerTraded[id] += (pendingTrade.give[id] ?? 0) + (pendingTrade.receive[id] ?? 0);
            }
          }
          break;
        case 'cardPlayed':
        case 'permanentInstalled':
          bump(cardsPlayed, state.cards.defs[e.card] ?? '?');
          break;
        case 'cardDelivered':
          bump(cardsPlayed, state.cards.defs[e.card] ?? '?');
          break;
        case 'cardDrawn':
        case 'cardTaken':
        case 'treasureDrawn':
          bump(cardsDrawn, next.cards.defs[e.card] ?? '?');
          break;
        case 'hazardTriggered':
          bump(hazardHits, e.hazard);
          break;
        case 'eventRevealed':
          bump(eventsRevealed, e.event);
          break;
        case 'disaster':
          disasters++;
          break;
        case 'playerEliminated':
          eliminations++;
          break;
        case 'excavated':
          excavations++;
          break;
      }
    }
    state = next;
  }

  const winners = state.winners;
  const seats: PlayerRecord[] = state.players.map((p) => {
    const prog = progress(ctx, state, p.id);
    const structures: Record<string, number> = {};
    for (const hex of Object.values(state.hexes))
      for (const s of hex.structures) if (s.owner === p.id) bump(structures, s.type);
    return {
      seat: p.id,
      level: agents[p.id]?.level ?? 'normal',
      focus: agents[p.id]?.focus ?? null,
      won: winners.includes(p.id),
      met: prog.met,
      progressTotal: prog.total,
      resources: { ...p.resources },
      produced: produced[p.id] ?? zero(),
      structures,
    };
  });
  const winTracks =
    state.endReason === 'condition' ? [...new Set(seats.filter((s) => s.won).flatMap((s) => s.met))] : [];
  return {
    seed: opts.seed,
    players: ctx.playerCount,
    rounds: state.round,
    endReason: state.endReason ?? 'roundLimit',
    winners,
    winTracks,
    steps,
    ms: now() - started,
    seats,
    bankTraded,
    playerTraded,
    tradesAccepted,
    cardsPlayed,
    cardsDrawn,
    hazardsPresent,
    hazardHits,
    eventsRevealed,
    disasters,
    eliminations,
    excavations,
  };
}

export type { ResourceId };
