/**
 * Catálogo de sons (UX_SPEC 6 e ART_DIRECTION 9). Cada som tem canal, legenda (acessibilidade,
 * UX_SPEC 3.5) e um preset sfxr como substituto. public/audio/audio-manifest.json lista os
 * mesmos ids com o arquivo esperado para a troca futura (teste: audio.test.ts).
 */
import type { SfxrParams } from './sfxr';

export type Channel = 'sfx' | 'ui' | 'ambient' | 'voice';

export interface SoundDef {
  readonly channel: Channel;
  /** Chave i18n da legenda (`captions.<id>`); sem legenda = som de interface trivial. */
  readonly caption: boolean;
  /** UX_SPEC 6: o que o som deve parecer (vai para o manifest). */
  readonly brief: string;
  readonly sfxr: Partial<SfxrParams>;
}

const s = (channel: Channel, brief: string, sfxr: Partial<SfxrParams>, caption = true): SoundDef => ({
  channel,
  caption,
  brief,
  sfxr,
});

export const SOUNDS = {
  // Interface
  uiClick: s(
    'ui',
    'clique seco metálico',
    { wave: 0, freq: 0.55, sustain: 0.02, decay: 0.08, duty: 0.4, volume: 0.25 },
    false,
  ),
  uiConfirm: s(
    'ui',
    'confirmação em dois tons',
    { wave: 0, freq: 0.45, sustain: 0.05, decay: 0.15, arpMod: 0.4, arpSpeed: 0.6, volume: 0.3 },
    false,
  ),
  uiError: s('ui', 'recusa grave curta', {
    wave: 1,
    freq: 0.18,
    sustain: 0.08,
    decay: 0.12,
    slide: -0.2,
    volume: 0.3,
  }),
  splashImpact: s('sfx', 'impacto metálico da placa do logo', {
    wave: 3,
    freq: 0.12,
    sustain: 0.05,
    punch: 0.6,
    decay: 0.5,
    lpfCutoff: 0.5,
    volume: 0.6,
  }),
  // Rodada e turno
  roundStart: s('sfx', 'gongo metálico curto', {
    wave: 2,
    freq: 0.3,
    sustain: 0.1,
    punch: 0.3,
    decay: 0.6,
    vibratoDepth: 0.1,
    vibratoSpeed: 0.4,
    volume: 0.35,
  }),
  turnStart: s(
    'ui',
    'sinal de vez',
    { wave: 2, freq: 0.5, sustain: 0.04, decay: 0.2, arpMod: 0.3, arpSpeed: 0.5, volume: 0.25 },
    false,
  ),
  // Cartas
  cardDraw: s('sfx', 'deslizar de papel', {
    wave: 3,
    freq: 0.55,
    sustain: 0.06,
    decay: 0.12,
    hpfCutoff: 0.4,
    volume: 0.3,
  }),
  cardPlay: s('sfx', 'whoosh + efeito', {
    wave: 3,
    freq: 0.4,
    sustain: 0.1,
    decay: 0.25,
    slide: 0.2,
    hpfCutoff: 0.2,
    volume: 0.35,
  }),
  cardDeliver: s('sfx', 'zumbido de drone', {
    wave: 1,
    freq: 0.32,
    sustain: 0.35,
    decay: 0.2,
    vibratoDepth: 0.3,
    vibratoSpeed: 0.7,
    lpfCutoff: 0.5,
    volume: 0.25,
  }),
  cardReveal: s('sfx', 'selo rompendo', {
    wave: 3,
    freq: 0.3,
    sustain: 0.03,
    punch: 0.5,
    decay: 0.2,
    volume: 0.35,
  }),
  install: s('sfx', 'trava metálica', {
    wave: 0,
    freq: 0.35,
    sustain: 0.02,
    punch: 0.7,
    decay: 0.15,
    duty: 0.2,
    volume: 0.35,
  }),
  steal: s('sfx', 'puxão de garra mecânica', {
    wave: 1,
    freq: 0.4,
    sustain: 0.08,
    decay: 0.2,
    slide: -0.35,
    volume: 0.35,
  }),
  // Mapa
  explore: s('sfx', 'batida de papelão', {
    wave: 3,
    freq: 0.2,
    sustain: 0.02,
    punch: 0.4,
    decay: 0.15,
    lpfCutoff: 0.4,
    volume: 0.4,
  }),
  survey: s('sfx', 'ping de sonar', {
    wave: 2,
    freq: 0.62,
    sustain: 0.05,
    decay: 0.45,
    slide: -0.05,
    volume: 0.3,
  }),
  build: s('sfx', 'martelos + clank', {
    wave: 3,
    freq: 0.35,
    sustain: 0.03,
    punch: 0.6,
    decay: 0.12,
    repeatSpeed: 0.55,
    volume: 0.35,
  }),
  upgrade: s('sfx', 'acorde ascendente', {
    wave: 0,
    freq: 0.35,
    sustain: 0.15,
    decay: 0.3,
    arpMod: -0.3,
    arpSpeed: 0.55,
    duty: 0.3,
    volume: 0.3,
  }),
  produce: s(
    'sfx',
    'tilintar metálico',
    { wave: 2, freq: 0.75, sustain: 0.02, decay: 0.15, arpMod: 0.5, arpSpeed: 0.7, volume: 0.2 },
    false,
  ),
  bank: s('sfx', 'caixa registradora futurista', {
    wave: 0,
    freq: 0.6,
    sustain: 0.05,
    decay: 0.2,
    arpMod: 0.45,
    arpSpeed: 0.65,
    duty: 0.5,
    volume: 0.3,
  }),
  destroy: s('sfx', 'desabamento', {
    wave: 3,
    freq: 0.1,
    sustain: 0.25,
    punch: 0.3,
    decay: 0.6,
    slide: -0.1,
    lpfCutoff: 0.35,
    volume: 0.5,
  }),
  downgrade: s('sfx', 'vidro quebrando', {
    wave: 3,
    freq: 0.75,
    sustain: 0.05,
    punch: 0.5,
    decay: 0.3,
    hpfCutoff: 0.5,
    volume: 0.35,
  }),
  villageHit: s('sfx', 'alarme grave', {
    wave: 1,
    freq: 0.15,
    sustain: 0.4,
    decay: 0.3,
    vibratoDepth: 0.5,
    vibratoSpeed: 0.5,
    volume: 0.4,
  }),
  // Tropas
  troopMove: s('sfx', 'passos / esteira', {
    wave: 3,
    freq: 0.25,
    sustain: 0.02,
    decay: 0.06,
    repeatSpeed: 0.62,
    lpfCutoff: 0.45,
    volume: 0.3,
  }),
  toll: s('sfx', 'bip de pedágio', {
    wave: 0,
    freq: 0.7,
    sustain: 0.04,
    decay: 0.08,
    duty: 0.5,
    volume: 0.25,
  }),
  combat: s('sfx', 'impacto + metal', {
    wave: 3,
    freq: 0.18,
    sustain: 0.12,
    punch: 0.8,
    decay: 0.45,
    volume: 0.5,
  }),
  // Tratados
  treatySigned: s('sfx', 'assinatura + selo', {
    wave: 3,
    freq: 0.45,
    sustain: 0.12,
    decay: 0.15,
    hpfCutoff: 0.3,
    slide: 0.15,
    volume: 0.3,
  }),
  treatyTriggered: s('sfx', 'sino', {
    wave: 2,
    freq: 0.48,
    sustain: 0.05,
    punch: 0.4,
    decay: 0.7,
    vibratoDepth: 0.05,
    vibratoSpeed: 0.6,
    volume: 0.35,
  }),
  pactBroken: s('sfx', 'corrente partida', {
    wave: 0,
    freq: 0.3,
    sustain: 0.05,
    punch: 0.6,
    decay: 0.3,
    slide: -0.4,
    volume: 0.35,
  }),
  // Eventos globais (por categoria) e sítios
  seismic: s('ambient', 'rumor grave', {
    wave: 3,
    freq: 0.06,
    sustain: 0.6,
    decay: 0.6,
    lpfCutoff: 0.2,
    volume: 0.55,
  }),
  thermal: s('ambient', 'erupção abafada', {
    wave: 3,
    freq: 0.12,
    sustain: 0.3,
    punch: 0.5,
    decay: 0.7,
    lpfCutoff: 0.3,
    volume: 0.5,
  }),
  climatic: s('ambient', 'chuva', {
    wave: 3,
    freq: 0.7,
    sustain: 0.8,
    decay: 0.4,
    hpfCutoff: 0.35,
    volume: 0.2,
  }),
  atmospheric: s('ambient', 'vento + estática', {
    wave: 3,
    freq: 0.4,
    sustain: 0.6,
    decay: 0.5,
    phaserOffset: 0.3,
    phaserSweep: 0.2,
    volume: 0.3,
  }),
  economic: s('ambient', 'pregão distante', {
    wave: 0,
    freq: 0.5,
    sustain: 0.2,
    decay: 0.3,
    arpMod: 0.3,
    arpSpeed: 0.4,
    repeatSpeed: 0.5,
    volume: 0.2,
  }),
  horde: s('ambient', 'rugido', {
    wave: 1,
    freq: 0.1,
    sustain: 0.35,
    punch: 0.4,
    decay: 0.5,
    vibratoDepth: 0.4,
    vibratoSpeed: 0.6,
    volume: 0.5,
  }),
  guardian: s('ambient', 'coro grave', {
    wave: 2,
    freq: 0.14,
    attack: 0.2,
    sustain: 0.5,
    decay: 0.6,
    vibratoDepth: 0.2,
    vibratoSpeed: 0.3,
    volume: 0.45,
  }),
  // Fim
  victory: s('sfx', 'fanfarra', {
    wave: 0,
    freq: 0.4,
    sustain: 0.3,
    decay: 0.5,
    arpMod: -0.4,
    arpSpeed: 0.7,
    duty: 0.3,
    volume: 0.4,
  }),
} as const satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;
export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

/** Faixas de música por estado (ART_DIRECTION 9). Substituto procedural em music.ts. */
export const MUSIC_TRACKS = {
  menu: 'orquestral-sintético calmo',
  explore: 'ambiente de exploração em jogo',
  tension: 'camada tensa (combate ou evento perigoso)',
} as const;
export type MusicState = keyof typeof MUSIC_TRACKS;
