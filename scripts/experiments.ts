/**
 * npm run sim:experiments — os 4 experimentos de balanceamento (seeds 1–200, 4 jogadores,
 * Economia + Cartas, IA Normal com rotas sorteadas, como o relatório de referência):
 *  1. trajetórias por rota (mediana por rodada do estoque-alvo, líquido e banca);
 *  2. bot investor (1 investor + 3 normais, assento em rodízio);
 *  3. A/B da Mina (override structures.json → mine.rarity = 1);
 *  4. calibração de limiares pela mediana do estoque na rodada T (T = 10, 12, 15; 3 iterações).
 * data/balance.json não muda: toda variação vai por override. Saída: simulations/experiments/
 * (JSON e CSV de cada lote) e docs/EXPERIMENTOS.md (tabelas com IC 95%).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAW_DATA } from '../src/data';
import { RESOURCE_IDS } from '../src/data/schemas';
import type { GameRecord } from '../src/sim/game';
import { DEFAULT_SIM, type SimConfig } from '../src/sim/run';
import { fmtMean, fmtRate, meanCI, wilson } from '../src/sim/stats';
import { stockAtRound, trajectoryCsv, trajectoryMarkdown, trajectoryTable } from '../src/sim/trajectory';
import { runBatch } from './sim-lib';

const OUT = join(import.meta.dirname, '..', 'simulations', 'experiments');
const DOC = join(import.meta.dirname, '..', 'docs', 'EXPERIMENTOS.md');
const BASE: SimConfig = {
  ...DEFAULT_SIM,
  games: 200,
  players: 4,
  seed: 1,
  levels: ['normal'],
  layers: { cards: true },
};
const TRACKS = [...RESOURCE_IDS, 'expansion', 'roundLimit'] as const;
const LABEL: Record<string, string> = {
  food: 'Comida',
  stone: 'Pedregulho',
  iron: 'Ferro',
  coal: 'Carvão',
  oil: 'Petróleo',
  gold: 'Ouro',
  expansion: 'Expansão',
  roundLimit: 'Limite de rodadas',
};
const baseThresholds = (
  RAW_DATA['balance.json'] as { victory: { resourceThresholds: Record<string, number> } }
).victory.resourceThresholds;

/** Leitura escrita à mão entre os marcadores: preservada quando o relatório é regerado. */
function reading(): string {
  try {
    const old = readFileSync(DOC, 'utf8');
    const m = /<!-- LEITURA -->[\s\S]*?<!-- \/LEITURA -->/.exec(old);
    if (m) return m[0];
  } catch {
    // primeiro relatório
  }
  return '<!-- LEITURA -->\n<!-- /LEITURA -->';
}

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function run(name: string, config: SimConfig): Promise<GameRecord[]> {
  log(`${name}: ${config.games} partidas…`);
  const { records, wallMs } = await runBatch(config);
  mkdirSync(join(OUT, name), { recursive: true });
  // Sem as trajetórias brutas (pesadas): o agregado vai em trajectories.csv.
  const slim = records.map((r) => ({ ...r, seats: r.seats.map((s) => ({ ...s, trajectory: [] })) }));
  writeFileSync(join(OUT, name, 'records.json'), JSON.stringify(slim));
  writeFileSync(join(OUT, name, 'trajectories.csv'), trajectoryCsv(trajectoryTable(records)));
  writeFileSync(join(OUT, name, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  log(`${name}: ${(wallMs / 1000).toFixed(1)} s`);
  return records;
}

// ── Métricas ─────────────────────────────────────────────────────────────────

const winsByTrack = (rs: readonly GameRecord[]) =>
  Object.fromEntries(
    TRACKS.map((t) => [
      t,
      wilson(
        rs.filter((r) => (t === 'roundLimit' ? r.endReason === 'roundLimit' : r.winTracks.includes(t)))
          .length,
        rs.length,
      ),
    ]),
  );
const duration = (rs: readonly GameRecord[]) => meanCI(rs.map((r) => r.rounds));
const perSeat = (rs: readonly GameRecord[], f: (s: GameRecord['seats'][number]) => number) =>
  meanCI(rs.flatMap((r) => r.seats.map(f)));
const perGame = (rs: readonly GameRecord[], f: (r: GameRecord) => number) => meanCI(rs.map(f));

function tracksTable(cols: readonly { name: string; rs: readonly GameRecord[] }[]): string {
  const w = cols.map((c) => winsByTrack(c.rs));
  return [
    `| Condição | ${cols.map((c) => c.name).join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    ...TRACKS.map((t) => `| ${LABEL[t]} | ${w.map((x) => fmtRate(x[t]!)).join(' | ')} |`),
    `| Duração média (rodadas) | ${cols.map((c) => fmtMean(duration(c.rs))).join(' | ')} |`,
  ].join('\n');
}

// ── Experimentos ─────────────────────────────────────────────────────────────

const md: string[] = [];
const started = Date.now();

// 1. Base + trajetórias
const base = await run('base', BASE);
md.push(
  '## Base (referência)',
  '',
  'Seeds 1–200, 4 jogadores, Economia + Cartas, IA Normal com rotas sorteadas. Código atual',
  '(depois da Fase 6: a IA ganhou risco de hazard e Escavar, que só valem com eventos/hexes',
  'especiais — desligados aqui).',
  '',
  tracksTable([{ name: 'Base', rs: base }]),
  '',
  `Vitórias por assento: ${[0, 1, 2, 3]
    .map((i) => `${i}: ${fmtRate(wilson(base.filter((r) => r.winners.includes(i)).length, base.length))}`)
    .join(' · ')}`,
  '',
  '## 1. Trajetórias por rota perseguida',
  '',
  'Mediana por rodada entre os assentos que perseguiam a rota e ainda estavam em jogo (n).',
  '"Líquido" = produzido − gasto do recurso na rodada (construir, melhorar, cartas, manutenção);',
  '"Comprado" = recebido da banca. As partidas acabam por volta da rodada 9: depois disso n cai',
  'e a mediana passa a ser das partidas mais longas (viés de sobrevivência).',
  '',
  trajectoryMarkdown(trajectoryTable(base), LABEL),
);

// 2. Investidor
const inv = await run('investor', {
  ...BASE,
  levels: ['investor', 'normal', 'normal', 'normal'],
  rotate: true,
});
const invSeats = inv.flatMap((r) => r.seats.filter((s) => s.level === 'investor').map((s) => ({ r, s })));
const normSeats = inv.flatMap((r) => r.seats.filter((s) => s.level === 'normal').map((s) => ({ r, s })));
const invWins = invSeats.filter(({ s }) => s.won).length;
const normWins = normSeats.filter(({ s }) => s.won).length;
const reach = (f: (x: (typeof invSeats)[number]) => boolean, list: typeof invSeats) =>
  wilson(list.filter(f).length, list.length);
md.push(
  '## 2. Experimento Investidor',
  '',
  'Bot `investor` = Normal + bônus de avaliação por Universidade (até nível 2) até a rodada 4 e',
  'por ter Mina até a rodada 5 (pesos em src/ai/weights.ts); valoriza sítios de Mina nesse',
  'período. 1 investor + 3 normais, o investor gira de assento (50 partidas em cada).',
  '',
  '| Métrica | Investor | Normais (por assento) |',
  '|---|---|---|',
  `| Taxa de vitória | **${fmtRate(wilson(invWins, invSeats.length))}** | ${fmtRate(wilson(normWins, normSeats.length))} |`,
  `| Universidade 2 até a rodada 4 | ${fmtRate(reach(({ s }) => s.uni2Round !== null && s.uni2Round <= 4, invSeats))} | ${fmtRate(reach(({ s }) => s.uni2Round !== null && s.uni2Round <= 4, normSeats))} |`,
  `| Mina até a rodada 5 | ${fmtRate(reach(({ s }) => s.mineRound !== null && s.mineRound <= 5, invSeats))} | ${fmtRate(reach(({ s }) => s.mineRound !== null && s.mineRound <= 5, normSeats))} |`,
  `| Alguma Mina na partida | ${fmtRate(reach(({ s }) => s.minesBuilt > 0, invSeats))} | ${fmtRate(reach(({ s }) => s.minesBuilt > 0, normSeats))} |`,
  `| Minas construídas (média) | ${fmtMean(meanCI(invSeats.map(({ s }) => s.minesBuilt)))} | ${fmtMean(meanCI(normSeats.map(({ s }) => s.minesBuilt)))} |`,
  '',
  `Parte justa com 4 jogadores = 25%. Por assento do investor: ${[0, 1, 2, 3]
    .map((i) => {
      const l = invSeats.filter(({ s }) => s.seat === i);
      return `${i}: ${fmtRate(wilson(l.filter(({ s }) => s.won).length, l.length))}`;
    })
    .join(' · ')}.`,
  '',
  `Vitórias do investor por condição: ${TRACKS.filter((t) => t !== 'roundLimit')
    .map((t) => {
      const k = invSeats.filter(
        ({ s, r }) => s.won && r.endReason === 'condition' && s.met.includes(t),
      ).length;
      return k ? `${LABEL[t]} ${k}` : null;
    })
    .filter(Boolean)
    .join(' · ')}.`,
  '',
);

// 3. A/B da Mina
const mineAB = await run('mine-rarity-1', {
  ...BASE,
  override: { 'structures.json': { mine: { rarity: 1 } } },
});
const ab = (f: (rs: readonly GameRecord[]) => ReturnType<typeof meanCI>) =>
  `${fmtMean(f(base))} | ${fmtMean(f(mineAB))}`;
md.push(
  '## 3. A/B da Mina (override `structures.json → mine.rarity = 1`)',
  '',
  'Mina sem exigir Universidade 2. Mesmas seeds da base (pareado).',
  '',
  tracksTable([
    { name: 'Base (rarity 2)', rs: base },
    { name: 'Mina rarity 1', rs: mineAB },
  ]),
  '',
  '| Métrica (IC 95%) | Base | Mina rarity 1 |',
  '|---|---|---|',
  `| Minas construídas por jogador | ${ab((rs) => perSeat(rs, (s) => s.minesBuilt))} |`,
  `| Jogadores com alguma Mina | ${fmtRate(wilson(base.flatMap((r) => r.seats).filter((s) => s.minesBuilt > 0).length, base.length * 4))} | ${fmtRate(wilson(mineAB.flatMap((r) => r.seats).filter((s) => s.minesBuilt > 0).length, mineAB.length * 4))} |`,
  `| Petróleo produzido por partida | ${ab((rs) => perGame(rs, (r) => r.seats.reduce((a, s) => a + s.produced.oil, 0)))} |`,
  `| Ouro produzido por partida | ${ab((rs) => perGame(rs, (r) => r.seats.reduce((a, s) => a + s.produced.gold, 0)))} |`,
  `| Carvão consumido por partida (manutenção) | ${ab((rs) => perGame(rs, (r) => r.seats.reduce((a, s) => a + s.coalUpkeep, 0)))} |`,
  `| Carvão consumido por partida (manutenção + gasto) | ${ab((rs) => perGame(rs, (r) => r.seats.reduce((a, s) => a + s.coalUpkeep + s.coalSpent, 0)))} |`,
  `| Duração (rodadas) | ${ab(duration)} |`,
  '',
);

// 4. Calibração
md.push(
  '## 4. Calibração de limiares',
  '',
  'Para cada T: simula até a rodada T sem vitória antecipada (variante de laboratório',
  '`playToRoundLimit`, `turn.roundLimit = T` por override), mede a mediana do estoque na rodada T',
  'dos bots que perseguem cada recurso e propõe esse valor (inteiro, mínimo 1) como limiar.',
  'Itera 3 vezes: limiar usado → mediana medida → limiar proposto. Expansão não é recalibrada.',
  '**Nada aplicado ao balance.json.**',
  '',
);
const calibration: Record<string, unknown> = {};
for (const T of [10, 12, 15]) {
  let thresholds: Record<string, number> = { ...baseThresholds };
  const tables: { used: Record<string, number>; measured: Record<string, { median: number; n: number }> }[] =
    [];
  for (let it = 1; it <= 3; it++) {
    const rs = await run(`calib-T${T}-it${it}`, {
      ...BASE,
      playToRoundLimit: true,
      override: { 'balance.json': { turn: { roundLimit: T }, victory: { resourceThresholds: thresholds } } },
    });
    const measured = stockAtRound(rs, T);
    tables.push({ used: { ...thresholds }, measured });
    thresholds = Object.fromEntries(
      RESOURCE_IDS.map((id) => [id, Math.max(1, Math.round(measured[id]?.median ?? thresholds[id] ?? 1))]),
    );
  }
  // Validação: os limiares propostos na 3ª iteração, partida normal (vitória antecipada, limite 15).
  const valid = await run(`calib-T${T}-validation`, {
    ...BASE,
    override: { 'balance.json': { victory: { resourceThresholds: thresholds } } },
  });
  calibration[`T${T}`] = { tables, proposal: thresholds };
  md.push(
    `### T = ${T}`,
    '',
    `| Recurso | Base | It. 1: mediana (n) → proposta | It. 2: mediana (n) → proposta | It. 3: mediana (n) → proposta |`,
    '|---|---|---|---|---|',
    ...RESOURCE_IDS.map((id) => {
      const cells = tables.map((t, i) => {
        const next = tables[i + 1]?.used[id] ?? thresholds[id];
        const m = t.measured[id];
        return `${Number.isNaN(m?.median) ? '—' : m?.median} (${m?.n ?? 0}) → **${next}**`;
      });
      return `| ${LABEL[id]} | ${baseThresholds[id]} | ${cells.join(' | ')} |`;
    }),
    '',
    `Variação entre a 2ª e a 3ª proposta: ${RESOURCE_IDS.map((id) => {
      const a = tables[2]?.used[id] ?? 0;
      const b = thresholds[id] ?? 0;
      return `${LABEL[id]} ${b - a >= 0 ? '+' : ''}${b - a} (${a ? (((b - a) / a) * 100).toFixed(0) : '—'}%)`;
    }).join(' · ')}.`,
    '',
    `Validação (limiares da 3ª proposta, partida normal até 15 rodadas):`,
    '',
    tracksTable([
      { name: 'Base', rs: base },
      { name: `Proposta T=${T}`, rs: valid },
    ]),
    '',
  );
}
writeFileSync(join(OUT, 'calibration.json'), JSON.stringify(calibration, null, 2) + '\n');

const header = [
  '# PROJETO 3077 — Experimentos de balanceamento',
  '',
  '> Gerado por `npm run sim:experiments` (scripts/experiments.ts). Todas as taxas com intervalo',
  '> de confiança de 95% (Wilson para proporções; média ± 1,96·dp/√n para médias). Seeds 1–200',
  '> em todos os lotes. `data/balance.json` não foi alterado: variações por override',
  '> (simulations/experiments/*/config.json).',
  `> Tempo total: ${((Date.now() - started) / 60000).toFixed(1)} min.`,
  '',
  reading(),
  '',
];
writeFileSync(DOC, header.join('\n') + md.join('\n') + '\n');
log(`relatório em ${DOC}`);
