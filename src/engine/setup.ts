/**
 * Montagem determinística da partida (GDD 3.2). Mesma seed + mesmas opções = mesmo
 * planeta. Toda aleatoriedade vem de rng.ts.
 */
import { RESOURCE_IDS } from '../data/schemas';
import type { EngineContext } from './context';
import { distance, ORIGIN } from './hex';
import { emptyResources, hexKeyOf, isSpecialTerrain } from './queries';
import { hashSeed, Rng, type Seed } from './rng';
import { buildEventDeck } from './rules/world';
import { buildDecks } from './rules/cards';
import { drawCards } from './rules/decks';
import { DEFAULT_LAYERS, type GameState, type HexState, type PlayerState, type RuleLayers } from './state';

export interface GameOptions {
  readonly seed: Seed;
  readonly layers?: Partial<Omit<RuleLayers, 'economy'>>;
  readonly longMap?: boolean;
}

export interface Tile {
  readonly surface: string;
  readonly subsoil: string;
}

/**
 * Maior resto: transforma pesos em contagens inteiras que somam `total`.
 * Empates de resto vão para o item que aparece primeiro.
 */
export function apportion(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w * total) / sum);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left-- <= 0) break;
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts;
}

const repeat = (id: string, n: number): string[] => Array.from({ length: n }, () => id);

/** Faces de superfície do baralho geral (antes de embaralhar). GDD 3.2 passo 1 + tiles.json. */
export function surfaceDeck(ctx: EngineContext, specialHexes: boolean): string[] {
  const { tiles } = ctx.data;
  const total = ctx.planet.hexes.length;
  const n = ctx.playerCount;
  const deck: string[] = [];

  if (specialHexes) {
    for (const site of tiles.sites) deck.push(...repeat(site.id, Math.round((site.copiesFor6 * n) / 6)));
    // GDD 3.2 passo 5: hazards são únicos no planeta.
    for (const hazard of tiles.hazards) deck.push(hazard.id);
  }

  const rest = total - deck.length;
  if (rest < 0) throw new Error(`baralho de tiles: especiais (${deck.length}) excedem o planeta (${total})`);
  const [resourceCount = 0, emptyCount = 0] = apportion(
    [tiles.categoryWeights.resource, tiles.categoryWeights.empty],
    rest,
  );
  for (const [category, count] of [
    ['resource', resourceCount],
    ['empty', emptyCount],
  ] as const) {
    const kinds = tiles.surface.filter((s) => s.category === category);
    apportion(
      kinds.map((k) => k.weight),
      count,
    ).forEach((c, i) => deck.push(...repeat(kinds[i]?.id ?? '', c)));
  }
  return deck;
}

/** Versos de subsolo, um por tile. */
export function subsoilDeck(ctx: EngineContext): string[] {
  const kinds = ctx.data.tiles.subsoil;
  const deck: string[] = [];
  apportion(
    kinds.map((k) => k.weight),
    ctx.planet.hexes.length,
  ).forEach((c, i) => deck.push(...repeat(kinds[i]?.id ?? '', c)));
  return deck;
}

export function isFoodTile(ctx: EngineContext, surface: string): boolean {
  const t = ctx.terrain(surface);
  return t.kind === 'surface' && t.def.produces.includes('food');
}

export function isGoldSubsoil(ctx: EngineContext, subsoil: string): boolean {
  return ctx.subsoil(subsoil).resource === 'gold';
}

/**
 * GDD 3.2 passo 4: garante o mínimo por tabuleiro por re-sorteio local — troca um
 * tile do tabuleiro carente com um tile sorteado de outro tabuleiro que tenha folga.
 * `field` define o que se troca: o tile inteiro (Comida) ou só o verso (Ouro).
 */
function enforceMinimum(
  ctx: EngineContext,
  rng: Rng,
  boards: Tile[][],
  min: number,
  matches: (t: Tile) => boolean,
  field: 'tile' | 'subsoil',
  label: string,
): void {
  const count = (b: Tile[]) => b.filter(matches).length;
  for (let b = 0; b < boards.length; b++) {
    const board = boards[b] as Tile[];
    while (count(board) < min) {
      const donors: [number, number][] = [];
      boards.forEach((other, ob) => {
        if (ob === b || count(other) <= min) return;
        other.forEach((t, i) => {
          if (matches(t)) donors.push([ob, i]);
        });
      });
      const receivers = board
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => !matches(t) && (field === 'subsoil' || !isSpecialTerrain(ctx, t.surface)))
        .map(({ i }) => i);
      if (donors.length === 0 || receivers.length === 0) {
        throw new Error(`setup: impossível garantir ${min} × ${label} no tabuleiro ${b}`);
      }
      const [ob, di] = rng.pick(donors);
      const ri = rng.pick(receivers);
      const donorBoard = boards[ob] as Tile[];
      const mine = board[ri] as Tile;
      const theirs = donorBoard[di] as Tile;
      if (field === 'tile') {
        board[ri] = theirs;
        donorBoard[di] = mine;
      } else {
        board[ri] = { surface: mine.surface, subsoil: theirs.subsoil };
        donorBoard[di] = { surface: theirs.surface, subsoil: mine.subsoil };
      }
    }
  }
}

/** Tiles de cada tabuleiro na ordem de ctx.planet.hexes. */
export function dealTiles(ctx: EngineContext, rng: Rng, specialHexes: boolean): Tile[][] {
  const surfaces = rng.shuffle(surfaceDeck(ctx, specialHexes));
  const subsoils = rng.shuffle(subsoilDeck(ctx));
  const boards: Tile[][] = ctx.planet.boards.map(() => []);
  ctx.planet.hexes.forEach((h, i) => {
    boards[h.boardId]?.push({ surface: surfaces[i] ?? '', subsoil: subsoils[i] ?? '' });
  });

  const s = ctx.balance.setup;
  enforceMinimum(
    ctx,
    rng,
    boards,
    s.minFoodHexesPerBoard,
    (t) => isFoodTile(ctx, t.surface),
    'tile',
    'Comida',
  );
  enforceMinimum(
    ctx,
    rng,
    boards,
    s.guaranteedGoldSubsoilPerBoard,
    (t) => isGoldSubsoil(ctx, t.subsoil),
    'subsoil',
    'Ouro no subsolo',
  );
  return boards;
}

/** GDD 3.2 passo 7: zona permitida da Vila — distância ≤ map.villageStartRing do centro, sem sítio/hazard. */
export function inVillageZone(ctx: EngineContext, hex: HexState): boolean {
  return distance(ORIGIN, hex) <= ctx.balance.map.villageStartRing && !isSpecialTerrain(ctx, hex.surface);
}

export function createGame(ctx: EngineContext, options: GameOptions): GameState {
  const seed = hashSeed(options.seed);
  const rng = Rng.fromSeed(seed);
  const layers: RuleLayers = { ...DEFAULT_LAYERS, ...options.layers, economy: true };

  const boards = dealTiles(ctx, rng, layers.specialHexes);
  const hexes: Record<string, HexState> = {};
  const cursor = boards.map(() => 0);
  for (const h of ctx.planet.hexes) {
    const i = cursor[h.boardId] ?? 0;
    cursor[h.boardId] = i + 1;
    const tile = boards[h.boardId]?.[i];
    if (!tile) throw new Error(`setup: tile ausente em ${hexKeyOf(h)}`);
    hexes[hexKeyOf(h)] = {
      boardId: h.boardId,
      q: h.q,
      r: h.r,
      surface: tile.surface,
      subsoil: tile.subsoil,
      revealed: false,
      surveyedBy: [],
      depleted: false,
      seal: null,
      yieldBonus: 0,
      structures: [],
      status: {},
      guardian: null,
      excavatedBy: null,
    };
  }
  // Depois dos tiles: com cartas desligadas o RNG não é tocado e o planeta não muda.
  const cards = buildDecks(ctx, layers, rng);
  // GDD 9: baralho de eventos da partida (só com a camada; sem ela o RNG não é tocado).
  const eventDeck = buildEventDeck(ctx, { layers }, (items) => rng.shuffle(items));

  const start = ctx.balance.setup.startingResources;
  const players: PlayerState[] = ctx.planet.boards.map((b) => {
    const resources = emptyResources();
    for (const id of RESOURCE_IDS) resources[id] = start[id] ?? 0;
    const hasSpecial = (boards[b.id] ?? []).some((t) => isSpecialTerrain(ctx, t.surface));
    return {
      id: b.id,
      boardId: b.id,
      resources,
      villageHex: null,
      villageLives: ctx.balance.village.lives,
      // GDD 3.2 passo 6: só faz sentido com a camada de hexes especiais.
      compensation: layers.specialHexes && !hasSpecial ? 'pending' : 'none',
      hand: [],
      permanents: Array.from({ length: ctx.balance.permanents.slots }, () => null),
      incoming: [],
      receivedThisRound: 0,
      deliveredThisTurn: 0,
      eliminated: false,
    };
  });

  const state: GameState = {
    rulesVersion: ctx.balance._meta.rulesVersion,
    seed,
    rngState: rng.state,
    layers,
    longMap: options.longMap ?? false,
    playerCount: ctx.playerCount,
    stage: 'setup',
    round: 0,
    activePlayer: 0,
    phase: 'reveal',
    actionsLeft: 0,
    players,
    hexes,
    nextUid: 1,
    pendingTrade: null,
    cards,
    pending: null,
    world: { deck: eventDeck, used: [], current: null, braced: [], firstSurveyDone: false, withheld: [] },
    winners: [],
    endReason: null,
    log: [],
  };
  // GDD 6.4: mão inicial (interpretação W: do baralho setup.startingHandDeck), por assento.
  if (layers.cards) {
    const { startingHand, startingHandDeck } = ctx.balance.setup;
    for (const p of players) drawCards(state, p.id, startingHandDeck, startingHand, []);
  }
  return state;
}
