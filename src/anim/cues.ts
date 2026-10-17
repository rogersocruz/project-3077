/**
 * Eventos do motor → pistas de animação (UX_SPEC 6). Puro e testado: agrupa o que anima
 * em cascata (revelações, produção), junta o custo pago à construção que ele pagou e
 * resolve onde cada coisa acontece (hex, posição dentro do hex, origem da varredura).
 * Eventos sem animação (propostas, fim de rodada…) só vão para o registro.
 */
import type { ResourceId } from '../data/schemas';
import type { EngineContext } from '../engine/context';
import type { GameEvent, IntelReport, PermanentRemoval } from '../engine/events';
import { findStructure, type ResourceAmounts } from '../engine/queries';
import type { ReasonKey } from '../engine/reasons';
import { rangeSources } from '../engine/rules/build';
import type {
  CardTarget,
  CardUid,
  DrawDeck,
  GameState,
  HexKey,
  PlayerId,
  Resources,
  TurnPhase,
} from '../engine/state';
import { type Slot, structureSlots } from '../render3d/placement';
import { cardCategory } from '../ui/card/model';
import type { CardCategoryKey } from '../ui/theme/tokens';

/** Uma carta identificada para a animação (id dos dados + categoria da moldura). */
export interface CardRef {
  readonly uid: CardUid;
  readonly id: string;
  readonly category: CardCategoryKey;
  readonly deck: DrawDeck | 'treasure';
}

/** Uma ação aplicada: estado antes, depois e os eventos que o motor emitiu. */
export interface Batch {
  readonly before: GameState;
  readonly after: GameState;
  readonly events: readonly GameEvent[];
}

export interface RevealItem {
  readonly hex: HexKey;
  readonly terrain: string;
  readonly hazard: boolean;
}

export interface PlacedStructureCue {
  readonly hex: HexKey;
  readonly uid: number;
  readonly structure: string;
  readonly level: number;
  readonly owner: PlayerId;
  readonly slot: Slot;
}

export type ProductionItem =
  | { readonly kind: 'produce'; readonly hex: HexKey; readonly resource: ResourceId; readonly amount: number }
  | ({ readonly kind: 'idle' } & PlacedStructureCue)
  | ({ readonly kind: 'depleted' } & PlacedStructureCue);

export interface UpkeepItem {
  readonly target: PlacedStructureCue;
  readonly cost: ResourceAmounts;
  readonly paid: boolean;
}

export type Cue =
  | { readonly kind: 'round'; readonly round: number }
  | { readonly kind: 'turn'; readonly player: PlayerId; readonly round: number }
  | { readonly kind: 'phase'; readonly player: PlayerId; readonly phase: TurnPhase }
  | { readonly kind: 'reveal'; readonly items: readonly RevealItem[] }
  | { readonly kind: 'village'; readonly player: PlayerId; readonly target: PlacedStructureCue }
  | {
      readonly kind: 'survey';
      readonly player: PlayerId;
      readonly hex: HexKey;
      readonly origin: HexKey | null;
    }
  | {
      readonly kind: 'build' | 'upgrade';
      readonly player: PlayerId;
      readonly target: PlacedStructureCue;
      readonly cost: ResourceAmounts;
    }
  | { readonly kind: 'production'; readonly player: PlayerId; readonly items: readonly ProductionItem[] }
  | { readonly kind: 'upkeep'; readonly player: PlayerId; readonly items: readonly UpkeepItem[] }
  | {
      readonly kind: 'bank';
      readonly player: PlayerId;
      readonly give: ResourceId;
      readonly amount: number;
      readonly receive: ResourceId;
      readonly received: number;
    }
  | {
      readonly kind: 'trade';
      readonly from: PlayerId;
      readonly to: PlayerId;
      readonly give: Partial<Resources>;
      readonly receive: Partial<Resources>;
    }
  // ── Cartas (Fase 4, UX_SPEC 6) ──
  | { readonly kind: 'draw'; readonly player: PlayerId; readonly cards: readonly CardRef[] }
  | {
      readonly kind: 'cardPlay';
      readonly player: PlayerId;
      readonly card: CardRef;
      readonly target: CardTarget | null;
      readonly cost: ResourceAmounts;
    }
  | { readonly kind: 'discard'; readonly player: PlayerId; readonly cards: readonly CardRef[] }
  | {
      readonly kind: 'install';
      readonly player: PlayerId;
      readonly card: CardRef;
      readonly slot: number;
      readonly cost: ResourceAmounts;
    }
  | {
      readonly kind: 'deliver';
      readonly from: PlayerId;
      readonly to: PlayerId;
      readonly card: CardRef;
      /** Posição do envelope na fila do destinatário. */
      readonly index: number;
      readonly cost: ResourceAmounts;
    }
  | {
      readonly kind: 'cardReveal';
      readonly from: PlayerId;
      readonly to: PlayerId;
      readonly card: CardRef;
      readonly index: number;
      readonly fizzled: ReasonKey | null;
    }
  | {
      readonly kind: 'permanentGone';
      readonly player: PlayerId;
      readonly card: CardRef;
      readonly slot: number;
      readonly cause: PermanentRemoval;
    }
  | {
      readonly kind: 'steal';
      readonly from: PlayerId;
      readonly to: PlayerId;
      readonly card: CardRef;
      readonly fromSlot: number;
      readonly toSlot: number;
    }
  | { readonly kind: 'destroy'; readonly target: PlacedStructureCue }
  | { readonly kind: 'downgrade'; readonly target: PlacedStructureCue }
  | { readonly kind: 'disabled'; readonly target: PlacedStructureCue }
  | {
      readonly kind: 'resources';
      readonly player: PlayerId;
      readonly amounts: ResourceAmounts;
      readonly sign: 1 | -1;
    }
  | { readonly kind: 'actions'; readonly player: PlayerId; readonly actionsLeft: number }
  | {
      readonly kind: 'intel';
      readonly player: PlayerId;
      readonly card: CardRef;
      readonly report: IntelReport;
    }
  | { readonly kind: 'taken'; readonly player: PlayerId; readonly card: CardRef; readonly deck: DrawDeck }
  // ── Eventos globais (Fase 6, UX_SPEC 2.14) ──
  | {
      readonly kind: 'worldEvent';
      readonly event: string;
      readonly category: string;
      /** Hexes que o evento atingiu neste lote (pulsam na cor da categoria). */
      readonly hexes: readonly HexKey[];
    }
  // ── Combate (Fase 7, UX_SPEC 2.13) ──
  | { readonly kind: 'combat'; readonly event: Extract<GameEvent, { type: 'combatResolved' }> }
  // ── Tratados (Fase 8, UX_SPEC 2.12) ──
  | {
      readonly kind: 'treaty';
      readonly fx: 'signed' | 'triggered' | 'broken';
      readonly treaty: number;
      readonly event: Extract<GameEvent, { type: 'treatySigned' | 'treatyTriggered' | 'pactBroken' }>;
    };

/** Estrutura `uid` com a posição dentro do hex (procura em `primary`, depois em `fallback`). */
function placed(primary: GameState, fallback: GameState, uid: number): PlacedStructureCue | null {
  const where = findStructure(primary, uid) ?? findStructure(fallback, uid);
  if (!where) return null;
  const types = where.hex.structures.map((s) => s.type);
  const index = where.hex.structures.findIndex((s) => s.uid === uid);
  return {
    hex: where.key,
    uid,
    structure: where.structure.type,
    level: where.structure.level,
    owner: where.structure.owner,
    slot: structureSlots(types)[index] ?? { x: 0, z: 0, scale: 1 },
  };
}

function revealItem(ctx: EngineContext, hex: HexKey, terrain: string): RevealItem {
  return { hex, terrain, hazard: ctx.terrain(terrain).kind === 'hazard' };
}

/** GDD 6.5: a varredura sai da origem de alcance mais próxima que cobre o alvo. */
function scanOrigin(ctx: EngineContext, state: GameState, player: PlayerId, hex: HexKey): HexKey | null {
  const target = state.hexes[hex];
  if (!target) return null;
  let best: { key: HexKey; d: number } | null = null;
  for (const src of rangeSources(ctx, state, player)) {
    const d = ctx.planet.distance(src.hex, target);
    if (d > src.range || (best && best.d <= d)) continue;
    best = { key: `${src.hex.boardId}:${src.hex.q},${src.hex.r}`, d };
  }
  return best?.key ?? null;
}

/** Hexes atingidos pelo evento do lote: gatilhos, marcas, desastres (com raio), guardiões, horda. */
export function worldEventHexes(
  ctx: EngineContext,
  state: GameState,
  events: readonly GameEvent[],
): HexKey[] {
  const out = new Set<HexKey>();
  for (const e of events) {
    if (e.type === 'hazardTriggered' || e.type === 'hexStatus' || e.type === 'hexContaminated')
      out.add(e.hex);
    else if (e.type === 'guardianSpawned' || e.type === 'volcanoErupted') out.add(e.hex);
    else if (e.type === 'hordeAttack') out.add(e.to);
    else if (e.type === 'disaster') {
      const c = state.hexes[e.hex];
      if (!c) continue;
      for (const h of ctx.planet.hexes) {
        if (ctx.planet.distance(c, h) <= e.radius) out.add(`${h.boardId}:${h.q},${h.r}`);
      }
    }
  }
  return [...out];
}

/** A carta `uid` como a animação a mostra. */
function cardRef(ctx: EngineContext, state: GameState, uid: CardUid): CardRef {
  const id = state.cards.defs[uid] ?? '';
  const def = ctx.card(id);
  const deck = def.deck === 'n1' || def.deck === 'n2' || def.deck === 'n3' ? def.deck : 'treasure';
  return { uid, id, category: cardCategory(def), deck };
}

export function buildCues(ctx: EngineContext, batch: Batch): Cue[] {
  const { before, after, events } = batch;
  const cues: Cue[] = [];
  let cost: ResourceAmounts = {};
  const card = (uid: CardUid) => cardRef(ctx, after, uid);
  // Posição na fila de envelopes de cada destinatário ao longo do lote.
  const queued = before.players.map((p) => p.incoming.length);
  const revealed = new Map<PlayerId, number>();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e) continue;
    switch (e.type) {
      case 'roundStarted':
        cues.push({ kind: 'round', round: e.round });
        break;
      case 'turnStarted':
        cues.push({ kind: 'turn', player: e.player, round: e.round });
        break;
      case 'phaseChanged':
        cues.push({ kind: 'phase', player: e.player, phase: e.phase });
        break;
      case 'hexRevealed': {
        // Cascata: todas as revelações seguidas viram uma pista só.
        const items: RevealItem[] = [revealItem(ctx, e.hex, e.surface)];
        for (let next = events[i + 1]; next?.type === 'hexRevealed'; next = events[i + 1]) {
          items.push(revealItem(ctx, next.hex, next.surface));
          i++;
        }
        cues.push({ kind: 'reveal', items });
        break;
      }
      case 'villageFounded': {
        // Primeiro o chão aparece (revelações logo depois do evento), depois a Vila sobe.
        const village = after.hexes[e.hex]?.structures.find((s) => s.type === 'village');
        const target = village ? placed(after, before, village.uid) : null;
        const items: RevealItem[] = [];
        for (let next = events[i + 1]; next?.type === 'hexRevealed'; next = events[i + 1]) {
          items.push(revealItem(ctx, next.hex, next.surface));
          i++;
        }
        if (items.length) cues.push({ kind: 'reveal', items });
        if (target) cues.push({ kind: 'village', player: e.player, target });
        break;
      }
      case 'subsoilSurveyed':
        cues.push({
          kind: 'survey',
          player: e.player,
          hex: e.hex,
          origin: scanOrigin(ctx, before, e.player, e.hex),
        });
        break;
      case 'resourcesSpent':
        cost = e.resources;
        break;
      case 'structureBuilt':
      case 'structureUpgraded': {
        const target = placed(after, before, e.uid);
        if (target) {
          cues.push({
            kind: e.type === 'structureBuilt' ? 'build' : 'upgrade',
            player: e.player,
            target,
            cost,
          });
        }
        cost = {};
        break;
      }
      case 'produced':
      case 'mineIdle':
      case 'mineDepleted': {
        const items: ProductionItem[] = [];
        const player = e.player;
        let cur: GameEvent | undefined = e;
        while (cur && (cur.type === 'produced' || cur.type === 'mineIdle' || cur.type === 'mineDepleted')) {
          if (cur.type === 'produced') {
            items.push({ kind: 'produce', hex: cur.hex, resource: cur.resource, amount: cur.amount });
          } else {
            // Mina esgotada já saiu do `after`: a posição vem do `before`.
            const target = placed(before, after, cur.uid);
            if (target) items.push({ kind: cur.type === 'mineIdle' ? 'idle' : 'depleted', ...target });
          }
          const next: GameEvent | undefined = events[i + 1];
          if (
            !next ||
            !(next.type === 'produced' || next.type === 'mineIdle' || next.type === 'mineDepleted')
          )
            break;
          cur = next;
          i++;
        }
        cues.push({ kind: 'production', player, items });
        break;
      }
      case 'upkeepPaid':
      case 'upkeepMissed': {
        const items: UpkeepItem[] = [];
        const player = e.player;
        let cur: GameEvent | undefined = e;
        while (cur && (cur.type === 'upkeepPaid' || cur.type === 'upkeepMissed')) {
          const target = placed(after, before, cur.uid);
          if (target) {
            items.push({
              target,
              cost: cur.type === 'upkeepPaid' ? cur.cost : {},
              paid: cur.type === 'upkeepPaid',
            });
          }
          const next: GameEvent | undefined = events[i + 1];
          if (!next || !(next.type === 'upkeepPaid' || next.type === 'upkeepMissed')) break;
          cur = next;
          i++;
        }
        cues.push({ kind: 'upkeep', player, items });
        break;
      }
      case 'bankTraded':
        cues.push({
          kind: 'bank',
          player: e.player,
          give: e.give,
          amount: e.amount,
          receive: e.receive,
          received: e.received,
        });
        break;
      case 'tradeAccepted': {
        const t = before.pendingTrade;
        if (t) cues.push({ kind: 'trade', from: t.from, to: t.to, give: t.give, receive: t.receive });
        break;
      }
      // ── Cartas ──
      case 'cardDrawn': {
        // Compras seguidas do mesmo jogador viram uma pista só (cartas em sequência).
        const cards: CardRef[] = [card(e.card)];
        for (
          let next = events[i + 1];
          next?.type === 'cardDrawn' && next.player === e.player;
          next = events[i + 1]
        ) {
          cards.push(card(next.card));
          i++;
        }
        cues.push({ kind: 'draw', player: e.player, cards });
        break;
      }
      case 'cardDiscarded': {
        const cards: CardRef[] = [card(e.card)];
        for (
          let next = events[i + 1];
          next?.type === 'cardDiscarded' && next.player === e.player;
          next = events[i + 1]
        ) {
          cards.push(card(next.card));
          i++;
        }
        cues.push({ kind: 'discard', player: e.player, cards });
        break;
      }
      case 'cardPlayed':
        cues.push({ kind: 'cardPlay', player: e.player, card: card(e.card), target: e.target ?? null, cost });
        cost = {};
        break;
      case 'permanentInstalled':
        cues.push({ kind: 'install', player: e.player, card: card(e.card), slot: e.slot, cost });
        cost = {};
        break;
      case 'cardDelivered': {
        const index = queued[e.to] ?? 0;
        queued[e.to] = index + 1;
        cues.push({ kind: 'deliver', from: e.from, to: e.to, card: card(e.card), index, cost });
        cost = {};
        break;
      }
      case 'cardRevealed': {
        const index = revealed.get(e.to) ?? 0;
        revealed.set(e.to, index + 1);
        const next = events[i + 1];
        const fizzled = next?.type === 'cardFizzled' && next.card === e.card ? next.reason : null;
        cues.push({ kind: 'cardReveal', from: e.from, to: e.to, card: card(e.card), index, fizzled });
        break;
      }
      case 'permanentRemoved':
        // O roubo anima pelo permanentStolen (a carta muda de bandeja).
        if (e.cause !== 'stolen') {
          cues.push({
            kind: 'permanentGone',
            player: e.player,
            card: card(e.card),
            slot: e.slot,
            cause: e.cause,
          });
        }
        break;
      case 'permanentStolen': {
        const fromSlot = before.players[e.from]?.permanents.indexOf(e.card) ?? 0;
        cues.push({ kind: 'steal', from: e.from, to: e.to, card: card(e.card), fromSlot, toSlot: e.slot });
        break;
      }
      case 'structureDestroyed':
      case 'structureDowngraded':
      case 'structureDisabled': {
        // Destruída já saiu do `after`: a posição vem do `before`.
        const target = placed(before, after, e.uid);
        if (target) {
          const kind =
            e.type === 'structureDestroyed'
              ? 'destroy'
              : e.type === 'structureDowngraded'
                ? 'downgrade'
                : 'disabled';
          cues.push({ kind, target });
        }
        break;
      }
      case 'resourcesGained':
      case 'resourcesLost':
        cues.push({
          kind: 'resources',
          player: e.player,
          amounts: e.resources,
          sign: e.type === 'resourcesGained' ? 1 : -1,
        });
        break;
      case 'actionsChanged':
        cues.push({ kind: 'actions', player: e.player, actionsLeft: e.actionsLeft });
        break;
      case 'intel':
        cues.push({ kind: 'intel', player: e.player, card: card(e.card), report: e.report });
        break;
      case 'cardTaken':
        cues.push({ kind: 'taken', player: e.player, card: card(e.card), deck: e.deck });
        break;
      case 'eventRevealed':
        cues.push({
          kind: 'worldEvent',
          event: e.event,
          category: e.category,
          hexes: worldEventHexes(ctx, before, events),
        });
        break;
      case 'treasureDrawn':
        cues.push({ kind: 'draw', player: e.player, cards: [card(e.card)] });
        break;
      case 'combatResolved':
        cues.push({ kind: 'combat', event: e });
        break;
      case 'treatySigned':
        cues.push({ kind: 'treaty', fx: 'signed', treaty: e.treaty, event: e });
        break;
      case 'treatyTriggered':
        cues.push({ kind: 'treaty', fx: 'triggered', treaty: e.treaty, event: e });
        if (e.resources) {
          cues.push({ kind: 'resources', player: e.obligor, amounts: e.resources, sign: -1 });
          cues.push({ kind: 'resources', player: e.beneficiary, amounts: e.resources, sign: 1 });
        }
        break;
      case 'pactBroken':
        cues.push({ kind: 'treaty', fx: 'broken', treaty: e.treaty, event: e });
        break;
      case 'treatyTrade':
        cues.push({ kind: 'resources', player: e.from, amounts: e.give, sign: -1 });
        cues.push({ kind: 'resources', player: e.from, amounts: e.receive, sign: 1 });
        break;
      case 'eventFoodLoss':
        if (e.amount > 0)
          cues.push({ kind: 'resources', player: e.player, amounts: { food: e.amount }, sign: -1 });
        break;
      default:
        break;
    }
  }
  return cues;
}
