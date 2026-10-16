/**
 * Pontas dos voos de carta 3D (slot, envelope na bandeja, pilha, centro) em mundo:
 * usadas pelos efeitos 3D e pela projeção para a interface.
 */
import { Vector3 } from 'three';
import type { PlayerId } from '../engine/state';
import type { CardAnchor } from './fxStore';
import type { TableLayout } from './layout';
import type { ScenePlayer } from './model';
import { DECK_SCALE, pilePosition } from './tableSpots';
import { trayEnvelopePoint, traySlotPoint } from './trayLayout';

export interface CardsFxCtx {
  readonly layout: TableLayout;
  readonly players: readonly ScenePlayer[];
}

const CENTER_HEIGHT = 2.2;

function trayOf(c: CardsFxCtx, player: PlayerId) {
  const pl = c.players[player];
  return pl ? c.layout.boards[pl.boardId]?.tray : undefined;
}

/** Ponto de mundo e escala da carta numa ponta do voo. */
export function cardAnchorPoint(a: CardAnchor, c: CardsFxCtx): { p: Vector3; scale: number } | null {
  switch (a.kind) {
    case 'slot': {
      const t = trayOf(c, a.player);
      if (!t) return null;
      const s = traySlotPoint(t, a.slot);
      return { p: new Vector3(s.x, s.y + 0.02, s.z), scale: 1 };
    }
    case 'envelope': {
      const t = trayOf(c, a.player);
      if (!t) return null;
      const s = trayEnvelopePoint(t, a.index);
      return { p: new Vector3(s.x, s.y, s.z), scale: 1 };
    }
    case 'pile': {
      const s = pilePosition(c.layout, a.deck, a.pile);
      return { p: new Vector3(s.x, 0.4, s.z), scale: DECK_SCALE };
    }
    case 'center':
      return { p: new Vector3(c.layout.centroid.x, CENTER_HEIGHT, c.layout.centroid.z), scale: DECK_SCALE };
  }
}
