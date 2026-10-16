/**
 * Máquina de fases (GDD 6.1 e 6.2). Fases automáticas avançam sozinhas; o motor só
 * para onde um jogador precisa decidir: Compra com mais de uma linha (fase 2), Ações
 * (fase 5) e Entrega (fase 7). Revelação, Compra e Entrega só agem com a camada de
 * cartas; Combate entra na Fase 7.
 */
import type { EngineContext } from './context';
import type { GameEvent } from './events';
import { revealIncoming } from './rules/cards';
import { drawRow, drawRows } from './rules/decks';
import { runProduction, runUpkeep } from './rules/economy';
import { checkRoundEnd } from './rules/victory';
import type { GameState, PlayerId, TurnPhase } from './state';

function enterPhase(state: GameState, phase: TurnPhase, events: GameEvent[]): void {
  state.phase = phase;
  events.push({ type: 'phaseChanged', player: state.activePlayer, phase });
}

/** Próximo jogador com decisão de setup pendente (compensação ou Vila), ou null. */
export function nextSetupPlayer(state: GameState): PlayerId | null {
  const p = state.players.find((pl) => pl.compensation === 'pending' || pl.villageHex === null);
  return p ? p.id : null;
}

/** Depois de cada ação de setup: passa a vez ou começa a rodada 1. */
export function advanceSetup(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  const next = nextSetupPlayer(state);
  if (next !== null) {
    state.activePlayer = next;
    return;
  }
  state.stage = 'playing';
  startRound(ctx, state, events);
}

/** GDD 6.1 INÍCIO: revela o Evento Global (camada de eventos, Fase 6). */
export function startRound(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  state.round += 1;
  // GDD 7.1: o teto de recebimento é por rodada.
  for (const p of state.players) p.receivedThisRound = 0;
  events.push({ type: 'roundStarted', round: state.round });
  startTurn(ctx, state, 0, events);
}

/**
 * Fases 1–4 automáticas. Para na Compra se a Universidade oferece mais de uma linha
 * (GDD 6.4: o jogador escolhe); senão segue até as Ações.
 */
export function startTurn(ctx: EngineContext, state: GameState, player: PlayerId, events: GameEvent[]): void {
  state.activePlayer = player;
  state.actionsLeft = ctx.balance.turn.actionsPerTurn;
  const p = state.players[player];
  if (p) p.deliveredThisTurn = 0;
  events.push({ type: 'turnStarted', player, round: state.round });

  enterPhase(state, 'reveal', events);
  if (state.layers.cards) revealIncoming(ctx, state, player, events);
  enterPhase(state, 'draw', events);
  if (state.layers.cards) {
    const rows = drawRows(ctx, state, player);
    if (rows.length > 1) return; // espera chooseDraw
    drawRow(state, player, rows[0] ?? [], events);
  }
  continueTurn(ctx, state, events);
}

/** Depois da Compra: Produção e Manutenção automáticas, e para nas Ações. */
export function continueTurn(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  const player = state.activePlayer;
  enterPhase(state, 'production', events);
  runProduction(ctx, state, player, events);
  enterPhase(state, 'upkeep', events);
  runUpkeep(ctx, state, player, events);
  enterPhase(state, 'actions', events);
}

/** Encerrar a fase atual do jogador ativo (Ações ou Entrega). */
export function endCurrentPhase(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  if (state.phase === 'actions') {
    enterPhase(state, 'combat', events); // combate: Fase 7
    enterPhase(state, 'delivery', events);
    if (state.layers.cards) return; // espera a decisão de entrega/descarte
  }
  endTurn(ctx, state, events);
}

function endTurn(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  state.actionsLeft = 0;
  const next = state.activePlayer + 1;
  if (next < state.players.length) {
    startTurn(ctx, state, next, events);
    return;
  }
  endRound(ctx, state, events);
}

/** GDD 6.1 FIM: tratados com prazo (Fase 8) e verificação de vitória (13.1). */
function endRound(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  events.push({ type: 'roundEnded', round: state.round });
  const verdict = checkRoundEnd(ctx, state);
  if (verdict) {
    state.stage = 'over';
    state.winners = verdict.winners;
    state.endReason = verdict.reason;
    events.push({ type: 'gameOver', winners: verdict.winners, reason: verdict.reason });
    return;
  }
  startRound(ctx, state, events);
}
