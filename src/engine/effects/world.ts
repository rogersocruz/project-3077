/**
 * effectIds de eventos (events.json), hazards (tiles.json) e facções (factions.json).
 * Cada um tem parâmetros validados na carga (CLAUDE.md regra 6). Eventos e danos de
 * hazard têm ganchos (revelação, fim de rodada, dano); os passivos são lidos pelas regras
 * com `eventParams` / `hazardParams`. Facções entram na Fase 9.
 */
import { z } from 'zod';
import { ResourceId } from '../../data/schemas';
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import { getPlayer, hexKeyOf } from '../queries';
import { HORDE, previewCombat, resolveCombat } from '../rules/combat';
import { destroyStructure } from '../rules/damage';
import { alivePlayers, disaster, hazardAt, hexDefense, hexesAround, markUntil } from '../rules/hazards';
import type { GameState, HexKey, LayerName } from '../state';

export interface WorldScope {
  readonly ctx: EngineContext;
  readonly state: GameState;
  readonly events: GameEvent[];
}

export interface WorldEffect {
  /** Camada a que pertence. */
  readonly layer: LayerName;
  /** Outras camadas sem as quais o evento não entra no baralho (interpretação U/AJ). */
  readonly requires: readonly LayerName[];
  readonly implemented: boolean;
  validateParams(raw: unknown): string | null;
  /** Evento revelado no início da rodada. */
  onReveal?(w: WorldScope, raw: unknown): void;
  /** Fim da rodada do evento. */
  onRoundEnd?(w: WorldScope, raw: unknown): void;
  /** Dano do hazard no hex `key`. */
  onDamage?(w: WorldScope, key: HexKey, raw: unknown): void;
  /** Ações da contra-ação ("quem gastar N ações fica imune"), se houver. */
  counterActions?(raw: unknown): number;
}

interface Spec<P> {
  readonly layer: LayerName;
  readonly params: z.ZodType<P>;
  readonly requires?: readonly LayerName[];
  readonly implemented?: boolean;
  readonly onReveal?: (w: WorldScope, p: P) => void;
  readonly onRoundEnd?: (w: WorldScope, p: P) => void;
  readonly onDamage?: (w: WorldScope, key: HexKey, p: P) => void;
  readonly counter?: (p: P) => number;
}

function world<P>(spec: Spec<P>): WorldEffect {
  const parse = (raw: unknown): P => spec.params.parse(raw ?? {});
  const out: WorldEffect = {
    layer: spec.layer,
    requires: spec.requires ?? [],
    implemented: spec.implemented ?? true,
    validateParams: (raw) => {
      const r = spec.params.safeParse(raw ?? {});
      return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    },
  };
  return {
    ...out,
    ...(spec.onReveal ? { onReveal: (w: WorldScope, raw: unknown) => spec.onReveal?.(w, parse(raw)) } : {}),
    ...(spec.onRoundEnd
      ? { onRoundEnd: (w: WorldScope, raw: unknown) => spec.onRoundEnd?.(w, parse(raw)) }
      : {}),
    ...(spec.onDamage
      ? { onDamage: (w: WorldScope, key: HexKey, raw: unknown) => spec.onDamage?.(w, key, parse(raw)) }
      : {}),
    ...(spec.counter ? { counterActions: (raw: unknown) => spec.counter?.(parse(raw)) ?? 0 } : {}),
  };
}

const Count = z.number().int().positive();
const None = z.strictObject({});
const Terrains = z.array(z.string()).min(1);

const ashAround = (w: WorldScope, key: HexKey, radius: number, rounds: number) => {
  const hex = w.state.hexes[key];
  if (!hex) return;
  for (const k of hexesAround(w.ctx, w.state, hex, radius))
    markUntil(w.state, k, 'ashUntil', rounds, w.events);
};

const AshParams = z.strictObject({ radius: Count, noProductionRounds: Count });

/** Hazards cujo bônus tem este effectId (o Vulcão é o que tem `produce`). */
const hazardsWithBonus = (w: WorldScope, effectId: string): HexKey[] =>
  Object.entries(w.state.hexes)
    .filter(([, h]) => hazardAt(w.ctx, h)?.bonus.effectId === effectId)
    .map(([k]) => k);

export const WORLD_EFFECTS: Readonly<Record<string, WorldEffect>> = {
  // ── events.json ──────────────────────────────────────────────────────────
  /** Tremor de Terra: desastre em cada hex do terreno (Montanha só com estrutura; hazard sempre). */
  disasterAtTerrain: world({
    layer: 'events',
    params: z.strictObject({ terrains: Terrains }),
    onReveal: (w, p) => {
      for (const [key, hex] of Object.entries(w.state.hexes)) {
        if (!p.terrains.includes(hex.surface)) continue;
        if (hazardAt(w.ctx, hex) || hex.structures.length > 0) disaster(w.ctx, w.state, key, w.events);
      }
    },
  }),
  /** Colapso Sísmico: Minas não operam na rodada; a contra-ação mantém as do jogador. */
  minesOffWithCounter: world({
    layer: 'events',
    params: z.strictObject({ counterActions: Count }),
    counter: (p) => p.counterActions,
  }),
  /** Crosta Instável: Sondar falha na rodada, exceto com Drone. */
  surveyBlocked: world({ layer: 'events', params: None }),
  /** Erupção: desastre no Vulcão, que vira Vazio para sempre. */
  volcanoErupt: world({
    layer: 'events',
    requires: ['specialHexes'],
    params: None,
    onReveal: (w) => {
      for (const key of hazardsWithBonus(w, 'produce')) {
        disaster(w.ctx, w.state, key, w.events);
        const hex = w.state.hexes[key];
        if (hex) hex.surface = 'empty';
        w.events.push({ type: 'volcanoErupted', hex: key });
      }
    },
  }),
  /** Nuvem de Cinzas (evento e dano do Vulcão): a área não produz por N rodadas. */
  ashCloud: world({
    layer: 'events',
    params: AshParams,
    onReveal: (w, p) => {
      for (const key of hazardsWithBonus(w, 'produce')) ashAround(w, key, p.radius, p.noProductionRounds);
    },
    onDamage: (w, key, p) => ashAround(w, key, p.radius, p.noProductionRounds),
  }),
  /** Chuva Ácida: Parques de superfície −amount na rodada; contra-ação imuniza. */
  parksMinusWithCounter: world({
    layer: 'events',
    params: z.strictObject({ amount: Count, counterActions: Count }),
    counter: (p) => p.counterActions,
  }),
  /** Estação Fértil: Parques nos terrenos +amount na rodada. */
  terrainYieldBonus: world({
    layer: 'events',
    params: z.strictObject({ terrains: Terrains, amount: Count }),
  }),
  /** Praga: no fim da rodada cada jogador perde `amount` Comida; contra-ação imuniza. */
  loseFoodWithCounter: world({
    layer: 'events',
    params: z.strictObject({ amount: Count, counterActions: Count }),
    counter: (p) => p.counterActions,
    onRoundEnd: (w, p) => {
      for (const id of alivePlayers(w.state)) {
        if (w.state.world.braced.includes(id)) continue;
        const res = getPlayer(w.state, id).resources;
        const lost = Math.min(p.amount, res.food);
        res.food -= lost;
        w.events.push({ type: 'eventFoodLoss', player: id, amount: lost });
      }
    },
  }),
  /** Ionização: Minas não operam na rodada. */
  minesOff: world({ layer: 'events', params: None }),
  /** Tempestade Magnética: nenhum Drone na rodada. */
  dronesOff: world({ layer: 'events', params: None }),
  /** Ventos de Cauda: movimento custa metade da Comida (rules/troops.ts). */
  halfMoveCost: world({ layer: 'events', requires: ['conflict'], params: None }),
  /**
   * Horda (interpretação AK, até a Fase 7): sai da Ruína "mais ao norte" (menor r global,
   * depois menor q) e ataca o vizinho com mais estruturas: desastre só nesse hex, a menos
   * que a defesa (Muro + Postos adjacentes) alcance a força.
   */
  spawnHorde: world({
    layer: 'events',
    requires: ['specialHexes'],
    params: z.strictObject({ strength: Count }),
    onReveal: (w, p) => {
      const ruins = w.ctx.data.tiles.sites.filter((s) => s.eventTrigger === 'horde').map((s) => s.id);
      const origin = Object.entries(w.state.hexes)
        .filter(([, h]) => ruins.includes(h.surface))
        .map(([key, h]) => ({ key, g: w.ctx.planet.toGlobal(h) }))
        .sort((a, b) => a.g.r - b.g.r || a.g.q - b.g.q)[0];
      if (!origin) return;
      const from = w.state.hexes[origin.key];
      if (!from) return;
      const target = w.ctx.planet
        .neighbors(from)
        .map((n) => ({ key: hexKeyOf(n), n: w.state.hexes[hexKeyOf(n)]?.structures.length ?? 0 }))
        .filter((t) => t.n > 0)
        .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))[0];
      if (!target) return;
      // Fase 7: com tropas no hex, combate de verdade (baixas automáticas); sem tropas, a Horda
      // vence. Sem a camada de conflito, vale a regra da Fase 6 (Muro + Postos, AK).
      const troopsThere = (w.state.hexes[target.key]?.troops.length ?? 0) > 0;
      let defense = 0;
      let repelled: boolean;
      if (w.state.layers.conflict) {
        if (troopsThere) {
          const pv = previewCombat(w.ctx, w.state, target.key, {
            extra: { owner: HORDE, kind: 'horde', strength: p.strength, attacks: true },
          });
          defense = Math.max(0, ...(pv?.sides.filter((s) => s.owner !== HORDE).map((s) => s.total) ?? []));
          const winner = resolveCombat(w.ctx, w.state, target.key, w.events, {
            extra: { owner: HORDE, kind: 'horde', strength: p.strength, attacks: true },
            auto: true,
          });
          w.state.combat = null;
          repelled = winner !== HORDE;
        } else repelled = false;
      } else {
        defense = hexDefense(w.ctx, w.state, target.key);
        repelled = defense >= p.strength;
      }
      w.events.push({
        type: 'hordeAttack',
        from: origin.key,
        to: target.key,
        strength: p.strength,
        defense,
        repelled,
      });
      if (!repelled) disaster(w.ctx, w.state, target.key, w.events, 0);
    },
  }),
  /** Guardiões: todo Templo não escavado ganha um Guardião parado (interpretação AK). */
  templeGuardians: world({
    layer: 'events',
    requires: ['specialHexes'],
    params: z.strictObject({ strength: Count }),
    onReveal: (w, p) => {
      const temples = w.ctx.data.tiles.sites.filter((s) => s.risk === 'guardian').map((s) => s.id);
      for (const [key, hex] of Object.entries(w.state.hexes)) {
        if (!temples.includes(hex.surface) || hex.guardian !== null) continue;
        hex.guardian = p.strength;
        w.events.push({ type: 'guardianSpawned', hex: key, strength: p.strength });
      }
    },
  }),
  /** Mercado Aquecido / Quebra de Crédito: spread da banca na rodada. */
  bankSpread: world({ layer: 'events', params: z.strictObject({ spread: z.number().int().nonnegative() }) }),
  /** Veio Exposto: o primeiro a Sondar na rodada revela o subsolo em raio N. */
  firstSurveyBonus: world({ layer: 'events', params: z.strictObject({ radius: Count }) }),

  // ── tiles.json: bônus dos hazards (passivos, lidos pelas regras) ───────────
  produce: world({
    layer: 'specialHexes',
    params: z.strictObject({ resource: ResourceId, amount: Count, withoutMine: z.boolean() }),
  }),
  freeMineUpkeep: world({ layer: 'specialHexes', params: z.strictObject({ radius: Count }) }),
  doubleFood: world({ layer: 'specialHexes', params: None }),
  freeDroneFromHere: world({ layer: 'specialHexes', params: None }),
  thinCrust: world({
    layer: 'specialHexes',
    params: z.strictObject({
      freeSurvey: z.boolean(),
      mineDiscount: z.partialRecord(ResourceId, z.number().int().positive()),
      multiplierBonus: Count,
    }),
  }),
  freePort: world({
    layer: 'specialHexes',
    params: z.strictObject({ bankSpread: z.number().int().nonnegative(), tradeIgnoresBorder: z.boolean() }),
  }),
  sabotageShield: world({ layer: 'specialHexes', params: z.strictObject({ radius: Count }) }),

  // ── tiles.json: dano dos hazards (gatilho = categoria do evento) ──────────
  geyserDry: world({
    layer: 'specialHexes',
    params: z.strictObject({ rounds: Count }),
    onDamage: (w, key, p) => markUntil(w.state, key, 'dryUntil', p.rounds, w.events),
  }),
  contaminate: world({
    layer: 'specialHexes',
    params: z.strictObject({ cleanActions: Count }),
    onDamage: (w, key, p) => {
      const hex = w.state.hexes[key];
      if (!hex) return;
      hex.status.contaminated = Math.max(hex.status.contaminated ?? 0, p.cleanActions);
      w.events.push({ type: 'hexContaminated', hex: key, actions: hex.status.contaminated });
    },
  }),
  groundDrones: world({
    layer: 'specialHexes',
    params: z.strictObject({ rounds: Count }),
    onDamage: (w, key, p) => markUntil(w.state, key, 'groundedUntil', p.rounds, w.events),
  }),
  mineCollapse: world({
    layer: 'specialHexes',
    params: z.strictObject({ sealRounds: Count }),
    onDamage: (w, key, p) => {
      const hex = w.state.hexes[key];
      if (!hex) return;
      for (const s of hex.structures.filter((x) => x.type === 'mine'))
        destroyStructure(w.state, s.uid, w.events);
      markUntil(w.state, key, 'sealedUntil', p.sealRounds, w.events);
    },
  }),
  portClosed: world({
    layer: 'specialHexes',
    params: z.strictObject({ rounds: Count, spreadMultiplier: Count }),
    onDamage: (w, key, p) => markUntil(w.state, key, 'closedUntil', p.rounds, w.events),
  }),
  sabotageAmplify: world({
    layer: 'specialHexes',
    params: z.strictObject({ radius: Count, factor: Count, rounds: Count }),
    onDamage: (w, key, p) => markUntil(w.state, key, 'amplifiedUntil', p.rounds, w.events),
  }),

  // ── factions.json (Fase 9) ───────────────────────────────────────────────
  // Habilidades passivas: as regras leem os parâmetros por rules/factions.ts → ability().
  betterBank: world({ layer: 'factions', params: z.strictObject({ sellOffset: z.number().int() }) }),
  freeSurvey: world({ layer: 'factions', params: z.strictObject({ perTurn: z.number().int().positive() }) }),
  ignoreDiscardOnSabotage: world({ layer: 'factions', params: z.strictObject({}) }),
  parkEfficiency: world({
    layer: 'factions',
    params: z.strictObject({
      fromLevel: z.number().int().positive(),
      asLevel: z.number().int().positive(),
      /** Experimento de balanceamento: só os N primeiros Parques do dono. */
      maxParks: z.number().int().positive().optional(),
    }),
  }),
  protocol: world({
    layer: 'factions',
    params: z.strictObject({
      band: z.enum(['n1', 'n2', 'n3']),
      extraDraw: z.number().int().nonnegative(),
      deck: z.enum(['n1', 'n2', 'n3']),
    }),
  }),
  underdogAction: world({
    layer: 'factions',
    params: z.strictObject({ actions: z.number().int().positive() }),
  }),
};

export function worldEffect(effectId: string): WorldEffect {
  const e = WORLD_EFFECTS[effectId];
  if (!e) throw new Error(`effectId desconhecido: ${effectId}`);
  return e;
}
