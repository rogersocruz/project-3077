/**
 * Tropas (GDD 8.1–8.3) e fronteira (GDD 5.4): força, teto de exército, recrutar, subir de
 * nível, tarifa declarada, movimento pago em Comida com pedágio por território alheio.
 *
 * Interpretações (Fase 7, isoladas aqui):
 * AR) tarifa inicial = border.defaultTariff; muda uma vez por rodada, no próprio turno;
 * AS) teto de exército = maior nível de Quartel × armyCapPerBarracksLevel (como o Arquivo, AG);
 * AT) toda tropa ocupa 1 espaço (Artilharia também; "não ocupa" = não conta para ocupação);
 *     o limite de 3 conta as estruturas + as tropas de UM jogador (queries.slotsUsed), como no
 *     exemplo do GDD 8.4.1, em que atacante e defensor dividem o hex com o Muro; subir de nível = 1 ação + custo de recrutar, Oficina libera o nível
 *     (decisão do usuário);
 * AU) movimento: o motor escolhe o caminho mais barato em Comida por hexes revelados; não passa
 *     por hex com tropa inimiga ou Guardião (pode parar nele); paga a tarifa do dono a cada
 *     entrada em território alheio, por tropa; o destino precisa de espaço para todas.
 */
import type { ResourceId } from '../../data/schemas';
import type { Action } from '../actions';
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import {
  canAfford,
  gain,
  getHex,
  getPlayer,
  maxLevelOf,
  pay,
  type ResourceAmounts,
  slotsUsed,
} from '../queries';
import type { Reason } from '../reasons';
import type { GameState, HexKey, HexState, PlayerId, TroopState, TroopType } from '../state';
import { workshopUnlock } from './build';
import { hasPermanent } from './permanents';
import { eventParams } from './world';
import { stagingAllies, tollWithTreaties } from './treatyQueries';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

export const isTroopType = (x: unknown): x is TroopType => x === 'line' || x === 'artillery';

export function troopDef(ctx: EngineContext, type: TroopType) {
  return ctx.balance.troops[type];
}

/** Força da tropa (sem metade de Artilharia em combate): base + nível + Liga Cerâmica + Reforço. */
export function troopStrength(ctx: EngineContext, state: GameState, t: TroopState): number {
  const b = ctx.balance.troops;
  let s = troopDef(ctx, t.type).strength + (t.level - 1) * b.strengthPerLevel;
  if (t.type === 'line' && hasPermanent(ctx, state, t.owner, 'lineStrengthBonus')) s += 1;
  if (t.bonusRound === state.round) s += t.bonusAmount ?? 0;
  return s;
}

export function troopsOf(
  state: GameState,
  player: PlayerId,
): { key: HexKey; hex: HexState; troop: TroopState }[] {
  const out: { key: HexKey; hex: HexState; troop: TroopState }[] = [];
  for (const [key, hex] of Object.entries(state.hexes))
    for (const troop of hex.troops) if (troop.owner === player) out.push({ key, hex, troop });
  return out;
}

export function findTroop(
  state: GameState,
  uid: number,
): { key: HexKey; hex: HexState; troop: TroopState } | null {
  for (const [key, hex] of Object.entries(state.hexes)) {
    const troop = hex.troops.find((t) => t.uid === uid);
    if (troop) return { key, hex, troop };
  }
  return null;
}

/** AS: teto de exército. */
export function armyCap(ctx: EngineContext, state: GameState, player: PlayerId): number {
  return maxLevelOf(state, player, 'barracks') * ctx.balance.troops.armyCapPerBarracksLevel;
}

/** Tropas de outros jogadores no hex (o Guardião conta à parte). */
export const enemyTroops = (hex: HexState, player: PlayerId): TroopState[] =>
  hex.troops.filter((t) => t.owner !== player);

const conflictOff = (state: GameState): Reason | null =>
  state.layers.conflict ? null : { key: 'layerDisabled', params: { layer: 'conflict' } };

// ── Recrutar e subir de nível ────────────────────────────────────────────────

/** GDD 6.3 Recrutar: no hex de um Quartel seu ou vizinho; espaço livre; teto de exército. */
export function checkRecruit(ctx: EngineContext, state: GameState, a: ActionOf<'recruit'>): Reason | null {
  const off = conflictOff(state);
  if (off) return off;
  if (!isTroopType(a.troop)) return { key: 'invalidOption' };
  const hex = getHex(state, a.hex);
  if (!hex) return { key: 'noSuchHex' };
  if (!hex.revealed) return { key: 'hexHidden' };
  const near = [hex, ...ctx.planet.neighbors(hex).map((n) => state.hexes[`${n.boardId}:${n.q},${n.r}`])];
  if (!near.some((h) => h?.structures.some((s) => s.type === 'barracks' && s.owner === a.player)))
    return { key: 'notNearBarracks' };
  if (enemyTroops(hex, a.player).length > 0 || hex.guardian !== null) return { key: 'enemyInHex' };
  if (slotsUsed(ctx, hex, a.player) >= ctx.balance.hex.slots)
    return { key: 'hexFull', params: { slots: ctx.balance.hex.slots } };
  if (troopsOf(state, a.player).length >= armyCap(ctx, state, a.player))
    return { key: 'armyCap', params: { cap: armyCap(ctx, state, a.player) } };
  return canAfford(getPlayer(state, a.player).resources, troopDef(ctx, a.troop).cost)
    ? null
    : { key: 'cannotAfford' };
}

export function applyRecruit(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'recruit'>,
  events: GameEvent[],
): void {
  const hex = state.hexes[a.hex];
  if (!hex) return;
  const cost = troopDef(ctx, a.troop).cost;
  pay(getPlayer(state, a.player).resources, cost);
  events.push({ type: 'resourcesSpent', player: a.player, resources: cost });
  const uid = state.nextUid++;
  hex.troops.push({ uid, type: a.troop, level: 1, owner: a.player, arrived: uid });
  events.push({ type: 'troopRecruited', player: a.player, hex: a.hex, uid, troop: a.troop });
}

/** Subir de nível: 1 ação + custo de recrutar; a Oficina precisa liberar o nível. */
export function checkUpgradeTroop(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'upgradeTroop'>,
): Reason | null {
  const off = conflictOff(state);
  if (off) return off;
  const where = findTroop(state, a.uid);
  if (!where || where.troop.owner !== a.player) return { key: 'notYourTroop' };
  const target = where.troop.level + 1;
  if (target > ctx.balance.troops.maxLevel) return { key: 'maxLevel' };
  if (workshopUnlock(ctx, state, a.player) < target)
    return { key: 'needsWorkshop', params: { level: target } };
  return canAfford(getPlayer(state, a.player).resources, troopDef(ctx, where.troop.type).cost)
    ? null
    : { key: 'cannotAfford' };
}

export function applyUpgradeTroop(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'upgradeTroop'>,
  events: GameEvent[],
): void {
  const where = findTroop(state, a.uid);
  if (!where) return;
  const cost = troopDef(ctx, where.troop.type).cost;
  pay(getPlayer(state, a.player).resources, cost);
  events.push({ type: 'resourcesSpent', player: a.player, resources: cost });
  where.troop.level += 1;
  events.push({ type: 'troopUpgraded', player: a.player, uid: a.uid, level: where.troop.level });
}

// ── Fronteira ────────────────────────────────────────────────────────────────

export function checkSetTariff(state: GameState, a: ActionOf<'setTariff'>): Reason | null {
  const off = conflictOff(state);
  if (off) return off;
  const p = getPlayer(state, a.player);
  if (p.tariffRound === state.round) return { key: 'tariffAlreadyChanged' };
  return p.tariff === a.resource ? { key: 'sameResource' } : null;
}

export function applySetTariff(state: GameState, a: ActionOf<'setTariff'>, events: GameEvent[]): void {
  const p = getPlayer(state, a.player);
  p.tariff = a.resource;
  p.tariffRound = state.round;
  events.push({ type: 'tariffChanged', player: a.player, resource: a.resource });
}

/** Pedágio por tropa para entrar no território do jogador (tarifa + modificadores, teto). */
export function tariffOf(ctx: EngineContext, state: GameState, owner: PlayerId): ResourceAmounts {
  const p = getPlayer(state, owner);
  const out: ResourceAmounts = { [p.tariff]: ctx.balance.border.tollPerTroop };
  for (const r of p.tariffMods.slice(0, ctx.balance.border.maxModifiers)) {
    out[r as ResourceId] = (out[r as ResourceId] ?? 0) + ctx.balance.border.tollPerTroop;
  }
  return out;
}

// ── Movimento ────────────────────────────────────────────────────────────────

export interface MovePlan {
  readonly path: HexKey[];
  /** Comida total (todas as tropas). */
  readonly food: number;
  /** Pedágio por dono de território: o que o jogador paga a cada um. */
  readonly tolls: { readonly owner: PlayerId; readonly amounts: ResourceAmounts; readonly treaty?: number }[];
  readonly crossed: boolean;
}

/** Dono do tabuleiro (assento = tabuleiro); null para tabuleiro sem jogador. */
const boardOwner = (state: GameState, boardId: number): PlayerId | null =>
  state.players.find((p) => p.boardId === boardId)?.id ?? null;

/** Comida para uma tropa entrar no hex (Montanha mais cara; Antigrav e Ventos de Cauda). */
function stepFood(ctx: EngineContext, state: GameState, player: PlayerId, hex: HexState): number {
  const t = ctx.terrain(hex.surface);
  const mountain = t.kind === 'surface' && t.def.id === 'mountain';
  const antigrav = hasPermanent(ctx, state, player, 'antigrav');
  return mountain && !antigrav ? ctx.balance.troops.moveFoodMountain : ctx.balance.troops.moveFoodPerHex;
}

/** AU: caminho mais barato em Comida de `from` a `to` para `n` tropas (null = sem caminho). */
export function planMove(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  from: HexKey,
  to: HexKey,
  n: number,
): MovePlan | null {
  const start = state.hexes[from];
  const goal = state.hexes[to];
  if (!start || !goal || from === to || !goal.revealed) return null;
  // Base Avançada: tropas do aliado não bloqueiam o caminho.
  const blocked = (h: HexState) =>
    h.guardian !== null || h.troops.some((t) => t.owner !== player && !stagingAllies(state, player, t.owner));
  const dist = new Map<HexKey, number>([[from, 0]]);
  const prev = new Map<HexKey, HexKey>();
  const open: HexKey[] = [from];
  while (open.length) {
    open.sort((a, b) => (dist.get(a) ?? 0) - (dist.get(b) ?? 0) || a.localeCompare(b));
    const cur = open.shift() as HexKey;
    if (cur === to) break;
    const ch = state.hexes[cur];
    if (!ch || (cur !== from && blocked(ch))) continue;
    for (const nb of ctx.planet.neighbors(ch)) {
      const k = `${nb.boardId}:${nb.q},${nb.r}`;
      const h = state.hexes[k];
      if (!h || !h.revealed) continue;
      const d = (dist.get(cur) ?? 0) + stepFood(ctx, state, player, h);
      if (d < (dist.get(k) ?? Infinity)) {
        dist.set(k, d);
        prev.set(k, cur);
        if (!open.includes(k)) open.push(k);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path: HexKey[] = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0] as HexKey) as HexKey);
  // Pedágio: cada entrada num território alheio (tabuleiro de outro jogador).
  const own = getPlayer(state, player).boardId;
  const tolls = new Map<PlayerId, { amounts: ResourceAmounts; treaty?: number }>();
  let crossed = false;
  for (let i = 1; i < path.length; i++) {
    const a = state.hexes[path[i - 1] as HexKey];
    const b = state.hexes[path[i] as HexKey];
    if (!a || !b || a.boardId === b.boardId || b.boardId === own) continue;
    const owner = boardOwner(state, b.boardId);
    if (owner === null || owner === player || getPlayer(state, owner).eliminated) continue;
    crossed = true;
    // GDD 10: tratados mudam o pedágio (Corredor Livre, Tarifa Preferencial, Muralha Comercial).
    const quote = tollWithTreaties(state, player, owner, n, tariffOf(ctx, state, owner));
    const due = tolls.get(owner) ?? { amounts: {} };
    for (const [r, q] of Object.entries(quote.amounts)) {
      due.amounts[r as ResourceId] = (due.amounts[r as ResourceId] ?? 0) + (q ?? 0);
    }
    if (quote.treaty !== undefined) due.treaty = quote.treaty;
    tolls.set(owner, due);
  }
  let food = (dist.get(to) ?? 0) * n;
  // Ventos de Cauda e Antigrav: metade da Comida, arredondado para cima.
  if (eventParams(ctx, state, 'halfMoveCost') || hasPermanent(ctx, state, player, 'antigrav'))
    food = Math.ceil(food / 2);
  return { path, food, tolls: [...tolls].map(([owner, t]) => ({ owner, ...t })), crossed };
}

/** Total que o movimento custa ao jogador (Comida + pedágios). */
export function moveCost(plan: MovePlan): ResourceAmounts {
  const total: ResourceAmounts = { food: plan.food };
  for (const t of plan.tolls) {
    for (const [r, q] of Object.entries(t.amounts))
      total[r as ResourceId] = (total[r as ResourceId] ?? 0) + (q ?? 0);
  }
  return total;
}

export function checkMove(ctx: EngineContext, state: GameState, a: ActionOf<'move'>): Reason | null {
  const off = conflictOff(state);
  if (off) return off;
  const from = state.hexes[a.from];
  if (!from) return { key: 'noSuchHex' };
  if (a.uids.length === 0 || new Set(a.uids).size !== a.uids.length) return { key: 'invalidOption' };
  for (const uid of a.uids) {
    const t = from.troops.find((x) => x.uid === uid);
    if (!t || t.owner !== a.player) return { key: 'notYourTroop' };
    if (t.rootedRound === state.round) return { key: 'troopRooted' };
  }
  const to = state.hexes[a.to];
  if (!to) return { key: 'noSuchHex' };
  if (slotsUsed(ctx, to, a.player) + a.uids.length > ctx.balance.hex.slots)
    return { key: 'hexFull', params: { slots: ctx.balance.hex.slots } };
  const plan = planMove(ctx, state, a.player, a.from, a.to, a.uids.length);
  if (!plan) return { key: 'noPath' };
  return canAfford(getPlayer(state, a.player).resources, moveCost(plan)) ? null : { key: 'cannotAfford' };
}

export function applyMove(
  ctx: EngineContext,
  state: GameState,
  a: ActionOf<'move'>,
  events: GameEvent[],
): void {
  const plan = planMove(ctx, state, a.player, a.from, a.to, a.uids.length);
  const from = state.hexes[a.from];
  const to = state.hexes[a.to];
  if (!plan || !from || !to) return;
  const me = getPlayer(state, a.player).resources;
  pay(me, { food: plan.food });
  if (plan.food > 0)
    events.push({ type: 'resourcesSpent', player: a.player, resources: { food: plan.food } });
  for (const t of plan.tolls) {
    pay(me, t.amounts);
    gain(getPlayer(state, t.owner).resources, t.amounts);
    if (Object.values(t.amounts).some((q) => (q ?? 0) > 0))
      events.push({ type: 'tollPaid', from: a.player, to: t.owner, resources: t.amounts });
    // Contrato "PAGA EM VEZ DA TARIFA" (Tarifa Preferencial) vale em toda entrada (BC).
    const contract = state.treaties.active.find((x) => x.id === t.treaty && x.terms.kind === 'contract');
    if (contract) {
      events.push({
        type: 'treatyTriggered',
        treaty: contract.id,
        obligor: a.player,
        beneficiary: t.owner,
        consequence: 'overrideToll',
        resources: t.amounts,
        defaulted: false,
      });
    }
  }
  const stamp = state.nextUid++;
  const moving = from.troops.filter((t) => a.uids.includes(t.uid));
  from.troops = from.troops.filter((t) => !a.uids.includes(t.uid));
  for (const t of moving) {
    t.arrived = stamp;
    if (plan.crossed) t.crossedRound = state.round;
    to.troops.push(t);
  }
  events.push({
    type: 'troopsMoved',
    player: a.player,
    from: a.from,
    to: a.to,
    uids: [...a.uids],
    path: plan.path,
  });
}
