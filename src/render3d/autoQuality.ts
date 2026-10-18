/**
 * Detecção automática de qualidade (UX_SPEC 3.1): mede o FPS por 3 s com a mesa na tela e
 * escolhe a predefinição. Roda sozinha no primeiro boot da partida e pelo botão nas
 * configurações.
 */
import { type Quality, QUALITY_PRESETS, useSettings } from '../settings';

/** Predefinição para a média medida. */
export function qualityForFps(fps: number): Quality {
  if (fps >= 58) return 'high';
  if (fps >= 45) return 'medium';
  return 'low';
}

/** Mede os quadros por `ms` e aplica a predefinição. Devolve o FPS médio. */
export function detectQuality(ms = 3000): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      frames++;
      if (t - start < ms) {
        requestAnimationFrame(tick);
        return;
      }
      const fps = (frames * 1000) / (t - start);
      useSettings.getState().setRender({ ...QUALITY_PRESETS[qualityForFps(fps)], autoDetected: true });
      resolve(fps);
    };
    requestAnimationFrame(tick);
  });
}
