/**
 * Resumo de um lote de partidas simuladas (UX_SPEC 2.18): vitórias por condição, por
 * posição de turno e por nível, duração, recursos produzidos e trocados, cartas mais e
 * menos jogadas, % no limite de rodadas. Mais o CSV por partida e por carta.
 */
import { wilson } from './stats';
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import type { TrackId } from '../engine/rules/victory';
import type { GameRecord } from './game';

export interface CardStat {
  readonly id: string;
  readonly played: number;
  readonly drawn: number;
  /** Jogadas por compra (0–1+; a mão inicial conta como compra). */
  readonly rate: number;
}

export interface SimSummary {
  readonly games: number;
  readonly players: number;
  readonly totalMs: number;
  /** Vitórias por trilha (partidas em que a trilha deu a vitória) e pelo limite de rodadas. */
  readonly winsByTrack: Record<TrackId | 'elimination' | 'roundLimit', number>;
  /** Vitórias por assento (empate conta para cada vencedor). */
  readonly winsBySeat: number[];
  readonly winsByLevel: Record<string, { readonly seats: number; readonly wins: number }>;
  /** GDD 12 / PROMPTS Fase 9: por facção, assentos e vitórias (empate conta para cada vencedor). */
  readonly winsByFaction: Record<string, { readonly seats: number; readonly wins: number }>;
  /** Por rota perseguida: assentos, vitórias e vitórias pela própria rota. */
  readonly winsByFocus: Record<
    string,
    { readonly seats: number; readonly wins: number; readonly onFocus: number }
  >;
  readonly rounds: {
    readonly mean: number;
    readonly median: number;
    readonly min: number;
    readonly max: number;
  };
  readonly roundsHistogram: Record<number, number>;
  readonly roundLimitRate: number;
  readonly sharedWins: number;
  /** Média por partida, somando os jogadores. */
  readonly producedPerGame: Record<ResourceId, number>;
  readonly bankTradedPerGame: Record<ResourceId, number>;
  readonly playerTradedPerGame: Record<ResourceId, number>;
  readonly tradesAcceptedPerGame: number;
  /** Estruturas em pé no fim, média por jogador. */
  readonly structuresPerPlayer: Record<string, number>;
  readonly cards: CardStat[];
  readonly msPerGame: number;
  /** D15: por hazard, % das partidas (em que ele estava no planeta) em que sofreu dano. */
  readonly hazards: Record<
    string,
    { readonly games: number; readonly hitGames: number; readonly hits: number }
  >;
  readonly eventsPerGame: Record<string, number>;
  readonly disastersPerGame: number;
  readonly eliminationsPerGame: number;
  readonly excavationsPerGame: number;
  readonly combatsPerGame: number;
  readonly recruitsPerGame: number;
  readonly villageHitsPerGame: number;
  readonly treatiesPerGame: { proposed: number; signed: number; triggered: number; broken: number };
}

const TRACKS: readonly (TrackId | 'elimination' | 'roundLimit')[] = [
  ...RESOURCE_IDS,
  'expansion',
  'tribe',
  'elimination',
  'roundLimit',
];

export function summarize(records: readonly GameRecord[], allCardIds: readonly string[] = []): SimSummary {
  const n = records.length || 1;
  const players = records[0]?.players ?? 0;
  const winsByTrack = Object.fromEntries(TRACKS.map((t) => [t, 0])) as Record<
    TrackId | 'elimination' | 'roundLimit',
    number
  >;
  const winsBySeat = Array.from({ length: players }, () => 0);
  const winsByLevel: Record<string, { seats: number; wins: number }> = {};
  const winsByFaction: Record<string, { seats: number; wins: number }> = {};
  const winsByFocus: Record<string, { seats: number; wins: number; onFocus: number }> = {};
  const produced = zero();
  const bank = zero();
  const traded = zero();
  const structures: Record<string, number> = {};
  const played: Record<string, number> = {};
  const drawn: Record<string, number> = {};
  const histogram: Record<number, number> = {};
  let trades = 0;
  let shared = 0;
  const hazards: Record<string, { games: number; hitGames: number; hits: number }> = {};
  const evs: Record<string, number> = {};
  let disasters = 0;
  let eliminations = 0;
  let excavations = 0;
  let combats = 0;
  let recruits = 0;
  let villageHits = 0;
  const treaties = { proposed: 0, signed: 0, triggered: 0, broken: 0 };
  let totalMs = 0;

  for (const r of records) {
    totalMs += r.ms;
    histogram[r.rounds] = (histogram[r.rounds] ?? 0) + 1;
    if (r.endReason === 'roundLimit') winsByTrack.roundLimit++;
    for (const t of r.winTracks) winsByTrack[t]++;
    if (r.winners.length > 1) shared++;
    for (const w of r.winners) winsBySeat[w] = (winsBySeat[w] ?? 0) + 1;
    for (const s of r.seats) {
      if (s.faction) {
        const fa = (winsByFaction[s.faction] ??= { seats: 0, wins: 0 });
        fa.seats++;
        if (s.won) fa.wins++;
      }
      const lv = (winsByLevel[s.level] ??= { seats: 0, wins: 0 });
      lv.seats++;
      if (s.won) lv.wins++;
      const fo = (winsByFocus[s.focus ?? 'equilibrado'] ??= { seats: 0, wins: 0, onFocus: 0 });
      fo.seats++;
      if (s.won) fo.wins++;
      if (s.won && r.endReason === 'condition' && s.focus && (s.met as string[]).includes(s.focus))
        fo.onFocus++;
      for (const id of RESOURCE_IDS) produced[id] += s.produced[id];
      for (const [type, count] of Object.entries(s.structures))
        structures[type] = (structures[type] ?? 0) + count;
    }
    for (const id of RESOURCE_IDS) {
      bank[id] += r.bankTraded[id];
      traded[id] += r.playerTraded[id];
    }
    trades += r.tradesAccepted;
    for (const h of r.hazardsPresent ?? []) {
      const hz = (hazards[h] ??= { games: 0, hitGames: 0, hits: 0 });
      hz.games++;
      const n = r.hazardHits?.[h] ?? 0;
      hz.hits += n;
      if (n > 0) hz.hitGames++;
    }
    for (const [id, c] of Object.entries(r.eventsRevealed ?? {})) evs[id] = (evs[id] ?? 0) + c;
    disasters += r.disasters ?? 0;
    eliminations += r.eliminations ?? 0;
    excavations += r.excavations ?? 0;
    combats += r.combats ?? 0;
    recruits += r.recruits ?? 0;
    villageHits += r.villageHits ?? 0;
    treaties.proposed += r.treatiesProposed ?? 0;
    treaties.signed += r.treatiesSigned ?? 0;
    treaties.triggered += r.treatiesTriggered ?? 0;
    treaties.broken += r.pactsBroken ?? 0;
    for (const [id, c] of Object.entries(r.cardsPlayed)) played[id] = (played[id] ?? 0) + c;
    for (const [id, c] of Object.entries(r.cardsDrawn)) drawn[id] = (drawn[id] ?? 0) + c;
  }

  const rounds = records.map((r) => r.rounds).sort((a, b) => a - b);
  const mid = Math.floor(rounds.length / 2);
  const median =
    rounds.length === 0 ? 0 : rounds.length % 2 ? rounds[mid]! : (rounds[mid - 1]! + rounds[mid]!) / 2;
  const ids = new Set([...allCardIds, ...Object.keys(played), ...Object.keys(drawn)]);
  const cards = [...ids]
    .map((id) => {
      const p = played[id] ?? 0;
      const d = drawn[id] ?? 0;
      return { id, played: p, drawn: d, rate: d > 0 ? p / d : 0 };
    })
    .sort((a, b) => b.played - a.played || b.rate - a.rate || a.id.localeCompare(b.id));
  const perGame = (r: Record<ResourceId, number>) =>
    Object.fromEntries(RESOURCE_IDS.map((id) => [id, r[id] / n])) as Record<ResourceId, number>;
  const seatsTotal = n * (players || 1);

  return {
    games: records.length,
    players,
    totalMs,
    winsByTrack,
    winsBySeat,
    winsByFaction,
    winsByLevel,
    winsByFocus,
    rounds: {
      mean: rounds.reduce((a, b) => a + b, 0) / n,
      median,
      min: rounds[0] ?? 0,
      max: rounds[rounds.length - 1] ?? 0,
    },
    roundsHistogram: histogram,
    roundLimitRate: winsByTrack.roundLimit / n,
    sharedWins: shared,
    producedPerGame: perGame(produced),
    bankTradedPerGame: perGame(bank),
    playerTradedPerGame: perGame(traded),
    tradesAcceptedPerGame: trades / n,
    structuresPerPlayer: Object.fromEntries(
      Object.entries(structures)
        .map(([k, v]) => [k, v / seatsTotal] as const)
        .sort((a, b) => b[1] - a[1]),
    ),
    cards,
    msPerGame: totalMs / n,
    hazards,
    eventsPerGame: Object.fromEntries(Object.entries(evs).map(([k, v]) => [k, v / n])),
    disastersPerGame: disasters / n,
    eliminationsPerGame: eliminations / n,
    excavationsPerGame: excavations / n,
    combatsPerGame: combats / n,
    recruitsPerGame: recruits / n,
    villageHitsPerGame: villageHits / n,
    treatiesPerGame: {
      proposed: treaties.proposed / n,
      signed: treaties.signed / n,
      triggered: treaties.triggered / n,
      broken: treaties.broken / n,
    },
  };
}

function zero(): Record<ResourceId, number> {
  return { food: 0, stone: 0, iron: 0, coal: 0, oil: 0, gold: 0 };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells: readonly (string | number)[]) => cells.map(csvCell).join(',');

/** Uma linha por partida. */
export function gamesCsv(records: readonly GameRecord[]): string {
  const players = Math.max(0, ...records.map((r) => r.players));
  const head = [
    'seed',
    'players',
    'rounds',
    'endReason',
    'winners',
    'winTracks',
    'steps',
    'ms',
    'tradesAccepted',
  ];
  for (let i = 0; i < players; i++) {
    head.push(
      `p${i}_level`,
      `p${i}_focus`,
      `p${i}_won`,
      `p${i}_progress`,
      ...RESOURCE_IDS.map((id) => `p${i}_${id}`),
    );
  }
  for (const id of RESOURCE_IDS) head.push(`bank_${id}`, `traded_${id}`);
  const lines = [csvRow(head)];
  for (const r of records) {
    const row: (string | number)[] = [
      r.seed,
      r.players,
      r.rounds,
      r.endReason,
      r.winners.join('|'),
      r.winTracks.join('|'),
      r.steps,
      Math.round(r.ms),
      r.tradesAccepted,
    ];
    for (let i = 0; i < players; i++) {
      const s = r.seats[i];
      row.push(
        s?.level ?? '',
        s?.focus ?? '',
        s?.won ? 1 : 0,
        s ? s.progressTotal.toFixed(3) : '',
        ...RESOURCE_IDS.map((id) => s?.resources[id] ?? ''),
      );
    }
    for (const id of RESOURCE_IDS) row.push(r.bankTraded[id], r.playerTraded[id]);
    lines.push(csvRow(row));
  }
  return lines.join('\n') + '\n';
}

export function cardsCsv(summary: SimSummary): string {
  const lines = [csvRow(['card', 'played', 'drawn', 'rate'])];
  for (const c of summary.cards) lines.push(csvRow([c.id, c.played, c.drawn, c.rate.toFixed(3)]));
  return lines.join('\n') + '\n';
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Resumo em texto para o terminal (pt-BR: é ferramenta de design, não texto de jogo). */
export function summaryText(s: SimSummary, header = ''): string {
  const n = s.games || 1;
  const out: string[] = [];
  if (header) out.push(header);
  out.push(
    `${s.games} partidas de ${s.players} jogadores em ${(s.totalMs / 1000).toFixed(1)} s de CPU (${s.msPerGame.toFixed(0)} ms/partida)`,
  );
  out.push('', 'Vitórias por condição:');
  for (const [track, wins] of Object.entries(s.winsByTrack).sort((a, b) => b[1] - a[1])) {
    out.push(`  ${track.padEnd(11)} ${String(wins).padStart(5)}  ${pct(wins / n)}`);
  }
  out.push(
    `  (vitórias compartilhadas: ${s.sharedWins})`,
    '',
    'Vitórias por posição de turno (assento = facção):',
  );
  s.winsBySeat.forEach((w, i) => out.push(`  assento ${i}   ${String(w).padStart(5)}  ${pct(w / n)}`));
  const levels = Object.entries(s.winsByLevel);
  const factions = Object.entries(s.winsByFaction);
  if (factions.length > 1) {
    out.push('', 'Vitórias por facção (% das partidas em que a facção jogou, IC 95% de Wilson):');
    for (const [f, v] of factions.sort((a, b) => b[1].wins / b[1].seats - a[1].wins / a[1].seats)) {
      const ci = wilson(v.wins, v.seats);
      out.push(
        `  ${f.padEnd(16)} ${String(v.seats).padStart(4)} partidas  ${pct(ci.value).padStart(6)}  [${pct(ci.lo)}–${pct(ci.hi)}]`,
      );
    }
  }
  if (levels.length > 1) {
    out.push('', 'Vitórias por nível de IA:');
    for (const [lv, v] of levels)
      out.push(`  ${lv.padEnd(8)} ${pct(v.wins / Math.max(1, v.seats))} dos assentos`);
  }
  const foci = Object.entries(s.winsByFocus);
  if (foci.length > 1 || (foci[0] && foci[0][0] !== 'equilibrado')) {
    out.push('', 'Por rota perseguida (vitória = qualquer; pela rota = cumpriu a própria trilha):');
    for (const [f, v] of foci.sort(
      (a, b) => b[1].wins / Math.max(1, b[1].seats) - a[1].wins / Math.max(1, a[1].seats),
    )) {
      out.push(
        `  ${f.padEnd(11)} ${String(v.seats).padStart(4)} assentos  vitória ${pct(v.wins / Math.max(1, v.seats)).padStart(6)}  pela rota ${pct(v.onFocus / Math.max(1, v.seats)).padStart(6)}`,
      );
    }
  }
  out.push(
    '',
    `Duração: média ${s.rounds.mean.toFixed(2)} rodadas, mediana ${s.rounds.median}, faixa ${s.rounds.min}–${s.rounds.max}`,
    `Bateram o limite de rodadas: ${pct(s.roundLimitRate)}`,
    '',
    'Recursos por partida (todos os jogadores):',
    `  ${'recurso'.padEnd(8)} ${'produzido'.padStart(10)} ${'banca'.padStart(8)} ${'trocado'.padStart(8)}`,
  );
  for (const id of RESOURCE_IDS) {
    out.push(
      `  ${id.padEnd(8)} ${s.producedPerGame[id].toFixed(1).padStart(10)} ${s.bankTradedPerGame[id].toFixed(1).padStart(8)} ${s.playerTradedPerGame[id].toFixed(1).padStart(8)}`,
    );
  }
  out.push(
    `  trocas aceitas entre jogadores: ${s.tradesAcceptedPerGame.toFixed(2)} por partida`,
    '',
    'Estruturas no fim (média por jogador):',
  );
  out.push(
    '  ' +
      Object.entries(s.structuresPerPlayer)
        .map(([k, v]) => `${k} ${v.toFixed(2)}`)
        .join(' · '),
  );
  const hz = Object.entries(s.hazards);
  if (hz.length) {
    out.push('', 'Hazards atingidos (D15: % das partidas em que sofreram dano):');
    for (const [id, v] of hz.sort((a, b) => b[1].hitGames / b[1].games - a[1].hitGames / a[1].games)) {
      out.push(
        `  ${id.padEnd(17)} ${pct(v.hitGames / Math.max(1, v.games)).padStart(6)}  (${(v.hits / Math.max(1, v.games)).toFixed(2)} vezes por partida)`,
      );
    }
  }
  if (Object.keys(s.eventsPerGame).length) {
    out.push(
      '',
      `Desastres por partida: ${s.disastersPerGame.toFixed(2)} · eliminações: ${s.eliminationsPerGame.toFixed(2)} · escavações: ${s.excavationsPerGame.toFixed(2)}`,
    );
  }
  if (s.recruitsPerGame > 0 || s.combatsPerGame > 0) {
    out.push(
      '',
      `Conflito por partida: ${s.recruitsPerGame.toFixed(2)} tropas recrutadas · ${s.combatsPerGame.toFixed(2)} combates · ${s.villageHitsPerGame.toFixed(2)} ataques à Vila`,
    );
  }
  const tr = s.treatiesPerGame;
  if (tr.proposed > 0) {
    out.push(
      '',
      `Tratados por partida: ${tr.proposed.toFixed(2)} propostos · ${tr.signed.toFixed(2)} assinados · ${tr.triggered.toFixed(2)} disparos · ${tr.broken.toFixed(2)} pactos rompidos`,
    );
  }
  const playedCards = s.cards.filter((c) => c.drawn > 0 || c.played > 0);
  out.push('', 'Cartas mais jogadas:');
  for (const c of playedCards.slice(0, 6))
    out.push(`  ${c.id.padEnd(28)} ${String(c.played).padStart(5)}  (${pct(c.rate)} das compradas)`);
  out.push('Cartas menos jogadas:');
  for (const c of [...playedCards].sort((a, b) => a.played - b.played || a.rate - b.rate).slice(0, 6)) {
    out.push(`  ${c.id.padEnd(28)} ${String(c.played).padStart(5)}  (${pct(c.rate)} das compradas)`);
  }
  return out.join('\n');
}
