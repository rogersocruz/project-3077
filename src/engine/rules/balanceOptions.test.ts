/**
 * Opções de experimento de balanceamento (balance/overrides/*.json): ausentes em data/, só
 * valem quando um override as liga. Uma verificação por opção.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext } from '../context';
import type { GameEvent } from '../events';
import { checkAction } from '../legal';
import { applyAction } from '../reducer';
import { simData } from '../../sim/run';
import { edit, place, startedGame } from '../testing';
import { minBankAmount, structureYield } from './economy';
import { revealEvent } from './world';

const override = (file: string) =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../../balance/overrides', file), 'utf8')) as Record<
    string,
    unknown
  >;

describe('A1 — banca vende no máximo N por turno (bank.maxBuyPerTurn)', () => {
  const ctx = createContext(simData(undefined, override('A1.json')), 3);
  it('a 3ª unidade comprada no turno é recusada', () => {
    let s = edit(startedGame(ctx, { seed: 2 }), (x) => {
      x.players[0]!.resources = { food: 30, stone: 30, iron: 30, coal: 30, oil: 30, gold: 30 };
    });
    // A menor quantia de Carvão que compra Comida; compra até bater no limite de 2 unidades.
    const amount = minBankAmount(ctx, s, 0, 'coal', 'food') ?? 0;
    expect(amount).toBeGreaterThan(0);
    const one = {
      type: 'bankTrade' as const,
      player: 0,
      give: 'coal' as const,
      amount,
      receive: 'food' as const,
    };
    while (checkAction(ctx, s, one).ok) s = applyAction(ctx, s, one).state;
    expect(checkAction(ctx, s, one)).toMatchObject({ ok: false, reason: { key: 'bankLimit' } });
    expect(s.players[0]?.bankBought).toBeLessThanOrEqual(2);
    expect(s.players[0]?.bankBought).toBeGreaterThan(0);
  });
  it('sem o override não há limite', () => {
    const plain = createContext(simData(), 3);
    expect(plain.balance.bank.maxBuyPerTurn).toBeUndefined();
  });
});

describe('A3 — dano de hazard só pelos eventos nomeados (events.hazardTriggers)', () => {
  const ctx = createContext(simData(undefined, override('A3.json')), 3);
  const reveal = (event: string) => {
    const s = edit(startedGame(ctx, { seed: 4, layers: { events: true, specialHexes: true } }), (x) => {
      x.world.deck = [event];
      // Todos os hazards no planeta, um por hex do tabuleiro 0.
      const hz = ctx.data.tiles.hazards.map((h) => h.id);
      Object.values(x.hexes)
        .filter((h) => h.boardId === 0 && !h.structures.length)
        .slice(0, hz.length)
        .forEach((h, i) => (h.surface = hz[i] as string));
    });
    const events: GameEvent[] = [];
    revealEvent(ctx, s, events);
    const hit = events
      .filter((e) => e.type === 'hazardTriggered')
      .map((e) => (e as { hazard: string }).hazard);
    return [...new Set(hit)].sort();
  };
  it('Tremor de Terra atinge Geiser e Crosta Fina; Estação Fértil não atinge nada', () => {
    expect(reveal('ev_quake')).toEqual(['geyser', 'thin_crust']);
    expect(reveal('ev_fertile_season')).toEqual([]);
    expect(reveal('ev_tailwinds')).toEqual([]);
  });
});

describe('B1 — Eficiência só nos N primeiros Parques (parkEfficiency.maxParks)', () => {
  const ctx = createContext(simData(undefined, override('A123_B1.json')), 3);
  it('3 Parques nível 1 da Helix: os 2 primeiros produzem como nível 2, o 3º como nível 1', () => {
    const s = edit(
      startedGame(ctx, { seed: 3, layers: { factions: true }, factions: ['helix', null, null] }),
      (x) => {
        const forests = Object.entries(x.hexes)
          .filter(([, h]) => h.surface === 'forest' || h.surface === 'empty')
          .slice(0, 3)
          .map(([k]) => k);
        for (const k of forests) {
          x.hexes[k]!.surface = 'forest';
          place(x, k, 'park', 0, 1);
        }
      },
    );
    const parks = Object.values(s.hexes).flatMap((h) =>
      h.structures.filter((p) => p.type === 'park').map((p) => ({ h, p })),
    );
    parks.sort((a, b) => a.p.uid - b.p.uid);
    const y = parks.map(({ h, p }) => Object.values(structureYield(ctx, h, p, new Map(), s))[0]);
    const lvl1 = ctx.structure('park').levels[0]?.yield;
    const lvl2 = ctx.structure('park').levels[1]?.yield;
    expect(y).toEqual([lvl2, lvl2, lvl1]);
  });
});
