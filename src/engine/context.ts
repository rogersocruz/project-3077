/**
 * Contexto imutável do motor: dados validados + geometria do planeta + índices.
 * Montado uma vez por partida e passado a toda função de regra; o estado da partida
 * (state.ts) fica só com o que muda.
 */
import type { GameData } from '../data/schemas';
import { assertEffects } from './effects/registry';
import { type Axial, buildPlanet, type Planet } from './hex';

export type Balance = GameData['balance'];
export type SurfaceDef = GameData['tiles']['surface'][number];
export type SiteDef = GameData['tiles']['sites'][number];
export type HazardDef = GameData['tiles']['hazards'][number];
export type SubsoilDef = GameData['tiles']['subsoil'][number];
export type StructureDef = GameData['structures'][number];
export type StructureLevelDef = StructureDef['levels'][number];
export type CardDef = GameData['cards'][number];

/** Tudo que pode estar na face de um tile: terreno comum, sítio ou hazard. */
export type TerrainDef =
  | { readonly kind: 'surface'; readonly def: SurfaceDef }
  | { readonly kind: 'site'; readonly def: SiteDef }
  | { readonly kind: 'hazard'; readonly def: HazardDef };

export interface EngineContext {
  readonly data: GameData;
  readonly balance: Balance;
  readonly planet: Planet;
  readonly playerCount: number;
  terrain(id: string): TerrainDef;
  subsoil(id: string): SubsoilDef;
  structure(id: string): StructureDef;
  card(id: string): CardDef;
  resourceValue(id: string): number;
}

export function createContext(data: GameData, playerCount: number, longMap = false): EngineContext {
  const layout: readonly Axial[] | undefined = data.layouts.layouts[String(playerCount)];
  if (!layout) throw new RangeError(`sem layout de roseta para ${playerCount} jogadores`);
  // CLAUDE.md regra 6: effectId desconhecido falha na carga, não no meio da partida.
  assertEffects(data);
  const edge = longMap ? data.balance.map.edgeLong : data.balance.map.edge;

  const terrain = new Map<string, TerrainDef>();
  for (const def of data.tiles.surface) terrain.set(def.id, { kind: 'surface', def });
  for (const def of data.tiles.sites) terrain.set(def.id, { kind: 'site', def });
  for (const def of data.tiles.hazards) terrain.set(def.id, { kind: 'hazard', def });
  const subsoil = new Map(data.tiles.subsoil.map((s) => [s.id, s]));
  const structures = new Map(data.structures.map((s) => [s.id, s]));
  const cards = new Map(data.cards.map((c) => [c.id, c]));
  const values = new Map(data.resources.map((r) => [r.id as string, r.value]));

  const get = <T>(map: Map<string, T>, id: string, what: string): T => {
    const v = map.get(id);
    if (v === undefined) throw new Error(`${what} desconhecido: ${id}`);
    return v;
  };

  return {
    data,
    balance: data.balance,
    planet: buildPlanet(edge, layout),
    playerCount,
    terrain: (id) => get(terrain, id, 'terreno'),
    subsoil: (id) => get(subsoil, id, 'subsolo'),
    structure: (id) => get(structures, id, 'estrutura'),
    card: (id) => get(cards, id, 'carta'),
    resourceValue: (id) => get(values, id, 'recurso'),
  };
}
