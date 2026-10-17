/**
 * Esquemas Zod de cada arquivo em data/. Objetos são estritos: um campo com nome
 * errado vira erro de validação em vez de ser ignorado em silêncio.
 */
import { z } from 'zod';

// ── Primitivos ───────────────────────────────────────────────────────────────

export const RESOURCE_IDS = ['food', 'stone', 'iron', 'coal', 'oil', 'gold'] as const;
export const ResourceId = z.enum(RESOURCE_IDS);
export type ResourceId = z.infer<typeof ResourceId>;

export const EVENT_CATEGORIES = ['seismic', 'thermal', 'climatic', 'atmospheric', 'horde', 'economic'] as const;
export const EventCategory = z.enum(EVENT_CATEGORIES);

export const DeckId = z.enum(['n1', 'n2', 'n3']);
export const CardDeckId = z.enum(['n1', 'n2', 'n3', 'treasure']);

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id deve ser snake_case minúsculo');
/** effectId: camelCase; a existência do handler é checada a partir da Fase 4. */
export const EffectId = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'effectId deve ser camelCase');
const Text = z.string().min(1);
const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'cor deve ser #RRGGBB');
const Count = z.number().int().nonnegative();
const Positive = z.number().int().positive();
const Params = z.record(z.string(), z.unknown());

export const ResourceAmounts = z.partialRecord(ResourceId, Count);

const Meta = z.record(z.string(), z.string()).optional();
const ArtSubject = z.strictObject({ subject: Text });
const ArtTerrain = z.strictObject({ terrain: Text });

// ── resources.json ───────────────────────────────────────────────────────────

export const ResourceSchema = z.strictObject({
  id: ResourceId,
  name: Text,
  value: Positive,
  color: HexColor,
  tokenShape: z.enum(['disc', 'roundedCube', 'hexPrism', 'rhombus', 'drop', 'octagon']),
  icon: Text,
  exclusiveUse: Text,
});
export const ResourcesFile = z.array(ResourceSchema);

// ── balance.json ─────────────────────────────────────────────────────────────

const DeckDraw = z.strictObject({ deck: DeckId, count: Positive });

export const BalanceFile = z.strictObject({
  _meta: z.strictObject({ rulesVersion: z.string().regex(/^\d+\.\d+\.\d+$/), note: Text }),
  map: z.strictObject({ edge: Positive, edgeLong: Positive, villageStartRing: Count }),
  turn: z.strictObject({ actionsPerTurn: Positive, roundLimit: Positive }),
  hex: z.strictObject({ slots: Positive }),
  setup: z.strictObject({
    startingResources: z.record(ResourceId, Count),
    startingHand: Count,
    /** Baralho da mão inicial (interpretação W da Fase 4). */
    startingHandDeck: DeckId,
    minFoodHexesPerBoard: Count,
    guaranteedGoldSubsoilPerBoard: Count,
    noSpecialCompensation: z.strictObject({
      choose: z
        .array(
          z.union([
            z.strictObject({ resourcesOfChoice: Positive }),
            z.strictObject({ drawFromDeck: DeckId, count: Positive }),
          ]),
        )
        .min(1),
    }),
  }),
  cards: z.strictObject({
    handLimit: Positive,
    archiveHandLimitPerLevel: Count,
    receiveCapPerRound: Count,
    deliverPerTurn: Count,
    /** Alcance RAIO N de carta atravessa fronteira (interpretação T da Fase 4). */
    radiusCrossesBorder: z.boolean(),
    /** Nível da Universidade → linhas de compra (o jogador escolhe uma linha). */
    universityDraw: z.record(z.string().regex(/^\d+$/), z.array(z.array(DeckDraw).min(1)).min(1)),
    ruinBonusDraw: Count,
    tutorRevealTop: Positive,
  }),
  /** GDD 7.4; installActions = GDD 6.3 "Instalar permanente: 1 ação" (se a carta não disser). */
  permanents: z.strictObject({ slots: Positive, installActions: Count }),
  bank: z.strictObject({
    buyOffset: z.number().int(),
    sellOffset: z.number().int(),
    marketSpreadReductionPerLevel: Count,
    minSpread: Count,
    roundingFavorsBank: z.boolean(),
    /** Qual lado do spread o Mercado reduz primeiro (DECISOES_ABERTAS, interpretação A da Fase 1). */
    spreadReductionOrder: z.enum(['sellFirst', 'buyFirst']),
  }),
  trade: z.strictObject({
    /** Comércio entre jogadores só entre tabuleiros vizinhos (interpretação B da Fase 1). */
    requiresAdjacentBoard: z.boolean(),
  }),
  production: z.strictObject({
    parkYieldByLevel: z.array(Count).min(1),
    quarryYieldByLevel: z.array(Count).min(1),
    mineMultiplier: Positive,
    mineTokens: Positive,
    mineCoalUpkeep: Count,
    occupiedHexYield: Count,
    lagoonDualYield: z.boolean(),
  }),
  range: z.strictObject({
    village: Count,
    outpost: Count,
    outpostOnMountain: Count,
    droneBonusByTier: z.array(Count).length(3),
    outpostLimit: Text,
    buildAcrossBorder: z.boolean(),
  }),
  village: z.strictObject({ lives: Positive, regenPerLevelUp: Count }),
  troops: z.strictObject({
    line: z.strictObject({ strength: Positive, cost: ResourceAmounts, occupies: z.boolean() }),
    artillery: z.strictObject({
      strength: Positive,
      cost: ResourceAmounts,
      occupies: z.boolean(),
      supportRange: Positive,
    }),
    strengthPerLevel: Count,
    maxLevel: Positive,
    armyCapPerBarracksLevel: Positive,
    moveFoodPerHex: Count,
    moveFoodMountain: Count,
  }),
  combat: z.strictObject({
    maxPositiveModifiers: Count,
    maxArtillerySupport: Count,
    modifiers: z.strictObject({
      defenderHomeBoard: z.number().int(),
      formation2: z.number().int(),
      formation3: z.number().int(),
      wall: z.number().int(),
      adjacentOutpost: z.number().int(),
      attackerCrossedBorder: z.number().int(),
    }),
    artilleryInMeleeFactor: z.number().min(0).max(1),
    tieLossEachSide: Count,
    retreatHexes: Count,
    /** GDD 8.5: tropa na Vila inimiga sem defensor no fim da rodada tira N vidas (máx. 1 vez por rodada). */
    villageDamagePerRound: Count,
  }),
  border: z.strictObject({
    tollPerTroop: Count,
    maxModifiers: Count,
    changeTariffOnlyAtRoundStart: z.boolean(),
    /** Tarifa de cada jogador no início da partida (interpretação AR). */
    defaultTariff: ResourceId,
  }),
  events: z.strictObject({ perRound: Count, maxPerCategoryInActiveDeck: Positive, activeDeckSize: Positive }),
  treaties: z.strictObject({
    goldCostEach: Count,
    maxActivePerPlayer: Positive,
    pactDurationRounds: Positive,
    negativeTriggerDeadlineRounds: Positive,
    pactBreakPenalty: z.strictObject({ discardHand: z.boolean(), loseActions: Count }),
    defaultPenalty: z.strictObject({ loseActions: Count }),
  }),
  victory: z.strictObject({
    resourceThresholds: z.record(ResourceId, Positive),
    expansionHexes: Positive,
    tribeTarget: z.strictObject({
      enabled: z.boolean(),
      targetLives: Count,
      holdUntilRoundEnd: z.boolean(),
    }),
    elimination: z.boolean(),
    tiebreak: z.enum(['highestSummedProgress']),
    /** Empate que persiste após o desempate (interpretação D da Fase 1). */
    finalTie: z.enum(['shared', 'seatOrder']),
    /** GDD 13.2 / D11: eliminado sai da partida ou vira facção neutra jogada pela IA. */
    eliminatedRule: z.enum(['leave', 'neutral']),
  }),
  costPoints: z.strictObject({
    food: Count,
    stone: Count,
    iron: Count,
    coal: Count,
    oil: Count,
    gold: Count,
    discardCard: Count,
    opponentDraws: Count,
    action: Count,
  }),
  tierBands: z.record(DeckId, z.tuple([Count, Count])),
  /** Caminhos (com ponto) de valores provisórios — checados contra o próprio arquivo. */
  provisional: z.array(Text),
});

// ── tiles.json ───────────────────────────────────────────────────────────────

const EffectRef = z.strictObject({ effectId: EffectId, params: Params });

export const TilesFile = z.strictObject({
  _meta: Meta,
  categoryWeights: z.strictObject({ resource: Count, empty: Count }),
  surface: z.array(
    z.strictObject({
      id: Id,
      name: Text,
      category: z.enum(['resource', 'empty']),
      produces: z.array(ResourceId),
      builder: Id.nullable(),
      moveCostFood: Count,
      weight: Positive,
      rangeBonus: z.record(z.string(), Count).optional(),
      eventTrigger: EventCategory.optional(),
      art: ArtTerrain,
    }),
  ),
  subsoil: z.array(z.strictObject({ id: Id, resource: ResourceId.nullable(), weight: Positive })),
  sites: z.array(
    z.strictObject({
      id: Id,
      name: Text,
      copiesFor6: Positive,
      action: z.enum(['excavate']),
      excavateCost: ResourceAmounts,
      reward: z.strictObject({ treasureDraw: Positive }),
      passive: z.strictObject({ extraDraw: Count, unlockDeck: DeckId }).optional(),
      afterExcavate: z.enum(['empty', 'keep']),
      risk: z.enum(['guardian']).optional(),
      eventTrigger: EventCategory.optional(),
      art: ArtTerrain,
    }),
  ),
  hazards: z.array(
    z.strictObject({
      id: Id,
      name: Text,
      trigger: EventCategory,
      bonus: EffectRef,
      damage: EffectRef,
      art: ArtTerrain,
    }),
  ),
  disaster: z.strictObject({
    radius: Count,
    downgradeLevels: Count,
    destroyLevel1: z.boolean(),
    villageImmune: z.boolean(),
    villageLoseLives: Count,
    affectsPermanents: z.boolean(),
  }),
});

// ── structures.json ──────────────────────────────────────────────────────────

const StructureLevel = z.strictObject({
  cost: ResourceAmounts,
  range: Count.optional(),
  outpostLimit: Count.optional(),
  yield: Count.optional(),
  multiplier: Positive.optional(),
  unlocksUpgradeTo: Positive.optional(),
  upgradeDiscount: Count.optional(),
  defenseAdjacent: Count.optional(),
  defense: Count.optional(),
  armyCap: Positive.optional(),
  drawTable: Count.optional(),
  handLimitBonus: Count.optional(),
  spreadReduction: Count.optional(),
});

export const StructuresFile = z.array(
  z.strictObject({
    id: Id,
    name: Text,
    subtype: z.enum(['village', 'extraction', 'workshop', 'reach', 'military', 'knowledge', 'commerce']),
    rarity: z.union([z.literal(1), z.literal(2)]),
    slots: Positive,
    buildable: z.boolean().optional(),
    buildOn: z.array(z.string()).min(1).optional(),
    levels: z.array(StructureLevel).min(1),
    upkeep: ResourceAmounts.optional(),
    tokens: Positive.optional(),
    flags: z.array(Text).optional(),
    art: ArtSubject,
  }),
);

// ── cards.json ───────────────────────────────────────────────────────────────

export const CardCost = z.strictObject({
  resources: ResourceAmounts.optional(),
  /** Alternativas: o jogador paga uma delas. */
  resourcesAny: z.array(ResourceAmounts).min(2).optional(),
  discard: Positive.optional(),
  actions: Positive.optional(),
});

export const CardSchema = z.strictObject({
  id: Id,
  name: Text,
  deck: CardDeckId,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  type: z.enum(['action', 'tech', 'treasure', 'relic']),
  timing: z.enum(['own', 'delivered', 'install', 'instant']),
  valence: z.enum(['benefit', 'sabotage', 'information', 'logistics']),
  target: z.enum(['troop', 'structure', 'resource', 'player', 'subsoil', 'hex', 'card', 'permanent']),
  range: z.string().regex(/^(own|drone|global|radius:\d+)$/, 'range deve ser own | drone | global | radius:N'),
  duration: z.enum(['instant', 'turn', 'round', 'permanent']),
  cost: CardCost,
  effect: Text,
  effectId: EffectId,
  params: Params,
  copies: Positive,
  art: ArtSubject,
  flags: z.array(z.enum(['fixedCost'])).optional(),
});
export const CardsFile = z.array(CardSchema);

// ── events.json ──────────────────────────────────────────────────────────────

export const EventsFile = z.array(
  z.strictObject({
    id: Id,
    name: Text,
    category: EventCategory,
    effect: Text,
    effectId: EffectId,
    params: Params,
    terrainTargets: z.array(Id),
    copies: Positive,
    art: ArtSubject,
  }),
);

// ── factions.json ────────────────────────────────────────────────────────────

export const FactionsFile = z.array(
  z.strictObject({
    id: Id,
    name: Text,
    alignment: Text,
    color: HexColor,
    symbol: z.enum(['circle', 'square', 'triangle', 'rhombus', 'hexagon', 'pentagon']),
    ability: z.strictObject({ name: Text, text: Text, effectId: EffectId, params: Params }),
    advisor: z.strictObject({ name: Text, voice: Text }),
    lore: Text,
    art: ArtSubject,
  }),
);

// ── treaties.json ────────────────────────────────────────────────────────────

const VerbSpec = z.strictObject({
  verb: z.string().regex(/^[a-z][a-zA-Z]*$/),
  label: Text,
  objects: z.array(z.string()).min(1),
  params: z.array(z.string()).optional(),
});

export const TreatiesFile = z.strictObject({
  _meta: Meta,
  pacts: z.array(
    z.strictObject({
      id: Id,
      category: z.enum(['border', 'cards', 'military', 'commerce', 'observation']),
      name: Text,
      text: Text,
      params: z.array(z.string()).optional(),
    }),
  ),
  contract: z.strictObject({
    /** Papéis: me = quem propõe, you = quem recebe (resolvidos na assinatura). */
    subjects: z.array(z.string()).min(1),
    victims: z.array(z.string()).min(1),
    obligors: z.array(z.string()).min(1),
    triggers: z.array(VerbSpec).min(1),
    negation: z.strictObject({ allowed: z.boolean(), deadlineRounds: Positive }),
    consequences: z.array(VerbSpec).min(1),
    obligorMustBeSignatory: z.boolean(),
  }),
  /** Pactos que não podem valer ao mesmo tempo entre os mesmos signatários. */
  pactConflicts: z.array(z.tuple([Id, Id])),
  templates: z.array(
    z.discriminatedUnion('type', [
      z.strictObject({
        id: Id,
        name: Text,
        type: z.literal('contract'),
        if: z.strictObject({ subject: z.string(), verb: z.string(), object: z.string(), of: z.string() }),
        then: z.strictObject({
          obligor: z.string(),
          verb: z.string(),
          object: z.string(),
          type: ResourceId.optional(),
          amount: Positive.optional(),
          perTroop: z.boolean().optional(),
        }),
        text: Text,
        art: ArtSubject.optional(),
      }),
      z.strictObject({ id: Id, name: Text, type: z.literal('pact'), pact: Id }),
    ]),
  ),
});

// ── layouts.json ─────────────────────────────────────────────────────────────

export const LayoutsFile = z.strictObject({
  _meta: Meta,
  layouts: z.record(
    z.string().regex(/^\d+$/),
    z.array(z.strictObject({ q: z.number().int(), r: z.number().int() })).min(1),
  ),
});

// ── Registro de arquivos ─────────────────────────────────────────────────────

export const DATA_FILES = {
  'balance.json': BalanceFile,
  'resources.json': ResourcesFile,
  'tiles.json': TilesFile,
  'structures.json': StructuresFile,
  'cards.json': CardsFile,
  'events.json': EventsFile,
  'factions.json': FactionsFile,
  'treaties.json': TreatiesFile,
  'layouts.json': LayoutsFile,
} as const;

export type DataFileName = keyof typeof DATA_FILES;

export interface GameData {
  balance: z.infer<typeof BalanceFile>;
  resources: z.infer<typeof ResourcesFile>;
  tiles: z.infer<typeof TilesFile>;
  structures: z.infer<typeof StructuresFile>;
  cards: z.infer<typeof CardsFile>;
  events: z.infer<typeof EventsFile>;
  factions: z.infer<typeof FactionsFile>;
  treaties: z.infer<typeof TreatiesFile>;
  layouts: z.infer<typeof LayoutsFile>;
}
