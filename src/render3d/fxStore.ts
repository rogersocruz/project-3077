/**
 * Efeitos animados da mesa (Fase 3). O diretor de animação (src/anim) cria itens e
 * anima os valores de `p` com GSAP; o componente Fx só lê `p` a cada quadro e desenha.
 * Peças animadas saem dos lotes instanciados: `hiddenHexes`/`hiddenStructures` tiram o
 * tile/estrutura do lote enquanto a cópia animada está na mesa.
 */
import { create } from 'zustand';
import type { ResourceId } from '../data/schemas';
import type { DrawDeck, HexKey, PlayerId } from '../engine/state';
import type { CardCategoryKey } from '../ui/theme/tokens';
import type { Slot } from './placement';

/** Onde um token começa ou termina o voo. */
export type FxAnchor =
  | { readonly kind: 'hex'; readonly key: HexKey }
  | { readonly kind: 'tray'; readonly player: PlayerId; readonly resource: ResourceId }
  | { readonly kind: 'vault' };

/** Onde uma carta 3D começa ou termina o voo. */
export type CardAnchor =
  | { readonly kind: 'slot'; readonly player: PlayerId; readonly slot: number }
  | { readonly kind: 'pile'; readonly deck: DrawDeck; readonly pile: 'draw' | 'discard' }
  | { readonly kind: 'envelope'; readonly player: PlayerId; readonly index: number }
  | { readonly kind: 'center' };

interface Placed {
  readonly hex: HexKey;
  readonly slot: Slot;
}

export type FxItem =
  /** Explorar: tile oculto sobe, gira 180° e assenta (flip 0→1; face troca na metade). */
  | {
      readonly id: number;
      readonly kind: 'tileFlip';
      readonly hex: HexKey;
      readonly terrain: string;
      readonly hazard: boolean;
      readonly p: { lift: number; flip: number; fade: number };
    }
  /** Sondar: o tile inclina e mostra o corte (tilt 0→1→0). */
  | {
      readonly id: number;
      readonly kind: 'tileTilt';
      readonly hex: HexKey;
      readonly terrain: string | null;
      readonly hazard: boolean;
      readonly p: { tilt: number };
    }
  | { readonly id: number; readonly kind: 'dust'; readonly hex: HexKey; readonly p: { t: number } }
  /** Anel de varredura da origem (Vila/Posto) até o alvo. */
  | {
      readonly id: number;
      readonly kind: 'scan';
      readonly from: HexKey;
      readonly to: HexKey;
      readonly p: { t: number };
    }
  /** Construir (rise 0→1) e Mina esgotada (rise 1→0). */
  | (Placed & {
      readonly id: number;
      readonly kind: 'structure';
      readonly type: string;
      readonly owner: PlayerId;
      readonly level: number;
      readonly p: { rise: number; fade: number };
    })
  | (Placed & { readonly id: number; readonly kind: 'sparks'; readonly p: { t: number } })
  /** Melhorar: anel novo na base + coluna de luz. */
  | (Placed & {
      readonly id: number;
      readonly kind: 'levelUp';
      readonly type: string;
      readonly level: number;
      readonly p: { t: number };
    })
  /** Mina parada por falta de Carvão. */
  | (Placed & { readonly id: number; readonly kind: 'idle'; readonly p: { t: number } })
  | {
      readonly id: number;
      readonly kind: 'token';
      readonly resource: ResourceId;
      readonly from: FxAnchor;
      readonly to: FxAnchor;
      readonly p: { t: number };
    }
  /** Cofre central da banca. */
  | { readonly id: number; readonly kind: 'vault'; readonly p: { t: number; spin: number } }
  /**
   * Carta entregue (UX_SPEC 6): envelope lacrado levado por um mini drone de `from` até
   * `to` (a bandeja do alvo) ou, na Revelação, da bandeja até o centro.
   */
  | {
      readonly id: number;
      readonly kind: 'envelope';
      readonly from: CardAnchor;
      readonly to: CardAnchor;
      readonly p: { t: number; open: number };
    }
  /** Carta 3D voando (roubo de permanente, instalar, descarte na pilha). */
  | {
      readonly id: number;
      readonly kind: 'cardFly';
      readonly card: string;
      readonly category: CardCategoryKey;
      readonly from: CardAnchor;
      readonly to: CardAnchor;
      readonly p: { t: number };
    };

export type FxKind = FxItem['kind'];
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
export type FxSpec = WithoutId<FxItem>;

interface FxStore {
  items: readonly FxItem[];
  hiddenHexes: ReadonlySet<HexKey>;
  hiddenStructures: ReadonlySet<number>;
  add(spec: FxSpec): FxItem;
  remove(id: number): void;
  hide(hexes: readonly HexKey[], structures: readonly number[]): void;
  clear(): void;
}

let nextId = 1;
const EMPTY_KEYS: ReadonlySet<HexKey> = new Set();
const EMPTY_UIDS: ReadonlySet<number> = new Set();

export const useFxStore = create<FxStore>()((set) => ({
  items: [],
  hiddenHexes: EMPTY_KEYS,
  hiddenStructures: EMPTY_UIDS,
  add: (spec) => {
    const item = { ...spec, id: nextId++ } as FxItem;
    set((s) => ({ items: [...s.items, item] }));
    return item;
  },
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  hide: (hexes, structures) =>
    set((s) => ({
      hiddenHexes: hexes.length ? new Set([...s.hiddenHexes, ...hexes]) : s.hiddenHexes,
      hiddenStructures: structures.length
        ? new Set([...s.hiddenStructures, ...structures])
        : s.hiddenStructures,
    })),
  clear: () => set({ items: [], hiddenHexes: EMPTY_KEYS, hiddenStructures: EMPTY_UIDS }),
}));
