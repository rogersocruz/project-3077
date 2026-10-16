/**
 * Pilhas de cartas na mesa (Fase 4): compra n1/n2/n3 com o verso do baralho e, à frente,
 * os descartes com a face da carta do topo. A altura acompanha a quantidade.
 */
import { useMemo } from 'react';
import { BoxGeometry } from 'three';
import { DRAW_DECKS } from '../../engine/state';
import { CARD } from '../constants';
import type { TableLayout } from '../layout';
import { cardBackMaterial, cardEdgeMaterial, cardFaceMaterial } from '../materials';
import type { ScenePiles } from '../model';
import { DECK_CARD_THICKNESS, DECK_SCALE, pilePosition } from '../tableSpots';

const unitBox = new BoxGeometry(CARD.width * DECK_SCALE, 1, CARD.height * DECK_SCALE).translate(0, 0.5, 0);

export function Piles({ piles, layout }: { piles: ScenePiles; layout: TableLayout }) {
  const edge = cardEdgeMaterial();
  const stacks = useMemo(
    () =>
      DRAW_DECKS.flatMap((deck) => {
        const draw = pilePosition(layout, deck, 'draw');
        const discard = pilePosition(layout, deck, 'discard');
        const top = piles.discardTop[deck];
        return [
          piles.draw[deck] > 0 && {
            key: `draw-${deck}`,
            pos: draw,
            height: Math.max(1, piles.draw[deck]) * DECK_CARD_THICKNESS,
            face: cardBackMaterial(deck),
          },
          top && {
            key: `discard-${deck}`,
            pos: discard,
            height: Math.max(1, piles.discard[deck]) * DECK_CARD_THICKNESS,
            face: cardFaceMaterial(top.id, top.category),
          },
        ].filter((s) => !!s);
      }),
    [piles, layout],
  );
  return (
    <group>
      {stacks.map((s) => (
        <mesh
          key={s.key}
          geometry={unitBox}
          material={[edge, edge, s.face, edge, edge, edge]}
          position={[s.pos.x, 0, s.pos.z]}
          rotation={[0, s.pos.rotationY, 0]}
          scale={[1, s.height, 1]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
