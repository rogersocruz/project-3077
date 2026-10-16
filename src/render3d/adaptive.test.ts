import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_SETTINGS } from '../settings';
import {
  adaptDprScale,
  adaptPost,
  INITIAL_MONITOR,
  MAX_TIER,
  MONITOR,
  type MonitorState,
  nextMonitorState,
} from './adaptive';

const run = (s: MonitorState, fps: number[]) => fps.reduce(nextMonitorState, s);

describe('qualidade adaptativa', () => {
  it('corta efeitos na ordem: tilt-shift, SMAA→FXAA, bloom; vinheta fica', () => {
    const post = DEFAULT_RENDER_SETTINGS.post;
    expect(adaptPost(post, 0)).toEqual({ ...post, fxaa: false });
    expect(adaptPost(post, 1)).toMatchObject({ tiltShift: false, smaa: true, bloom: true });
    expect(adaptPost(post, 2)).toMatchObject({ smaa: false, fxaa: true, bloom: true });
    expect(adaptPost(post, 3)).toMatchObject({ bloom: false, fxaa: true, vignette: true });
    expect(adaptDprScale(3)).toBe(1);
    expect(adaptDprScale(MAX_TIER)).toBeLessThan(adaptDprScale(4));
  });

  it('nunca liga o que o jogador desligou', () => {
    const off = { bloom: false, vignette: false, smaa: false, tiltShift: false };
    for (let t = 0; t <= MAX_TIER; t++) expect(adaptPost(off, t)).toEqual({ ...off, fxaa: false });
  });

  it('degrada uma vez por janela lenta, respeitando a espera após cada troca', () => {
    const slow = MONITOR.lower - 10;
    // 1ª janela é espera inicial; depois: degrada, espera, degrada.
    const s = run(INITIAL_MONITOR, [slow, slow, slow, slow]);
    expect(s.tier).toBe(2);
    expect(run(INITIAL_MONITOR, Array(40).fill(slow)).tier).toBe(MAX_TIER);
  });

  it('recupera só depois de várias janelas boas, e para de oscilar', () => {
    const slow = MONITOR.lower - 10;
    const good = MONITOR.upper;
    let s = run(INITIAL_MONITOR, [slow, slow, slow, slow]);
    expect(s.tier).toBe(2);
    s = run(s, Array(MONITOR.goodToRecover).fill(good));
    expect(s.tier).toBe(2);
    s = run(s, [good]);
    expect(s.tier).toBe(1);
    // Depois de maxRecoveries, não sobe mais.
    s = run(s, [slow, slow, slow, ...Array(20).fill(good)]);
    s = run(s, [slow, slow, ...Array(40).fill(good)]);
    expect(s.recoveries).toBe(MONITOR.maxRecoveries);
    const before = s.tier;
    expect(run(s, Array(40).fill(good)).tier).toBe(before);
  });
});
