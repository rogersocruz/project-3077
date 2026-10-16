import { beforeEach, describe, expect, it } from 'vitest';
import type { Action } from '../engine/actions';
import { applyAction } from '../engine/reducer';
import { createGame } from '../engine/setup';
import type { GameState } from '../engine/state';
import { key, makeContext } from '../engine/testing';
import { Director } from './director';
import { usePresentation } from './presentation';

const ctx = makeContext(3);
const flush = () => new Promise((r) => setTimeout(r, 5));

function setup(privacy: boolean) {
  const focused: number[] = [];
  const director = new Director({
    speed: () => 'instant',
    privacy: () => privacy,
    reducedMotion: () => false,
    focusBoard: (b) => focused.push(b),
    setLocalPlayer: () => {},
  });
  let state = createGame(ctx, { seed: 1 });
  director.reset(ctx, state);
  const act = (a: Action) => {
    const before: GameState = state;
    const r = applyAction(ctx, before, a);
    state = r.state;
    director.enqueue({ before, after: r.state, events: r.events });
  };
  return { director, act, focused, state: () => state };
}

const village = (p: number): Action => ({ type: 'chooseVillage', player: p, hex: key(p, 0, 0) });

describe('diretor de animação: fila, troca do estado mostrado e privacidade em hotseat', () => {
  beforeEach(() => usePresentation.setState({ viewer: null, gate: null, busy: false, log: [] }));

  it('começa pedindo a tela de privacidade para quem decide e bloqueia a entrada', async () => {
    const { director } = setup(true);
    await flush();
    expect(usePresentation.getState().gate).toEqual({ player: 0, reason: 'setup' });
    expect(usePresentation.getState().busy).toBe(true);
    director.release();
    await flush();
    expect(usePresentation.getState()).toMatchObject({ gate: null, viewer: 0, busy: false });
  });

  it('o estado mostrado só muda depois do lote; cada troca de jogador passa pela privacidade', async () => {
    const { director, act, state } = setup(true);
    await flush();
    director.release();
    await flush();
    act(village(0));
    await flush();
    // Vila fundada e já é a vez do jogador 1 escolher: o lote terminou, falta a privacidade.
    expect(usePresentation.getState().shown).toBe(state());
    expect(usePresentation.getState().gate).toEqual({ player: 1, reason: 'setup' });
    director.release();
    await flush();
    act(village(1));
    await flush();
    director.release();
    await flush();
    act(village(2));
    await flush();
    // Última Vila: a rodada 1 começa no meio do lote, e a privacidade vem no turno do 0.
    expect(usePresentation.getState().gate).toEqual({ player: 0, reason: 'turn' });
    expect(usePresentation.getState().shown?.stage).toBe('setup');
    director.release();
    await flush();
    expect(usePresentation.getState().shown).toBe(state());
    expect(usePresentation.getState().turn).toMatchObject({ round: 1, activePlayer: 0, phase: 'actions' });
    expect(usePresentation.getState().busy).toBe(false);
    expect(usePresentation.getState().counters).toEqual(state().players.map((p) => p.resources));
  });

  it('sem privacidade, quem olha segue quem decide e a câmera vai para o tabuleiro dele', async () => {
    const { act, focused } = setup(false);
    await flush();
    expect(usePresentation.getState().viewer).toBe(0);
    act(village(0));
    act(village(1));
    await flush();
    expect(usePresentation.getState().viewer).toBe(2);
    expect(usePresentation.getState().gate).toBeNull();
    expect(focused).toEqual([0, 1, 2]);
  });

  it('registro guarda os eventos com o índice da ação (o desfazer corta por ele)', async () => {
    const { act } = setup(false);
    await flush();
    act(village(0));
    await flush();
    const log = usePresentation.getState().log;
    expect(log.length).toBeGreaterThan(0);
    expect(new Set(log.map((e) => e.actionIndex))).toEqual(new Set([1]));
    expect(log[0]?.event.type).toBe('villageFounded');
  });
});
