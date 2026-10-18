/**
 * Métricas detalhadas de uma partida simulada (pedido do usuário: ritmo, economia por rodada,
 * construção e ações, conflito e interação). Coletadas ação a ação por `MetricsCollector`,
 * gravadas em `GameRecord.metrics` e agregadas com IC em metricsReport.ts.
 */
import { RESOURCE_IDS } from '../data/schemas';
import type { Action } from '../engine/actions';
import type { EngineContext } from '../engine/context';
import type { GameEvent } from '../engine/events';
import { troopsOf, troopStrength } from '../engine/rules/troops';
import { playerTracks, progress } from '../engine/rules/victory';
import type { GameState, PlayerId, Resources } from '../engine/state';

/** Um jogador no fim de uma rodada. Valores em pontos de recurso (resources.json → value). */
export interface SeatRound {
  /** Estoque (valor). */
  readonly stock: number;
  /** Fluxos da rodada (valor). */
  readonly produced: number;
  readonly spent: number;
  /** Unidades compradas na banca na rodada. */
  readonly bought: number;
  /** Estoque por recurso (unidades, ordem de RESOURCE_IDS). */
  readonly stockBy: number[];
  /** Força militar somada. */
  readonly army: number;
  /** Progresso somado e da melhor trilha (0–1). */
  readonly progress: number;
  readonly best: number;
}

export interface GameMetrics {
  /** Ritmo da partida. */
  readonly pace: {
    /** Rodada em que alguém passou de 50% / 80% numa trilha (null = nunca). */
    readonly first50: number | null;
    readonly first80: number | null;
    /** Trocas de líder (progresso somado) entre fins de rodada. */
    readonly leadChanges: number;
    /** Diferença de progresso somado entre 1º e 2º no fim (pontos percentuais). */
    readonly margin: number;
    /** O vencedor não liderava no fim da rodada anterior. */
    readonly comeback: boolean;
  };
  /** [assento][rodada − 1] */
  readonly rounds: SeatRound[][];
  /** Ações por tipo, por assento. */
  readonly actions: Record<string, number>[];
  /** Ações que sobraram ao encerrar a fase de Ações, por assento. */
  readonly wasted: number[];
  /** Estruturas construídas por tipo e rodada da primeira, por assento. */
  readonly builds: { readonly count: Record<string, number>; readonly first: Record<string, number> }[];
  /** Nível das estruturas no fim, por tipo (todas as do planeta). */
  readonly levels: Record<string, number[]>;
  readonly combats: number;
  readonly attackerWins: number;
  readonly villageHits: number;
  /** [de][para] por partida: trocas aceitas, tratados assinados, sabotagens entregues. */
  readonly trades: number[][];
  readonly treaties: number[][];
  readonly sabotage: number[][];
}

/** Tipos que não são escolha de jogo (contam fora de "ações por tipo"). */
const NOT_COUNTED = new Set<Action['type']>(['endPhase', 'chooseVillage', 'chooseCompensation']);

const zeros = (n: number) => Array.from({ length: n }, () => 0);
const square = (n: number) => Array.from({ length: n }, () => zeros(n));

export class MetricsCollector {
  private readonly n: number;
  private readonly rounds: SeatRound[][];
  private readonly actions: Record<string, number>[];
  private readonly wasted: number[];
  private readonly builds: { count: Record<string, number>; first: Record<string, number> }[];
  private readonly trades: number[][];
  private readonly treaties: number[][];
  private readonly sabotage: number[][];
  private combats = 0;
  private attackerWins = 0;
  private villageHits = 0;
  private flow: { produced: number; spent: number; bought: number }[];

  constructor(private readonly ctx: EngineContext) {
    const n = ctx.playerCount;
    this.n = n;
    this.rounds = Array.from({ length: n }, () => []);
    this.actions = Array.from({ length: n }, () => ({}));
    this.wasted = zeros(n);
    this.builds = Array.from({ length: n }, () => ({ count: {}, first: {} }));
    this.trades = square(n);
    this.treaties = square(n);
    this.sabotage = square(n);
    this.flow = this.emptyFlow();
  }

  private emptyFlow() {
    return Array.from({ length: this.n }, () => ({ produced: 0, spent: 0, bought: 0 }));
  }

  private value(amounts: Partial<Resources>): number {
    let v = 0;
    for (const [r, q] of Object.entries(amounts)) v += (q ?? 0) * this.ctx.resourceValue(r as never);
    return v;
  }

  onAction(before: GameState, action: Action, after: GameState, events: readonly GameEvent[]): void {
    const p = action.player;
    if (!NOT_COUNTED.has(action.type) && this.actions[p]) {
      this.actions[p][action.type] = (this.actions[p][action.type] ?? 0) + 1;
    }
    if (action.type === 'endPhase' && before.phase === 'actions' && before.stage === 'playing')
      this.wasted[p] = (this.wasted[p] ?? 0) + before.actionsLeft;
    let round = before.round;
    for (const e of events) {
      const f = 'player' in e && typeof e.player === 'number' ? this.flow[e.player] : undefined;
      switch (e.type) {
        case 'roundStarted':
          round = e.round;
          this.flow = this.emptyFlow();
          break;
        case 'produced':
          if (f) f.produced += e.amount * this.ctx.resourceValue(e.resource);
          break;
        case 'resourcesSpent':
          if (f) f.spent += this.value(e.resources);
          break;
        case 'upkeepPaid':
          if (f) f.spent += this.value(e.cost);
          break;
        case 'bankTraded':
          if (f) f.bought += e.received;
          break;
        case 'structureBuilt': {
          const b = this.builds[e.player];
          if (b) {
            b.count[e.structure] = (b.count[e.structure] ?? 0) + 1;
            b.first[e.structure] ??= Math.max(1, round);
          }
          break;
        }
        case 'combatResolved': {
          this.combats++;
          const atk = e.sides.find((s) => s.attacker)?.owner;
          if (atk !== undefined && e.winner === atk) this.attackerWins++;
          break;
        }
        case 'villageAttacked':
          this.villageHits++;
          break;
        case 'tradeAccepted':
          this.bump(this.trades, e.from, e.to);
          break;
        case 'treatySigned':
          this.bump(this.treaties, e.parties[0], e.parties[1]);
          break;
        case 'cardDelivered': {
          const id = after.cards.defs[e.card];
          if (id && this.ctx.card(id).valence === 'sabotage') this.bump(this.sabotage, e.from, e.to);
          break;
        }
        case 'roundEnded':
          this.snapshot(after);
          break;
        default:
          break;
      }
    }
  }

  private bump(m: number[][], a: PlayerId, b: PlayerId): void {
    const row = m[a];
    if (row && b >= 0 && b < row.length) row[b] = (row[b] ?? 0) + 1;
  }

  private snapshot(s: GameState): void {
    for (const pl of s.players) {
      const prog = progress(this.ctx, s, pl.id);
      const best = Math.max(0, ...playerTracks(s, pl.id).map((t) => prog.tracks[t]));
      const fl = this.flow[pl.id] ?? { produced: 0, spent: 0, bought: 0 };
      this.rounds[pl.id]?.push({
        stock: this.value(pl.resources),
        produced: fl.produced,
        spent: fl.spent,
        bought: fl.bought,
        stockBy: RESOURCE_IDS.map((r) => pl.resources[r]),
        army: troopsOf(s, pl.id).reduce((t, x) => t + troopStrength(this.ctx, s, x.troop), 0),
        progress: prog.total,
        best,
      });
    }
  }

  finish(final: GameState): GameMetrics {
    const roundsN = Math.max(0, ...this.rounds.map((r) => r.length));
    const at = (k: number) => this.rounds.map((r) => r[k]);
    let first50: number | null = null;
    let first80: number | null = null;
    const leaders: number[] = [];
    for (let k = 0; k < roundsN; k++) {
      const row = at(k);
      const best = Math.max(...row.map((x) => x?.best ?? 0));
      if (first50 === null && best >= 0.5) first50 = k + 1;
      if (first80 === null && best >= 0.8) first80 = k + 1;
      let lead = 0;
      row.forEach((x, i) => {
        if ((x?.progress ?? 0) > (row[lead]?.progress ?? 0)) lead = i;
      });
      leaders.push(lead);
    }
    let leadChanges = 0;
    for (let k = 1; k < leaders.length; k++) if (leaders[k] !== leaders[k - 1]) leadChanges++;
    const totals = final.players.map((p) => progress(this.ctx, final, p.id).total).sort((a, b) => b - a);
    const margin = ((totals[0] ?? 0) - (totals[1] ?? 0)) * 100;
    const winner = final.winners[0];
    const prevLeader = leaders.length >= 2 ? leaders[leaders.length - 2] : undefined;
    const comeback = winner !== undefined && prevLeader !== undefined && prevLeader !== winner;
    const levels: Record<string, number[]> = {};
    for (const h of Object.values(final.hexes))
      for (const st of h.structures) (levels[st.type] ??= []).push(st.level);
    return {
      pace: { first50, first80, leadChanges, margin, comeback },
      rounds: this.rounds,
      actions: this.actions,
      wasted: this.wasted,
      builds: this.builds,
      levels,
      combats: this.combats,
      attackerWins: this.attackerWins,
      villageHits: this.villageHits,
      trades: this.trades,
      treaties: this.treaties,
      sabotage: this.sabotage,
    };
  }
}
