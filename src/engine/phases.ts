/**
 * Máquina de fases (GDD 6.1 e 6.2). Fases automáticas avançam sozinhas; o motor só
 * para onde um jogador precisa decidir: Compra com mais de uma linha (fase 2), Ações
 * (fase 5) e Entrega (fase 7). Revelação, Compra e Entrega só agem com a camada de
 * cartas; Combate entra na Fase 7.
 */
import { protocolDraw, underdogBonus } from './rules/factions';
import type { EngineContext } from './context';
import type { GameEvent } from './events';
import { revealIncoming } from './rules/cards';
import { drawRow, drawRows } from './rules/decks';
import { runProduction, runUpkeep } from './rules/economy';
import { checkRoundEnd } from './rules/victory';
import { endRoundEvent, revealEvent } from './rules/world';
import { runCombatPhase, villageAttacks } from './rules/combat';
import { endRoundTreaties, payActionDebt } from './rules/treaties';
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
  revealEvent(ctx, state, events);
  // O evento pode eliminar alguém (Vila a 0) e até encerrar a partida.
  if (finishIfDecided(ctx, state, events)) return;
  const first = nextAlive(state, -1);
  if (first === null) return;
  startTurn(ctx, state, first, events);
}

/** Próximo assento na partida depois de `after` nesta rodada (null = acabou a rodada). */
function nextAlive(state: GameState, after: PlayerId): PlayerId | null {
  for (let p = after + 1; p < state.players.length; p++) {
    const pl = state.players[p];
    if (pl && (!pl.eliminated || pl.neutral)) return p;
  }
  return null;
}

/** Eliminação total (GDD 13.1): sobrou um só, ele vence na hora. */
function finishIfDecided(ctx: EngineContext, state: GameState, events: GameEvent[]): boolean {
  const alive = state.players.filter((p) => !p.eliminated);
  if (alive.length > 1) return false;
  const verdict = checkRoundEnd(ctx, state) ?? {
    winners: alive.map((p) => p.id),
    reason: 'condition' as const,
  };
  state.stage = 'over';
  state.winners = verdict.winners;
  state.endReason = verdict.reason;
  events.push({ type: 'gameOver', winners: verdict.winners, reason: verdict.reason });
  return true;
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
  // Inadimplência ou quebra de pacto fora do próprio turno: as ações saem agora.
  payActionDebt(state, player, events);
  // Levante (Revolucionários): +ação a quem está em último no progresso.
  underdogBonus(ctx, state, player, events);

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
  // Protocolo (Governo): carta extra na Compra, depois da linha da Universidade.
  protocolDraw(ctx, state, player, events);
  enterPhase(state, 'production', events);
  runProduction(ctx, state, player, events);
  enterPhase(state, 'upkeep', events);
  runUpkeep(ctx, state, player, events);
  enterPhase(state, 'actions', events);
}

/** Encerrar a fase atual do jogador ativo (Ações ou Entrega). */
export function endCurrentPhase(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  if (state.phase === 'actions') {
    enterPhase(state, 'combat', events);
    continueCombat(ctx, state, events);
    return;
  }
  endTurn(ctx, state, events);
}

/**
 * GDD 6.2 fase 6: resolve os combates (para se alguém precisa escolher baixas) e segue para
 * a Entrega. Chamado de novo depois de cada escolha de baixas.
 */
export function continueCombat(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  if (state.layers.conflict && !runCombatPhase(ctx, state, events)) return;
  enterPhase(state, 'delivery', events);
  if (state.layers.cards) return; // espera a decisão de entrega/descarte
  endTurn(ctx, state, events);
}

function endTurn(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  state.actionsLeft = 0;
  const next = nextAlive(state, state.activePlayer);
  if (next !== null) {
    startTurn(ctx, state, next, events);
    return;
  }
  endRound(ctx, state, events);
}

/** GDD 6.1 FIM: tratados com prazo e verificação de vitória (13.1). */
function endRound(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  endRoundEvent(ctx, state, events);
  // GDD 8.5: tropa na Vila inimiga sem defensor tira vida (pode eliminar).
  villageAttacks(ctx, state, events);
  // GDD 6.1 FIM: resolve tratados com prazo (Fase 8).
  endRoundTreaties(ctx, state, events);
  if (finishIfDecided(ctx, state, events)) return;
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
