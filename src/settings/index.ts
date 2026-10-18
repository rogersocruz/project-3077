/**
 * Configurações persistidas em localStorage (UX_SPEC 3): vídeo/tela, áudio, jogabilidade,
 * controles (atalhos remapeáveis, UX_SPEC 5) e acessibilidade. Cada opção tem efeito: quem lê
 * está anotado no campo. A tela é ui/screens/Settings.tsx.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

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
  /** Escala de renderização 50–150% (multiplica o DPR do Canvas). */
  renderScale: number;
  /** Limite de FPS: 0 = ilimitado (TableScene → FpsLimiter). */
  fpsLimit: 0 | 30 | 60 | 120 | 144;
  /** Antisserrilhado do pós-processamento (SMAA/FXAA) ou desligado. */
  antialias: 'off' | 'fxaa' | 'smaa';
  /** Partículas (faíscas, poeira): multiplica a quantidade (render3d/components/Fx.tsx). */
  particles: 'low' | 'normal' | 'high';
  /** Escala da interface 80–150% (raiz do documento). */
  uiScale: number;
  /** Tela cheia (API do navegador; no app desktop, o modo da janela). */
  fullscreen: boolean;
  /** Já mediu a qualidade automática no primeiro boot (UX_SPEC 3.1). */
  autoDetected: boolean;
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
  renderScale: 1,
  fpsLimit: 0,
  antialias: 'smaa',
  particles: 'normal',
  uiScale: 1,
  fullscreen: false,
  autoDetected: false,
};

/** UX_SPEC 3.1: predefinições de qualidade (Personalizada = qualquer ajuste manual). */
export const QUALITY_PRESETS: Record<Quality, Partial<RenderSettings>> = {
  low: { quality: 'low', shadows: false, props: false, particles: 'low', antialias: 'fxaa' },
  medium: { quality: 'medium', shadows: true, props: true, particles: 'normal', antialias: 'fxaa' },
  high: { quality: 'high', shadows: true, props: true, particles: 'normal', antialias: 'smaa' },
  ultra: { quality: 'ultra', shadows: true, props: true, particles: 'high', antialias: 'smaa' },
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
  /** Pausa entre decisões da IA (ui/game/aiDriver.ts). */
  aiSpeed: 'slow' | 'normal' | 'fast';
  /** Encerrar as Ações com ações sobrando pede confirmação (ui/game/commands.ts). */
  confirmIrreversible: boolean;
  /** Desligado: o diretor para depois de cada fase automática até "Continuar". */
  autoAdvance: boolean;
  /** Dicas contextuais (títulos e linha de ajuda do HUD). */
  hints: boolean;
  /** Previsão de combate antes de mover para hex com inimigo (UX_SPEC 2.13). */
  combatPreview: boolean;
  /** Salvamento automático (save/index.ts). */
  autosave: 'turn' | 'round' | 'off';
  /** Idioma da interface. */
  language: 'pt-BR' | 'en';
}

export const DEFAULT_GAMEPLAY: GameplaySettings = {
  animationSpeed: 1,
  privacyScreen: true,
  undo: true,
  aiSpeed: 'normal',
  confirmIrreversible: false,
  autoAdvance: true,
  hints: true,
  combatPreview: true,
  autosave: 'turn',
  language: 'pt-BR',
};

/** UX_SPEC 3.2: volumes 0–1 por canal (audio/manager.ts). */
export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  ambient: number;
  voice: number;
  muteOnBlur: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  ui: 0.7,
  ambient: 0.5,
  voice: 0.8,
  muteOnBlur: true,
};

/** UX_SPEC 3.4: câmera (render3d/components/CameraRig.tsx). */
export interface ControlSettings {
  orbitSpeed: number;
  zoomSpeed: number;
  panSpeed: number;
  invertY: boolean;
  /** Mouse na borda da tela move a câmera. */
  edgePan: boolean;
}

export const DEFAULT_CONTROLS: ControlSettings = {
  orbitSpeed: 1,
  zoomSpeed: 1,
  panSpeed: 1,
  invertY: false,
  edgePan: false,
};

export type ColorMode = 'normal' | 'deuteranopia' | 'protanopia' | 'tritanopia';

/** UX_SPEC 3.5 (ui/theme/accessibility.ts aplica na raiz do documento e na paleta). */
export interface AccessibilitySettings {
  colorMode: ColorMode;
  highContrast: boolean;
  /** Tamanho de texto 85–150%. */
  textScale: number;
  /** 'system' segue o sistema operacional. */
  reduceMotion: 'system' | 'on' | 'off';
  cameraShake: boolean;
  /** Legendas para os sons relevantes (audio → CaptionBar). */
  captions: boolean;
  /** Avisos e legendas não somem sozinhos. */
  unlimitedTime: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  colorMode: 'normal',
  highContrast: false,
  textScale: 1,
  reduceMotion: 'system',
  cameraShake: true,
  captions: false,
  unlimitedTime: false,
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
  ultra: { dpr: [1, 2.5], shadowMapSize: 4096, textureSize: 768, microGeometry: true, envResolution: 256 },
};

interface SettingsStore {
  render: RenderSettings;
  gameplay: GameplaySettings;
  audio: AudioSettings;
  controls: ControlSettings;
  accessibility: AccessibilitySettings;
  setRender(patch: Partial<RenderSettings>): void;
  setPost(patch: Partial<PostSettings>): void;
  setGameplay(patch: Partial<GameplaySettings>): void;
  setAudio(patch: Partial<AudioSettings>): void;
  setControls(patch: Partial<ControlSettings>): void;
  setAccessibility(patch: Partial<AccessibilitySettings>): void;
  /** Troca a tecla de uma ação (índice = qual das alternativas). */
  setKey(action: keyof KeyMap, index: number, code: string): void;
  resetKeys(): void;
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
      audio: DEFAULT_AUDIO,
      controls: DEFAULT_CONTROLS,
      accessibility: DEFAULT_ACCESSIBILITY,
      setAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),
      setControls: (patch) => set((s) => ({ controls: { ...s.controls, ...patch } })),
      setAccessibility: (patch) => set((s) => ({ accessibility: { ...s.accessibility, ...patch } })),
      setKey: (action, index, code) =>
        set((s) => {
          const list = [...s.render.keys[action]];
          list[index] = code;
          return { render: { ...s.render, keys: { ...s.render.keys, [action]: list } } };
        }),
      resetKeys: () => set((s) => ({ render: { ...s.render, keys: DEFAULT_KEYS } })),
      reset: () =>
        set({
          render: DEFAULT_RENDER_SETTINGS,
          gameplay: DEFAULT_GAMEPLAY,
          audio: DEFAULT_AUDIO,
          controls: DEFAULT_CONTROLS,
          accessibility: DEFAULT_ACCESSIBILITY,
        }),
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
        const audio = { ...DEFAULT_AUDIO, ...p.audio };
        const controls = { ...DEFAULT_CONTROLS, ...p.controls };
        const accessibility = { ...DEFAULT_ACCESSIBILITY, ...p.accessibility };
        return { ...current, render, gameplay, audio, controls, accessibility };
      },
    },
  ),
);

/**
 * Movimento reduzido (ART_DIRECTION 7): a opção de acessibilidade manda; em "sistema", segue a
 * preferência do sistema operacional.
 */
export function prefersReducedMotion(): boolean {
  const mode = useSettings.getState().accessibility?.reduceMotion ?? 'system';
  if (mode !== 'system') return mode === 'on';
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Atalhos que usam a tecla (conflito de remapeamento). */
export function keyConflicts(keys: KeyMap, code: string, except: keyof KeyMap): (keyof KeyMap)[] {
  return (Object.keys(keys) as (keyof KeyMap)[]).filter((k) => k !== except && keys[k].includes(code));
}
