/**
 * A partida em andamento (Zustand). Toda ação passa por `dispatch`: o motor confere e
 * aplica na hora, e o lote (antes/depois/eventos) vai para o diretor de animação.
 * O save futuro (Fase 10) é exatamente `options` + `state.log`.
 */
import { create } from 'zustand';
import { director, usePresentation } from '../../anim';
import { loadGameData } from '../../data';
import {
  type Action,
  applyAction,
  canUndo,
  checkAction,
  type CheckResult,
  createContext,
  createGame,
  type EngineContext,
  type GameOptions,
  type GameState,
  undo,
} from '../../engine';
import type { GameSetup } from './params';

interface SessionStore {
  setup: GameSetup | null;
  ctx: EngineContext | null;
  options: GameOptions | null;
  state: GameState | null;
  start(setup: GameSetup): void;
  /** Confere e aplica; devolve o motivo quando a ação é ilegal (nada muda). */
  dispatch(action: Action): CheckResult;
  undo(): boolean;
  rematch(): void;
  quit(): void;
}

export const useSession = create<SessionStore>()((set, get) => ({
  setup: null,
  ctx: null,
  options: null,
  state: null,

  start: (setup) => {
    const ctx = createContext(loadGameData(), setup.players, setup.longMap);
    const options: GameOptions = { seed: setup.seed, longMap: setup.longMap, layers: { cards: setup.cards } };
    const state = createGame(ctx, options);
    set({ setup, ctx, options, state });
    director.reset(ctx, state);
  },

  dispatch: (action) => {
    const { ctx, state } = get();
    if (!ctx || !state) return { ok: false, reason: { key: 'gameOver' } };
    const check = checkAction(ctx, state, action);
    if (!check.ok) return check;
    const { state: next, events } = applyAction(ctx, state, action);
    set({ state: next });
    director.enqueue({ before: state, after: next, events });
    return check;
  },

  undo: () => {
    const { ctx, options, state } = get();
    if (!ctx || !options || !state || !canUndo(state)) return false;
    const next = undo(ctx, options, state);
    const log = usePresentation.getState().log.filter((e) => e.actionIndex <= next.log.length);
    set({ state: next });
    director.reset(ctx, next, { keepViewer: true, log });
    return true;
  },

  rematch: () => {
    const { setup } = get();
    if (setup) get().start(setup);
  },

  quit: () => set({ setup: null, ctx: null, options: null, state: null }),
}));
