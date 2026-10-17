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
import type { GameEvent } from '../engine/events';
import { expansionCount, progress, type TrackId } from '../engine/rules/victory';
import { createGame, type GameOptions } from '../engine/setup';
import type { GameState, Resources } from '../engine/state';

/** Condição de vitória registrada: trilha ou eliminação total. */
export type WinTrack = TrackId | 'elimination';

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
  /** Trajetória por rodada (índice 0 = rodada 1), para os experimentos de balanceamento. */
  readonly trajectory: RoundPoint[];
  /** Rodada em que chegou à Universidade 2 / construiu a primeira Mina (null = nunca). */
  readonly uni2Round: number | null;
  readonly mineRound: number | null;
  readonly minesBuilt: number;
  /** Carvão pago de manutenção (Minas) e gasto em construção/cartas. */
  readonly coalUpkeep: number;
  readonly coalSpent: number;
}

/**
 * Uma rodada de um jogador: estoque no fim da rodada, hexes com estrutura, e os fluxos da
 * rodada — produzido (Parques, Pedreiras, Minas), gasto (construir, melhorar, cartas,
 * manutenção), comprado e vendido na banca. Vetores na ordem de RESOURCE_IDS.
 */
export interface RoundPoint {
  readonly stock: number[];
  readonly hexes: number;
  readonly produced: number[];
  readonly spent: number[];
  readonly bought: number[];
  readonly sold: number[];
}

export interface GameRecord {
  readonly seed: number;
  readonly players: number;
  readonly rounds: number;
  readonly endReason: 'condition' | 'roundLimit';
  readonly winners: number[];
  /** Trilhas que deram a vitória (de todos os vencedores; vazio no limite de rodadas). */
  readonly winTracks: WinTrack[];
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
  /** Fase 7: combates, tropas recrutadas e ataques à Vila. */
  readonly combats: number;
  readonly recruits: number;
  readonly villageHits: number;
  /** Fase 8: tratados propostos, assinados, disparados e pactos rompidos. */
  readonly treatiesProposed: number;
  readonly treatiesSigned: number;
  readonly treatiesTriggered: number;
  readonly pactsBroken: number;
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
  /** Laboratório: ninguém vence antes do limite de rodadas (calibração). */
  readonly playToRoundLimit?: boolean;
}

const RES = RESOURCE_IDS;
const vec = () => RES.map(() => 0);
const add = (v: number[], amounts: Partial<Resources>, sign = 1) => {
  RES.forEach((id, i) => {
    v[i] = (v[i] ?? 0) + sign * (amounts[id] ?? 0);
  });
};

/** Variação de estoque que o evento causa (para tirar do estado o que veio depois do fim da rodada). */
function stockDelta(e: GameEvent): { player: number; amounts: Partial<Resources>; sign: 1 | -1 } | null {
  switch (e.type) {
    case 'produced':
      return { player: e.player, amounts: { [e.resource]: e.amount }, sign: 1 };
    case 'upkeepPaid':
      return { player: e.player, amounts: e.cost, sign: -1 };
    case 'resourcesSpent':
      return { player: e.player, amounts: e.resources, sign: -1 };
    case 'resourcesGained':
      return { player: e.player, amounts: e.resources, sign: 1 };
    case 'resourcesLost':
      return { player: e.player, amounts: e.resources, sign: -1 };
    case 'eventFoodLoss':
      return { player: e.player, amounts: { food: e.amount }, sign: -1 };
    default:
      return null;
  }
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
    ...(opts.playToRoundLimit ? { playToRoundLimit: true } : {}),
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
  let combats = 0;
  let recruits = 0;
  let villageHits = 0;
  let treatiesProposed = 0;
  let treatiesSigned = 0;
  let treatiesTriggered = 0;
  let pactsBroken = 0;
  const n = ctx.playerCount;
  const trajectory: RoundPoint[][] = Array.from({ length: n }, () => []);
  const flows = () =>
    Array.from({ length: n }, () => ({ produced: vec(), spent: vec(), bought: vec(), sold: vec() }));
  let cur = flows();
  let round = 0;
  const uni2Round: (number | null)[] = Array.from({ length: n }, () => null);
  const mineRound: (number | null)[] = Array.from({ length: n }, () => null);
  const minesBuilt = Array.from({ length: n }, () => 0);
  const coalUpkeep = Array.from({ length: n }, () => 0);
  const coalSpent = Array.from({ length: n }, () => 0);

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
    events.forEach((e, idx) => {
      // Fluxos da rodada corrente (antes de roundEnded; depois de roundStarted é a próxima).
      const f = 'player' in e && typeof e.player === 'number' ? cur[e.player] : undefined;
      if (f) {
        if (e.type === 'produced') add(f.produced, { [e.resource]: e.amount });
        if (e.type === 'resourcesSpent') add(f.spent, e.resources);
        if (e.type === 'upkeepPaid') add(f.spent, e.cost);
      }
      if (e.type === 'bankTraded') {
        const b = cur[e.player];
        if (b) {
          add(b.sold, { [e.give]: e.amount });
          add(b.bought, { [e.receive]: e.received });
        }
      }
      if (e.type === 'upkeepPaid') coalUpkeep[e.player] = (coalUpkeep[e.player] ?? 0) + (e.cost.coal ?? 0);
      if (e.type === 'resourcesSpent')
        coalSpent[e.player] = (coalSpent[e.player] ?? 0) + (e.resources.coal ?? 0);
      if (e.type === 'structureBuilt' && e.structure === 'mine') {
        minesBuilt[e.player] = (minesBuilt[e.player] ?? 0) + 1;
        mineRound[e.player] ??= Math.max(1, round);
      }
      if (e.type === 'structureUpgraded' && e.level >= 2 && uni2Round[e.player] === null) {
        const placed = Object.values(next.hexes).some((h) =>
          h.structures.some((st) => st.uid === e.uid && st.type === 'university'),
        );
        if (placed) uni2Round[e.player] = Math.max(1, round);
      }
      if (e.type === 'roundStarted') {
        round = e.round;
        cur = flows();
      }
      if (e.type === 'roundEnded') {
        // Estoque no fim da rodada = depois da ação − o que entrou depois de roundEnded.
        for (let p = 0; p < n; p++) {
          const stock = vec();
          add(stock, next.players[p]?.resources ?? {});
          for (const later of events.slice(idx + 1)) {
            const d = stockDelta(later);
            if (d && d.player === p) add(stock, d.amounts, -d.sign);
          }
          const c = cur[p] ?? flows()[0]!;
          trajectory[p]?.push({
            stock,
            hexes: expansionCount(state, p),
            produced: c.produced,
            spent: c.spent,
            bought: c.bought,
            sold: c.sold,
          });
        }
      }
    });
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
        case 'combatResolved':
          combats++;
          break;
        case 'troopRecruited':
          recruits++;
          break;
        case 'villageAttacked':
          villageHits++;
          break;
        case 'treatyProposed':
          treatiesProposed++;
          break;
        case 'treatySigned':
          treatiesSigned++;
          break;
        case 'treatyTriggered':
          treatiesTriggered++;
          break;
        case 'pactBroken':
          pactsBroken++;
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
      trajectory: trajectory[p.id] ?? [],
      uni2Round: uni2Round[p.id] ?? null,
      mineRound: mineRound[p.id] ?? null,
      minesBuilt: minesBuilt[p.id] ?? 0,
      coalUpkeep: coalUpkeep[p.id] ?? 0,
      coalSpent: coalSpent[p.id] ?? 0,
    };
  });
  // Eliminação total (GDD 13.1): venceu sobrando sozinho, sem trilha cumprida.
  const alive = state.players.filter((p) => !p.eliminated).length;
  const tracks = [...new Set(seats.filter((s) => s.won).flatMap((s) => s.met))];
  const winTracks: WinTrack[] =
    state.endReason === 'condition' ? (tracks.length === 0 && alive === 1 ? ['elimination'] : tracks) : [];
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
    combats,
    recruits,
    villageHits,
    treatiesProposed,
    treatiesSigned,
    treatiesTriggered,
    pactsBroken,
  };
}

export type { ResourceId };
