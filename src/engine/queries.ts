/**
 * Consultas e utilitários sobre o estado, usados por regras, legal.ts e reducer.
 * Nada aqui altera o estado, exceto os helpers de recurso marcados como mutáveis
 * (chamados só pelo reducer sobre a cópia de trabalho).
 */
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import type { EngineContext, StructureLevelDef } from './context';
import { type BoardHex, boardHexKey } from './hex';
import type { GameState, HexKey, HexState, PlayerId, PlayerState, Resources, StructureState } from './state';

export type ResourceAmounts = Partial<Resources>;

export const emptyResources = (): Resources => ({ food: 0, stone: 0, iron: 0, coal: 0, oil: 0, gold: 0 });

export function isResourceId(id: string): id is ResourceId {
  return (RESOURCE_IDS as readonly string[]).includes(id);
}

/** Quantidades válidas: chaves de recurso conhecidas, inteiros ≥ 0. */
export function isValidAmounts(amounts: Record<string, unknown>): amounts is ResourceAmounts {
  return Object.entries(amounts).every(
    ([k, v]) => isResourceId(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0,
  );
}

export function amountTotal(amounts: ResourceAmounts): number {
  return RESOURCE_IDS.reduce((sum, id) => sum + (amounts[id] ?? 0), 0);
}

export function canAfford(have: Resources, cost: ResourceAmounts): boolean {
  return RESOURCE_IDS.every((id) => have[id] >= (cost[id] ?? 0));
}

/** O que falta para pagar `cost` (vazio se dá para pagar). UX_SPEC 7.3: "Falta 1 Ferro". */
export function deficit(have: Resources, cost: ResourceAmounts): ResourceAmounts {
  const out: ResourceAmounts = {};
  for (const id of RESOURCE_IDS) {
    const missing = (cost[id] ?? 0) - have[id];
    if (missing > 0) out[id] = missing;
  }
  return out;
}

/** Mutável: debita (assume que canAfford já foi checado). */
export function pay(have: Resources, cost: ResourceAmounts): void {
  for (const id of RESOURCE_IDS) have[id] -= cost[id] ?? 0;
}

/** Mutável: credita. */
export function gain(have: Resources, amounts: ResourceAmounts): void {
  for (const id of RESOURCE_IDS) have[id] += amounts[id] ?? 0;
}

export const hexKeyOf = (h: BoardHex): HexKey => boardHexKey(h);

export function getHex(state: GameState, key: HexKey): HexState | undefined {
  return state.hexes[key];
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
  const p = state.players[id];
  if (!p) throw new RangeError(`jogador inexistente: ${id}`);
  return p;
}

export interface PlacedStructure {
  readonly hex: HexState;
  readonly key: HexKey;
  readonly structure: StructureState;
}

/** Estruturas do jogador, em ordem de construção (uid). */
export function ownedStructures(state: GameState, player: PlayerId, type?: string): PlacedStructure[] {
  const out: PlacedStructure[] = [];
  for (const [key, hex] of Object.entries(state.hexes)) {
    for (const structure of hex.structures) {
      if (structure.owner === player && (type === undefined || structure.type === type)) {
        out.push({ hex, key, structure });
      }
    }
  }
  return out.sort((a, b) => a.structure.uid - b.structure.uid);
}

export function findStructure(state: GameState, uid: number): PlacedStructure | undefined {
  for (const [key, hex] of Object.entries(state.hexes)) {
    const structure = hex.structures.find((s) => s.uid === uid);
    if (structure) return { hex, key, structure };
  }
  return undefined;
}

export function levelDef(ctx: EngineContext, s: Pick<StructureState, 'type' | 'level'>): StructureLevelDef {
  const def = ctx.structure(s.type).levels[s.level - 1];
  if (!def) throw new RangeError(`nível ${s.level} inexistente em ${s.type}`);
  return def;
}

/** Maior nível de um tipo de estrutura que o jogador possui (0 se nenhuma). */
export function maxLevelOf(state: GameState, player: PlayerId, type: string): number {
  return ownedStructures(state, player, type).reduce((m, p) => Math.max(m, p.structure.level), 0);
}

export function villageLevel(state: GameState, player: PlayerId): number {
  return maxLevelOf(state, player, 'village');
}

/** GDD 6.6: espaços ocupados no hex (estruturas; tropas entram na Fase 7). */
export function slotsUsed(ctx: EngineContext, hex: HexState): number {
  return hex.structures.reduce((sum, s) => sum + ctx.structure(s.type).slots, 0);
}

/** Hexes do próprio tabuleiro vizinhos de `key` (GDD 6.3 Explorar: "no próprio tabuleiro"). */
export function sameBoardNeighbors(ctx: EngineContext, hex: HexState): HexKey[] {
  return ctx.planet
    .neighbors(hex)
    .filter((n) => n.boardId === hex.boardId)
    .map(hexKeyOf);
}

/** GDD 3.2 passo 6: hex especial = sítio ou hazard. */
export function isSpecialTerrain(ctx: EngineContext, surface: string): boolean {
  return ctx.terrain(surface).kind !== 'surface';
}
