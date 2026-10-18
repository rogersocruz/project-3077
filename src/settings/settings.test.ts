/**
 * Fase 10 — configurações com efeito verificável (UX_SPEC 3): predefinições, antisserrilhado,
 * detecção de qualidade, conflito de atalhos, modo daltônico e movimento reduzido.
 */
import { describe, expect, it } from 'vitest';
import { adaptPost } from '../render3d/adaptive';
import { qualityForFps } from '../render3d/autoQuality';
import { applyColorMode } from '../ui/theme/accessibility';
import { palette } from '../ui/theme/tokens';
import { DEFAULT_KEYS, keyConflicts, prefersReducedMotion, QUALITY_PRESETS, useSettings } from '.';

describe('Configurações', () => {
  it('antisserrilhado FXAA troca o SMAA em qualquer degrau; desligado não liga nenhum', () => {
    const post = { bloom: true, vignette: true, smaa: true, tiltShift: true };
    expect(adaptPost(post, 0, true)).toMatchObject({ smaa: false, fxaa: true });
    expect(adaptPost({ ...post, smaa: false }, 0)).toMatchObject({ smaa: false, fxaa: false });
  });

  it('predefinições e detecção automática de qualidade', () => {
    expect(QUALITY_PRESETS.low).toMatchObject({ shadows: false, particles: 'low' });
    expect(QUALITY_PRESETS.ultra).toMatchObject({ quality: 'ultra', particles: 'high' });
    expect(qualityForFps(60)).toBe('high');
    expect(qualityForFps(50)).toBe('medium');
    expect(qualityForFps(30)).toBe('low');
  });

  it('atalho remapeado avisa o conflito; restaurar volta ao padrão', () => {
    const st = useSettings.getState();
    st.setKey('build', 0, 'KeyE');
    expect(useSettings.getState().render.keys.build[0]).toBe('KeyE');
    expect(keyConflicts(useSettings.getState().render.keys, 'KeyE', 'build')).toEqual(['explore']);
    useSettings.getState().resetKeys();
    expect(useSettings.getState().render.keys).toEqual(DEFAULT_KEYS);
  });

  it('modo daltônico troca a paleta (JS) e volta', () => {
    const before = palette.faction.government.color;
    expect(applyColorMode('deuteranopia')).toBe(true);
    expect(palette.faction.government.color).not.toBe(before);
    expect(palette.resource.food.color).toBe('#009E73');
    applyColorMode('normal');
    expect(palette.faction.government.color).toBe(before);
  });

  it('reduzir movimento: a opção manda sobre o sistema', () => {
    useSettings.getState().setAccessibility({ reduceMotion: 'on' });
    expect(prefersReducedMotion()).toBe(true);
    useSettings.getState().setAccessibility({ reduceMotion: 'off' });
    expect(prefersReducedMotion()).toBe(false);
    useSettings.getState().reset();
  });
});
