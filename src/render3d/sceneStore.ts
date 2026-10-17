/**
 * Estado de interface da cena 3D (Zustand): hex sob o mouse, hex selecionado, alvos
 * destacados e pedidos de foco da câmera. A UI escuta seleções por `onHexSelect`.
 */
import { create } from 'zustand';
import type { HexKey } from '../engine/state';

export type FocusTarget =
  | { readonly kind: 'overview' }
  | { readonly kind: 'board'; readonly boardId: number }
  | { readonly kind: 'hex'; readonly key: HexKey };

export interface FocusRequest {
  readonly target: FocusTarget;
  /** Sem interpolação (capturas de tela, movimento reduzido). */
  readonly instant: boolean;
  /** Muda a cada pedido, para repetir o mesmo alvo. */
  readonly nonce: number;
}

/** Ação cujos alvos estão destacados (a cor vem de tokens → scene.action). */
export type TargetKind = 'explore' | 'survey' | 'build' | 'upgrade' | 'chooseVillage' | 'card' | 'move';

export interface TargetSet {
  readonly kind: TargetKind;
  readonly keys: ReadonlySet<HexKey>;
  /** Cor do contorno (cartas: cor da categoria); padrão: tokens → scene.action[kind]. */
  readonly color?: string;
}

interface SceneStore {
  hovered: HexKey | null;
  selected: HexKey | null;
  /** Jogador deste dispositivo (Espaço = "meu tabuleiro"). */
  localPlayer: number;
  focus: FocusRequest | null;
  /** Fim de partida (UX_SPEC 2.16): órbita lenta em volta do foco. */
  orbit: boolean;
  setOrbit(on: boolean): void;
  /** Hexes válidos para a ação escolhida; os demais escurecem (ART_DIRECTION 8). */
  targets: TargetSet | null;
  /** Hexes que um evento global atingiu: contorno pulsante na cor da categoria (UX_SPEC 2.14). */
  pulse: { readonly keys: ReadonlySet<HexKey>; readonly color: string } | null;
  fps: number;
  /** Degrau atual da qualidade adaptativa (0 = tudo ligado). */
  autoTier: number;
  setHovered(key: HexKey | null): void;
  select(key: HexKey | null): void;
  requestFocus(target: FocusTarget, instant?: boolean): void;
  setLocalPlayer(player: number): void;
  setTargets(targets: TargetSet | null): void;
  setPulse(pulse: { readonly keys: ReadonlySet<HexKey>; readonly color: string } | null): void;
  setFps(fps: number): void;
  setAutoTier(tier: number): void;
}

type HexSelectListener = (key: HexKey | null) => void;
const listeners = new Set<HexSelectListener>();

/** Assina seleções de hex vindas da cena; devolve a função para cancelar. */
export function onHexSelect(listener: HexSelectListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let nonce = 0;

export const useSceneStore = create<SceneStore>()((set) => ({
  hovered: null,
  selected: null,
  localPlayer: 0,
  focus: null,
  targets: null,
  pulse: null,
  fps: 0,
  autoTier: 0,
  setHovered: (hovered) => set((s) => (s.hovered === hovered ? s : { hovered })),
  select: (selected) => {
    set({ selected });
    for (const l of listeners) l(selected);
  },
  orbit: false,
  setOrbit: (orbit) => set({ orbit }),
  requestFocus: (target, instant = false) => set({ focus: { target, instant, nonce: ++nonce } }),
  setLocalPlayer: (localPlayer) => set({ localPlayer }),
  setTargets: (targets) => set({ targets }),
  setPulse: (pulse) => set({ pulse }),
  setFps: (fps) => set({ fps }),
  setAutoTier: (autoTier) => set({ autoTier }),
}));
