/**
 * Parâmetros da partida na URL: `?view=game&players=3&seed=1&long=0&cards=1` e, para capturas
 * reproduzíveis e testes, `speed=0.5|1|2|instant`, `privacy=0|1`, `quality`, `post`,
 * `adaptive`. Os de apresentação gravam nas configurações.
 */
import type { AnimationSpeed, Quality } from '../../settings';

export interface GameSetup {
  readonly players: number;
  readonly seed: number;
  readonly longMap: boolean;
  /** Camada de cartas (Fase 4; padrão ligada, `cards=0` desliga). */
  readonly cards: boolean;
}

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
  const players = Number(p.get('players') ?? 3);
  const seed = Number(p.get('seed') ?? 1);
  const speed = p.get('speed');
  const q = p.get('quality');
  return {
    setup: {
      players: Number.isInteger(players) && players >= 3 && players <= 6 ? players : 3,
      seed: Number.isInteger(seed) && seed >= 0 ? seed : 1,
      longMap: p.get('long') === '1',
      cards: p.get('cards') !== '0',
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
  !!a && a.players === b.players && a.seed === b.seed && a.longMap === b.longMap && a.cards === b.cards;
