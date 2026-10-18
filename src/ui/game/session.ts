/**
 * A partida em andamento (Zustand). Toda ação passa por `dispatch`: o motor confere e
 * aplica na hora, e o lote (antes/depois/eventos) vai para o diretor de animação.
 * O save (Fase 10, save/index.ts) é o setup + o log; carregar refaz a partida pelo log.
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
import { replay } from '../../engine';
import { simData } from '../../sim/run';
import { makeSave, type SaveFile, type SlotId, stateChecksum, writeSave } from '../../save';
import { useSettings } from '../../settings';
import { type GameSetup, rulesOverride } from './params';

/** Contexto e opções da partida a partir do setup (regras da partida = sobreposição). */
function contextOf(setup: GameSetup): { ctx: EngineContext; options: GameOptions } {
  const override = rulesOverride(setup.rules);
  const data = override ? simData(undefined, override) : loadGameData();
  const ctx = createContext(data, setup.players, setup.longMap);
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
  return { ctx, options };
}

/** Resultado de carregar um save (UX_SPEC 9: regras de outra versão abrem com aviso). */
export interface LoadResult {
  readonly ok: boolean;
  readonly warning?: 'rulesVersion' | 'checksum';
}

interface SessionStore {
  setup: GameSetup | null;
  ctx: EngineContext | null;
  options: GameOptions | null;
  state: GameState | null;
  /** Agente por assento (null = pessoa). */
  agents: (Agent | null)[];
  start(setup: GameSetup): void;
  /** Refaz a partida do save pelo log. */
  loadSave(save: SaveFile): LoadResult;
  /** Grava a partida atual num espaço (automático ou 1–10). */
  saveTo(slot: SlotId): boolean;
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
    const { ctx, options } = contextOf(setup);
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

  loadSave: (save) => {
    const setup = save.setup as unknown as GameSetup;
    let built: { ctx: EngineContext; options: GameOptions; state: GameState };
    try {
      const { ctx, options } = contextOf(setup);
      built = { ctx, options, state: replay(ctx, options, save.log) };
    } catch {
      return { ok: false };
    }
    const { ctx, options, state } = built;
    const agents = setup.seats.map((kind, i) =>
      kind === 'human' ? null : createAgent(kind, `${setup.seed}:seat:${i}`),
    );
    // Neutros (D11) seguem com a IA também depois de carregar.
    state.players.forEach((p, i) => {
      if (p.neutral && !agents[i]) agents[i] = createAgent('normal', `${state.seed}:neutral:${i}`);
    });
    setSeatFactions(state.players.map((p) => p.faction));
    set({ setup, ctx, options, state, agents });
    director.setHumans(agents.map((a) => a === null));
    director.reset(ctx, state);
    if (save.rulesVersion !== state.rulesVersion) return { ok: true, warning: 'rulesVersion' };
    if (stateChecksum(state) !== save.checksum) return { ok: true, warning: 'checksum' };
    return { ok: true };
  },

  saveTo: (slot) => {
    const { setup, state } = get();
    if (!setup || !state) return false;
    return writeSave(slot, makeSave(state, setup as unknown as Record<string, unknown>, Date.now()));
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
    // UX_SPEC 3.3 / 9: salvamento automático a cada turno ou rodada.
    const auto = useSettings.getState().gameplay.autosave;
    if (
      (auto === 'turn' && events.some((e) => e.type === 'turnStarted')) ||
      (auto === 'round' && events.some((e) => e.type === 'roundStarted')) ||
      events.some((e) => e.type === 'gameOver')
    )
      get().saveTo('auto');
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
