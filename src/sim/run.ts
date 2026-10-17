/**
 * Lote de simulação: configuração, contexto (com balance.json editado pelo Laboratório)
 * e a fatia de seeds que um worker roda. Puro e sem APIs de Node ou de navegador.
 */
import type { AiLevel } from '../ai';
import { RAW_DATA } from '../data';
import type { GameData } from '../data/schemas';
import { formatIssue, type RawDataFiles, validateGameData } from '../data/validate';
import { createContext, type EngineContext } from '../engine/context';
import { cardEnabled } from '../engine/effects/registry';
import { DEFAULT_LAYERS, type LayerName, type RuleLayers } from '../engine/state';
import { type GameRecord, playSimGame } from './game';

export interface SimConfig {
  readonly games: number;
  readonly players: number;
  /** Seed da primeira partida; as seguintes são seed+1, seed+2… */
  readonly seed: number;
  /** Nível por assento (repete se for mais curto que o número de jogadores). */
  readonly levels: readonly AiLevel[];
  readonly layers: Partial<Record<LayerName, boolean>>;
  readonly longMap: boolean;
  /** 'mixed': cada assento sorteia uma rota de vitória; 'balanced': IA sem foco. */
  readonly style: 'mixed' | 'balanced';
  /** balance.json alternativo (Laboratório / --balance); validado antes de rodar. */
  readonly balance?: unknown;
  /**
   * Patches em qualquer arquivo de dados (--override): { "balance.json": {...},
   * "structures.json": { "mine": { "rarity": 1 } } }. Listas com id recebem o patch por id;
   * objetos são mesclados (listas internas substituídas). Os arquivos originais não mudam.
   */
  readonly override?: Record<string, unknown>;
  /** Gira os níveis por partida: o nível 0 cai no assento (seed − seed inicial) mod jogadores. */
  readonly rotate?: boolean;
  /** Laboratório: sem vitória antes do limite de rodadas (calibração). */
  readonly playToRoundLimit?: boolean;
}

export const DEFAULT_SIM: SimConfig = {
  games: 200,
  players: 4,
  seed: 1,
  levels: ['normal'],
  layers: { cards: true },
  longMap: false,
  style: 'mixed',
};

/** Camadas que a simulação aceita ligar hoje (as outras ainda não têm regra no motor). */
export const SIM_LAYERS: readonly LayerName[] = ['cards', 'events', 'specialHexes', 'conflict', 'treaties'];

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Mescla `patch` sobre `base` (objetos recursivos; o resto substitui). */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(base[k], v);
  return out;
}

/** Aplica um override de dados (ver SimConfig.override); falha com id ou arquivo desconhecido. */
export function applyOverride(
  raw: RawDataFiles,
  override: Record<string, unknown> | undefined,
): RawDataFiles {
  if (!override) return raw;
  const out: Record<string, unknown> = { ...raw };
  for (const [file, patch] of Object.entries(override)) {
    if (!(file in raw)) throw new Error(`override: arquivo desconhecido "${file}"`);
    const base = out[file];
    if (Array.isArray(base) && isObj(patch)) {
      const ids = new Set(base.map((x) => (isObj(x) ? x['id'] : undefined)));
      for (const id of Object.keys(patch))
        if (!ids.has(id)) throw new Error(`override: "${id}" não existe em ${file}`);
      out[file] = base.map((x) =>
        isObj(x) && typeof x['id'] === 'string' && x['id'] in patch ? deepMerge(x, patch[x['id']]) : x,
      );
    } else out[file] = deepMerge(base, patch);
  }
  return out as RawDataFiles;
}

/** Dados validados com o balance.json trocado e/ou override aplicado; lança com os erros. */
export function simData(balance?: unknown, override?: Record<string, unknown>): GameData {
  const raw = applyOverride(
    balance === undefined ? RAW_DATA : { ...RAW_DATA, 'balance.json': balance },
    override,
  );
  const { data, issues } = validateGameData(raw);
  if (!data) {
    const errors = issues.filter((i) => i.severity === 'error').map(formatIssue);
    throw new Error(`balance inválido:\n${errors.join('\n')}`);
  }
  return data;
}

export function simContext(
  config: SimConfig,
  data: GameData = simData(config.balance, config.override),
): EngineContext {
  return createContext(data, config.players, config.longMap);
}

export function seedsOf(config: SimConfig): number[] {
  return Array.from({ length: config.games }, (_, i) => config.seed + i);
}

/** Divide as seeds em `parts` fatias intercaladas (partidas longas se espalham). */
export function splitSeeds(seeds: readonly number[], parts: number): number[][] {
  const out: number[][] = Array.from({ length: Math.max(1, parts) }, () => []);
  seeds.forEach((s, i) => out[i % out.length]!.push(s));
  return out.filter((x) => x.length > 0);
}

export function runSeeds(
  ctx: EngineContext,
  config: SimConfig,
  seeds: readonly number[],
  onGame?: (r: GameRecord) => void,
): GameRecord[] {
  const out: GameRecord[] = [];
  for (const seed of seeds) {
    const shift = config.rotate
      ? (((seed - config.seed) % config.players) + config.players) % config.players
      : 0;
    const levels = Array.from(
      { length: config.players },
      (_, i) =>
        config.levels[
          ((((i - shift) % config.players) + config.players) % config.players) % config.levels.length
        ] ?? 'normal',
    );
    const r = playSimGame(ctx, {
      seed,
      levels,
      ...(config.playToRoundLimit ? { playToRoundLimit: true } : {}),
      layers: config.layers,
      longMap: config.longMap,
      style: config.style,
    });
    out.push(r);
    onGame?.(r);
  }
  return out.sort((a, b) => a.seed - b.seed);
}

/** Cartas que entram no baralho com as camadas da simulação (para "menos jogadas" incluir zeros). */
export function deckCardIds(data: GameData, layers: SimConfig['layers']): string[] {
  const full: RuleLayers = { ...DEFAULT_LAYERS, ...layers, economy: true };
  if (!full.cards) return [];
  return data.cards
    .filter((c) => ['n1', 'n2', 'n3'].includes(c.deck) && cardEnabled(c, full))
    .map((c) => c.id);
}
