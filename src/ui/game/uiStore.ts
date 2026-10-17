/**
 * Estado só de interface da tela de partida: ação escolhida aguardando alvo, carta em
 * uso, modificadores armados (Drone/Contrato), modal aberto, registro visível e avisos.
 */
import { create } from 'zustand';
import type { ActionTemplate, CardUid, CardUse, PlayerId, Reason } from '../../engine';
import type { CardFlow } from './cardFlow';

export type Modal =
  | { readonly kind: 'bank' }
  | { readonly kind: 'trade'; readonly counter: boolean; readonly partner?: PlayerId }
  | { readonly kind: 'pause' }
  | { readonly kind: 'rules' }
  | { readonly kind: 'buildPicker' }
  /** Descartar até o limite antes de encerrar a Entrega. */
  | { readonly kind: 'discard' }
  /** Zoom da carta do evento da rodada (Fase 6). */
  | { readonly kind: 'event' };

export interface Toast {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly tone: 'info' | 'warn';
  readonly nonce: number;
}

/** Cartas armadas para a próxima Sondar/Construir (GDD 6.5: Drone vai junto com a ação). */
export interface Armed {
  readonly drone?: CardUse;
  readonly halfCost?: CardUse;
}

/** Zoom de carta (UX_SPEC 2.7): uma carta da partida ou um id dos dados. */
export type ZoomTarget = { readonly card: CardUid } | { readonly id: string };

interface UiStore {
  /** Ação escolhida pelo botão/tecla, esperando o clique num hex destacado. */
  mode: ActionTemplate | null;
  /** Carta da mão em uso (escolhendo alvo/pagamento). */
  flow: CardFlow | null;
  armed: Armed;
  zoom: ZoomTarget | null;
  /** Alvos válidos da carta em zoom (null = a carta não tem alvo a escolher). */
  zoomTargets: number | null;
  modal: Modal | null;
  logOpen: boolean;
  toast: Toast | null;
  setMode(mode: ActionTemplate | null): void;
  setFlow(flow: CardFlow | null): void;
  setArmed(armed: Armed): void;
  setZoom(zoom: ZoomTarget | null): void;
  setZoomTargets(n: number | null): void;
  open(modal: Modal | null): void;
  toggleLog(): void;
  say(key: string, params?: Toast['params'], tone?: Toast['tone']): void;
  /** Motivo do motor (`engine.illegal.<key>`) como aviso. */
  refuse(reason: Reason): void;
}

let nonce = 0;

export const NOT_ARMED: Armed = {};

export const useUi = create<UiStore>()((set) => ({
  mode: null,
  flow: null,
  armed: NOT_ARMED,
  zoom: null,
  zoomTargets: null,
  modal: null,
  logOpen: true,
  toast: null,
  setMode: (mode) => set({ mode }),
  setFlow: (flow) => set({ flow }),
  setArmed: (armed) => set({ armed }),
  setZoom: (zoom) => set({ zoom }),
  setZoomTargets: (zoomTargets) => set((s) => (s.zoomTargets === zoomTargets ? s : { zoomTargets })),
  open: (modal) => set({ modal }),
  toggleLog: () => set((s) => ({ logOpen: !s.logOpen })),
  say: (key, params, tone = 'info') => set({ toast: { key, params, tone, nonce: ++nonce } }),
  refuse: (reason) =>
    set({
      toast: { key: `engine.illegal.${reason.key}`, params: reason.params, tone: 'warn', nonce: ++nonce },
    }),
}));
