// API pública do motor de regras.
export * from './actions';
export * from './context';
export * from './events';
export * from './effects';
export {
  actionAt,
  actionCost,
  actionTargets,
  checkAction,
  decider,
  legalActions,
  type ActionTemplate,
  type CheckResult,
} from './legal';
export * from './reasons';
export { applyAction, replay, type ApplyResult } from './reducer';
export { cardResourceCost, cardTargets, installActions } from './rules/cards';
export { drawRows, handLimit, type DeckDraw } from './rules/decks';
export { cardDefOf, installedCards, type InstalledCard } from './rules/permanents';
export { createGame, type GameOptions } from './setup';
export * from './state';
export { canUndo, undo, UNDOABLE_ACTIONS } from './undo';
