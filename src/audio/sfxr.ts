/**
 * Sintetizador no formato do sfxr (decisão do usuário: gerador próprio, sem dependência de
 * licença ambígua). Os parâmetros têm os mesmos nomes e faixas do sfxr/jsfxr (0–1, salvo os
 * marcados como −1–1), então presets feitos no site do jsfxr podem ser colados aqui.
 * O ruído usa o RNG do projeto (engine/rng.ts) com seed: o mesmo preset gera o mesmo som.
 */
import { Rng } from '../engine/rng';

export interface SfxrParams {
  /** 0 quadrada · 1 dente de serra · 2 senoide · 3 ruído. */
  readonly wave: 0 | 1 | 2 | 3;
  readonly attack: number;
  readonly sustain: number;
  readonly punch: number;
  readonly decay: number;
  readonly freq: number;
  readonly freqLimit: number;
  /** −1–1 */
  readonly slide: number;
  /** −1–1 */
  readonly deltaSlide: number;
  readonly vibratoDepth: number;
  readonly vibratoSpeed: number;
  /** −1–1 */
  readonly arpMod: number;
  readonly arpSpeed: number;
  readonly duty: number;
  /** −1–1 */
  readonly dutySweep: number;
  readonly repeatSpeed: number;
  /** −1–1 */
  readonly phaserOffset: number;
  /** −1–1 */
  readonly phaserSweep: number;
  readonly lpfCutoff: number;
  /** −1–1 */
  readonly lpfSweep: number;
  readonly lpfResonance: number;
  readonly hpfCutoff: number;
  /** −1–1 */
  readonly hpfSweep: number;
  readonly volume: number;
}

export const SFXR_DEFAULTS: SfxrParams = {
  wave: 0,
  attack: 0,
  sustain: 0.3,
  punch: 0,
  decay: 0.4,
  freq: 0.3,
  freqLimit: 0,
  slide: 0,
  deltaSlide: 0,
  vibratoDepth: 0,
  vibratoSpeed: 0,
  arpMod: 0,
  arpSpeed: 0,
  duty: 0,
  dutySweep: 0,
  repeatSpeed: 0,
  phaserOffset: 0,
  phaserSweep: 0,
  lpfCutoff: 1,
  lpfSweep: 0,
  lpfResonance: 0,
  hpfCutoff: 0,
  hpfSweep: 0,
  volume: 0.5,
};

export const SAMPLE_RATE = 44100;

/** Amostras em −1–1 (44,1 kHz, mono). */
export function synth(partial: Partial<SfxrParams>, seed = 'sfx'): Float32Array {
  const p: SfxrParams = { ...SFXR_DEFAULTS, ...partial };
  const rng = Rng.fromSeed(seed);
  const noise = () => rng.next() * 2 - 1;

  let period = 0;
  let maxPeriod = 0;
  let slide = 0;
  let deltaSlide = 0;
  let squareDuty = 0;
  let dutySweep = 0;
  let arpMod = 1;
  let arpLimit = 0;
  const reset = () => {
    period = 100 / (p.freq * p.freq + 0.001);
    maxPeriod = 100 / (p.freqLimit * p.freqLimit + 0.001);
    slide = 1 - p.slide ** 3 * 0.01;
    deltaSlide = -(p.deltaSlide ** 3) * 0.000001;
    squareDuty = 0.5 - p.duty * 0.5;
    dutySweep = -p.dutySweep * 0.00005;
    arpMod = p.arpMod >= 0 ? 1 - p.arpMod ** 2 * 0.9 : 1 + p.arpMod ** 2 * 10;
    arpLimit = p.arpSpeed === 1 ? 0 : Math.floor((1 - p.arpSpeed) ** 2 * 20000 + 32);
  };
  reset();

  // Filtros.
  let lpPos = 0;
  let lpDelta = 0;
  let lpCut = p.lpfCutoff ** 3 * 0.1;
  const lpCutDelta = 1 + p.lpfSweep * 0.0001;
  let lpDamp = (5 / (1 + p.lpfResonance ** 2 * 20)) * (0.01 + lpCut);
  if (lpDamp > 0.8) lpDamp = 0.8;
  let hpPos = 0;
  let hpCut = p.hpfCutoff ** 2 * 0.1;
  const hpCutDelta = 1 + p.hpfSweep * 0.0003;

  // Vibrato.
  let vibPhase = 0;
  const vibSpeed = p.vibratoSpeed ** 2 * 0.01;
  const vibAmp = p.vibratoDepth * 0.5;

  // Envelope.
  const envLen = [
    Math.floor(p.attack * p.attack * 100000),
    Math.floor(p.sustain * p.sustain * 100000),
    Math.floor(p.decay * p.decay * 100000),
  ] as [number, number, number];
  const total = envLen[0] + envLen[1] + envLen[2];

  // Phaser.
  let phaserOffset = p.phaserOffset ** 2 * 1020 * (p.phaserOffset < 0 ? -1 : 1);
  const phaserDelta = p.phaserSweep ** 2 * (p.phaserSweep < 0 ? -1 : 1);
  const phaserBuf = new Float32Array(1024);
  let ipp = 0;

  const noiseBuf = Float32Array.from({ length: 32 }, noise);
  const repeatLimit = p.repeatSpeed === 0 ? 0 : Math.floor((1 - p.repeatSpeed) ** 2 * 20000 + 32);

  const out = new Float32Array(Math.max(1, Math.ceil(total / 1)));
  let phase = 0;
  let envStage = 0;
  let envTime = 0;
  let repeatTime = 0;
  let arpTime = 0;
  let n = 0;

  for (let t = 0; t < total; t++) {
    if (repeatLimit && ++repeatTime >= repeatLimit) {
      repeatTime = 0;
      reset();
    }
    if (arpLimit && ++arpTime >= arpLimit) {
      arpLimit = 0;
      period *= arpMod;
    }
    slide += deltaSlide;
    period *= slide;
    if (period > maxPeriod) {
      period = maxPeriod;
      if (p.freqLimit > 0) break;
    }
    let rfperiod = period;
    if (vibAmp > 0) {
      vibPhase += vibSpeed;
      rfperiod = period * (1 + Math.sin(vibPhase) * vibAmp);
    }
    const iperiod = Math.max(8, Math.floor(rfperiod));
    squareDuty = Math.min(0.5, Math.max(0, squareDuty + dutySweep));

    if (++envTime > envLen[envStage as 0 | 1 | 2]) {
      envTime = 0;
      envStage++;
      if (envStage > 2) break;
    }
    const len = envLen[envStage as 0 | 1 | 2] || 1;
    const env =
      envStage === 0
        ? envTime / len
        : envStage === 1
          ? 1 + (1 - envTime / len) * 2 * p.punch
          : 1 - envTime / len;

    phaserOffset += phaserDelta;
    const iphase = Math.min(1023, Math.abs(Math.floor(phaserOffset)));
    if (hpCutDelta !== 1) hpCut = Math.min(0.1, Math.max(0.00001, hpCut * hpCutDelta));

    let sample = 0;
    // 8× sobreamostragem, como o sfxr.
    for (let si = 0; si < 8; si++) {
      phase++;
      if (phase >= iperiod) {
        phase %= iperiod;
        if (p.wave === 3) for (let i = 0; i < 32; i++) noiseBuf[i] = noise();
      }
      const fp = phase / iperiod;
      let s: number;
      switch (p.wave) {
        case 0:
          s = fp < squareDuty ? 0.5 : -0.5;
          break;
        case 1:
          s = 1 - fp * 2;
          break;
        case 2:
          s = Math.sin(fp * 2 * Math.PI);
          break;
        default:
          s = noiseBuf[Math.floor((phase * 32) / iperiod)] ?? 0;
      }
      // Passa-baixa.
      const lpOld = lpPos;
      lpCut = Math.min(0.1, Math.max(0, lpCut * lpCutDelta));
      if (p.lpfCutoff !== 1) {
        lpDelta += (s - lpPos) * lpCut;
        lpDelta *= lpDamp;
      } else {
        lpPos = s;
        lpDelta = 0;
      }
      lpPos += lpDelta;
      // Passa-alta.
      hpPos += lpPos - lpOld;
      hpPos -= hpPos * hpCut;
      s = hpPos;
      // Phaser.
      phaserBuf[ipp & 1023] = s;
      s += phaserBuf[(ipp - iphase + 1024) & 1023] ?? 0;
      ipp = (ipp + 1) & 1023;
      sample += s * env;
    }
    out[n++] = Math.max(-1, Math.min(1, (sample / 8) * p.volume * 2));
  }
  return out.subarray(0, n);
}

/** WAV PCM 16 bits (para o Howler tocar como data URI). */
export function toWav(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.round(s * 32767), true));
  return bytes;
}

export function wavDataUri(samples: Float32Array): string {
  const bytes = toWav(samples);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
