/**
 * Dados do jogo para o app: importa data/*.json no build e valida na carga.
 * Dado inválido falha aqui, nunca no meio da partida.
 */
import balance from '../../data/balance.json';
import cards from '../../data/cards.json';
import events from '../../data/events.json';
import factions from '../../data/factions.json';
import layouts from '../../data/layouts.json';
import resources from '../../data/resources.json';
import structures from '../../data/structures.json';
import tiles from '../../data/tiles.json';
import treaties from '../../data/treaties.json';
import type { GameData } from './schemas';
import { formatIssue, type RawDataFiles, validateGameData } from './validate';

export const RAW_DATA: RawDataFiles = {
  'balance.json': balance,
  'resources.json': resources,
  'tiles.json': tiles,
  'structures.json': structures,
  'cards.json': cards,
  'events.json': events,
  'factions.json': factions,
  'treaties.json': treaties,
  'layouts.json': layouts,
};

let cached: GameData | null = null;

export function loadGameData(): GameData {
  if (cached) return cached;
  const { data, issues } = validateGameData(RAW_DATA);
  if (!data) {
    const errors = issues.filter((i) => i.severity === 'error').map(formatIssue);
    throw new Error(`Dados inválidos:\n${errors.join('\n')}`);
  }
  cached = data;
  return data;
}

export type { GameData } from './schemas';
