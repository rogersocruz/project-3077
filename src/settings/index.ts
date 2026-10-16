/**
 * Configurações persistidas em localStorage: render 3D e câmera (Fase 2), velocidade de
 * animação, privacidade em hotseat e desfazer (Fase 3). A tela de configurações completa
 * e o remapeamento de teclas entram na Fase 10 (UX_SPEC 3–5).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Quality = 'low' | 'medium' | 'high';

export interface PostSettings {
  bloom: boolean;
  vignette: boolean;
  smaa: boolean;
  /** Bordas da mesa levemente desfocadas (ART_DIRECTION 6). */
  tiltShift: boolean;
}

/** Ações com tecla (UX_SPEC 5). Valores = `KeyboardEvent.code`. */
export interface KeyMap {
  panForward: string[];
  panBack: string[];
  panLeft: string[];
  panRight: string[];
  focusMine: string[];
  /** Índice = jogador; foco rápido 1–6. */
  focusPlayer: string[];
  overview: string[];
  endPhase: string[];
  explore: string[];
  /** UX_SPEC 5 pede S, que já move a câmera (WASD): Sondar fica no R ("radar"). */
  survey: string[];
  build: string[];
  upgrade: string[];
  trade: string[];
  treaty: string[];
  bank: string[];
  toggleLog: string[];
  /** Com Ctrl (ou ⌘). */
  undo: string[];
  pause: string[];
  rules: string[];
}

export interface RenderSettings {
  quality: Quality;
  shadows: boolean;
  /** Caneca, caixa do jogo e outros objetos de mesa. */
  props: boolean;
  /** Corta efeitos e resolução sozinho quando o FPS cai (render3d/adaptive.ts). */
  adaptiveQuality: boolean;
  post: PostSettings;
  /** Segundos de suavização da câmera (0 = instantâneo). */
  cameraSmoothTime: number;
  invertOrbit: boolean;
  showFps: boolean;
  keys: KeyMap;
}

export const DEFAULT_KEYS: KeyMap = {
  panForward: ['KeyW', 'ArrowUp'],
  panBack: ['KeyS', 'ArrowDown'],
  panLeft: ['KeyA', 'ArrowLeft'],
  panRight: ['KeyD', 'ArrowRight'],
  focusMine: ['Space'],
  focusPlayer: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'],
  overview: ['Home'],
  endPhase: ['Enter', 'NumpadEnter'],
  explore: ['KeyE'],
  survey: ['KeyR'],
  build: ['KeyB'],
  upgrade: ['KeyU'],
  trade: ['KeyT'],
  treaty: ['KeyY'],
  bank: ['KeyM'],
  toggleLog: ['Tab'],
  undo: ['KeyZ'],
  pause: ['Escape'],
  rules: ['F1'],
};

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  quality: 'high',
  shadows: true,
  props: true,
  adaptiveQuality: true,
  post: { bloom: true, vignette: true, smaa: true, tiltShift: true },
  cameraSmoothTime: 0.35,
  invertOrbit: false,
  showFps: false,
  keys: DEFAULT_KEYS,
};

/** UX_SPEC 3.3 / ART_DIRECTION 7: 0.5× · 1× · 2× · instantânea. */
export type AnimationSpeed = 0.5 | 1 | 2 | 'instant';
export const ANIMATION_SPEEDS: readonly AnimationSpeed[] = [0.5, 1, 2, 'instant'];

export interface GameplaySettings {
  animationSpeed: AnimationSpeed;
  /** Hotseat: tela "Vez de {facção}" sempre que muda quem decide (interpretação Q da Fase 3). */
  privacyScreen: boolean;
  /** UX_SPEC 3.3: desfazer na fase de Ações. */
  undo: boolean;
}

export const DEFAULT_GAMEPLAY: GameplaySettings = {
  animationSpeed: 1,
  privacyScreen: true,
  undo: true,
};

/** Parâmetros técnicos por nível de qualidade. */
export interface QualityProfile {
  readonly dpr: [number, number];
  readonly shadowMapSize: number;
  readonly textureSize: number;
  readonly microGeometry: boolean;
  readonly envResolution: number;
}

export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  low: { dpr: [1, 1], shadowMapSize: 1024, textureSize: 256, microGeometry: false, envResolution: 32 },
  medium: { dpr: [1, 1.5], shadowMapSize: 2048, textureSize: 384, microGeometry: true, envResolution: 64 },
  high: { dpr: [1, 2], shadowMapSize: 2048, textureSize: 512, microGeometry: true, envResolution: 128 },
};

interface SettingsStore {
  render: RenderSettings;
  gameplay: GameplaySettings;
  setRender(patch: Partial<RenderSettings>): void;
  setPost(patch: Partial<PostSettings>): void;
  setGameplay(patch: Partial<GameplaySettings>): void;
  reset(): void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      render: DEFAULT_RENDER_SETTINGS,
      gameplay: DEFAULT_GAMEPLAY,
      setRender: (patch) => set((s) => ({ render: { ...s.render, ...patch } })),
      setPost: (patch) => set((s) => ({ render: { ...s.render, post: { ...s.render.post, ...patch } } })),
      setGameplay: (patch) => set((s) => ({ gameplay: { ...s.gameplay, ...patch } })),
      reset: () => set({ render: DEFAULT_RENDER_SETTINGS, gameplay: DEFAULT_GAMEPLAY }),
    }),
    {
      name: 'p3077.settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Campos novos ganham o padrão mesmo com um save antigo.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsStore>;
        const render = { ...DEFAULT_RENDER_SETTINGS, ...p.render };
        render.post = { ...DEFAULT_RENDER_SETTINGS.post, ...p.render?.post };
        render.keys = { ...DEFAULT_KEYS, ...p.render?.keys };
        const gameplay = { ...DEFAULT_GAMEPLAY, ...p.gameplay };
        return { ...current, render, gameplay };
      },
    },
  ),
);

/** Preferência do sistema por movimento reduzido (ART_DIRECTION 7). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
