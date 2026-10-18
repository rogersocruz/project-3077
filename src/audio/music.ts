/**
 * Trilha procedural (decisão do usuário: substituto em Web Audio até existirem arquivos).
 * Estados (ART_DIRECTION 9): menu = pad calmo; explore = ambiente em jogo; tension = camada
 * tensa por cima (pulso grave) que entra com combate ou evento perigoso e sai sozinha.
 */
import type { MusicState } from './sounds';

/** Acordes (frequências em Hz) por estado; trocam a cada `STEP` segundos. */
const CHORDS: Record<'menu' | 'explore', number[][]> = {
  menu: [
    [130.81, 196.0, 261.63, 329.63],
    [110.0, 164.81, 220.0, 277.18],
    [116.54, 174.61, 233.08, 293.66],
    [98.0, 146.83, 196.0, 246.94],
  ],
  explore: [
    [110.0, 164.81, 220.0, 261.63],
    [98.0, 146.83, 196.0, 233.08],
    [87.31, 130.81, 174.61, 220.0],
    [103.83, 155.56, 207.65, 246.94],
  ],
};
const STEP = 6;

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private tensionGain: GainNode | null = null;
  private voices: OscillatorNode[] = [];
  private timer: number | null = null;
  private tensionTimer: number | null = null;
  private state: MusicState | null = null;
  private chord = 0;
  private volume = 0.5;

  /** Precisa de um gesto do usuário (política de autoplay): chamado no primeiro clique. */
  unlock(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.padGain.connect(lp).connect(this.master);
    this.voices = [0, 1, 2, 3].map(() => {
      const o = this.ctx!.createOscillator();
      o.type = 'triangle';
      o.connect(this.padGain!);
      o.start();
      return o;
    });
    // Camada tensa: pulso grave em dente de serra, modulado por um LFO.
    this.tensionGain = this.ctx.createGain();
    this.tensionGain.gain.value = 0;
    const bass = this.ctx.createOscillator();
    bass.type = 'sawtooth';
    bass.frequency.value = 55;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 2;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(this.tensionGain.gain);
    const tlp = this.ctx.createBiquadFilter();
    tlp.type = 'lowpass';
    tlp.frequency.value = 400;
    bass.connect(tlp).connect(this.tensionGain).connect(this.master);
    bass.start();
    lfo.start();
    if (this.state) this.play(this.state);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  get current(): MusicState | null {
    return this.state;
  }

  play(state: MusicState): void {
    if (state === 'tension') {
      this.tension();
      return;
    }
    this.state = state;
    if (!this.ctx || !this.padGain) return;
    this.padGain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 1.5);
    const chords = CHORDS[state];
    const apply = () => {
      const c = chords[this.chord % chords.length] ?? [];
      this.voices.forEach((o, i) => o.frequency.setTargetAtTime(c[i] ?? 0, this.ctx!.currentTime, 1.2));
      this.chord++;
    };
    apply();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = window.setInterval(apply, STEP * 1000);
  }

  /** Entra a camada tensa por alguns segundos (combate, desastre, horda). */
  tension(seconds = 10): void {
    if (!this.ctx || !this.tensionGain) return;
    this.tensionGain.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.4);
    if (this.tensionTimer !== null) window.clearTimeout(this.tensionTimer);
    this.tensionTimer = window.setTimeout(() => {
      if (this.ctx && this.tensionGain) this.tensionGain.gain.setTargetAtTime(0, this.ctx.currentTime, 2);
    }, seconds * 1000);
  }

  stop(): void {
    this.state = null;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && this.padGain) this.padGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
  }
}
