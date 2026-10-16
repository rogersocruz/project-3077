/** Efeitos de baralho: Requisição Prioritária (escolha em 2 passos) e Arquivo Selado. */
import { z } from 'zod';
import { DeckId } from '../../data/schemas';
import { drawCards, reshuffleDeck } from '../rules/decks';
import { defineEffect, type EffectScope, subjectOf } from './types';

const Decks = z.array(DeckId).min(1);

const deckTargets = (decks: readonly ('n1' | 'n2' | 'n3')[]) =>
  decks.map((deck) => ({ kind: 'deck' as const, deck }));

const checkDeck = (s: EffectScope, decks: readonly string[], deck: 'n1' | 'n2' | 'n3') => {
  if (!decks.includes(deck)) return { key: 'deckNotAllowed' as const };
  const c = s.state.cards;
  return c.decks[deck].length + c.discards[deck].length > 0 ? null : { key: 'deckEmpty' as const };
};

/**
 * Requisição Prioritária: escolhe o baralho, vê as `look` primeiras, pega uma e a revela
 * a todos; depois o baralho é embaralhado (resolveChoice no reducer).
 */
export const tutor = defineEffect({
  params: z.strictObject({ decks: Decks, look: z.number().int().positive(), reveal: z.boolean() }),
  target: 'deck',
  candidates: (_s, p) => deckTargets(p.decks),
  check: (s, p, t) => checkDeck(s, p.decks, t.deck),
  apply: (s, p, t) => {
    if (s.state.cards.decks[t.deck].length === 0) reshuffleDeck(s.state, t.deck, s.events);
    const options = s.state.cards.decks[t.deck].slice(0, p.look);
    if (options.length === 0) return;
    const player = subjectOf(s);
    s.state.pending = { kind: 'tutor', player, card: s.card, deck: t.deck, options };
    s.events.push({ type: 'choicePending', player, card: s.card, deck: t.deck, options: [...options] });
  },
});

/** Arquivo Selado (Tesouro): compra de um dos baralhos indicados. */
export const drawFromDeck = defineEffect({
  params: z.strictObject({ decks: Decks, count: z.number().int().positive() }),
  target: 'deck',
  candidates: (_s, p) => deckTargets(p.decks),
  check: (s, p, t) => checkDeck(s, p.decks, t.deck),
  apply: (s, p, t) => {
    drawCards(s.state, subjectOf(s), t.deck, p.count, s.events);
  },
});
