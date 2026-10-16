/**
 * Projeção mundo → tela para as animações da interface (cartas que saem do baralho 3D e
 * entram na mão, que vão até a bandeja de outro jogador…). Registrada pela cena
 * (components/Projector); sem cena, devolve null e a animação usa um ponto da tela.
 */
import type { HexKey, PlayerId } from '../engine/state';
import type { CardAnchor } from './fxStore';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export type WorldAnchor =
  | CardAnchor
  | { readonly kind: 'hex'; readonly key: HexKey }
  | { readonly kind: 'trayCenter'; readonly player: PlayerId };

type Project = (a: WorldAnchor) => ScreenPoint | null;

let current: Project | null = null;

export function setProjector(p: Project | null): void {
  current = p;
}

export function screenOf(a: WorldAnchor): ScreenPoint | null {
  return current?.(a) ?? null;
}
