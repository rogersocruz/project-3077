/**
 * Gerenciador de som (Fase 10, ART_DIRECTION 9): canais (geral, música, efeitos, interface,
 * ambiente, vozes) com volume das configurações, efeitos substitutos gerados pelo sfxr próprio
 * e tocados pelo Howler, trilha procedural por estado e legendas para acessibilidade.
 * Fora do navegador (testes, simulador) tudo vira silêncio.
 */
import type { Howl } from 'howler';
import { useSettings } from '../settings';
import { useCaptions } from './captions';
import { MusicEngine } from './music';
import { synth, wavDataUri } from './sfxr';
import { type MusicState, SOUNDS, type SoundId } from './sounds';

export { useCaptions } from './captions';
export { soundsForCue, soundsForEvents } from './map';
export { SOUND_IDS, SOUNDS, type MusicState, type SoundId } from './sounds';

const browser = typeof window !== 'undefined' && typeof document !== 'undefined';
const howls = new Map<SoundId, Howl>();
let howler: typeof import('howler') | null = null;
let loading: Promise<void> | null = null;
let focused = true;
export const music = new MusicEngine();

/** Último som tocado (teste e2e: a configuração de volume tem efeito). */
export const audioProbe = { last: null as { id: SoundId; volume: number } | null, played: 0 };
if (browser && import.meta.env?.DEV)
  (window as unknown as { __p3077audio: typeof audioProbe }).__p3077audio = audioProbe;

function channelVolume(id: SoundId): number {
  const a = useSettings.getState().audio;
  if (a.muteOnBlur && !focused) return 0;
  return a.master * a[SOUNDS[id].channel];
}

async function ensureHowler(): Promise<void> {
  if (howler || !browser) return;
  loading ??= import('howler').then((m) => {
    howler = m;
  });
  await loading;
}

function howlOf(id: SoundId): Howl | null {
  if (!howler) return null;
  let h = howls.get(id);
  if (!h) {
    h = new howler.Howl({ src: [wavDataUri(synth(SOUNDS[id].sfxr, id))], format: ['wav'], preload: true });
    howls.set(id, h);
  }
  return h;
}

/** Toca um efeito no canal dele; com legendas ligadas, mostra a legenda. */
export function playSound(id: SoundId): void {
  if (!browser) return;
  const volume = channelVolume(id);
  audioProbe.last = { id, volume };
  audioProbe.played++;
  if (SOUNDS[id].caption && useSettings.getState().accessibility.captions) useCaptions.getState().push(id);
  if (volume <= 0) return;
  void ensureHowler().then(() => {
    const h = howlOf(id);
    if (!h) return;
    h.volume(volume);
    h.play();
  });
}

/** Música por estado (menu, explore; tension = camada por cima). */
export function setMusic(state: MusicState | null): void {
  if (state === null) music.stop();
  else music.play(state);
}

/** Liga o áudio no primeiro gesto, segue volumes e o foco da janela. Uma vez, em App. */
export function initAudio(): () => void {
  if (!browser) return () => undefined;
  const unlock = () => {
    music.unlock();
    void ensureHowler();
  };
  const applyMusic = () => {
    const a = useSettings.getState().audio;
    music.setVolume(a.muteOnBlur && !focused ? 0 : a.master * a.music);
  };
  const blur = () => {
    focused = false;
    applyMusic();
  };
  const focus = () => {
    focused = true;
    applyMusic();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  applyMusic();
  const unsub = useSettings.subscribe((s, prev) => {
    if (s.audio !== prev.audio) applyMusic();
  });
  return () => {
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
    unsub();
  };
}
