/**
 * O que a tela mostra (Zustand). O motor aplica a ação na hora; a tela fica com o estado
 * de antes até o diretor terminar de tocar os eventos, e então assume o novo
 * (`shown`). Os contadores do HUD e a fase/jogador da barra do topo andam junto com a
 * animação. `viewer` é quem está diante da tela (hotseat: quem decide agora).
 */
import { create } from 'zustand';
import type { GameEvent, IntelReport } from '../engine/events';
import type { GameState, PlayerId, Resources, Stage, TurnPhase } from '../engine/state';

export interface TurnView {
  readonly stage: Stage;
  readonly round: number;
  readonly activePlayer: PlayerId;
  readonly phase: TurnPhase;
  readonly actionsLeft: number;
}

/** Tela de privacidade (UX_SPEC 2.15): por que o dispositivo passa de mão. */
export type GateReason = 'setup' | 'turn' | 'trade';

export interface Gate {
  readonly player: PlayerId;
  readonly reason: GateReason;
}

export interface LogEntry {
  readonly id: number;
  /** Tamanho do log de ações depois da ação que gerou o evento (o desfazer corta por aqui). */
  readonly actionIndex: number;
  readonly round: number;
  readonly event: GameEvent;
}

interface PresentationStore {
  shown: GameState | null;
  counters: readonly Resources[];
  turn: TurnView | null;
  viewer: PlayerId | null;
  /** Fila tocando ou esperando a tela de privacidade: a interface não aceita ações. */
  busy: boolean;
  gate: Gate | null;
  /** Faixa "RODADA N" no início de cada rodada. */
  banner: { readonly round: number } | null;
  /** Cinemática do evento global (UX_SPEC 2.14) enquanto toca. */
  eventReveal: { readonly event: string; readonly category: string } | null;
  /** Relatório de carta de informação: só para quem jogou; a fila espera o "Entendi". */
  intel: { readonly player: PlayerId; readonly card: string; readonly report: IntelReport } | null;
  log: readonly LogEntry[];
}

export const usePresentation = create<PresentationStore>()(() => ({
  shown: null,
  counters: [],
  turn: null,
  viewer: null,
  busy: false,
  gate: null,
  banner: null,
  eventReveal: null,
  intel: null,
  log: [],
}));

export function turnViewOf(state: GameState): TurnView {
  return {
    stage: state.stage,
    round: state.round,
    activePlayer: state.activePlayer,
    phase: state.phase,
    actionsLeft: state.actionsLeft,
  };
}

export const countersOf = (state: GameState): Resources[] => state.players.map((p) => ({ ...p.resources }));
