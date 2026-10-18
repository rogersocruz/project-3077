/**
 * npm run sim:balance [-- --games 1000 --only baseline-v1,A1]
 *
 * Etapas 0–2 do balanceamento: linha de base (baseline-v1) e as variantes A1, A2, A3, A123 e
 * A123+B1, todas nas MESMAS seeds (1–N), 4 jogadores, IA normal em todos os assentos, todas as
 * camadas, facções sorteadas por partida. Cada variante é um arquivo de override em
 * balance/overrides/*.json (o mesmo formato do `npm run sim -- --balance`); data/ nunca muda.
 *
 * Saída: simulations/balance/<variante>/ (summary.txt, summary.json, games.csv, records.json
 * sem trajetórias) e docs/BALANCEAMENTO.md (tabela única com IC 95% de Wilson e metas).
 * Lotes já rodados são reaproveitados (apague a pasta para refazer).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESOURCE_IDS } from '../src/data/schemas';
import type { GameRecord } from '../src/sim/game';
import { gamesCsv, summarize, summaryText } from '../src/sim/report';
import { DEFAULT_SIM, type SimConfig } from '../src/sim/run';
import { type Interval, meanCI, wilson } from '../src/sim/stats';
import { runBatch } from './sim-lib';

const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'simulations', 'balance');
const DOC = join(ROOT, 'docs', 'BALANCEAMENTO.md');
const OVERRIDES = join(ROOT, 'balance', 'overrides');

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const GAMES = Number(arg('games') ?? 1000);

const VARIANTS: { name: string; label: string; file: string | null }[] = [
  { name: 'baseline-v1', label: 'baseline', file: null },
  { name: 'A1', label: 'A1', file: 'A1.json' },
  { name: 'A2', label: 'A2', file: 'A2.json' },
  { name: 'A3', label: 'A3', file: 'A3.json' },
  { name: 'A123', label: 'A123', file: 'A123.json' },
  { name: 'A123_B1', label: 'A123+B1', file: 'A123_B1.json' },
];
const only = arg('only')?.split(',');

const BASE: SimConfig = {
  ...DEFAULT_SIM,
  games: GAMES,
  players: 4,
  seed: 1,
  levels: ['normal'],
  layers: { cards: true, events: true, specialHexes: true, conflict: true, treaties: true, factions: true },
};

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

function overrideOf(file: string | null): Record<string, unknown> | undefined {
  if (!file) return undefined;
  const raw = JSON.parse(readFileSync(join(OVERRIDES, file), 'utf8')) as Record<string, unknown>;
  return Object.keys(raw).some((k) => k.endsWith('.json')) ? raw : { 'balance.json': raw };
}

async function batch(name: string, file: string | null): Promise<GameRecord[]> {
  const dir = join(OUT, name);
  const cached = join(dir, 'records.json');
  if (existsSync(cached)) {
    const rs = JSON.parse(readFileSync(cached, 'utf8')) as GameRecord[];
    if (rs.length === GAMES) {
      log(`${name}: ${rs.length} partidas reaproveitadas`);
      return rs;
    }
  }
  const override = overrideOf(file);
  const config: SimConfig = { ...BASE, ...(override ? { override } : {}) };
  log(`${name}: ${GAMES} partidas…`);
  const { records, wallMs } = await runBatch(config);
  mkdirSync(dir, { recursive: true });
  const slim = records.map((r) => ({ ...r, seats: r.seats.map((s) => ({ ...s, trajectory: [] })) }));
  const summary = summarize(records);
  writeFileSync(cached, JSON.stringify(slim));
  writeFileSync(join(dir, 'games.csv'), gamesCsv(records));
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ config, summary }, null, 2) + '\n');
  writeFileSync(join(dir, 'summary.txt'), summaryText(summary, `${name} — seeds 1–${GAMES}`) + '\n');
  log(`${name}: ${(wallMs / 1000).toFixed(0)} s`);
  return records;
}

// ── Métricas ─────────────────────────────────────────────────────────────────

type Cell = { readonly i: Interval; readonly kind: 'rate' | 'mean'; readonly bad: boolean };
type Row = { readonly section: string; readonly label: string; readonly cells: Cell[] };

const TRACKS = [...RESOURCE_IDS, 'expansion', 'tribe', 'elimination'] as const;
const LABEL: Record<string, string> = {
  food: 'Comida',
  stone: 'Pedregulho',
  iron: 'Ferro',
  coal: 'Carvão',
  oil: 'Petróleo',
  gold: 'Ouro',
  expansion: 'Expansão',
  tribe: 'Alvo de tribo',
  elimination: 'Eliminação total',
  revolutionaries: 'Revolucionários',
  government: 'Governo Intergaláctico',
  helix: 'Consórcio Helix',
  vantage: 'Vantage Dynamics',
  pirates: 'Piratas da Fenda',
  natives: 'Nativos de Aurum',
};
const FACTIONS = ['revolutionaries', 'government', 'helix', 'vantage', 'pirates', 'natives'];

const rate = (k: number, n: number, bad: (p: number) => boolean): Cell => {
  const i = wilson(k, n);
  return { i, kind: 'rate', bad: bad(i.value) };
};
const mean = (xs: number[], bad: (m: number) => boolean = () => false): Cell => {
  const i = meanCI(xs);
  return { i, kind: 'mean', bad: bad(i.value) };
};

/** Metas da tarefa (fora = vermelho). */
const GOAL = {
  route: (p: number) => p < 0.08 || p > 0.2,
  faction: (p: number) => p < 0.21 || p > 0.29,
  seat: (p: number) => p < 0.22 || p > 0.28,
  roundLimit: (p: number) => p < 0.05 || p > 0.15,
  hazard: (p: number) => p < 0.3 || p > 0.5,
  mines: (m: number) => m < 1,
};

function rows(all: GameRecord[][]): Row[] {
  const out: Row[] = [];
  const add = (section: string, label: string, f: (rs: GameRecord[]) => Cell) =>
    out.push({ section, label, cells: all.map(f) });

  for (const t of TRACKS) {
    // Rotas = condições de vitória por trilha; eliminação total fica fora da meta de rota.
    const isRoute = t !== 'elimination';
    add('Vitórias por condição', LABEL[t] ?? t, (rs) =>
      rate(
        rs.filter((r) => r.endReason === 'condition' && r.winTracks.includes(t)).length,
        rs.length,
        isRoute ? GOAL.route : () => false,
      ),
    );
  }
  for (const f of FACTIONS) {
    add('Vitórias por facção (% das partidas em que jogou)', LABEL[f] ?? f, (rs) => {
      const seats = rs.flatMap((r) => r.seats).filter((s) => s.faction === f);
      return rate(seats.filter((s) => s.won).length, seats.length, GOAL.faction);
    });
  }
  for (let seat = 0; seat < 4; seat++) {
    add('Vitórias por assento (ordem de turno)', `Assento ${seat + 1}`, (rs) =>
      rate(rs.filter((r) => r.winners.includes(seat)).length, rs.length, GOAL.seat),
    );
  }
  add('Duração e limite', 'Duração média (rodadas)', (rs) => mean(rs.map((r) => r.rounds)));
  add('Duração e limite', 'Partidas no limite de rodadas', (rs) =>
    rate(rs.filter((r) => r.endReason === 'roundLimit').length, rs.length, GOAL.roundLimit),
  );
  add('Hazards', 'Hazard atingido (% das partidas, média dos hazards)', (rs) => {
    let games = 0;
    let hit = 0;
    for (const r of rs)
      for (const h of r.hazardsPresent ?? []) {
        games++;
        if ((r.hazardHits?.[h] ?? 0) > 0) hit++;
      }
    return rate(hit, games, GOAL.hazard);
  });
  const perPlayer = (type: string) => (rs: GameRecord[]) =>
    rs.flatMap((r) => r.seats.map((s) => s.structures[type] ?? 0));
  add('Estruturas por jogador (fim da partida)', 'Minas', (rs) => mean(perPlayer('mine')(rs), GOAL.mines));
  add('Estruturas por jogador (fim da partida)', 'Universidades', (rs) => mean(perPlayer('university')(rs)));
  add('Estruturas por jogador (fim da partida)', 'Mercados', (rs) => mean(perPlayer('market')(rs)));
  for (const r of RESOURCE_IDS) {
    add('Comprado na banca por partida (unidades, todos os jogadores)', LABEL[r] ?? r, (rs) =>
      mean(rs.map((g) => g.bankBought?.[r] ?? 0)),
    );
  }
  return out;
}

const pct = (x: number) => (x * 100).toFixed(1).replace('.', ',');
const num = (x: number) => x.toFixed(2).replace('.', ',');
function fmt(c: Cell): string {
  const s =
    c.kind === 'rate'
      ? `${pct(c.i.value)}% [${pct(c.i.lo)}–${pct(c.i.hi)}]`
      : `${num(c.i.value)} [${num(c.i.lo)}–${num(c.i.hi)}]`;
  return c.bad ? `🔴 ${s}` : s;
}

function table(labels: string[], rs: Row[]): string {
  const head = `| Métrica | ${labels.join(' | ')} |\n|---|${labels.map(() => '---').join('|')}|`;
  const lines: string[] = [];
  let section = '';
  for (const r of rs) {
    if (r.section !== section) {
      section = r.section;
      lines.push(`| **${section}** |${labels.map(() => ' ').join('|')}|`);
    }
    lines.push(`| ${r.label} | ${r.cells.map(fmt).join(' | ')} |`);
  }
  return `${head}\n${lines.join('\n')}`;
}

/** Texto escrito à mão entre os marcadores: preservado quando o relatório é regerado. */
function reading(): string {
  try {
    const m = /<!-- LEITURA -->[\s\S]*?<!-- \/LEITURA -->/.exec(readFileSync(DOC, 'utf8'));
    if (m) return m[0];
  } catch {
    // primeiro relatório
  }
  return '<!-- LEITURA -->\n<!-- /LEITURA -->';
}

const chosen = VARIANTS.filter((v) => !only || only.includes(v.name));
const results: GameRecord[][] = [];
for (const v of chosen) results.push(await batch(v.name, v.file));

if (chosen.length === VARIANTS.length) {
  const doc = `# Balanceamento — Etapas 0, 1 e 2

Gerado por \`npm run sim:balance\` (scripts/balance.ts). Seeds 1–${GAMES} em todas as colunas,
4 jogadores, IA normal em todos os assentos (rota sorteada por assento, como nas simulações
anteriores), todas as camadas (cartas, eventos, hexes especiais, conflito, tratados, facções),
facções sorteadas por partida. Taxas com IC 95% de Wilson; médias com IC 95% (1,96·dp/√n).
Variantes = arquivos em \`balance/overrides/\`; \`data/\` não foi alterado.

🔴 = fora da meta: rotas 8–20% (nenhuma > 25%) · facções 25±4% · assentos 25±3% · limite de
rodadas 5–15% · hazard 30–50% · Minas ≥ 1 por jogador.

| Coluna | Override |
|---|---|
| baseline | nenhum (baseline-v1) |
| A1 | banca vende no máx. 2 recursos por turno a cada jogador (\`bank.maxBuyPerTurn: 2\`) |
| A2 | \`structures.mine.rarity = 1\` (Mina sem Universidade 2) |
| A3 | dano de hazard só por eventos nomeados (\`events.hazardTriggers\`) |
| A123 | A1 + A2 + A3 |
| A123+B1 | A123 + Helix só nos 2 primeiros Parques (\`factions.helix.ability.params.maxParks: 2\`) |

${table(
  chosen.map((v) => v.label),
  rows(results),
)}

${reading()}
`;
  writeFileSync(DOC, doc);
  log(`relatório: ${DOC}`);
}
