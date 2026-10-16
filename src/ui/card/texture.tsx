/**
 * Canvas da face/verso para texturas 3D (ART_DIRECTION 4: o mesmo SVG da interface).
 * Falha de rasterização nunca quebra a mesa (CLAUDE.md regra 7): devolve null e a cena
 * mantém o substituto procedural.
 */
import { Card } from './Card';
import { CARD_H, CARD_W } from './geometry';
import { type BackKind, CardBack } from './CardBack';
import { cardFace, cardVersion } from './faces';
import { rasterize } from './rasterize';

const faces = new Map<string, Promise<HTMLCanvasElement | null>>();

export function cardFaceCanvas(id: string, width = 512): Promise<HTMLCanvasElement | null> {
  const key = `${id}@${width}`;
  let p = faces.get(key);
  if (!p) {
    const height = Math.round((width * CARD_H) / CARD_W);
    p = rasterize(<Card face={cardFace(id)} width={width} version={cardVersion()} />, width, height).catch(
      () => null,
    );
    faces.set(key, p);
  }
  return p;
}

export function cardBackCanvas(kind: BackKind, width = 512): Promise<HTMLCanvasElement | null> {
  const key = `back:${kind}@${width}`;
  let p = faces.get(key);
  if (!p) {
    const horizontal = kind === 'event';
    const w = horizontal ? Math.round((width * CARD_H) / CARD_W) : width;
    const h = horizontal ? width : Math.round((width * CARD_H) / CARD_W);
    p = rasterize(<CardBack kind={kind} width={w} />, w, h).catch(() => null);
    faces.set(key, p);
  }
  return p;
}
