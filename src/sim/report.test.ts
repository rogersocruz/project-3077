/** Relatório do simulador (UX_SPEC 2.18): agregados, CSV e resumo. */
import { describe, expect, it } from 'vitest';
import type { GameRecord, PlayerRecord } from './game';
import { cardsCsv, gamesCsv, summarize, summaryText } from './report';
import { deckCardIds, seedsOf, simData, splitSeeds, DEFAULT_SIM } from './run';

const res = (n = 0) => ({ food: n, stone: n, iron: n, coal: n, oil: n, gold: n });
const seat = (i: number, won: boolean, extra: Partial<PlayerRecord> = {}): PlayerRecord => ({
  seat: i,
  level: 'normal',
  focus: 'coal',
  won,
  met: won ? ['coal'] : [],
  progressTotal: won ? 1.5 : 0.5,
  resources: res(1),
  produced: res(2),
  structures: { park: 2, village: 1 },
  trajectory: [],
  uni2Round: null,
  mineRound: null,
  minesBuilt: 0,
  coalUpkeep: 0,
  coalSpent: 0,
  ...extra,
});
const record = (seed: number, extra: Partial<GameRecord> = {}): GameRecord => ({
  seed,
  players: 3,
  rounds: 8,
  endReason: 'condition',
  winners: [0],
  winTracks: ['coal'],
  steps: 100,
  ms: 1000,
  seats: [seat(0, true), seat(1, false, { focus: 'gold' }), seat(2, false)],
  bankTraded: res(1),
  playerTraded: res(0),
  tradesAccepted: 1,
  cardsPlayed: { convoy: 2 },
  cardsDrawn: { convoy: 4, audit: 1 },
  hazardsPresent: ['volcano', 'geyser'],
  hazardHits: { volcano: 2 },
  eventsRevealed: { ev_quake: 1 },
  disasters: 1,
  eliminations: 0,
  excavations: 2,
  combats: 0,
  recruits: 0,
  villageHits: 0,
  treatiesProposed: 0,
  treatiesSigned: 0,
  treatiesTriggered: 0,
  pactsBroken: 0,
  ...extra,
});

describe('summarize', () => {
  const records = [
    record(1),
    record(2, {
      rounds: 15,
      endReason: 'roundLimit',
      winTracks: [],
      winners: [1, 2],
      seats: [seat(0, false), seat(1, true, { focus: 'gold', met: [] }), seat(2, true, { met: [] })],
    }),
  ];
  const s = summarize(records, ['convoy', 'audit', 'dossier']);

  it('conta vitórias por condição, limite de rodadas e assento', () => {
    expect(s.winsByTrack.coal).toBe(1);
    expect(s.winsByTrack.roundLimit).toBe(1);
    expect(s.roundLimitRate).toBe(0.5);
    expect(s.winsBySeat).toEqual([1, 1, 1]);
    expect(s.sharedWins).toBe(1);
  });

  it('duração, recursos e estruturas por partida/jogador', () => {
    expect(s.rounds).toEqual({ mean: 11.5, median: 11.5, min: 8, max: 15 });
    expect(s.producedPerGame.coal).toBe(6); // 3 jogadores × 2
    expect(s.bankTradedPerGame.gold).toBe(1);
    expect(s.structuresPerPlayer['park']).toBe(2);
  });

  it('cartas: inclui as nunca jogadas do baralho e a taxa por compra', () => {
    const byId = Object.fromEntries(s.cards.map((c) => [c.id, c]));
    expect(byId['convoy']).toMatchObject({ played: 4, drawn: 8, rate: 0.5 });
    expect(byId['dossier']).toMatchObject({ played: 0, drawn: 0 });
    expect(s.cards[0]?.id).toBe('convoy');
  });

  it('hazards atingidos (D15) e números do planeta', () => {
    expect(s.hazards['volcano']).toEqual({ games: 2, hitGames: 2, hits: 4 });
    expect(s.hazards['geyser']).toEqual({ games: 2, hitGames: 0, hits: 0 });
    expect(s.disastersPerGame).toBe(1);
    expect(summaryText(s)).toContain('Hazards atingidos');
  });

  it('vitórias por rota perseguida', () => {
    expect(s.winsByFocus['coal']).toEqual({ seats: 4, wins: 2, onFocus: 1 });
    expect(s.winsByFocus['gold']).toEqual({ seats: 2, wins: 1, onFocus: 0 });
  });

  it('CSV: uma linha por partida, mesmas colunas do cabeçalho', () => {
    const lines = gamesCsv(records).trim().split('\n');
    expect(lines).toHaveLength(3);
    const cols = lines[0]!.split(',').length;
    for (const l of lines) expect(l.split(',').length).toBe(cols);
    expect(cardsCsv(s).split('\n')[0]).toBe('card,played,drawn,rate');
  });

  it('resumo em texto cita as seções do relatório', () => {
    const text = summaryText(s);
    for (const part of [
      'Vitórias por condição',
      'posição de turno',
      'limite de rodadas',
      'Cartas mais jogadas',
    ])
      expect(text).toContain(part);
  });
});

describe('lote', () => {
  it('seeds sequenciais divididas sem perder nenhuma', () => {
    const seeds = seedsOf({ ...DEFAULT_SIM, games: 10, seed: 5 });
    expect(seeds).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const parts = splitSeeds(seeds, 3);
    expect(parts).toHaveLength(3);
    expect(parts.flat().sort((a, b) => a - b)).toEqual(seeds);
  });

  it('balance editado é validado (Laboratório)', () => {
    const data = simData();
    const edited = structuredClone(data.balance) as { turn: { actionsPerTurn: number } };
    edited.turn.actionsPerTurn = 4;
    expect(simData(edited).balance.turn.actionsPerTurn).toBe(4);
    edited.turn.actionsPerTurn = -1;
    expect(() => simData(edited)).toThrow(/balance inválido/);
  });

  it('cartas do baralho seguem as camadas', () => {
    const data = simData();
    expect(deckCardIds(data, {})).toEqual([]);
    expect(deckCardIds(data, { cards: true })).toContain('convoy');
  });
});
