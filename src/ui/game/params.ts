/**
 * Parâmetros da partida na URL: `?view=game&players=3&seed=1&long=0&cards=1` e os assentos
 * (Fase 5): `seats=human,normal,hard` (um por jogador; falta = humano) ou `ai=all|easy|
 * normal|hard` (todos IA: modo espectador; `all` = Normal). Para capturas
 * reproduzíveis e testes, `speed=0.5|1|2|instant`, `privacy=0|1`, `quality`, `post`,
 * `adaptive`. Os de apresentação gravam nas configurações.
 */
import { type AiLevel, isAiLevel } from '../../ai/types';
import type { AnimationSpeed, Quality } from '../../settings';

/** Quem joga no assento: pessoa (hotseat) ou IA de um nível. */
export type SeatKind = 'human' | AiLevel;

export interface GameSetup {
  readonly players: number;
  readonly seed: number;
  readonly longMap: boolean;
  /** Camada de cartas (Fase 4; padrão ligada, `cards=0` desliga). */
  readonly cards: boolean;
  /** Eventos globais e hexes especiais (Fase 6; na URL `events=1`, `special=1`). */
  readonly events: boolean;
  readonly specialHexes: boolean;
  /** Tropas e combate (Fase 7; na URL `conflict=1`). */
  readonly conflict: boolean;
  /** Tratados (Fase 8; na URL `treaties=1`). */
  readonly treaties: boolean;
  /** Facções assimétricas (Fase 9; na URL `factions=1`, `fac=pirates,random,…`, `elim=neutral`). */
  readonly factions: boolean;
  /** Facção escolhida por assento; null = aleatória. */
  readonly factionPicks: readonly (string | null)[];
  /** GDD 13.2 / D11: regra do eliminado (null = padrão do balance.json). */
  readonly eliminatedRule: 'leave' | 'neutral' | null;
  /** Um por jogador (Fase 5). */
  readonly seats: readonly SeatKind[];
}

export function parseSeats(players: number, seats: string | null, ai: string | null): SeatKind[] {
  if (ai !== null) {
    const level: AiLevel = ai === 'all' || !isAiLevel(ai) ? 'normal' : ai;
    return Array.from({ length: players }, () => level);
  }
  const list = (seats ?? '').split(',');
  return Array.from({ length: players }, (_, i) => {
    const v = list[i]?.trim();
    return isAiLevel(v) ? v : 'human';
  });
}

export const isSpectator = (seats: readonly SeatKind[]) => seats.every((k) => k !== 'human');

export interface GameParams {
  readonly setup: GameSetup;
  readonly speed: AnimationSpeed | null;
  readonly privacy: boolean | null;
  readonly quality: Quality | null;
  readonly post: boolean | null;
  readonly adaptive: boolean | null;
}

const flag = (v: string | null): boolean | null => (v === null ? null : v !== '0');

export function parseGameParams(search: string): GameParams {
  const p = new URLSearchParams(search);
  const rawPlayers = Number(p.get('players') ?? 3);
  const players = Number.isInteger(rawPlayers) && rawPlayers >= 3 && rawPlayers <= 6 ? rawPlayers : 3;
  const seed = Number(p.get('seed') ?? 1);
  const speed = p.get('speed');
  const q = p.get('quality');
  return {
    setup: {
      players,
      seed: Number.isInteger(seed) && seed >= 0 ? seed : 1,
      longMap: p.get('long') === '1',
      cards: p.get('cards') !== '0',
      events: p.get('events') === '1',
      specialHexes: p.get('special') === '1',
      conflict: p.get('conflict') === '1',
      treaties: p.get('treaties') === '1',
      factions: p.get('factions') === '1',
      factionPicks: (p.get('fac') ?? '')
        .split(',')
        .filter((x) => x !== '')
        .map((x) => (x === 'random' ? null : x)),
      eliminatedRule: p.get('elim') === 'neutral' ? 'neutral' : p.get('elim') === 'leave' ? 'leave' : null,
      seats: parseSeats(players, p.get('seats'), p.get('ai')),
    },
    speed:
      speed === 'instant' ? 'instant' : speed === '0.5' ? 0.5 : speed === '1' ? 1 : speed === '2' ? 2 : null,
    privacy: flag(p.get('privacy')),
    quality: q === 'low' || q === 'medium' || q === 'high' ? q : null,
    post: flag(p.get('post')),
    adaptive: flag(p.get('adaptive')),
  };
}

export const sameSetup = (a: GameSetup | null, b: GameSetup) =>
  !!a &&
  a.players === b.players &&
  a.seed === b.seed &&
  a.longMap === b.longMap &&
  a.cards === b.cards &&
  a.events === b.events &&
  a.specialHexes === b.specialHexes &&
  a.conflict === b.conflict &&
  a.treaties === b.treaties &&
  a.factions === b.factions &&
  a.factionPicks.join() === b.factionPicks.join() &&
  a.eliminatedRule === b.eliminatedRule &&
  a.seats.join() === b.seats.join();
