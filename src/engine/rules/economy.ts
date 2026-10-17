/**
 * Economia: produção (GDD 4.1, 4.2, 6.2 fase 3), manutenção (6.2 fase 4) e banca (5.2).
 */
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import {
  amountTotal,
  canAfford,
  emptyResources,
  gain,
  getPlayer,
  levelDef,
  maxLevelOf,
  ownedStructures,
  pay,
  type PlacedStructure,
  type ResourceAmounts,
} from '../queries';
import type { GameState, HexState, PlayerId, StructureState } from '../state';
import { occupiedAgainst } from './combat';
import { until } from './hazards';
import { numParam, permanentsWith, sumParam } from './permanents';
import { freeUpkeepAt, hazardParkYield, mineMultiplierBonus, portEffect } from './specials';
import { eventHits, eventParams, withhold } from './world';

// ── Banca ────────────────────────────────────────────────────────────────────

export interface BankPrices {
  /** Crédito recebido por unidade entregue à banca (valor + buyOffset). */
  readonly sell: number;
  /** Crédito pago por unidade comprada da banca (valor + sellOffset). */
  readonly buy: number;
}

/** Redução de spread do jogador: Mercado (GDD 5.2) — maior nível possuído. */
export function spreadReduction(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const level = maxLevelOf(state, player, 'market');
  if (level === 0) return 0;
  return levelDef(ctx, { type: 'market', level }).spreadReduction ?? 0;
}

/**
 * GDD 5.2: a banca compra pelo valor −1 e vende pelo valor +1. O Mercado reduz o
 * spread; o lado reduzido primeiro vem de bank.spreadReductionOrder, e o spread
 * nunca fica abaixo de bank.minSpread.
 */
export function bankPrices(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  resource: ResourceId,
): BankPrices {
  const bank = ctx.balance.bank;
  let buyOffset = bank.buyOffset;
  let sellOffset = bank.sellOffset;
  // Fase 6: evento muda o spread da rodada (o lado da venda absorve, como na interpretação A);
  // Porto Franco aberto zera o spread; fechado, dobra o de quem tem estrutura nele.
  const event = eventParams<{ spread: number }>(ctx, state, 'bankSpread');
  if (event) sellOffset = buyOffset + event.spread;
  const port = portEffect(ctx, state, player);
  if (port.spread !== undefined) {
    const value = ctx.resourceValue(resource);
    return { sell: Math.max(0, value - port.spread), buy: Math.max(1, value + port.spread) };
  }
  if (port.multiplier !== undefined) {
    buyOffset *= port.multiplier;
    sellOffset *= port.multiplier;
  }
  const maxReduction = Math.max(0, sellOffset - buyOffset - bank.minSpread);
  let k = Math.min(spreadReduction(ctx, state, player), maxReduction);

  const cutSell = () => {
    const d = Math.min(k, Math.max(0, sellOffset));
    sellOffset -= d;
    k -= d;
  };
  const cutBuy = () => {
    const d = Math.min(k, Math.max(0, -buyOffset));
    buyOffset += d;
    k -= d;
  };
  if (bank.spreadReductionOrder === 'sellFirst') {
    cutSell();
    cutBuy();
  } else {
    cutBuy();
    cutSell();
  }
  // Resto da redução (offsets do mesmo sinal): fecha o spread pelo lado da venda.
  sellOffset -= k;

  const value = ctx.resourceValue(resource);
  return { sell: Math.max(0, value + buyOffset), buy: Math.max(1, value + sellOffset) };
}

export interface BankQuote {
  readonly received: number;
  /** Crédito que sobra e fica com a banca (troco a favor da banca). */
  readonly lostCredit: number;
}

export function bankQuote(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  give: ResourceId,
  amount: number,
  receive: ResourceId,
): BankQuote {
  const credit = amount * bankPrices(ctx, state, player, give).sell;
  const price = bankPrices(ctx, state, player, receive).buy;
  const received = ctx.balance.bank.roundingFavorsBank
    ? Math.floor(credit / price)
    : Math.round(credit / price);
  return { received, lostCredit: Math.max(0, credit - received * price) };
}

/** Menor quantidade de `give` que compra 1 unidade de `receive` (null se impossível). */
export function minBankAmount(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  give: ResourceId,
  receive: ResourceId,
): number | null {
  const sell = bankPrices(ctx, state, player, give).sell;
  if (sell <= 0) return null;
  return Math.ceil(bankPrices(ctx, state, player, receive).buy / sell);
}

// ── Produção ─────────────────────────────────────────────────────────────────

/**
 * GDD 6.2 fase 3. Parque: produção do nível × recursos do terreno (Lagoa dá os dois
 * se production.lagoonDualYield). Pedreira: produção do nível. Mina: multiplicador do
 * nível × 1 do recurso do subsolo, gasta 1 token; ao zerar, sai e o subsolo esgota.
 * Mina ociosa (sem Carvão na manutenção anterior) não produz e volta a operar.
 */
export function runProduction(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  events: GameEvent[],
): void {
  const p = state.players[player];
  if (!p) return;
  const automation = automationBonus(ctx, state, player);
  const total = emptyResources();

  for (const placed of ownedStructures(state, player)) {
    const { hex, key, structure } = placed;
    if (ctx.structure(structure.type).subtype !== 'extraction') continue;
    if (structure.type === 'mine' && structure.idle) {
      structure.idle = false;
      delete structure.overloaded;
      events.push({ type: 'mineIdle', player, hex: key, uid: structure.uid });
      continue;
    }
    // AQ: Mina parada só pelo evento com contra-ação fica registrada (a contra-ação devolve).
    if (
      structure.type === 'mine' &&
      !productionBlocked(state, hex, structure) &&
      eventParams(ctx, state, 'minesOff') === null &&
      eventHits(ctx, state, 'minesOffWithCounter', player)
    ) {
      withhold(state, player).mines.push(structure.uid);
    }
    if (productionBlocked(state, hex, structure, ctx)) {
      // Marcas de uma Produção só: Sobrecarga e Pane Induzida se consomem aqui.
      delete structure.overloaded;
      delete structure.noProduceRound;
      events.push({ type: 'structureInactive', player, hex: key, uid: structure.uid });
      continue;
    }
    gain(total, produceOnce(ctx, state, player, placed, automation, events));
  }
  // GDD 8.5: hexes alheios ocupados por Linha sua (sem outra tropa) rendem occupiedHexYield.
  if (state.layers.conflict) {
    const own = p.boardId;
    for (const [key, hex] of Object.entries(state.hexes)) {
      if (hex.boardId === own || hex.guardian !== null) continue;
      if (!hex.troops.some((t) => t.owner === player && t.type === 'line')) continue;
      if (hex.troops.some((t) => t.owner !== player)) continue;
      const resources = new Set<ResourceId>();
      const t = ctx.terrain(hex.surface);
      if (t.kind === 'surface') for (const r of t.def.produces) resources.add(r);
      for (const s of hex.structures) {
        if (ctx.structure(s.type).subtype !== 'extraction') continue;
        for (const r of Object.keys(structureYield(ctx, hex, s)) as ResourceId[]) resources.add(r);
      }
      for (const r of resources) {
        const amount = ctx.balance.production.occupiedHexYield;
        p.resources[r] += amount;
        total[r] += amount;
        events.push({ type: 'produced', player, hex: key, uid: -1, resource: r, amount });
      }
    }
  }
  runSilos(ctx, state, player, total, events);
}

/**
 * O que impede a estrutura de produzir agora: Bomba de Íons (desligada na rodada), Pane
 * Induzida (não produz neste turno), Sobrecarga (inativa na próxima Produção), Colapso de
 * Galeria (Mina em subsolo selado); Fase 6: cinzas, contaminação e eventos que param as
 * Minas (com `ctx`; a contra-ação mantém as do jogador).
 */
export function productionBlocked(
  state: GameState,
  hex: HexState,
  s: StructureState,
  ctx?: EngineContext,
): boolean {
  return (
    s.offlineRound === state.round ||
    s.noProduceRound === state.round ||
    s.overloaded === true ||
    (s.type === 'mine' && hex.seal !== null) ||
    until(state, hex.status.ashUntil) ||
    !!hex.status.contaminated ||
    // GDD 8.5: hex ocupado por Linha de outro jogador — o dono não produz ali.
    occupiedAgainst(hex, s.owner) ||
    (!!ctx && s.type === 'mine' && minesStopped(ctx, state, s.owner))
  );
}

/** Ionização (todas) e Colapso Sísmico (quem não fez a contra-ação): Minas não operam. */
export function minesStopped(ctx: EngineContext, state: GameState, owner: PlayerId): boolean {
  return eventParams(ctx, state, 'minesOff') !== null || eventHits(ctx, state, 'minesOffWithCounter', owner);
}

/**
 * Quanto a estrutura de extração rende numa Produção, sem efeito colateral. Parque e
 * Pedreira somam o bônus do hex (Terraformação) e da Automação em cada recurso
 * produzido — a Lagoa ganha nos dois (interpretação AC).
 */
export function structureYield(
  ctx: EngineContext,
  hex: HexState,
  structure: StructureState,
  automation: ReadonlyMap<number, number> = new Map(),
  state: GameState | null = null,
): ResourceAmounts {
  const level = levelDef(ctx, structure);
  const out: ResourceAmounts = {};
  if (structure.type === 'mine') {
    const resource = ctx.subsoil(hex.subsoil).resource;
    // Crosta Fina: multiplicador +N (com estado: só com o bônus ligado).
    const bonus = state ? mineMultiplierBonus(ctx, state, hex) : 0;
    if (resource && !hex.depleted)
      out[resource] = (level.multiplier ?? ctx.balance.production.mineMultiplier) + bonus;
    return out;
  }
  // Parque em Vulcão/Pântano (interpretação AL).
  const hazardYield = hazardParkYield(ctx, state, hex, structure, level.yield ?? 0);
  if (hazardYield) return hazardYield;
  const terrain = ctx.terrain(hex.surface);
  if (terrain.kind !== 'surface') return out;
  const base = level.yield ?? 0;
  if (base <= 0) return out;
  const produces = ctx.balance.production.lagoonDualYield
    ? terrain.def.produces
    : terrain.def.produces.slice(0, 1);
  const amount = base + hex.yieldBonus + (automation.get(structure.uid) ?? 0);
  for (const resource of produces) out[resource] = amount;
  return out;
}

/**
 * Automação de Extração: cada cópia dá +amount aos `count` Parques que mais ganham com
 * isso (valor dos recursos produzidos), empate por ordem de construção (interpretação AC).
 */
export function automationBonus(ctx: EngineContext, state: GameState, player: PlayerId): Map<number, number> {
  const out = new Map<number, number>();
  const copies = permanentsWith(ctx, state, player, 'parkBonus');
  if (copies.length === 0) return out;
  const parks = ownedStructures(state, player, 'park')
    .filter(({ hex, structure }) => !productionBlocked(state, hex, structure, ctx))
    .map(({ hex, structure }) => {
      const y = structureYield(ctx, hex, structure);
      const worth = RESOURCE_IDS.reduce((sum, id) => sum + (y[id] ? ctx.resourceValue(id) : 0), 0);
      return { uid: structure.uid, worth };
    })
    .filter((p) => p.worth > 0)
    .sort((a, b) => b.worth - a.worth || a.uid - b.uid);
  for (const def of copies) {
    for (const park of parks.slice(0, numParam(def, 'count'))) {
      out.set(park.uid, (out.get(park.uid) ?? 0) + numParam(def, 'amount'));
    }
  }
  return out;
}

/**
 * Mutável: a estrutura produz uma vez (Produção ou Sobrecarga). Mina gasta 1 token e,
 * ao zerar, sai e o subsolo esgota. Devolve o que rendeu.
 */
export function produceOnce(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  placed: PlacedStructure,
  automation: ReadonlyMap<number, number>,
  events: GameEvent[],
): ResourceAmounts {
  const { hex, key, structure } = placed;
  const p = getPlayer(state, player);
  const y = { ...structureYield(ctx, hex, structure, automation, state) };
  applyEventYield(ctx, state, player, hex, structure, y);
  for (const resource of RESOURCE_IDS) {
    const amount = y[resource];
    if (!amount) continue;
    p.resources[resource] += amount;
    events.push({ type: 'produced', player, hex: key, uid: structure.uid, resource, amount });
  }
  if (structure.type === 'mine' && amountTotal(y) > 0) {
    const def = ctx.structure('mine');
    structure.tokens = (structure.tokens ?? def.tokens ?? ctx.balance.production.mineTokens) - 1;
    if (structure.tokens <= 0) {
      hex.structures = hex.structures.filter((s) => s.uid !== structure.uid);
      hex.depleted = true;
      events.push({ type: 'mineDepleted', player, hex: key, uid: structure.uid });
    }
  }
  return y;
}

/** Silos: ao fim da Produção, +amount do recurso mais produzido; empate vai ao de maior valor (AE). */
function runSilos(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  total: ResourceAmounts,
  events: GameEvent[],
): void {
  const silos = permanentsWith(ctx, state, player, 'silos');
  const produced = RESOURCE_IDS.filter((id) => (total[id] ?? 0) > 0);
  if (silos.length === 0 || produced.length === 0) return;
  const top = produced.reduce((a, b) => {
    const da = total[a] ?? 0;
    const db = total[b] ?? 0;
    if (da !== db) return db > da ? b : a;
    return ctx.resourceValue(b) > ctx.resourceValue(a) ? b : a;
  });
  const amount = sumParam(silos, 'amount');
  getPlayer(state, player).resources[top] += amount;
  const resources: ResourceAmounts = {};
  resources[top] = amount;
  events.push({ type: 'resourcesGained', player, resources });
}

/**
 * Eventos da rodada sobre Parques (Fase 6): Estação Fértil (+N nos terrenos) e Chuva
 * Ácida (−N nos Parques de superfície de quem não fez a contra-ação; mínimo 0).
 */
function applyEventYield(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  hex: HexState,
  structure: StructureState,
  y: ResourceAmounts,
): void {
  if (structure.type !== 'park') return;
  const fertile = eventParams<{ terrains: string[]; amount: number }>(ctx, state, 'terrainYieldBonus');
  const acid = eventHits(ctx, state, 'parksMinusWithCounter', player)
    ? eventParams<{ amount: number }>(ctx, state, 'parksMinusWithCounter')
    : null;
  for (const id of RESOURCE_IDS) {
    const n = y[id];
    if (!n) continue;
    let v = n;
    if (fertile?.terrains.includes(hex.surface)) v += fertile.amount;
    if (acid) {
      const cut = Math.min(v, acid.amount);
      v -= cut;
      // AQ: o corte fica registrado para a contra-ação devolver.
      if (cut > 0 && state.phase === 'production') {
        const lost = withhold(state, player).lost;
        lost[id] = (lost[id] ?? 0) + cut;
      }
    }
    y[id] = v;
  }
}

/** AQ: a Mina que o evento parou produz agora e paga a manutenção (se puder). */
export function produceWithheldMine(
  ctx: EngineContext,
  state: GameState,
  uid: number,
  events: GameEvent[],
): void {
  const placed = ownedStructures(state, findOwner(state, uid)).find((p) => p.structure.uid === uid);
  if (!placed || productionBlocked(state, placed.hex, placed.structure)) return;
  const owner = placed.structure.owner;
  const upkeep = ctx.structure('mine').upkeep ?? {};
  const p = getPlayer(state, owner);
  if (!freeUpkeepAt(ctx, state, placed.hex)) {
    if (!canAfford(p.resources, upkeep)) return;
    pay(p.resources, upkeep);
    events.push({ type: 'upkeepPaid', player: owner, uid, cost: upkeep });
  }
  produceOnce(ctx, state, owner, placed, automationBonus(ctx, state, owner), events);
}

function findOwner(state: GameState, uid: number): PlayerId {
  for (const h of Object.values(state.hexes)) for (const s of h.structures) if (s.uid === uid) return s.owner;
  return -1;
}

/**
 * GDD 6.2 fase 4: cada Mina paga o upkeep (Carvão) em ordem de construção. A que não
 * puder pagar fica ociosa e não produz na próxima Produção. Estrutura desligada por
 * carta (Bomba de Íons, subsolo selado) não opera: não paga nem fica ociosa (AA, AB).
 */
export function runUpkeep(ctx: EngineContext, state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = state.players[player];
  if (!p) return;
  for (const { hex, structure } of ownedStructures(state, player)) {
    const upkeep = ctx.structure(structure.type).upkeep;
    if (!upkeep || RESOURCE_IDS.every((id) => (upkeep[id] ?? 0) === 0)) continue;
    if (structure.offlineRound === state.round || (structure.type === 'mine' && hex.seal !== null)) continue;
    // Fase 6: Mina parada por evento não opera (não paga); Geiser ativo perto dispensa o Carvão.
    if (structure.type === 'mine' && (minesStopped(ctx, state, player) || freeUpkeepAt(ctx, state, hex)))
      continue;
    if (canAfford(p.resources, upkeep)) {
      pay(p.resources, upkeep);
      events.push({ type: 'upkeepPaid', player, uid: structure.uid, cost: upkeep });
    } else {
      structure.idle = true;
      events.push({ type: 'upkeepMissed', player, uid: structure.uid });
    }
  }
}
