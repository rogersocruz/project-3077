/**
 * Agregado das métricas detalhadas (sim/metrics.ts) com intervalos de confiança de 95%:
 * ritmo, curvas de economia por rodada (geral, por facção, por assento), ações e construção,
 * conflito e interação (matrizes por assento). Usado pelo CLI, pelo sim:balance e pelo
 * Laboratório.
 */
import { loadGameData } from '../data';
import { RESOURCE_IDS } from '../data/schemas';
import type { GameRecord } from './game';
import type { SeatRound } from './metrics';
import { type Interval, meanCI, median, wilson } from './stats';

export interface CurvePoint {
  readonly round: number;
  /** Jogadores ainda em partidas que chegaram a esta rodada. */
  readonly n: number;
  readonly stock: Interval;
  readonly produced: Interval;
  readonly spent: Interval;
  readonly bought: Interval;
  readonly army: Interval;
  readonly progress: Interval;
  /** Estoque médio por recurso (unidades). */
  readonly stockBy: number[];
}

export interface MetricsSummary {
  readonly games: number;
  readonly pace: {
    readonly first50: Interval;
    readonly first80: Interval;
    readonly never80: Interval;
    readonly leadChanges: Interval;
    readonly margin: Interval;
    readonly comeback: Interval;
  };
  readonly curve: CurvePoint[];
  /** Estoque (valor) médio por rodada, por facção e por assento. */
  readonly stockByFaction: Record<string, { round: number; mean: number; n: number }[]>;
  readonly stockBySeat: { round: number; mean: number; n: number }[][];
  /** Ações por tipo, por jogador e partida. */
  readonly actions: Record<string, Interval>;
  readonly wasted: Interval;
  /** Por estrutura: construídas por jogador, mediana da rodada da primeira, nível médio no fim. */
  readonly builds: Record<string, { perPlayer: Interval; firstRound: number | null; level: number | null }>;
  /** Cartas jogadas por categoria, por partida. */
  readonly cards: Record<string, Interval>;
  readonly conflict: {
    readonly combats: Interval;
    readonly attackerWin: Interval;
    readonly villageHits: Interval;
  };
  /** Média por partida, [de][para]. */
  readonly trades: number[][];
  readonly treaties: number[][];
  readonly sabotage: number[][];
}

const nonNull = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function curveAt(points: SeatRound[], round: number): CurvePoint {
  const pick = (f: (p: SeatRound) => number) => meanCI(points.map(f));
  return {
    round,
    n: points.length,
    stock: pick((p) => p.stock),
    produced: pick((p) => p.produced),
    spent: pick((p) => p.spent),
    bought: pick((p) => p.bought),
    army: pick((p) => p.army),
    progress: pick((p) => p.progress),
    stockBy: RESOURCE_IDS.map((_, i) => avg(points.map((p) => p.stockBy[i] ?? 0))),
  };
}

/** Categoria de carta (ART_DIRECTION 4): tecnologia, relíquia, tesouro, entregue, própria. */
function categoryOf(id: string, cache: Map<string, string>): string {
  if (cache.size === 0)
    for (const c of loadGameData().cards)
      cache.set(
        c.id,
        c.type === 'tech' || c.type === 'relic' || c.type === 'treasure'
          ? c.type
          : c.timing === 'delivered'
            ? 'delivered'
            : 'own',
      );
  return cache.get(id) ?? 'own';
}

export function summarizeMetrics(records: readonly GameRecord[]): MetricsSummary | null {
  const rs = records.filter((r) => r.metrics);
  if (rs.length === 0) return null;
  const players = rs[0]?.players ?? 0;
  const m = rs.map((r) => r.metrics!);

  // Curvas por rodada (jogadores das partidas que chegaram até ela).
  const maxRound = Math.max(...m.map((x) => Math.max(0, ...x.rounds.map((s) => s.length))));
  const curve: CurvePoint[] = [];
  const stockByFaction: Record<string, { round: number; mean: number; n: number }[]> = {};
  const stockBySeat: { round: number; mean: number; n: number }[][] = Array.from(
    { length: players },
    () => [],
  );
  for (let k = 0; k < maxRound; k++) {
    const all: SeatRound[] = [];
    const fac: Record<string, number[]> = {};
    const seat: number[][] = Array.from({ length: players }, () => []);
    rs.forEach((r) =>
      r.metrics!.rounds.forEach((series, i) => {
        const p = series[k];
        if (!p) return;
        all.push(p);
        const f = r.seats[i]?.faction;
        if (f) (fac[f] ??= []).push(p.stock);
        seat[i]?.push(p.stock);
      }),
    );
    if (all.length === 0) continue;
    curve.push(curveAt(all, k + 1));
    for (const [f, xs] of Object.entries(fac))
      (stockByFaction[f] ??= []).push({ round: k + 1, mean: avg(xs), n: xs.length });
    seat.forEach((xs, i) => xs.length && stockBySeat[i]?.push({ round: k + 1, mean: avg(xs), n: xs.length }));
  }

  // Ações e construção (por jogador-partida).
  const seatGames = m.flatMap((x) => x.actions.map((a, i) => ({ a, b: x.builds[i]!, w: x.wasted[i] ?? 0 })));
  const actionTypes = [...new Set(seatGames.flatMap((s) => Object.keys(s.a)))].sort();
  const actions = Object.fromEntries(actionTypes.map((t) => [t, meanCI(seatGames.map((s) => s.a[t] ?? 0))]));
  const structureTypes = [...new Set(seatGames.flatMap((s) => Object.keys(s.b.count)))].sort();
  const builds = Object.fromEntries(
    structureTypes.map((t) => {
      const firsts = nonNull(seatGames.map((s) => s.b.first[t] ?? null));
      const levels = m.flatMap((x) => x.levels[t] ?? []);
      return [
        t,
        {
          perPlayer: meanCI(seatGames.map((s) => s.b.count[t] ?? 0)),
          firstRound: firsts.length ? median(firsts) : null,
          level: levels.length ? avg(levels) : null,
        },
      ];
    }),
  );

  // Cartas por categoria.
  const cache = new Map<string, string>();
  const cats: Record<string, number[]> = {};
  rs.forEach((r, gi) => {
    const per: Record<string, number> = {};
    for (const [id, n] of Object.entries(r.cardsPlayed)) {
      const c = categoryOf(id, cache);
      per[c] = (per[c] ?? 0) + n;
    }
    for (const c of new Set([...Object.keys(per), ...Object.keys(cats)])) {
      (cats[c] ??= Array.from({ length: gi }, () => 0)).push(per[c] ?? 0);
    }
  });
  const cards = Object.fromEntries(Object.entries(cats).map(([c, xs]) => [c, meanCI(xs)]));

  const matrix = (pick: (x: (typeof m)[number]) => number[][]) =>
    Array.from({ length: players }, (_, a) =>
      Array.from({ length: players }, (_, b) => avg(m.map((x) => pick(x)[a]?.[b] ?? 0))),
    );
  const combats = m.reduce((s, x) => s + x.combats, 0);
  const atk = m.reduce((s, x) => s + x.attackerWins, 0);
  const first80 = m.map((x) => x.pace.first80);

  return {
    games: rs.length,
    pace: {
      first50: meanCI(nonNull(m.map((x) => x.pace.first50))),
      first80: meanCI(nonNull(first80)),
      never80: wilson(first80.filter((x) => x === null).length, m.length),
      leadChanges: meanCI(m.map((x) => x.pace.leadChanges)),
      margin: meanCI(m.map((x) => x.pace.margin)),
      comeback: wilson(m.filter((x) => x.pace.comeback).length, m.length),
    },
    curve,
    stockByFaction,
    stockBySeat,
    actions,
    wasted: meanCI(seatGames.map((s) => s.w)),
    builds,
    cards,
    conflict: {
      combats: meanCI(m.map((x) => x.combats)),
      attackerWin: wilson(atk, combats),
      villageHits: meanCI(m.map((x) => x.villageHits)),
    },
    trades: matrix((x) => x.trades),
    treaties: matrix((x) => x.treaties),
    sabotage: matrix((x) => x.sabotage),
  };
}

const f2 = (x: number) => x.toFixed(2);
const ci = (i: Interval, d = 2) => `${i.value.toFixed(d)} [${i.lo.toFixed(d)}–${i.hi.toFixed(d)}]`;
const pc = (i: Interval) =>
  `${(i.value * 100).toFixed(1)}% [${(i.lo * 100).toFixed(1)}–${(i.hi * 100).toFixed(1)}]`;

function matrixText(title: string, mx: number[][]): string[] {
  const out = [title, `  de\\para ${mx.map((_, i) => `A${i + 1}`.padStart(6)).join('')}`];
  mx.forEach((row, i) => out.push(`  A${i + 1}      ${row.map((v) => f2(v).padStart(6)).join('')}`));
  return out;
}

/** Seção de texto do relatório (CLI). */
export function metricsText(s: MetricsSummary): string {
  const out: string[] = [
    '',
    '── Métricas detalhadas (IC 95%) ──',
    '',
    'Ritmo:',
    `  rodada em que alguém passa de 50% numa trilha: ${ci(s.pace.first50)}`,
    `  rodada em que alguém passa de 80%:             ${ci(s.pace.first80)} · nunca: ${pc(s.pace.never80)}`,
    `  trocas de líder por partida:                   ${ci(s.pace.leadChanges)}`,
    `  margem 1º−2º no fim (p.p. de progresso):       ${ci(s.pace.margin, 1)}`,
    `  virada (vencedor não liderava na rodada anterior): ${pc(s.pace.comeback)}`,
    '',
    'Economia por rodada (média por jogador; valor em pontos):',
    `  rod   n    estoque           renda             gasto             banca(un.)  exército  progresso`,
  ];
  for (const p of s.curve) {
    out.push(
      `  ${String(p.round).padStart(3)} ${String(p.n).padStart(4)}  ${ci(p.stock, 1).padEnd(17)} ${ci(p.produced, 1).padEnd(17)} ${ci(p.spent, 1).padEnd(17)} ${f2(p.bought.value).padStart(8)}  ${f2(p.army.value).padStart(8)}  ${(p.progress.value * 100).toFixed(0).padStart(5)}%`,
    );
  }
  out.push('', 'Ações por jogador e partida:');
  for (const [t, i] of Object.entries(s.actions).sort((a, b) => b[1].value - a[1].value))
    out.push(`  ${t.padEnd(18)} ${ci(i)}`);
  out.push(`  ações que sobraram ao encerrar: ${ci(s.wasted)}`, '', 'Construção (por jogador):');
  for (const [t, b] of Object.entries(s.builds))
    out.push(
      `  ${t.padEnd(11)} ${ci(b.perPlayer)}  1ª na rodada ${b.firstRound ?? '—'} (mediana)  nível médio no fim ${b.level === null ? '—' : f2(b.level)}`,
    );
  out.push('', 'Cartas jogadas por categoria (por partida):');
  for (const [c, i] of Object.entries(s.cards)) out.push(`  ${c.padEnd(10)} ${ci(i)}`);
  out.push(
    '',
    'Conflito:',
    `  combates por partida: ${ci(s.conflict.combats)} · atacante vence: ${pc(s.conflict.attackerWin)}`,
    `  ataques à Vila por partida: ${ci(s.conflict.villageHits)}`,
    '',
    ...matrixText('Trocas aceitas por partida (proponente → destinatário, por assento):', s.trades),
    '',
    ...matrixText('Tratados assinados por partida:', s.treaties),
    '',
    ...matrixText('Sabotagens entregues por partida (quem atrapalhou quem):', s.sabotage),
  );
  return out.join('\n');
}

/** Curvas por rodada (geral, por recurso, por facção, por assento) em CSV. */
export function economyCsv(s: MetricsSummary): string {
  const head = [
    'round',
    'n',
    'stock_mean',
    'stock_lo',
    'stock_hi',
    'produced_mean',
    'spent_mean',
    'bought_mean',
    'army_mean',
    'progress_mean',
    ...RESOURCE_IDS.map((r) => `stock_${r}`),
    ...Object.keys(s.stockByFaction).map((f) => `stock_${f}`),
    ...s.stockBySeat.map((_, i) => `stock_seat${i + 1}`),
  ];
  const rows = s.curve.map((p) => {
    const byF = Object.values(s.stockByFaction).map((xs) => xs.find((x) => x.round === p.round)?.mean ?? '');
    const byS = s.stockBySeat.map((xs) => xs.find((x) => x.round === p.round)?.mean ?? '');
    return [
      p.round,
      p.n,
      p.stock.value,
      p.stock.lo,
      p.stock.hi,
      p.produced.value,
      p.spent.value,
      p.bought.value,
      p.army.value,
      p.progress.value,
      ...p.stockBy,
      ...byF,
      ...byS,
    ]
      .map((v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v))
      .join(',');
  });
  return [head.join(','), ...rows].join('\n') + '\n';
}
