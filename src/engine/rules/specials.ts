/**
 * Bônus passivos dos hazards (GDD 4.3), consultados pelas regras de economia, construção
 * e cartas. Interpretação AL: vale para quem tem estrutura no hazard (Geiser: Minas
 * adjacentes de qualquer dono; Anomalia: qualquer alvo na área; Crosta Fina: sondar o hex
 * é grátis para qualquer um).
 */
import type { ResourceId } from '../../data/schemas';
import type { EngineContext } from '../context';
import type { ResourceAmounts } from '../queries';
import type { GameState, HexKey, HexState, PlayerId, StructureState } from '../state';
import {
  activeHazardHexes,
  hasStructureOn,
  hazardAt,
  hazardBonusActive,
  hexesAround,
  until,
} from './hazards';

const paramsOf = <T>(ctx: EngineContext, hex: HexState): T | null => {
  const def = hazardAt(ctx, hex);
  return def ? (def.bonus.params as T) : null;
};

const isBonus = (
  ctx: EngineContext,
  state: GameState,
  hex: HexState | undefined,
  effectId: string,
): boolean => {
  if (!hex || !state.layers.specialHexes) return false;
  return hazardAt(ctx, hex)?.bonus.effectId === effectId && hazardBonusActive(state, hex);
};

// ── Crosta Fina ──────────────────────────────────────────────────────────────

interface ThinCrust {
  readonly freeSurvey: boolean;
  readonly mineDiscount: Partial<Record<ResourceId, number>>;
  readonly multiplierBonus: number;
}

export function freeSurveyAt(ctx: EngineContext, state: GameState, key: HexKey): boolean {
  const hex = state.hexes[key];
  return isBonus(ctx, state, hex, 'thinCrust') && !!hex && !!paramsOf<ThinCrust>(ctx, hex)?.freeSurvey;
}

/** Custo da Mina no hex com o desconto da Crosta Fina. */
export function mineDiscountAt(
  ctx: EngineContext,
  state: GameState,
  hex: HexState | undefined,
): ResourceAmounts {
  if (!hex || !isBonus(ctx, state, hex, 'thinCrust')) return {};
  return paramsOf<ThinCrust>(ctx, hex)?.mineDiscount ?? {};
}

/** +multiplicador da Mina na Crosta Fina. */
export function mineMultiplierBonus(ctx: EngineContext, state: GameState, hex: HexState): number {
  return isBonus(ctx, state, hex, 'thinCrust') ? (paramsOf<ThinCrust>(ctx, hex)?.multiplierBonus ?? 0) : 0;
}

// ── Vulcão e Pântano: Parque no hazard ───────────────────────────────────────

/**
 * Produção de Parque num hazard (interpretação AL): Vulcão produz `amount` do recurso +
 * (produção do nível − 1); Pântano Ácido produz Comida em dobro da produção do nível.
 * null = o hex não é um desses hazards (a regra comum decide).
 */
export function hazardParkYield(
  ctx: EngineContext,
  state: GameState | null,
  hex: HexState,
  structure: StructureState,
  levelYield: number,
): ResourceAmounts | null {
  const def = hazardAt(ctx, hex);
  if (!def || structure.type !== 'park') return null;
  const active = state ? hazardBonusActive(state, hex) : true;
  if (def.bonus.effectId === 'produce') {
    const p = def.bonus.params as { resource: ResourceId; amount: number };
    return active ? { [p.resource]: p.amount + Math.max(0, levelYield - 1) + hex.yieldBonus } : {};
  }
  if (def.bonus.effectId === 'doubleFood') return active ? { food: 2 * (levelYield + hex.yieldBonus) } : {};
  return {};
}

// ── Geiser ───────────────────────────────────────────────────────────────────

/** Mina a até `radius` de um Geiser ativo opera sem Carvão. */
export function freeUpkeepAt(ctx: EngineContext, state: GameState, hex: HexState): boolean {
  if (!state.layers.specialHexes) return false;
  return activeHazardHexes(ctx, state, 'freeMineUpkeep').some(({ hex: g }) => {
    const radius = (paramsOf<{ radius: number }>(ctx, g)?.radius ?? 1) as number;
    return ctx.planet.distance(g, hex) <= radius;
  });
}

// ── Porto Franco ─────────────────────────────────────────────────────────────

/**
 * Spread da banca para o jogador pelo Porto Franco: { spread } se tem estrutura num porto
 * aberto (sem spread), { multiplier } se o porto dele está fechado (spread dobrado).
 */
export function portEffect(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { spread?: number; multiplier?: number } {
  if (!state.layers.specialHexes) return {};
  let out: { spread?: number; multiplier?: number } = {};
  for (const hex of Object.values(state.hexes)) {
    const def = hazardAt(ctx, hex);
    if (!def || def.bonus.effectId !== 'freePort' || !hasStructureOn(hex, player)) continue;
    if (until(state, hex.status.closedUntil)) {
      const mult = (def.damage.params as { spreadMultiplier?: number }).spreadMultiplier ?? 2;
      out = { multiplier: mult };
    } else if (hazardBonusActive(state, hex)) {
      return { spread: (def.bonus.params as { bankSpread: number }).bankSpread };
    }
  }
  return out;
}

// ── Cânion de Ventos ─────────────────────────────────────────────────────────

/** Drones do jogador não custam recursos (estrutura num Cânion ativo). */
export function freeDronesFor(ctx: EngineContext, state: GameState, player: PlayerId): boolean {
  return activeHazardHexes(ctx, state, 'freeDroneFromHere').some(({ hex }) => hasStructureOn(hex, player));
}

/** Drones do jogador no chão (Cânion com dano ativo onde ele tem estrutura). */
export function dronesGroundedFor(state: GameState, player: PlayerId): boolean {
  return Object.values(state.hexes).some(
    (h) => until(state, h.status.groundedUntil) && hasStructureOn(h, player),
  );
}

// ── Anomalia Magnética ───────────────────────────────────────────────────────

/** O hex está sob o escudo de uma Anomalia ativa (sabotagem não alveja). */
export function shieldedHex(ctx: EngineContext, state: GameState, key: HexKey): boolean {
  const hex = state.hexes[key];
  if (!hex) return false;
  return activeHazardHexes(ctx, state, 'sabotageShield').some(({ hex: a }) => {
    const radius = paramsOf<{ radius: number }>(ctx, a)?.radius ?? 1;
    return ctx.planet.distance(a, hex) <= radius;
  });
}

/** Fator das cartas que alvejam o hex (Anomalia invertida = efeito dobrado). */
export function amplifyFactor(ctx: EngineContext, state: GameState, key: HexKey): number {
  const hex = state.hexes[key];
  if (!hex || !state.layers.specialHexes) return 1;
  for (const a of Object.values(state.hexes)) {
    const def = hazardAt(ctx, a);
    if (!def || def.damage.effectId !== 'sabotageAmplify' || !until(state, a.status.amplifiedUntil)) continue;
    const p = def.damage.params as { radius: number; factor: number };
    if (hexesAround(ctx, state, a, p.radius).includes(key)) return p.factor;
  }
  return 1;
}
