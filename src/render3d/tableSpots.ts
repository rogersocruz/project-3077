/**
 * Lugares livres da mesa entre as bandejas: caneca e caixa do jogo (Fase 2) e as pilhas
 * de cartas n1/n2/n3 com os descartes (Fase 4). Puro: só geometria do layout.
 */
import type { DrawDeck } from '../engine/state';
import { CARD } from './constants';
import type { TableLayout } from './layout';

export interface Spot {
  readonly x: number;
  readonly z: number;
  /** Ângulo (a partir do centróide) do ponto. */
  readonly angle: number;
}

export const MUG_ANGLE = Math.PI * 0.75;
export const BOX_ANGLE = -Math.PI * 0.6;

const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function trayAngles(layout: TableLayout): number[] {
  return layout.boards.map((b) => Math.atan2(b.outward.x, b.outward.z));
}

function at(layout: TableLayout, angle: number, radius: number): Spot {
  return {
    x: layout.centroid.x + Math.sin(angle) * radius,
    z: layout.centroid.z + Math.cos(angle) * radius,
    angle,
  };
}

/** Ponto livre na mesa: entre bandejas, perto da borda, a partir do ângulo preferido. */
export function freeSpot(layout: TableLayout, preferred: number): Spot {
  const angles = trayAngles(layout);
  let best = preferred;
  let bestGap = -1;
  for (let i = 0; i < 72; i++) {
    const a = preferred + (i / 72) * Math.PI * 2;
    const gap = Math.min(...angles.map((b) => angDist(a, b)));
    if (gap > bestGap + 0.05) {
      bestGap = gap;
      best = a;
    }
  }
  return at(layout, best, layout.radius * 0.92);
}

/** Escala das cartas das pilhas (maiores que as dos slots, para ler de longe). */
export const DECK_SCALE = 2.2;
/** Espessura visual por carta na pilha. */
export const DECK_CARD_THICKNESS = 0.012;

/** Centro das pilhas: o vão entre bandejas mais longe da caneca e da caixa. */
export function deckSpot(layout: TableLayout): Spot {
  const trays = trayAngles(layout);
  const props = [freeSpot(layout, MUG_ANGLE).angle, freeSpot(layout, BOX_ANGLE).angle];
  let best = 0;
  let score = -Infinity;
  for (let i = 0; i < 144; i++) {
    const a = (i / 144) * Math.PI * 2;
    const s = Math.min(
      Math.min(...trays.map((b) => angDist(a, b))),
      0.85 * Math.min(...props.map((b) => angDist(a, b))),
    );
    if (s > score + 1e-6) {
      score = s;
      best = a;
    }
  }
  return at(layout, best, layout.radius * 0.8);
}

const DECK_INDEX: Record<DrawDeck, number> = { n1: -1, n2: 0, n3: 1 };

/**
 * Onde fica a pilha (de compra ou de descarte) de um baralho: lado a lado na tangente,
 * descartes um passo mais perto do centro. y = topo da mesa.
 */
export function pilePosition(
  layout: TableLayout,
  deck: DrawDeck,
  pile: 'draw' | 'discard',
): { x: number; z: number; rotationY: number } {
  const spot = deckSpot(layout);
  const w = CARD.width * DECK_SCALE;
  const h = CARD.height * DECK_SCALE;
  const tangent = { x: Math.cos(spot.angle), z: -Math.sin(spot.angle) };
  const inward = { x: -Math.sin(spot.angle), z: -Math.cos(spot.angle) };
  const along = DECK_INDEX[deck] * (w + 0.35);
  const depth = pile === 'discard' ? h + 0.3 : 0;
  return {
    x: spot.x + tangent.x * along + inward.x * depth,
    z: spot.z + tangent.z * along + inward.z * depth,
    // Cartas "de pé" para quem olha do centro da mesa.
    rotationY: spot.angle + Math.PI,
  };
}
