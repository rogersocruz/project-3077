/**
 * Consultas de tratados (GDD 10) usadas pelas outras regras: pactos em vigor entre dois
 * jogadores, pedágio com tratado, Base Avançada, Canal Aberto, Céu Aberto. Só lê o estado
 * (as regras de assinatura, gatilho e quebra ficam em treaties.ts).
 */
import type { ResourceId } from '../../data/schemas';
import type { ResourceAmounts } from '../queries';
import type { ContractTerms, GameState, PlayerId, Treaty, TreatySubject, TreatyVictim } from '../state';

const on = (state: GameState): boolean => state.layers.treaties && !!state.treaties;

export const partnerOf = (t: Treaty, p: PlayerId): PlayerId =>
  t.parties[0] === p ? t.parties[1] : t.parties[0];
export const isParty = (t: Treaty, p: PlayerId): boolean => t.parties[0] === p || t.parties[1] === p;

/** Tratados ativos de que o jogador participa. */
export function treatiesOf(state: GameState, player: PlayerId): Treaty[] {
  return on(state) ? state.treaties.active.filter((t) => isParty(t, player)) : [];
}

/** O pacto `pact` vale entre `a` e `b`? */
export function pactBetween(state: GameState, a: PlayerId, b: PlayerId, pact: string): Treaty | undefined {
  if (!on(state) || a === b) return undefined;
  return state.treaties.active.find(
    (t) => t.terms.kind === 'pact' && t.terms.pact === pact && isParty(t, a) && isParty(t, b),
  );
}

/** Algum pacto `pact` tem `p` como signatário? */
export const pactsOf = (state: GameState, p: PlayerId, pact: string): Treaty[] =>
  on(state)
    ? state.treaties.active.filter((t) => t.terms.kind === 'pact' && t.terms.pact === pact && isParty(t, p))
    : [];

/** O papel do sujeito do gatilho bate com quem agiu? */
export function subjectMatches(t: Treaty, subject: TreatySubject, actor: PlayerId): boolean {
  switch (subject) {
    case 'me':
      return actor === t.parties[0];
    case 'you':
      return actor === t.parties[1];
    case 'anySignatory':
      return isParty(t, actor);
    case 'third':
      return !isParty(t, actor);
    case 'anyone':
      return true;
  }
}

/** O papel de "de quem" bate com a vítima (otherSignatory: o signatário que não agiu)? */
export function victimMatches(t: Treaty, of: TreatyVictim, actor: PlayerId, victim: PlayerId): boolean {
  switch (of) {
    case 'me':
      return victim === t.parties[0];
    case 'you':
      return victim === t.parties[1];
    case 'eitherSignatory':
      return isParty(t, victim);
    case 'otherSignatory':
      return isParty(t, actor) && isParty(t, victim) && actor !== victim;
    case 'third':
      return !isParty(t, victim);
    case 'anyone':
      return true;
  }
}

export interface TollQuote {
  readonly amounts: ResourceAmounts;
  /** Tratado que mudou o pedágio (Tarifa Preferencial, Corredor Livre, Muralha Comercial). */
  readonly treaty?: number;
}

/**
 * Pedágio de `n` tropas de `player` ao entrar no território de `owner` (GDD 5.4 + 10):
 * Corredor Livre zera; contrato "PAGA EM VEZ DA TARIFA" troca a tarifa; Muralha Comercial
 * dobra para terceiros. `base` = tarifa declarada por tropa.
 */
export function tollWithTreaties(
  state: GameState,
  player: PlayerId,
  owner: PlayerId,
  n: number,
  base: ResourceAmounts,
): TollQuote {
  const times = (a: ResourceAmounts, k: number): ResourceAmounts => {
    const out: ResourceAmounts = {};
    for (const [r, q] of Object.entries(a)) out[r as ResourceId] = (q ?? 0) * k;
    return out;
  };
  if (!on(state)) return { amounts: times(base, n) };
  const free = pactBetween(state, player, owner, 'pact_free_passage');
  if (free) return { amounts: {}, treaty: free.id };
  const override = state.treaties.active.find((t) => {
    if (t.terms.kind !== 'contract' || t.terms.consequence !== 'overrideToll') return false;
    const c: ContractTerms = t.terms;
    return subjectMatches(t, c.subject, player) && victimMatches(t, c.of, player, owner);
  });
  if (override && override.terms.kind === 'contract' && override.terms.resource) {
    const each = override.terms.amount ?? 1;
    return {
      amounts: { [override.terms.resource]: override.terms.perTroop ? each * n : each },
      treaty: override.id,
    };
  }
  const wall = pactsOf(state, owner, 'pact_double_toll').find((t) => !isParty(t, player));
  if (wall) return { amounts: times(base, 2 * n), treaty: wall.id };
  return { amounts: times(base, n) };
}

/** Base Avançada: as tropas dos dois podem dividir o hex sem combate. */
export const stagingAllies = (state: GameState, a: PlayerId, b: PlayerId): boolean =>
  !!pactBetween(state, a, b, 'pact_staging');

/** Canal Aberto: o teto de recebimento sobe entre os signatários. */
export const receiveCapBonus = (state: GameState, from: PlayerId, to: PlayerId): number =>
  pactBetween(state, from, to, 'pact_extra_delivery') ? 1 : 0;

/** Céu Aberto: o jogador pode sondar o território do outro signatário. */
export const surveyOpen = (state: GameState, player: PlayerId, owner: PlayerId | null): boolean =>
  owner !== null && !!pactBetween(state, player, owner, 'pact_open_survey');

/** Tratados ativos contam no limite por jogador (GDD 10: máximo 2). */
export const activeCount = (state: GameState, p: PlayerId): number => treatiesOf(state, p).length;

/** Dono do tabuleiro (assento = tabuleiro). */
export const boardOwnerOf = (state: GameState, boardId: number): PlayerId | null =>
  state.players.find((p) => p.boardId === boardId)?.id ?? null;

/** Dono do tabuleiro de um hex. */
export function hexOwner(state: GameState, key: string): PlayerId | null {
  const h = state.hexes[key];
  return h ? boardOwnerOf(state, h.boardId) : null;
}
