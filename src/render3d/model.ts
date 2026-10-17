/**
 * Modelo de cena: tudo que a mesa 3D desenha, derivado do estado do motor por uma
 * função pura. O render nunca lê regras — só este modelo.
 *
 * Tropas (Fase 7) e facções (Fase 9) ainda não existem no motor: o modelo já tem lugar
 * para elas, e por enquanto só a vitrine (dev/showcase.ts) as preenche. Permanentes vêm
 * do estado desde a Fase 4.
 */
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import type { EngineContext } from '../engine/context';
import {
  DRAW_DECKS,
  type DrawDeck,
  type GameState,
  type HexKey,
  type PlayerId,
  type Resources,
} from '../engine/state';
import { cardCategory } from '../ui/card/model';
import { type CardCategoryKey, type FactionKey, palette } from '../ui/theme/tokens';
import { hexToWorld, type Vec2 } from './layout';

export type TerrainKind = 'surface' | 'site' | 'hazard';
export type TroopKind = 'line' | 'artillery';

export interface SceneStructure {
  readonly uid: number;
  readonly type: string;
  readonly level: number;
  readonly owner: PlayerId;
  /** Parada por carta (Bomba de Íons, Pane Induzida, Sobrecarga): marcador vermelho. */
  readonly disabled?: boolean;
}

export interface SceneTroop {
  readonly id: string;
  readonly kind: TroopKind;
  readonly level: number;
  readonly owner: PlayerId;
}

/** Subsolo como quem olha o conhece (D10: sondagem é privada). */
export interface SceneSubsoil {
  readonly resource: ResourceId | null;
  readonly depleted: boolean;
}

export interface SceneHex {
  readonly key: HexKey;
  readonly boardId: number;
  readonly q: number;
  readonly r: number;
  readonly world: Vec2;
  readonly terrain: string;
  readonly kind: TerrainKind;
  readonly revealed: boolean;
  /** Só se quem olha sondou este hex; senão null. */
  readonly subsoil: SceneSubsoil | null;
  readonly structures: readonly SceneStructure[];
  readonly troops: readonly SceneTroop[];
  /** Colapso de Galeria: subsolo selado (público). */
  readonly sealed?: boolean;
  /** Terraformação: rendimento extra do hex (público). */
  readonly yieldBonus?: number;
  /** Fase 6: estados de hazard/evento ativos (públicos) e Guardião parado. */
  readonly marks?: readonly WorldMark[];
  readonly guardian?: number | null;
}

/** Marca de estado no hex (cinzas, contaminado, seco, fechado, drones no chão, anomalia, selado). */
export type WorldMark = 'ash' | 'contaminated' | 'dry' | 'closed' | 'grounded' | 'amplified' | 'sealed';

export interface ScenePermanent {
  /** Id da carta (cards.json) ou do modelo de tratado. */
  readonly id: string;
  readonly category: CardCategoryKey;
}

export interface ScenePlayer {
  readonly id: PlayerId;
  readonly boardId: number;
  /** Facção visual (cor + símbolo). Sem a camada de facções: assento N → facção N. */
  readonly faction: FactionKey;
  readonly resources: Resources;
  /** Um item por slot de permanente (balance.permanents.slots); null = vazio. */
  readonly permanents: readonly (ScenePermanent | null)[];
  /** Envelopes lacrados esperando a Revelação (a carta é secreta, a quantidade não). */
  readonly incoming?: number;
}

/** Pilhas de cartas na mesa: compra (verso) e descarte (face da carta do topo). */
export interface ScenePiles {
  readonly draw: Readonly<Record<DrawDeck, number>>;
  readonly discard: Readonly<Record<DrawDeck, number>>;
  readonly discardTop: Readonly<Record<DrawDeck, ScenePermanent | null>>;
}

export interface SceneModel {
  readonly hexes: readonly SceneHex[];
  readonly players: readonly ScenePlayer[];
  /** Só com a camada de cartas. */
  readonly piles?: ScenePiles;
}

export const SEAT_FACTIONS = Object.keys(palette.faction) as FactionKey[];

export function seatFaction(seat: number): FactionKey {
  return SEAT_FACTIONS[seat % SEAT_FACTIONS.length] ?? 'revolutionaries';
}

/** Hexes da cena. `viewer` = quem está diante da tela (hotseat: quem decide agora). */
export function sceneHexes(ctx: EngineContext, state: GameState, viewer: PlayerId | null = null): SceneHex[] {
  return ctx.planet.hexes.map((h): SceneHex => {
    const key = `${h.boardId}:${h.q},${h.r}`;
    const hs = state.hexes[key];
    if (!hs) throw new Error(`modelo de cena: hex ausente ${key}`);
    return {
      key,
      boardId: h.boardId,
      q: h.q,
      r: h.r,
      world: hexToWorld(ctx.planet.toGlobal(h)),
      terrain: hs.surface,
      kind: ctx.terrain(hs.surface).kind,
      revealed: hs.revealed,
      subsoil:
        viewer !== null && hs.surveyedBy.includes(viewer)
          ? { resource: ctx.subsoil(hs.subsoil).resource, depleted: hs.depleted }
          : null,
      structures: hs.structures.map((s) => ({
        uid: s.uid,
        type: s.type,
        level: s.level,
        owner: s.owner,
        disabled:
          s.offlineRound === state.round ||
          s.noProduceRound === state.round ||
          s.overloaded === true ||
          (s.type === 'mine' && hs.seal !== null),
      })),
      troops: [],
      sealed: hs.seal !== null || (hs.status.sealedUntil ?? 0) >= state.round,
      yieldBonus: hs.yieldBonus,
      marks: worldMarks(hs.status, state.round),
      guardian: hs.guardian,
    };
  });
}

function worldMarks(st: GameState['hexes'][string]['status'], round: number): WorldMark[] {
  const out: WorldMark[] = [];
  const on = (n: number | undefined) => n !== undefined && n >= round;
  if (on(st.ashUntil)) out.push('ash');
  if (st.contaminated) out.push('contaminated');
  if (on(st.dryUntil)) out.push('dry');
  if (on(st.closedUntil)) out.push('closed');
  if (on(st.groundedUntil)) out.push('grounded');
  if (on(st.amplifiedUntil)) out.push('amplified');
  return out;
}

/** Jogadores da cena; `resources` permite mostrar o estoque animado (contadores do HUD). */
export function scenePlayers(
  ctx: EngineContext,
  state: GameState,
  resources?: readonly Resources[],
): ScenePlayer[] {
  const slots = ctx.balance.permanents.slots;
  return state.players.map((p): ScenePlayer => {
    const res = resources?.[p.id] ?? p.resources;
    return {
      id: p.id,
      boardId: p.boardId,
      faction: seatFaction(p.id),
      resources: Object.fromEntries(RESOURCE_IDS.map((id) => [id, res[id]])) as Resources,
      // GDD 7.4: slots públicos; vazio = null.
      permanents: Array.from({ length: slots }, (_, i): ScenePermanent | null => {
        const uid = p.permanents[i];
        const id = uid === null || uid === undefined ? undefined : state.cards.defs[uid];
        return id === undefined ? null : { id, category: cardCategory(ctx.card(id)) };
      }),
      incoming: p.incoming.length,
    };
  });
}

/** Pilhas de compra e de descarte (null sem a camada de cartas). */
export function scenePiles(ctx: EngineContext, state: GameState): ScenePiles | undefined {
  if (!state.layers.cards) return undefined;
  const count = (f: (d: DrawDeck) => number) =>
    Object.fromEntries(DRAW_DECKS.map((d) => [d, f(d)])) as Record<DrawDeck, number>;
  const discardTop = Object.fromEntries(
    DRAW_DECKS.map((d) => {
      const uid = state.cards.discards[d].at(-1);
      const id = uid === undefined ? undefined : state.cards.defs[uid];
      return [d, id === undefined ? null : { id, category: cardCategory(ctx.card(id)) }];
    }),
  ) as Record<DrawDeck, ScenePermanent | null>;
  return {
    draw: count((d) => state.cards.decks[d].length),
    discard: count((d) => state.cards.discards[d].length),
    discardTop,
  };
}

export function sceneModel(ctx: EngineContext, state: GameState, viewer: PlayerId | null = null): SceneModel {
  const piles = scenePiles(ctx, state);
  return {
    hexes: sceneHexes(ctx, state, viewer),
    players: scenePlayers(ctx, state),
    ...(piles ? { piles } : {}),
  };
}

/** Pilhas visuais de um estoque: colunas de até `perColumn`, no máximo `maxColumns`. */
export function tokenColumns(count: number, perColumn: number, maxColumns: number): number[] {
  const shown = Math.max(0, Math.min(count, perColumn * maxColumns));
  const cols: number[] = [];
  for (let left = shown; left > 0; left -= perColumn) cols.push(Math.min(perColumn, left));
  return cols;
}
