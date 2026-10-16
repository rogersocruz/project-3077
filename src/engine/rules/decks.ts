/**
 * Baralhos e mão (GDD 6.4, 7): compra pela tabela da Universidade, rebaralhar o
 * descarte, limite de mão (com Arquivo) e descarte. Toda aleatoriedade usa o estado do
 * RNG guardado na partida (engine/rng.ts).
 */
import type { GameData } from '../../data/schemas';
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import { getPlayer, levelDef, maxLevelOf } from '../queries';
import { Rng } from '../rng';
import { type CardUid, DRAW_DECKS, type DrawDeck, type GameState, type PlayerId } from '../state';
import { cardDefOf } from './permanents';

export type DeckDraw = GameData['balance']['cards']['universityDraw'][string][number][number];

export function isDrawDeck(deck: string): deck is DrawDeck {
  return (DRAW_DECKS as readonly string[]).includes(deck);
}

/** Baralho de compra de onde a carta veio (null para Tesouro). */
export function deckOfCard(ctx: EngineContext, state: GameState, card: CardUid): DrawDeck | null {
  const deck = cardDefOf(ctx, state, card).deck;
  return isDrawDeck(deck) ? deck : null;
}

/** Usa o RNG da partida e grava o estado novo (o reducer trabalha numa cópia). */
export function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = Rng.fromState(state.rngState);
  const out = fn(rng);
  state.rngState = rng.state;
  return out;
}

/** Interpretação V: baralho vazio rebaralha o próprio descarte. */
export function reshuffleDeck(state: GameState, deck: DrawDeck, events: GameEvent[]): void {
  const pile = state.cards.discards[deck];
  if (pile.length === 0) return;
  state.cards.decks[deck] = [...state.cards.decks[deck], ...withRng(state, (rng) => rng.shuffle(pile))];
  state.cards.discards[deck] = [];
  events.push({ type: 'deckReshuffled', deck, size: state.cards.decks[deck].length });
}

/** Embaralha a pilha de compra inteira (Requisição Prioritária). */
export function shuffleDeck(state: GameState, deck: DrawDeck): void {
  state.cards.decks[deck] = withRng(state, (rng) => rng.shuffle(state.cards.decks[deck]));
}

/** Mutável: compra até `count` cartas do topo; com baralho e descarte vazios, compra menos. */
export function drawCards(
  state: GameState,
  player: PlayerId,
  deck: DrawDeck,
  count: number,
  events: GameEvent[],
): CardUid[] {
  const hand = getPlayer(state, player).hand;
  const drawn: CardUid[] = [];
  for (let i = 0; i < count; i++) {
    if (state.cards.decks[deck].length === 0) reshuffleDeck(state, deck, events);
    const card = state.cards.decks[deck].shift();
    if (card === undefined) break;
    hand.push(card);
    drawn.push(card);
    events.push({ type: 'cardDrawn', player, card, deck });
  }
  return drawn;
}

/** Mutável: carta usada vai para o descarte do seu baralho; sem baralho de compra, sai do jogo. */
export function toDiscard(ctx: EngineContext, state: GameState, card: CardUid): void {
  const deck = deckOfCard(ctx, state, card);
  if (deck) state.cards.discards[deck].push(card);
  else state.cards.removed.push(card);
}

/** Mutável: tira a carta da mão (assume que está lá). */
export function takeFromHand(state: GameState, player: PlayerId, card: CardUid): void {
  const hand = getPlayer(state, player).hand;
  const i = hand.indexOf(card);
  if (i < 0) throw new RangeError(`carta ${card} não está na mão do jogador ${player}`);
  hand.splice(i, 1);
}

export function discardFromHand(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  cards: readonly CardUid[],
  reason: 'cost' | 'limit',
  events: GameEvent[],
): void {
  for (const card of cards) {
    takeFromHand(state, player, card);
    toDiscard(ctx, state, card);
    events.push({ type: 'cardDiscarded', player, card, reason });
  }
}

/** GDD 6.4 + interpretação AG: limite base + bônus do maior Arquivo. */
export function handLimit(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const level = maxLevelOf(state, player, 'archive');
  const bonus = level > 0 ? (levelDef(ctx, { type: 'archive', level }).handLimitBonus ?? 0) : 0;
  return ctx.balance.cards.handLimit + bonus;
}

/** GDD 6.4: linhas de compra que a Universidade do jogador oferece. */
export function drawRows(ctx: EngineContext, state: GameState, player: PlayerId): DeckDraw[][] {
  const level = maxLevelOf(state, player, 'university');
  const table = level > 0 ? (levelDef(ctx, { type: 'university', level }).drawTable ?? level) : 0;
  return ctx.balance.cards.universityDraw[String(table)] ?? [];
}

/** Mutável: compra a linha escolhida. */
export function drawRow(
  state: GameState,
  player: PlayerId,
  row: readonly DeckDraw[],
  events: GameEvent[],
): void {
  for (const { deck, count } of row) drawCards(state, player, deck, count, events);
}
