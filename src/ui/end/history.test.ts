/**
 * Fase 9 — histórico da tela de fim (UX_SPEC 2.16): refeito pelo log, uma marca por rodada
 * terminada e exportação suficiente para refazer a partida.
 */
import { describe, expect, it } from 'vitest';
import { replay } from '../../engine';
import { makeContext, passTurn, startedGame } from '../../engine/testing';
import { exportGame, gameHistory } from './history';

describe('Histórico da partida', () => {
  const ctx = makeContext(3);
  const options = { seed: 21, layers: { conflict: true, events: true } };

  it('uma marca por rodada terminada, com um ponto por jogador', () => {
    let s = startedGame(ctx, options);
    while (s.round < 4 && s.stage === 'playing') s = passTurn(ctx, s).state;
    const h = gameHistory(ctx, options, s.log);
    expect(h.rounds.map((r) => r.round)).toEqual([1, 2, 3]);
    expect(h.rounds.every((r) => r.players.length === 3)).toBe(true);
    expect(h.timeline.some((t) => t.event.type === 'eventRevealed')).toBe(true);
  });

  it('o arquivo exportado refaz a mesma partida', () => {
    let s = startedGame(ctx, options);
    s = passTurn(ctx, s).state;
    const file = JSON.parse(exportGame(s, options)) as { options: typeof options; log: typeof s.log };
    expect(replay(ctx, file.options, file.log)).toEqual(s);
  });
});
