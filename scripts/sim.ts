/**
 * npm run sim -- --games 200 --players 4 --seed 1 [--level normal|easy|hard|easy,normal,hard,normal]
 *               [--layers cards,specialHexes | --layers none] [--long] [--balance arquivo.json]
 *               [--style mixed|balanced] [--override patch.json] [--rotate] [--play-to-limit]
 *               [--workers N] [--out sim-out]
 * --override: patches em qualquer data/*.json (ex.: {"structures.json":{"mine":{"rarity":1}}}).
 * --balance: arquivo de override (balance/overrides/*.json). Com chaves "*.json" é um patch de
 *   vários arquivos (como --override); senão é um patch (parcial ou completo) do balance.json.
 *   data/ nunca muda.
 * --rotate: o primeiro nível gira de assento a cada partida (ex.: --level investor,normal,normal,normal).
 * --play-to-limit: laboratório — ninguém vence antes do limite de rodadas (calibração).
 * Roda N partidas IA × IA sem renderização, com seeds sequenciais, em paralelo
 * (worker_threads). Grava games.csv, cards.csv e summary.json/.txt em --out e mostra o
 * resumo no terminal (UX_SPEC 2.18, PROMPTS Fase 5).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isAiLevel, type AiLevel } from '../src/ai/types';
import { cardsCsv, gamesCsv, summarize, summaryText } from '../src/sim/report';
import { trajectoryCsv, trajectoryTable } from '../src/sim/trajectory';
import { defaultWorkers, runBatch } from './sim-lib';
import { DEFAULT_SIM, deckCardIds, SIM_LAYERS, simData, type SimConfig } from '../src/sim/run';
import type { LayerName } from '../src/engine/state';

function fail(msg: string): never {
  console.error(`sim: ${msg}`);
  process.exit(1);
}

function style(v: string | undefined): SimConfig['style'] {
  if (v === undefined || v === 'mixed' || v === 'balanced') return v ?? 'mixed';
  return fail('--style aceita mixed (cada assento persegue uma rota sorteada) ou balanced');
}

function parseArgs(argv: readonly string[]): { config: SimConfig; workers: number; out: string } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) fail(`argumento inesperado: ${a}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args.set(a.slice(2), 'true');
    else {
      args.set(a.slice(2), next);
      i++;
    }
  }
  const int = (k: string, def: number, min: number) => {
    const v = args.get(k);
    if (v === undefined) return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) fail(`--${k} precisa ser inteiro ≥ ${min}`);
    return n;
  };
  const levels = (args.get('level') ?? 'normal').split(',').map((l) => l.trim());
  if (!levels.every(isAiLevel)) fail('--level aceita easy, normal, hard (ou lista por assento)');
  const layersArg = args.get('layers') ?? 'cards';
  const layers: Partial<Record<LayerName, boolean>> = {};
  if (layersArg !== 'none') {
    for (const l of layersArg.split(',')) {
      if (!(SIM_LAYERS as readonly string[]).includes(l))
        fail(`camada desconhecida ou ainda sem regra: ${l} (use ${SIM_LAYERS.join(', ')})`);
      layers[l as LayerName] = true;
    }
  }
  const players = int('players', DEFAULT_SIM.players, 3);
  if (players > 6) fail('--players vai de 3 a 6');
  const read = (p: string) => JSON.parse(readFileSync(resolve(p), 'utf8')) as Record<string, unknown>;
  const balancePath = args.get('balance');
  const overridePath = args.get('override');
  const fromBalance = balancePath ? read(balancePath) : undefined;
  const multiFile = (o: Record<string, unknown>) => Object.keys(o).some((k) => k.endsWith('.json'));
  const asOverride = fromBalance
    ? multiFile(fromBalance)
      ? fromBalance
      : { 'balance.json': fromBalance }
    : undefined;
  const merged = { ...(asOverride ?? {}), ...(overridePath ? read(overridePath) : {}) };
  const override = Object.keys(merged).length ? merged : undefined;
  const balance = undefined;
  return {
    config: {
      games: int('games', DEFAULT_SIM.games, 1),
      players,
      seed: int('seed', DEFAULT_SIM.seed, 0),
      levels: levels as AiLevel[],
      layers,
      longMap: args.has('long'),
      style: style(args.get('style')),
      ...(balance === undefined ? {} : { balance }),
      ...(override === undefined ? {} : { override }),
      ...(args.has('rotate') ? { rotate: true } : {}),
      ...(args.has('play-to-limit') ? { playToRoundLimit: true } : {}),
    },
    workers: int('workers', defaultWorkers(), 1),
    out: args.get('out') ?? 'sim-out',
  };
}

const { config, workers, out } = parseArgs(process.argv.slice(2));
const data = simData(config.balance, config.override); // falha cedo com dado inválido

const progress = (done: number) => {
  if (!process.stdout.isTTY) return;
  const width = 30;
  const fill = Math.round((done / config.games) * width);
  process.stdout.write(`\r[${'#'.repeat(fill)}${'.'.repeat(width - fill)}] ${done}/${config.games}`);
};

const { records, wallMs: wall, workers: used } = await runBatch(config, workers, progress);
if (process.stdout.isTTY) process.stdout.write('\n');
const summary = summarize(records, deckCardIds(data, config.layers));
const header =
  `Simulação: ${config.games} partidas · ${config.players} jogadores · seeds ${config.seed}–${config.seed + config.games - 1}` +
  ` · IA ${config.levels.join(',')} (${config.style === 'mixed' ? 'rotas sorteadas' : 'sem foco'}) · camadas: economia${Object.keys(config.layers).length ? ', ' + Object.keys(config.layers).join(', ') : ''}` +
  `${config.longMap ? ' · mapa longo' : ''}${config.balance ? ' · balance alternativo' : ''}` +
  `${config.override ? ' · override' : ''}${config.rotate ? ' · níveis em rodízio' : ''}` +
  `${config.playToRoundLimit ? ' · até o limite de rodadas' : ''}\n` +
  `Tempo real: ${(wall / 1000).toFixed(1)} s com ${used} workers`;
const text = summaryText(summary, header);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'games.csv'), gamesCsv(records));
writeFileSync(join(out, 'cards.csv'), cardsCsv(summary));
writeFileSync(join(out, 'summary.json'), JSON.stringify({ config, wallMs: wall, summary }, null, 2));
writeFileSync(join(out, 'summary.txt'), text + '\n');
writeFileSync(join(out, 'trajectories.csv'), trajectoryCsv(trajectoryTable(records)));
console.log(text);
console.log(`\nRelatório em ${out}/ (games.csv, cards.csv, trajectories.csv, summary.json, summary.txt)`);
