/**
 * Lote de simulação: configuração, contexto (com balance.json editado pelo Laboratório)
 * e a fatia de seeds que um worker roda. Puro e sem APIs de Node ou de navegador.
 */
import type { AiLevel } from '../ai';
import { RAW_DATA } from '../data';
import type { GameData } from '../data/schemas';
import { formatIssue, validateGameData } from '../data/validate';
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
export const SIM_LAYERS: readonly LayerName[] = ['cards', 'events', 'specialHexes'];

/** Dados validados com o balance.json trocado; lança com a lista de erros. */
export function simData(balance?: unknown): GameData {
  const raw = balance === undefined ? RAW_DATA : { ...RAW_DATA, 'balance.json': balance };
  const { data, issues } = validateGameData(raw);
  if (!data) {
    const errors = issues.filter((i) => i.severity === 'error').map(formatIssue);
    throw new Error(`balance inválido:\n${errors.join('\n')}`);
  }
  return data;
}

export function simContext(config: SimConfig, data: GameData = simData(config.balance)): EngineContext {
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
    const r = playSimGame(ctx, {
      seed,
      levels: config.levels,
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
