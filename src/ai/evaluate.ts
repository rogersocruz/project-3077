/**
 * Avaliação estática de um estado do ponto de vista de um jogador, em pontos de valor
 * de recurso. Lê só o que esse jogador pode saber: estoques e trilhas são públicos
 * (GDD 13.1), o subsolo só conta se ele sondou, a mão conta por nível (a identidade
 * das cartas compradas não muda o valor, então simular a Compra não espia o baralho).
 */
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import type { EngineContext } from '../engine/context';
import { levelDef } from '../engine/queries';
import { rangeSources, rarityUnlocked } from '../engine/rules/build';
import { handLimit } from '../engine/rules/decks';
import { productionBlocked, structureYield } from '../engine/rules/economy';
import { cardDefOf } from '../engine/rules/permanents';
import { progress } from '../engine/rules/victory';
import type { GameState, HexState, PlayerId, Resources, StructureState } from '../engine/state';
import { type AiFocus, MINE_FOCI } from './types';
import type { AiWeights } from './weights';

/** Valor de um conjunto de recursos pela tabela de resources.json. */
export function resourcesWorth(ctx: EngineContext, amounts: Partial<Resources>): number {
  let sum = 0;
  for (const id of RESOURCE_IDS) sum += (amounts[id] ?? 0) * ctx.resourceValue(id);
  return sum;
}

/**
 * Produções que o jogador ainda faz na partida (contando a deste turno se ainda não
 * passou), com teto no horizonte da heurística.
 */
export function productionsLeft(ctx: EngineContext, state: GameState, player: PlayerId, cap: number): number {
  const before =
    state.activePlayer < player ||
    (state.activePlayer === player && (state.phase === 'reveal' || state.phase === 'draw'));
  const left = ctx.balance.turn.roundLimit - state.round + (before ? 1 : 0);
  return Math.max(0, Math.min(cap, left));
}

/** Valor de uma produção da estrutura (Mina desconta a manutenção). */
export function yieldWorth(ctx: EngineContext, hex: HexState, s: StructureState): number {
  let v = resourcesWorth(ctx, structureYield(ctx, hex, s));
  const upkeep = ctx.structure(s.type).upkeep;
  if (upkeep) v -= resourcesWorth(ctx, upkeep);
  return v;
}

/** Melhor renda por produção que um extrator novo de nível 1 daria no terreno do hex. */
export function siteWorth(ctx: EngineContext, hex: HexState): number {
  const terrain = ctx.terrain(hex.surface);
  if (terrain.kind !== 'surface' || !terrain.def.builder) return 0;
  const def = ctx.structure(terrain.def.builder);
  const base = def.levels[0]?.yield ?? 0;
  const produces = ctx.balance.production.lagoonDualYield
    ? terrain.def.produces
    : terrain.def.produces.slice(0, 1);
  return produces.reduce((sum, id) => sum + (base + hex.yieldBonus) * ctx.resourceValue(id), 0);
}

/** Renda de uma produção de Mina nível 1 sobre o subsolo (já descontada a manutenção). */
export function mineSiteWorth(ctx: EngineContext, hex: HexState): number {
  const resource = ctx.subsoil(hex.subsoil).resource;
  if (!resource || hex.depleted) return 0;
  const mine = ctx.structure('mine');
  const mult = mine.levels[0]?.multiplier ?? ctx.balance.production.mineMultiplier;
  return mult * ctx.resourceValue(resource) - resourcesWorth(ctx, mine.upkeep ?? {});
}

const levelValue = (table: readonly number[], level: number) => table[Math.min(level, table.length - 1)] ?? 0;

export interface EvalOptions {
  /** Estoque hipotético do jogador (banca/troca sem copiar o estado). */
  readonly resources?: Resources;
  /** Foco estratégico do agente (null/ausente = equilibrado). */
  readonly focus?: AiFocus | null;
}

/** Partes da avaliação (para depuração e testes). */
export interface EvalBreakdown {
  stock: number;
  victory: number;
  income: number;
  capability: number;
  sites: number;
  cards: number;
  total: number;
}

export function evaluateParts(
  ctx: EngineContext,
  state: GameState,
  me: PlayerId,
  w: AiWeights,
  opts: EvalOptions = {},
): EvalBreakdown {
  const player = state.players[me];
  if (!player) throw new RangeError(`jogador ${me}`);
  const resources = opts.resources ?? player.resources;
  const left = productionsLeft(ctx, state, me, w.horizon);
  const scale = left / w.horizon;

  const focus = opts.focus ?? null;
  const { stock, victory } = resourceTerms(ctx, state, me, w, resources, focus);
  const mineRoute = focus !== null && MINE_FOCI.includes(focus) ? w.mineRouteBoost : 1;

  // Estruturas: renda, capacidades e o que destravam.
  let income = 0;
  let capability = 0;
  const levels: Record<string, number> = {};
  const extractedHexes = new Set<HexState>();
  for (const hex of Object.values(state.hexes)) {
    for (const s of hex.structures) {
      if (s.owner !== me) continue;
      levels[s.type] = Math.max(levels[s.type] ?? 0, s.level);
      const def = ctx.structure(s.type);
      if (def.subtype === 'extraction') {
        if (s.type !== 'mine') extractedHexes.add(hex);
        let n = left;
        if (s.type === 'mine')
          n = Math.min(left, s.tokens ?? def.tokens ?? ctx.balance.production.mineTokens);
        // Produção bloqueada agora custa uma produção.
        if (productionBlocked(state, hex, s) || (s.type === 'mine' && s.idle)) n = Math.max(0, n - 1);
        income += yieldWorth(ctx, hex, s) * n;
      } else if (s.type === 'outpost') {
        capability += w.outpost * scale;
        // Nível do Posto: só o alcance importa (o raio do nível já está nas origens).
        capability += (levelDef(ctx, s).range ?? 0) * 0.3 * scale;
      }
    }
  }
  income *= w.income;
  capability +=
    (levelValue(w.university, levels['university'] ?? 0) * mineRoute +
      levelValue(w.workshop, levels['workshop'] ?? 0) +
      levelValue(w.archive, levels['archive'] ?? 0) +
      levelValue(w.market, levels['market'] ?? 0) +
      levelValue(w.villageLevel, levels['village'] ?? 0)) *
    scale;

  // Oficina abre a Universidade 2 (e a Mina): vale mais para quem já tem a Universidade 1.
  if ((levels['workshop'] ?? 0) > 0 && (levels['university'] ?? 0) === 1)
    capability += w.workshopForUniversity * mineRoute * scale;

  // Sítios ao alcance: só os melhores contam (não dá para construir em todos).
  const found = openSites(ctx, state, me, extractedHexes);
  const mineOk = rarityUnlocked(state, me, ctx.structure('mine').rarity);
  const sites =
    (diminishing(found.surface, w.siteSlots) * w.site +
      diminishing(found.mine, w.siteSlots) * (mineOk ? w.mineSite : w.mineSiteLocked) * mineRoute) *
    scale;

  // Cartas: mão por nível até o limite; permanentes por nível.
  let cards = 0;
  if (state.layers.cards) {
    const limit = handLimit(ctx, state, me);
    const handValues = player.hand
      .map((c) => tierValue(w.cardTier, cardDefOf(ctx, state, c).tier))
      .sort((a, b) => b - a)
      .slice(0, limit);
    cards += handValues.reduce((a, b) => a + b, 0);
    for (const c of player.permanents) {
      if (c !== null)
        cards += tierValue(w.permanentTier, cardDefOf(ctx, state, c).tier) * Math.max(scale, 0.3);
    }
  }

  const total = stock + victory + income + capability + sites + cards;
  return { stock, victory, income, capability, sites, cards, total };
}

/**
 * Parte da avaliação que depende só do estoque (estoque + trilhas de vitória). Banca e
 * trocas mudam só isto: a IA compara estoques sem reavaliar o planeta.
 */
export function resourceTerms(
  ctx: EngineContext,
  state: GameState,
  me: PlayerId,
  w: AiWeights,
  resources: Resources,
  focus: AiFocus | null = null,
): { stock: number; victory: number } {
  const stock = resourcesWorth(ctx, resources);
  const prog = progress(ctx, withResources(state, me, resources), me);
  let best = 0;
  let sum = 0;
  for (const [track, v] of Object.entries(prog.tracks)) {
    best = Math.max(best, focus && track !== focus ? v * w.victoryOffFocus : v);
    sum += v;
  }
  const finalRound = state.round >= ctx.balance.turn.roundLimit;
  let victory = w.victoryMax * best ** w.victoryExp + (finalRound ? w.victorySumFinal : w.victorySum) * sum;
  if (prog.met.length > 0) victory += w.winBonus;
  return { stock, victory };
}

/** Diferença de avaliação ao trocar só o estoque do jogador. */
export function resourceDelta(
  ctx: EngineContext,
  state: GameState,
  me: PlayerId,
  w: AiWeights,
  resources: Resources,
  focus: AiFocus | null = null,
): number {
  const player = state.players[me];
  if (!player) return 0;
  const a = resourceTerms(ctx, state, me, w, player.resources, focus);
  const b = resourceTerms(ctx, state, me, w, resources, focus);
  return b.stock + b.victory - a.stock - a.victory;
}

/**
 * Rota mais promissora agora: trilha com maior progresso projetado (estoque + renda
 * das próximas produções). O Difícil sem foco fixo concentra esforço nela.
 */
export function projectedFocus(ctx: EngineContext, state: GameState, me: PlayerId, horizon: number): AiFocus {
  const player = state.players[me];
  const v = ctx.balance.victory;
  const income: Record<string, number> = {};
  let hexes = 0;
  for (const hex of Object.values(state.hexes)) {
    let mine = false;
    for (const s of hex.structures) {
      if (s.owner !== me) continue;
      mine = true;
      if (ctx.structure(s.type).subtype !== 'extraction') continue;
      for (const [id, n] of Object.entries(structureYield(ctx, hex, s)))
        income[id] = (income[id] ?? 0) + (n ?? 0);
    }
    if (mine) hexes++;
  }
  const left = productionsLeft(ctx, state, me, horizon);
  let best: AiFocus = 'expansion';
  let bestScore = (hexes + left * 0.5) / v.expansionHexes;
  for (const id of RESOURCE_IDS) {
    const score = ((player?.resources[id] ?? 0) + (income[id] ?? 0) * left) / v.resourceThresholds[id];
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

export interface OpenSites {
  /** Renda por produção de cada hex revelado ao alcance com terreno produtivo e sem extrator. */
  readonly surface: number[];
  /** Renda por produção de Mina em cada subsolo sondado com recurso, sem Mina. */
  readonly mine: number[];
}

/** Lugares ao alcance ainda não aproveitados, do mais rentável para o menos. */
export function openSites(
  ctx: EngineContext,
  state: GameState,
  me: PlayerId,
  extracted?: ReadonlySet<HexState>,
): OpenSites {
  const player = state.players[me];
  const surface: number[] = [];
  const mine: number[] = [];
  if (!player) return { surface, mine };
  const sources = rangeSources(ctx, state, me);
  for (const hex of Object.values(state.hexes)) {
    if (hex.boardId !== player.boardId || hex.structures.length >= ctx.balance.hex.slots) continue;
    if (!sources.some((src) => ctx.planet.distance(src.hex, hex) <= src.range)) continue;
    const hasExtractor = extracted
      ? extracted.has(hex)
      : hex.structures.some(
          (s) => s.owner === me && s.type !== 'mine' && ctx.structure(s.type).subtype === 'extraction',
        );
    if (hex.revealed && !hasExtractor) {
      const v = siteWorth(ctx, hex);
      if (v > 0) surface.push(v);
    }
    if (hex.surveyedBy.includes(me) && !hex.structures.some((s) => s.type === 'mine')) {
      const v = mineSiteWorth(ctx, hex);
      if (v > 0) mine.push(v);
    }
  }
  return { surface: surface.sort((a, b) => b - a), mine: mine.sort((a, b) => b - a) };
}

/** Soma com pesos decrescentes (o primeiro sítio vale inteiro, os seguintes menos). */
export function diminishing(values: readonly number[], weights: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.min(values.length, weights.length); i++)
    sum += (values[i] ?? 0) * (weights[i] ?? 0);
  return sum;
}

export function evaluate(
  ctx: EngineContext,
  state: GameState,
  me: PlayerId,
  w: AiWeights,
  opts: EvalOptions = {},
): number {
  return evaluateParts(ctx, state, me, w, opts).total;
}

export function tierValue(table: readonly [number, number, number], tier: 1 | 2 | 3 | null): number {
  return table[(tier ?? 2) - 1] ?? table[1];
}

/** Cópia rasa só com o estoque trocado (para progress() sem clonar o planeta). */
function withResources(state: GameState, me: PlayerId, resources: Resources): GameState {
  if (state.players[me]?.resources === resources) return state;
  const players = state.players.map((p) => (p.id === me ? { ...p, resources } : p));
  return { ...state, players };
}

/** Recurso de maior valor do qual o jogador tem ao menos `min` (alvo de Pilhagem). */
export function richestResource(
  state: GameState,
  player: PlayerId,
  ctx: EngineContext,
  min = 1,
): ResourceId | null {
  const res = state.players[player]?.resources;
  if (!res) return null;
  let best: ResourceId | null = null;
  for (const id of RESOURCE_IDS) {
    if (res[id] < min) continue;
    if (!best || res[id] * ctx.resourceValue(id) > res[best] * ctx.resourceValue(best)) best = id;
  }
  return best;
}
