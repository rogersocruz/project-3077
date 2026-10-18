/**
 * Fase 10 — áudio: sintetizador sfxr determinístico, WAV válido, todo momento do catálogo de
 * animações (UX_SPEC 6) tem som, e o manifest lista exatamente o catálogo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { soundsForCue, soundsForEvents } from './map';
import { synth, toWav } from './sfxr';
import { MUSIC_TRACKS, SOUND_IDS, SOUNDS } from './sounds';

describe('sfxr próprio', () => {
  it('mesmo preset e seed = mesmas amostras; ruído com seed diferente muda', () => {
    const a = synth(SOUNDS.combat.sfxr, 'x');
    const b = synth(SOUNDS.combat.sfxr, 'x');
    const c = synth(SOUNDS.combat.sfxr, 'y');
    expect(a.length).toBeGreaterThan(1000);
    expect([...a]).toEqual([...b]);
    expect([...a]).not.toEqual([...c]);
  });

  it('todo som do catálogo gera áudio audível dentro de −1–1', () => {
    for (const id of SOUND_IDS) {
      const s = synth(SOUNDS[id].sfxr, id);
      expect(s.length, id).toBeGreaterThan(200);
      const peak = s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      expect(peak, id).toBeGreaterThan(0.01);
      expect(peak, id).toBeLessThanOrEqual(1);
    }
  });

  it('WAV PCM 16 bits mono 44,1 kHz', () => {
    const wav = toWav(new Float32Array([0, 0.5, -0.5]));
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint16(34, true)).toBe(16);
    expect(wav.length).toBe(44 + 6);
  });
});

describe('Evento → som (UX_SPEC 6)', () => {
  it('cada momento do catálogo de animações tem um som', () => {
    const cue = (kind: string, extra = {}) => ({ kind, ...extra }) as never;
    expect(soundsForCue(cue('draw'))).toEqual(['cardDraw']);
    expect(soundsForCue(cue('cardPlay'))).toEqual(['cardPlay']);
    expect(soundsForCue(cue('deliver'))).toEqual(['cardDeliver']);
    expect(soundsForCue(cue('cardReveal'))).toEqual(['cardReveal']);
    expect(soundsForCue(cue('reveal'))).toEqual(['explore']);
    expect(soundsForCue(cue('survey'))).toEqual(['survey']);
    expect(soundsForCue(cue('build'))).toEqual(['build']);
    expect(soundsForCue(cue('upgrade'))).toEqual(['upgrade']);
    expect(soundsForCue(cue('production', { items: [1] }))).toEqual(['produce']);
    expect(soundsForCue(cue('bank'))).toEqual(['bank']);
    expect(soundsForCue(cue('combat'))).toEqual(['combat']);
    expect(soundsForCue(cue('destroy'))).toEqual(['destroy']);
    expect(soundsForCue(cue('downgrade'))).toEqual(['downgrade']);
    expect(soundsForCue(cue('install'))).toEqual(['install']);
    expect(soundsForCue(cue('steal'))).toEqual(['steal']);
    expect(soundsForCue(cue('treaty', { fx: 'signed' }))).toEqual(['treatySigned']);
    expect(soundsForCue(cue('treaty', { fx: 'triggered' }))).toEqual(['treatyTriggered']);
    for (const c of ['seismic', 'thermal', 'climatic', 'atmospheric', 'horde'])
      expect(soundsForCue(cue('worldEvent', { category: c }))).toEqual([c]);
    expect(
      soundsForEvents([
        { type: 'troopsMoved', player: 0, from: 'a', to: 'b', uids: [1], path: [] },
        { type: 'tollPaid', from: 0, to: 1, resources: {} },
        { type: 'villageDamaged', player: 1, lives: 2 },
        { type: 'guardianSpawned', hex: 'a', strength: 4 },
        { type: 'gameOver', winners: [0], reason: 'condition' },
      ]),
    ).toEqual(['troopMove', 'toll', 'villageHit', 'guardian', 'victory']);
  });

  it('o manifest lista exatamente os sons e as faixas do catálogo', () => {
    const file = join(import.meta.dirname, '../../public/audio/audio-manifest.json');
    const m = JSON.parse(readFileSync(file, 'utf8')) as {
      sounds: { id: string; file: string }[];
      music: { id: string }[];
    };
    expect(m.sounds.map((s) => s.id).sort()).toEqual([...SOUND_IDS].sort());
    expect(m.music.map((s) => s.id).sort()).toEqual(Object.keys(MUSIC_TRACKS).sort());
  });
});
