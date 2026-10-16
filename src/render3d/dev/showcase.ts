/**
 * Vitrine da mesa 3D (Fase 2): uma partida real montada pelo motor (seed fixa, Vilas
 * fundadas por ações legais) + uma DECORAÇÃO SÓ VISUAL — hexes revelados, estruturas
 * de todos os tipos e níveis, tropas, permanentes e estoques. A decoração mexe só no
 * modelo de cena, nunca no estado do motor; serve para conferir a arte e para as
 * capturas de tela. Some quando a partida jogável existir (Fase 3).
 */
import { loadGameData } from '../../data';
import { RESOURCE_IDS } from '../../data/schemas';
import { applyAction, createContext, createGame, decider, legalActions } from '../../engine';
import type { EngineContext } from '../../engine/context';
import { distance } from '../../engine/hex';
import { Rng } from '../../engine/rng';
import type { GameState } from '../../engine/state';
import type { CardCategoryKey } from '../../ui/theme/tokens';
import {
  type SceneHex,
  type SceneModel,
  sceneModel,
  type ScenePermanent,
  type SceneStructure,
  type SceneTroop,
} from '../model';

export interface Showcase {
  readonly ctx: EngineContext;
  readonly state: GameState;
  readonly model: SceneModel;
}

/** Setup completo por ações legais: Vila no centro quando possível. */
function playSetup(ctx: EngineContext, state: GameState): GameState {
  let s = state;
  for (let guard = 0; s.stage === 'setup' && guard < 100; guard++) {
    const p = decider(s);
    const legal = legalActions(ctx, s, p);
    const action =
      legal.find((a) => a.type === 'chooseCompensation') ??
      legal.find((a) => a.type === 'chooseVillage' && a.hex === `${p}:0,0`) ??
      legal.find((a) => a.type === 'chooseVillage') ??
      legal[0];
    if (!action) throw new Error('vitrine: setup sem ação legal');
    s = applyAction(ctx, s, action).state;
  }
  return s;
}

const CATEGORIES: CardCategoryKey[] = ['tech', 'own', 'contract', 'relic', 'delivered'];
/** Uma carta real por categoria (as da v0.3), para a face rasterizada aparecer na vitrine. */
const SAMPLE_CARD: Record<CardCategoryKey, string> = {
  tech: 'tech_orbital_logistics',
  own: 'strategic_retreat',
  contract: 'tpl_preferential_tariff',
  relic: 'relic_nav_core',
  delivered: 'ion_bomb',
};

export function buildShowcase(players: number, seed: number): Showcase {
  const ctx = createContext(loadGameData(), players);
  const state = playSetup(ctx, createGame(ctx, { seed, layers: { specialHexes: true } }));
  const base = sceneModel(ctx, state);
  const rng = Rng.fromSeed(`showcase:${seed}`);

  const villageOf = new Map<number, SceneHex>();
  for (const h of base.hexes) if (h.structures.some((s) => s.type === 'village')) villageOf.set(h.boardId, h);

  // 1. Névoa: o jogador 0 explorou mais; hazards e sítios ficam à vista para conferência.
  let hexes = base.hexes.map((h): SceneHex => {
    const v = villageOf.get(h.boardId);
    const d = v ? distance(h, v) : 99;
    const reach = h.boardId === 0 ? 2 : 1;
    const revealed =
      h.revealed || h.kind !== 'surface' || d <= reach || (d === reach + 1 && rng.next() < 0.45);
    return { ...h, revealed };
  });

  // 2. Estruturas: o jogador 0 mostra todos os tipos; os outros, algumas.
  let uid = 1000;
  const placed = new Map<string, SceneStructure[]>();
  const tryPlace = (boardId: number, owner: number, type: string, level: number) => {
    const def = ctx.structure(type);
    const v = villageOf.get(boardId);
    const candidates = hexes
      .filter((h) => h.boardId === boardId && h.revealed && h.kind === 'surface')
      .filter((h) => !(placed.get(h.key) ?? h.structures).some((s) => s.type === type))
      .filter((h) => (placed.get(h.key) ?? h.structures).length < 2)
      .filter(
        (h) => !def.buildOn || def.buildOn.includes(h.terrain) || def.buildOn.includes('surveyedSubsoil'),
      )
      .sort((a, b) => (v ? distance(a, v) - distance(b, v) : 0));
    const free = candidates.filter(
      (h) => h.key !== v?.key && (placed.get(h.key) ?? h.structures).length === 0,
    );
    const target = free[0] ?? candidates[0];
    if (!target) return;
    const list = [...(placed.get(target.key) ?? target.structures)];
    list.push({ uid: uid++, type, level, owner });
    placed.set(target.key, list);
  };

  const v0 = villageOf.get(0);
  if (v0) {
    placed.set(
      v0.key,
      v0.structures.map((s) => (s.type === 'village' ? { ...s, level: 2 } : s)),
    );
    tryPlace(0, 0, 'market', 2);
  }
  const showcase0: [string, number][] = [
    ['park', 2],
    ['quarry', 1],
    ['mine', 3],
    ['workshop', 2],
    ['outpost', 3],
    ['wall', 1],
    ['barracks', 2],
    ['university', 3],
    ['archive', 1],
    ['park', 1],
  ];
  for (const [type, level] of showcase0) tryPlace(0, 0, type, level);

  const pool = ['park', 'quarry', 'workshop', 'outpost', 'barracks', 'university', 'market', 'mine'];
  for (let p = 1; p < players; p++) {
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const type = rng.pick(pool);
      const maxLevel = ctx.structure(type).levels.length;
      tryPlace(p, p, type, rng.int(1, maxLevel));
    }
  }
  hexes = hexes.map((h) => (placed.has(h.key) ? { ...h, structures: placed.get(h.key) ?? [] } : h));

  // 3. Tropas em hexes revelados do próprio tabuleiro, fora da Vila.
  const troopsAt = new Map<string, SceneTroop[]>();
  const addTroop = (owner: number, kind: SceneTroop['kind'], level: number) => {
    const v = villageOf.get(owner);
    const options = hexes.filter(
      (h) => h.boardId === owner && h.revealed && h.key !== v?.key && !troopsAt.has(h.key),
    );
    if (options.length === 0) return;
    const sorted = options.sort((a, b) => (v ? distance(a, v) - distance(b, v) : 0));
    const h = sorted[rng.int(0, Math.min(sorted.length, 6) - 1)];
    if (!h) return;
    troopsAt.set(h.key, [{ id: `t${owner}-${troopsAt.size}`, kind, level, owner }]);
  };
  addTroop(0, 'line', 1);
  addTroop(0, 'line', 2);
  addTroop(0, 'artillery', 3);
  for (let p = 1; p < players; p++) {
    addTroop(p, 'line', rng.int(1, 3));
    if (rng.next() < 0.6) addTroop(p, 'artillery', rng.int(1, 2));
  }
  hexes = hexes.map((h) => (troopsAt.has(h.key) ? { ...h, troops: troopsAt.get(h.key) ?? [] } : h));

  // 4. Estoques e permanentes.
  const bonus0 = { food: 8, stone: 6, iron: 5, coal: 3, oil: 2, gold: 4 };
  const playerModels = base.players.map((pl) => {
    const resources = { ...pl.resources };
    for (const id of RESOURCE_IDS) resources[id] += pl.id === 0 ? bonus0[id] : rng.int(0, 7);
    const filled = pl.id === 0 ? 3 : rng.int(0, 2);
    const permanents = pl.permanents.map((_, i): ScenePermanent | null => {
      if (i >= filled) return null;
      const category = pl.id === 0 ? (CATEGORIES[i] ?? 'tech') : rng.pick(CATEGORIES);
      return { id: SAMPLE_CARD[category], category };
    });
    return { ...pl, resources, permanents };
  });

  return { ctx, state, model: { hexes, players: playerModels } };
}
