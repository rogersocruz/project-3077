import { describe, expect, it } from 'vitest';
import { parseCam, parseTableParams } from './tableParams';

describe('parâmetros da rota da mesa', () => {
  it('padrões', () => {
    expect(parseTableParams('')).toEqual({
      players: 4,
      seed: 1,
      cam: null,
      quality: null,
      showUi: true,
      post: null,
      adaptive: null,
    });
  });

  it('lê jogadores, seed, câmera, qualidade e interruptores', () => {
    expect(parseTableParams('?players=6&seed=42&cam=hex:2:-1,1&quality=low&ui=0&post=0&adaptive=0')).toEqual({
      players: 6,
      seed: 42,
      cam: { kind: 'hex', key: '2:-1,1' },
      quality: 'low',
      showUi: false,
      post: false,
      adaptive: false,
    });
  });

  it('valores inválidos caem no padrão', () => {
    expect(parseTableParams('?players=9').players).toBe(4);
    expect(parseTableParams('?quality=ultra').quality).toBeNull();
    expect(parseCam('board:x')).toBeNull();
    expect(parseCam('board:3')).toEqual({ kind: 'board', boardId: 3 });
    expect(parseCam('overview')).toEqual({ kind: 'overview' });
  });
});
