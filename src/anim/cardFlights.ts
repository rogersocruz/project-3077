/**
 * Cartas que voam na interface (UX_SPEC 6): do baralho 3D para a mão, da mão para o
 * alvo ou para o slot, e a carta revelada no centro da tela. O diretor anima `p` com
 * GSAP; ui/hud/CardFlights só lê `p` a cada quadro (mesmo padrão do fxStore 3D).
 */
import { create } from 'zustand';
import type { ReasonKey } from '../engine/reasons';
import type { DrawDeck, PlayerId } from '../engine/state';
import type { WorldAnchor } from '../render3d/projector';
import type { CardCategoryKey } from '../ui/theme/tokens';

/** Ponta do voo: ponto 3D projetado, elemento da interface ou centro da tela. */
export type FlightPoint =
  | { readonly kind: 'world'; readonly anchor: WorldAnchor }
  | { readonly kind: 'dom'; readonly selector: string }
  | { readonly kind: 'center' };

export interface CardFlight {
  readonly id: number;
  /** Face (id da carta) — null mostra só o verso. */
  readonly face: string | null;
  readonly back: DrawDeck | 'treasure';
  readonly category: CardCategoryKey;
  readonly from: FlightPoint;
  readonly to: FlightPoint;
  /** t: posição; flip 0 = verso, 1 = face; burst: partículas da categoria no destino. */
  readonly p: { t: number; flip: number; scale: number; fade: number; glow: number; burst: number };
}

/** Legenda da carta mostrada no centro (revelação, Requisição). */
export type CardCaption =
  | {
      readonly kind: 'reveal';
      readonly id: string;
      readonly from: PlayerId;
      readonly to: PlayerId;
      readonly fizzled: ReasonKey | null;
    }
  | { readonly kind: 'taken'; readonly id: string; readonly player: PlayerId; readonly deck: DrawDeck };

interface CardFlightStore {
  items: readonly CardFlight[];
  caption: CardCaption | null;
  add(spec: Omit<CardFlight, 'id'>): CardFlight;
  setCaption(caption: CardCaption | null): void;
  clear(): void;
}

let nextId = 1;

export const useCardFlights = create<CardFlightStore>()((set) => ({
  items: [],
  caption: null,
  add: (spec) => {
    const item = { ...spec, id: nextId++ };
    set((s) => ({ items: [...s.items, item] }));
    return item;
  },
  setCaption: (caption) => set({ caption }),
  clear: () => set({ items: [], caption: null }),
}));
