/**
 * A partida em andamento (Zustand). Toda ação passa por `dispatch`: o motor confere e
 * aplica na hora, e o lote (antes/depois/eventos) vai para o diretor de animação.
 * O save futuro (Fase 10) é exatamente `options` + `state.log`.
 */
import { setSeatFactions } from '../../render3d/model';
import { create } from 'zustand';
import { type Agent, chooseAction, createAgent } from '../../ai';
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
  decider,
  legalActions,
  type PlayerId,
  undo,
} from '../../engine';
import type { GameSetup } from './params';

interface SessionStore {
  setup: GameSetup | null;
  ctx: EngineContext | null;
  options: GameOptions | null;
  state: GameState | null;
  /** Agente por assento (null = pessoa). */
  agents: (Agent | null)[];
  start(setup: GameSetup): void;
  /** Se quem decide agora é IA: escolhe e aplica pelo mesmo caminho dos botões. */
  aiStep(): boolean;
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
  agents: [],

  start: (setup) => {
    const ctx = createContext(loadGameData(), setup.players, setup.longMap);
    const options: GameOptions = {
      seed: setup.seed,
      longMap: setup.longMap,
      layers: {
        cards: setup.cards,
        events: setup.events,
        specialHexes: setup.specialHexes,
        conflict: setup.conflict,
        treaties: setup.treaties,
        factions: setup.factions,
      },
      ...(setup.factions ? { factions: setup.factionPicks } : {}),
      ...(setup.eliminatedRule ? { eliminatedRule: setup.eliminatedRule } : {}),
    };
    const state = createGame(ctx, options);
    // Agentes determinísticos pela seed da partida e pelo assento (Rng, nunca Math.random).
    const agents = setup.seats.map((kind, i) =>
      kind === 'human' ? null : createAgent(kind, `${setup.seed}:seat:${i}`),
    );
    setSeatFactions(state.players.map((p) => p.faction));
    set({ setup, ctx, options, state, agents });
    director.setHumans(setup.seats.map((k) => k === 'human'));
    director.reset(ctx, state);
  },

  dispatch: (action) => {
    const { ctx, state } = get();
    if (!ctx || !state) return { ok: false, reason: { key: 'gameOver' } };
    const check = checkAction(ctx, state, action);
    if (!check.ok) return check;
    const { state: next, events } = applyAction(ctx, state, action);
    set({ state: next });
    // D11 "facção neutra": o eliminado passa a ser jogado pela IA.
    if (events.some((e) => e.type === 'playerEliminated') && next.players.some((p) => p.neutral)) {
      const { agents } = get();
      const list = next.players.map(
        (p, i) => agents[i] ?? (p.neutral ? createAgent('normal', `${next.seed}:neutral:${i}`) : null),
      );
      set({ agents: list });
      director.setHumans(list.map((a) => a === null));
    }
    director.enqueue({ before: state, after: next, events });
    return check;
  },

  aiStep: () => {
    const { ctx, state, agents } = get();
    if (!ctx || !state || state.stage === 'over') return false;
    const agent = agents[decider(state)];
    if (!agent) return false;
    let action: Action;
    try {
      action = chooseAction(ctx, state, agent);
    } catch (e) {
      // A IA nunca pode travar a partida: na falha, a primeira ação legal (encerrar fase).
      console.error('IA falhou; jogando a primeira ação legal', e);
      const fallback = legalActions(ctx, state, decider(state));
      action = fallback.find((a) => a.type === 'endPhase') ?? fallback[0]!;
      if (!action) return false;
    }
    return get().dispatch(action).ok;
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

  quit: () => {
    setSeatFactions(null);
    set({ setup: null, ctx: null, options: null, state: null, agents: [] });
  },
}));

/** O assento é de uma pessoa (sem partida, todos contam como pessoa). */
export function isHuman(player: PlayerId): boolean {
  const { setup, state } = useSession.getState();
  if (state?.players[player]?.neutral) return false;
  const seats = setup?.seats;
  return !seats || seats[player] === undefined || seats[player] === 'human';
}

/** Há alguém diante da tela? Sem pessoa nenhuma é modo espectador. */
export function anyHuman(): boolean {
  const seats = useSession.getState().setup?.seats;
  return !seats || seats.some((k) => k === 'human');
}
