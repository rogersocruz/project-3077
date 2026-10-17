/**
 * Construção, melhoria, alcance e sondagem (GDD 6.3, 6.5, 6.6, 11).
 * Cada função de verificação devolve o motivo da ilegalidade ou null.
 */
import { RESOURCE_IDS } from '../../data/schemas';
import type { EngineContext, StructureDef } from '../context';
import type { GameEvent } from '../events';
import {
  canAfford,
  findStructure,
  getHex,
  getPlayer,
  hexKeyOf,
  levelDef,
  maxLevelOf,
  ownedStructures,
  type ResourceAmounts,
  sameBoardNeighbors,
  slotsUsed,
  villageLevel,
} from '../queries';
import type { Reason } from '../reasons';
import type { GameState, HexKey, HexState, PlayerId } from '../state';
import { until } from './hazards';
import { permanentsWith, sumParam } from './permanents';
import { mineDiscountAt } from './specials';

const SURVEYED_SUBSOIL = 'surveyedSubsoil';

// ── Alcance ──────────────────────────────────────────────────────────────────

export interface RangeSource {
  readonly hex: HexState;
  readonly range: number;
}

/**
 * GDD 6.5: origens de alcance do jogador — Centro da Vila e Postos. Posto em terreno
 * com rangeBonus.outpost (Montanha) usa o maior entre o raio do nível e o bônus.
 * Permanentes somam: Rede de Sensores (Postos) e Lente Ancestral (Postos e Vila).
 */
export function rangeSources(ctx: EngineContext, state: GameState, player: PlayerId): RangeSource[] {
  const outpostBonus = sumParam(permanentsWith(ctx, state, player, 'outpostRangeBonus'), 'amount');
  const allBonus = sumParam(permanentsWith(ctx, state, player, 'rangeBonusAll'), 'amount');
  const out: RangeSource[] = [];
  for (const { hex, structure } of ownedStructures(state, player)) {
    const range = levelDef(ctx, structure).range;
    if (range === undefined) continue;
    let r = range;
    if (structure.type === 'outpost') {
      const terrain = ctx.terrain(hex.surface);
      const bonus = terrain.kind === 'surface' ? terrain.def.rangeBonus?.['outpost'] : undefined;
      if (bonus !== undefined) r = Math.max(r, bonus);
      r += outpostBonus;
    }
    out.push({ hex, range: r + allBonus });
  }
  return out;
}

export interface RangeOptions {
  /** Drone (GDD 6.5): soma ao raio de qualquer origem. */
  readonly bonus?: number;
  /** Drone com Sondar alcança outro tabuleiro (texto da carta). */
  readonly crossBorder?: boolean;
}

/** GDD 6.5: hex dentro do raio; o raio não atravessa fronteira (range.buildAcrossBorder). */
export function inRange(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  target: HexState,
  opts: RangeOptions = {},
): boolean {
  if (
    !opts.crossBorder &&
    !ctx.balance.range.buildAcrossBorder &&
    target.boardId !== getPlayer(state, player).boardId
  )
    return false;
  const bonus = opts.bonus ?? 0;
  return rangeSources(ctx, state, player).some((s) => ctx.planet.distance(s.hex, target) <= s.range + bonus);
}

// ── Desbloqueios ─────────────────────────────────────────────────────────────

/** GDD 11: r1 desde o início; rN exige Universidade nível N. (Ruína para r3: Fase 6.) */
export function rarityUnlocked(state: GameState, player: PlayerId, rarity: number): boolean {
  return rarity <= 1 || maxLevelOf(state, player, 'university') >= rarity;
}

/** GDD 6.3 Melhorar: nível máximo que as Oficinas do jogador liberam (1 sem Oficina). */
export function workshopUnlock(ctx: EngineContext, state: GameState, player: PlayerId): number {
  let best = 1;
  for (const { structure } of ownedStructures(state, player, 'workshop')) {
    const levels = ctx.structure('workshop').levels.slice(0, structure.level);
    for (const l of levels) best = Math.max(best, l.unlocksUpgradeTo ?? 0);
    // Oficina no topo libera ao menos o próprio nível.
    best = Math.max(best, structure.level);
  }
  return best;
}

/** Desconto de melhoria da Oficina (structures.json → upgradeDiscount). */
export function workshopDiscount(ctx: EngineContext, state: GameState, player: PlayerId): number {
  let best = 0;
  for (const { structure } of ownedStructures(state, player, 'workshop')) {
    best = Math.max(best, levelDef(ctx, structure).upgradeDiscount ?? 0);
  }
  return best;
}

/**
 * Aplica o desconto de melhoria: tira `discount` unidades do recurso de maior valor
 * presente no custo (interpretação I da Fase 1).
 */
export function applyUpgradeDiscount(
  ctx: EngineContext,
  cost: ResourceAmounts,
  discount: number,
): ResourceAmounts {
  const out: ResourceAmounts = { ...cost };
  let left = discount;
  while (left > 0) {
    const present = RESOURCE_IDS.filter((id) => (out[id] ?? 0) > 0);
    if (present.length === 0) break;
    const top = present.reduce((a, b) => (ctx.resourceValue(b) >= ctx.resourceValue(a) ? b : a));
    out[top] = (out[top] ?? 0) - 1;
    left--;
  }
  return out;
}

export function outpostLimit(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const level = villageLevel(state, player);
  if (level === 0) return 0;
  return levelDef(ctx, { type: 'village', level }).outpostLimit ?? 0;
}

// ── Construir ────────────────────────────────────────────────────────────────

function terrainAllows(
  ctx: EngineContext,
  def: StructureDef,
  hex: HexState,
  player: PlayerId,
): Reason | null {
  if (!def.buildOn) return null;
  if (def.buildOn.includes(SURVEYED_SUBSOIL)) {
    if (!hex.surveyedBy.includes(player)) return { key: 'subsoilNotSurveyed' };
    if (hex.depleted) return { key: 'subsoilDepleted' };
    if (hex.seal) return { key: 'subsoilSealed' };
    if (ctx.subsoil(hex.subsoil).resource === null) return { key: 'subsoilEmpty' };
    return null;
  }
  return def.buildOn.includes(hex.surface) ? null : { key: 'wrongTerrain', params: { structure: def.id } };
}

/**
 * Custo de construir; Contrato de Obra paga metade de cada recurso, para cima
 * (interpretação AH). `discount` (Crosta Fina) sai antes da metade, sem passar de 0.
 */
export function buildCost(
  ctx: EngineContext,
  structure: string,
  half = false,
  discount: ResourceAmounts = {},
): ResourceAmounts {
  const base = ctx.structure(structure).levels[0]?.cost ?? {};
  const out: ResourceAmounts = {};
  for (const id of RESOURCE_IDS) {
    const n = Math.max(0, (base[id] ?? 0) - (discount[id] ?? 0));
    if (n) out[id] = half ? Math.ceil(n / 2) : n;
  }
  return out;
}

/** Custo de construir no hex (desconto da Mina na Crosta Fina). */
export function buildCostAt(
  ctx: EngineContext,
  state: GameState,
  structure: string,
  key: HexKey,
  half = false,
): ResourceAmounts {
  const discount = structure === 'mine' ? mineDiscountAt(ctx, state, getHex(state, key)) : {};
  return buildCost(ctx, structure, half, discount);
}

/** Cartas jogadas junto com Construir. */
export interface BuildModifiers {
  /** Bônus de raio do Drone. */
  readonly droneBonus?: number;
  /** Contrato de Obra. */
  readonly halfCost?: boolean;
}

/** GDD 6.3 Construir + 6.5 + 6.6 + 11. */
export function checkBuild(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  structure: string,
  key: HexKey,
  mods: BuildModifiers = {},
): Reason | null {
  const def = ctx.data.structures.find((s) => s.id === structure);
  if (!def || def.buildable === false) return { key: 'notBuildable', params: { structure } };
  const hex = getHex(state, key);
  if (!hex) return { key: 'noSuchHex' };
  if (!hex.revealed) return { key: 'hexHidden' };
  if (hex.guardian !== null) return { key: 'guardianBlocks' };
  if (structure === 'mine' && until(state, hex.status.sealedUntil)) return { key: 'subsoilSealed' };
  if (!rarityUnlocked(state, player, def.rarity)) {
    return { key: 'rarityLocked', params: { structure, university: def.rarity } };
  }
  if (!inRange(ctx, state, player, hex, { bonus: mods.droneBonus ?? 0 })) return { key: 'outOfRange' };
  const terrain = terrainAllows(ctx, def, hex, player);
  if (terrain) return terrain;
  if (hex.structures.some((s) => s.type === structure))
    return { key: 'duplicateInHex', params: { structure } };
  if (slotsUsed(ctx, hex) + def.slots > ctx.balance.hex.slots)
    return { key: 'hexFull', params: { slots: ctx.balance.hex.slots } };
  if (
    structure === 'outpost' &&
    ownedStructures(state, player, 'outpost').length >= outpostLimit(ctx, state, player)
  ) {
    return { key: 'outpostLimit', params: { limit: outpostLimit(ctx, state, player) } };
  }
  if (!canAfford(getPlayer(state, player).resources, buildCostAt(ctx, state, structure, key, mods.halfCost)))
    return { key: 'cannotAfford' };
  return null;
}

// ── Melhorar ─────────────────────────────────────────────────────────────────

export function upgradeCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  uid: number,
): ResourceAmounts {
  const placed = ownedStructures(state, player).find((p) => p.structure.uid === uid);
  if (!placed) return {};
  const next = ctx.structure(placed.structure.type).levels[placed.structure.level];
  if (!next) return {};
  return applyUpgradeDiscount(ctx, next.cost, workshopDiscount(ctx, state, player));
}

/**
 * GDD 6.3 Melhorar: exige Oficina para os níveis 2 e 3. `free` (Pesquisa Avançada)
 * dispensa só o custo; a Oficina continua exigida (interpretação AD).
 */
export function checkUpgrade(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  uid: number,
  free = false,
): Reason | null {
  const placed = ownedStructures(state, player).find((p) => p.structure.uid === uid);
  if (!placed) return { key: 'notYourStructure' };
  const def = ctx.structure(placed.structure.type);
  const target = placed.structure.level + 1;
  if (target > def.levels.length) return { key: 'maxLevel' };
  if (target >= 2 && workshopUnlock(ctx, state, player) < target) {
    return { key: 'needsWorkshop', params: { level: target } };
  }
  if (!free && !canAfford(getPlayer(state, player).resources, upgradeCost(ctx, state, player, uid))) {
    return { key: 'cannotAfford' };
  }
  return null;
}

/** Mutável: sobe 1 nível (custo já pago). Vila regenera vida (GDD 13.2). */
export function raiseLevel(ctx: EngineContext, state: GameState, uid: number, events: GameEvent[]): void {
  const placed = findStructure(state, uid);
  if (!placed) return;
  const player = placed.structure.owner;
  placed.structure.level += 1;
  events.push({ type: 'structureUpgraded', player, uid, level: placed.structure.level });
  if (placed.structure.type === 'village') {
    const p = getPlayer(state, player);
    // GDD 13.2: upgrade de Vila regenera vidas, sem passar do máximo.
    p.villageLives = Math.min(
      ctx.balance.village.lives,
      p.villageLives + ctx.balance.village.regenPerLevelUp,
    );
    events.push({ type: 'villageHealed', player, lives: p.villageLives });
  }
}

// ── Explorar e Sondar ────────────────────────────────────────────────────────

/** GDD 6.3 Explorar: hex oculto do próprio tabuleiro, vizinho de um hex revelado dele. */
export function checkExplore(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  key: HexKey,
): Reason | null {
  const hex = getHex(state, key);
  if (!hex) return { key: 'noSuchHex' };
  if (hex.boardId !== getPlayer(state, player).boardId) return { key: 'notOwnBoard' };
  if (hex.revealed) return { key: 'alreadyRevealed' };
  const touches = sameBoardNeighbors(ctx, hex).some((n) => state.hexes[n]?.revealed);
  return touches ? null : { key: 'notAdjacentToRevealed' };
}

/**
 * GDD 6.3 Sondar: subsolo de 1 hex dentro do raio (não precisa estar revelado). Com
 * Drone, o raio cresce e pode atingir outro tabuleiro (texto da carta).
 */
export function checkSurvey(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  key: HexKey,
  droneBonus?: number,
): Reason | null {
  const hex = getHex(state, key);
  if (!hex) return { key: 'noSuchHex' };
  const opts = droneBonus === undefined ? {} : { bonus: droneBonus, crossBorder: true };
  if (!inRange(ctx, state, player, hex, opts)) return { key: 'outOfRange' };
  if (hex.surveyedBy.includes(player)) return { key: 'alreadySurveyed' };
  return null;
}

/** Hexes do tabuleiro do jogador (candidatos para enumerar ações). */
export function ownBoardHexes(ctx: EngineContext, state: GameState, player: PlayerId): HexKey[] {
  const board = getPlayer(state, player).boardId;
  return ctx.planet.hexes.filter((h) => h.boardId === board).map(hexKeyOf);
}
