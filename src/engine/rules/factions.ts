/**
 * Facções assimétricas (GDD 12): cada facção tem uma habilidade (effectId em factions.json,
 * parâmetros validados na carga). Só valem com a camada "factions". As regras perguntam aqui.
 *
 * Interpretações (Fase 9, isoladas aqui):
 * BG) Levante: "último lugar no progresso" = menor progresso somado entre os jogadores na
 *     partida (neutros fora), medido no início do turno; empatados no último lugar ganham;
 * BH) Protocolo: a faixa vale para jogar, instalar e entregar (custo em pontos de
 *     balance.costPoints, como o data:check); a carta extra vem na Compra, depois da linha;
 * BI) Eficiência: Parque no nível `fromLevel` produz como `asLevel` (só a produção);
 * BJ) Aquisição: a banca vende ao jogador pelo valor + `sellOffset`; o Mercado ainda reduz;
 * BK) Saque: o descarte do custo some só nas cartas de valência sabotagem;
 * BL) Raízes: os primeiros `perTurn` Sondar do turno não gastam ação (fora o Sondar já grátis
 *     da Crosta Fina, que não consome a habilidade).
 */
import { cardCostPoints } from '../../data/validate';
import type { CardDef, EngineContext } from '../context';
import type { GameEvent } from '../events';
import { getPlayer } from '../queries';
import type { DrawDeck, GameState, PlayerId } from '../state';
import { drawCards } from './decks';
import { progress } from './victory';

export interface AbilityParams {
  underdogAction: { actions: number };
  protocol: { band: DrawDeck; extraDraw: number; deck: DrawDeck };
  parkEfficiency: { fromLevel: number; asLevel: number };
  betterBank: { sellOffset: number };
  ignoreDiscardOnSabotage: Record<string, never>;
  freeSurvey: { perTurn: number };
}

export function factionDef(ctx: EngineContext, state: GameState, player: PlayerId) {
  const id = getPlayer(state, player).faction;
  return ctx.data.factions.find((f) => f.id === id);
}

/** Parâmetros da habilidade se o jogador a tem e a camada está ligada; senão null. */
export function ability<K extends keyof AbilityParams>(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  effectId: K,
): AbilityParams[K] | null {
  if (!state.layers.factions || !state.players[player]) return null;
  const def = factionDef(ctx, state, player);
  if (def?.ability.effectId !== effectId) return null;
  return (def.ability.params ?? {}) as AbilityParams[K];
}

/** BG: começo do turno — Levante dá ações a quem está em último. */
export function underdogBonus(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  events: GameEvent[],
): void {
  const p = ability(ctx, state, player, 'underdogAction');
  if (!p) return;
  const live = state.players.filter((x) => !x.eliminated).map((x) => x.id);
  const totals = live.map((id) => progress(ctx, state, id).total);
  const mine = progress(ctx, state, player).total;
  if (mine > Math.min(...totals) + 1e-9) return;
  state.actionsLeft += p.actions;
  events.push({ type: 'factionAbility', player, ability: 'underdogAction', amount: p.actions });
}

/** BH: custo da carta em pontos dentro da faixa do Protocolo? */
export function protocolAllows(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  def: CardDef,
): boolean {
  const p = ability(ctx, state, player, 'protocol');
  if (!p) return true;
  const [, max] = ctx.balance.tierBands[p.band];
  const [min] = ctx.balance.tierBands[p.band];
  const points = cardCostPoints(def.cost, ctx.balance.costPoints);
  return points >= min && points <= max;
}

/** BH: carta extra do Protocolo na Compra. */
export function protocolDraw(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  events: GameEvent[],
): void {
  const p = ability(ctx, state, player, 'protocol');
  if (!p || p.extraDraw <= 0 || !state.layers.cards) return;
  drawCards(state, player, p.deck, p.extraDraw, events);
  events.push({ type: 'factionAbility', player, ability: 'protocol', amount: p.extraDraw });
}

/** BI: nível com que o Parque produz. */
export function parkLevel(ctx: EngineContext, state: GameState, owner: PlayerId, level: number): number {
  const p = ability(ctx, state, owner, 'parkEfficiency');
  return p && level === p.fromLevel ? p.asLevel : level;
}

/** BK: descarte exigido no custo da carta. */
export function discardNeed(ctx: EngineContext, state: GameState, player: PlayerId, def: CardDef): number {
  if (def.valence === 'sabotage' && ability(ctx, state, player, 'ignoreDiscardOnSabotage')) return 0;
  return def.cost.discard ?? 0;
}

/** BL: o próximo Sondar do jogador é grátis pela habilidade? */
export function freeSurveyAvailable(ctx: EngineContext, state: GameState, player: PlayerId): boolean {
  const p = ability(ctx, state, player, 'freeSurvey');
  if (!p) return false;
  const pl = getPlayer(state, player);
  return pl.freeSurveyRound !== state.round || pl.freeSurveyUsed < p.perTurn;
}

/** BL: marca um Sondar grátis usado nesta rodada (um turno por rodada). */
export function spendFreeSurvey(state: GameState, player: PlayerId): void {
  const pl = getPlayer(state, player);
  if (pl.freeSurveyRound !== state.round) {
    pl.freeSurveyRound = state.round;
    pl.freeSurveyUsed = 0;
  }
  pl.freeSurveyUsed += 1;
}
