/**
 * Valores esperados do que ainda está escondido, calculados dos pesos de tiles.json:
 * a IA avalia Explorar e Sondar por eles, nunca pelo tile de verdade.
 */
import type { EngineContext } from '../engine/context';
import type { HexState } from '../engine/state';
import { mineSiteWorth, siteWorth } from './evaluate';

export interface Expectations {
  /** Renda média por produção de um extrator nível 1 num hex recém-revelado. */
  readonly siteWorth: number;
  /** Chance de o hex revelado ter terreno produtivo e a renda média nesse caso. */
  readonly siteChance: number;
  readonly siteIfAny: number;
  /** Chance de o subsolo ter recurso e a renda média de Mina nesse caso. */
  readonly mineChance: number;
  readonly mineIfAny: number;
  /** Renda média por produção de uma Mina nível 1 num subsolo recém-sondado. */
  readonly mineSiteWorth: number;
}

const cache = new WeakMap<EngineContext, Expectations>();

const fakeHex = (surface: string, subsoil: string): HexState => ({
  boardId: 0,
  q: 0,
  r: 0,
  surface,
  subsoil,
  revealed: true,
  surveyedBy: [],
  depleted: false,
  seal: null,
  yieldBonus: 0,
  structures: [],
  status: {},
  guardian: null,
  excavatedBy: null,
});

export function expectations(ctx: EngineContext): Expectations {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const tiles = ctx.data.tiles;
  const cat = tiles.categoryWeights as Record<string, number>;
  const catTotal = Object.values(cat).reduce((a, b) => a + b, 0);
  let site = 0;
  let siteChance = 0;
  for (const category of Object.keys(cat)) {
    const surfaces = tiles.surface.filter((s) => s.category === category);
    const total = surfaces.reduce((a, s) => a + s.weight, 0);
    if (total <= 0 || catTotal <= 0) continue;
    for (const s of surfaces) {
      const p = ((cat[category] ?? 0) / catTotal) * (s.weight / total);
      const v = siteWorth(ctx, fakeHex(s.id, tiles.subsoil[0]?.id ?? ''));
      site += p * v;
      if (v > 0) siteChance += p;
    }
  }
  const subTotal = tiles.subsoil.reduce((a, s) => a + s.weight, 0);
  const surface = tiles.surface[0]?.id ?? '';
  let mine = 0;
  let mineChance = 0;
  for (const s of tiles.subsoil) {
    if (subTotal <= 0) break;
    const p = s.weight / subTotal;
    const v = Math.max(0, mineSiteWorth(ctx, fakeHex(surface, s.id)));
    mine += p * v;
    if (v > 0) mineChance += p;
  }
  const out = {
    siteWorth: site,
    siteChance,
    siteIfAny: siteChance > 0 ? site / siteChance : 0,
    mineSiteWorth: mine,
    mineChance,
    mineIfAny: mineChance > 0 ? mine / mineChance : 0,
  };
  cache.set(ctx, out);
  return out;
}
