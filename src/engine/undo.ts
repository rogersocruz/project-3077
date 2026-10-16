/**
 * Desfazer na fase de Ações (UX_SPEC 3.3: "desfaz até a última informação nova
 * revelada"). Interpretação P da Fase 3: só a última ação do jogador ativo, e só se
 * ela não revelou informação nem dependeu de outro jogador — Construir, Melhorar,
 * Banca e Instalar permanente (interpretação AI da Fase 4). Explorar e Sondar revelam;
 * jogar ou entregar carta pode revelar; troca aceita tem o consentimento do outro.
 *
 * Desfazer = refazer a partida pelo log sem a última ação (o save já é seed + log).
 */
import type { ActionType } from './actions';
import type { EngineContext } from './context';
import { replay } from './reducer';
import type { GameOptions } from './setup';
import type { GameState } from './state';

export const UNDOABLE_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  'build',
  'upgrade',
  'bankTrade',
  'installPermanent',
]);

export function canUndo(state: GameState): boolean {
  const last = state.log.at(-1);
  // Qualquer encerramento de fase seria a última ação: se a última é desfazível e o
  // jogador dela segue nas Ações, ela aconteceu nesta mesma fase.
  return (
    !!last &&
    state.stage === 'playing' &&
    state.phase === 'actions' &&
    state.pendingTrade === null &&
    state.pending === null &&
    last.player === state.activePlayer &&
    UNDOABLE_ACTIONS.has(last.type)
  );
}

export function undo(ctx: EngineContext, options: GameOptions, state: GameState): GameState {
  if (!canUndo(state)) throw new Error('nada a desfazer');
  return replay(ctx, options, state.log.slice(0, -1));
}
