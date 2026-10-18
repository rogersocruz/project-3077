/**
 * Qualidade adaptativa: quando o FPS cai abaixo da meta, a mesa sobe um degrau e
 * corta primeiro o que mais custa e menos aparece. Puro (testado no Vitest).
 *
 *   0  tudo como nas configurações
 *   1  sem desfoque de borda (tilt-shift)
 *   2  SMAA → FXAA (uma passada em vez de três)
 *   3  sem bloom
 *   4  resolução × 0,85
 *   5  resolução × 0,7
 */
import type { PostSettings } from '../settings';

export const MAX_TIER = 5;

export const MONITOR = {
  /** Duração de uma janela de medição (s). */
  window: 2,
  /** Média abaixo disso degrada um degrau. */
  lower: 57,
  /** Média a partir disso conta como janela boa. */
  upper: 59.5,
  /** Janelas boas seguidas para recuperar um degrau. */
  goodToRecover: 5,
  /** Recuperações permitidas (evita ficar oscilando entre dois degraus). */
  maxRecoveries: 2,
} as const;

export interface MonitorState {
  readonly tier: number;
  /** Janelas a ignorar depois de uma troca (a cena reconstrói o pós). */
  readonly cooldown: number;
  readonly good: number;
  readonly recoveries: number;
}

export const INITIAL_MONITOR: MonitorState = { tier: 0, cooldown: 1, good: 0, recoveries: 0 };

/** Decide o próximo degrau a partir da média de FPS de uma janela. */
export function nextMonitorState(s: MonitorState, fps: number): MonitorState {
  if (s.cooldown > 0) return { ...s, cooldown: s.cooldown - 1, good: 0 };
  if (fps < MONITOR.lower && s.tier < MAX_TIER) return { ...s, tier: s.tier + 1, cooldown: 1, good: 0 };
  if (fps >= MONITOR.upper && s.tier > 0 && s.recoveries < MONITOR.maxRecoveries) {
    const good = s.good + 1;
    if (good >= MONITOR.goodToRecover) {
      return { tier: s.tier - 1, cooldown: 1, good: 0, recoveries: s.recoveries + 1 };
    }
    return { ...s, good };
  }
  return { ...s, good: 0 };
}

export interface AdaptedPost extends PostSettings {
  /** FXAA no lugar do SMAA. */
  fxaa: boolean;
}

/**
 * `fxaaOnly` (antisserrilhado FXAA escolhido nas configurações): FXAA em todos os degraus.
 */
export function adaptPost(post: PostSettings, tier: number, fxaaOnly = false): AdaptedPost {
  return {
    tiltShift: post.tiltShift && tier < 1,
    smaa: post.smaa && !fxaaOnly && tier < 2,
    fxaa: fxaaOnly || (post.smaa && tier >= 2),
    bloom: post.bloom && tier < 3,
    vignette: post.vignette,
  };
}

export function adaptDprScale(tier: number): number {
  if (tier >= 5) return 0.7;
  if (tier >= 4) return 0.85;
  return 1;
}

export function anyPost(p: AdaptedPost): boolean {
  return p.bloom || p.vignette || p.smaa || p.fxaa || p.tiltShift;
}
