/**
 * Parâmetros da rota de desenvolvimento da mesa:
 *   ?view=table&players=6&seed=1&cam=overview|board:N|hex:B:q,r&quality=low|medium|high
 *   &ui=0&post=0&adaptive=0
 */
import type { Quality } from '../../settings';
import type { FocusTarget } from '../../render3d/sceneStore';

export interface TableParams {
  readonly players: number;
  readonly seed: number;
  readonly cam: FocusTarget | null;
  readonly quality: Quality | null;
  readonly showUi: boolean;
  readonly post: boolean | null;
  /** Qualidade adaptativa (desligar deixa as capturas reproduzíveis). */
  readonly adaptive: boolean | null;
}

export function parseCam(raw: string | null): FocusTarget | null {
  if (!raw) return null;
  if (raw === 'overview') return { kind: 'overview' };
  const board = /^board:(\d+)$/.exec(raw);
  if (board) return { kind: 'board', boardId: Number(board[1]) };
  const hex = /^hex:(\d+):(-?\d+),(-?\d+)$/.exec(raw);
  if (hex) return { kind: 'hex', key: `${hex[1]}:${hex[2]},${hex[3]}` };
  return null;
}

export function parseTableParams(search: string): TableParams {
  const p = new URLSearchParams(search);
  const players = Number(p.get('players') ?? 4);
  const seed = Number(p.get('seed') ?? 1);
  const q = p.get('quality');
  const post = p.get('post');
  const adaptive = p.get('adaptive');
  return {
    players: Number.isInteger(players) && players >= 3 && players <= 6 ? players : 4,
    seed: Number.isFinite(seed) ? seed : 1,
    cam: parseCam(p.get('cam')),
    quality: q === 'low' || q === 'medium' || q === 'high' ? q : null,
    showUi: p.get('ui') !== '0',
    post: post === null ? null : post !== '0',
    adaptive: adaptive === null ? null : adaptive !== '0',
  };
}
