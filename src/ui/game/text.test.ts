import i18next, { type TFunction } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { RESOURCE_IDS } from '../../data/schemas';
import { TURN_PHASES } from '../../engine/state';
import type { GameEvent } from '../../engine/events';
import { key, makeContext, startedGame } from '../../engine/testing';
import en from '../../i18n/en.json';
import ptBR from '../../i18n/pt-BR.json';
import { parseGameParams } from './params';
import { amountsText, cardName, hexLabel, LOG_KEYS, logLine } from './text';

const ctx = makeContext(3);

/** Um exemplo de cada tipo de evento do motor. */
const SAMPLES: GameEvent[] = [
  { type: 'compensationChosen', player: 0, option: 0, resources: { gold: 3 } },
  { type: 'villageFounded', player: 0, hex: key(0, 0, 0) },
  { type: 'hexRevealed', hex: key(0, 1, 0), surface: 'forest', by: 0 },
  { type: 'subsoilSurveyed', hex: key(0, 1, 0), player: 0, subsoil: 'sub_gold' },
  { type: 'roundStarted', round: 2 },
  { type: 'turnStarted', player: 1, round: 2 },
  { type: 'phaseChanged', player: 1, phase: 'production' },
  { type: 'produced', player: 1, hex: key(1, 0, 1), uid: 5, resource: 'food', amount: 2 },
  { type: 'mineIdle', player: 1, hex: key(1, 0, 1), uid: 5 },
  { type: 'mineDepleted', player: 1, hex: key(1, 0, 1), uid: 5 },
  { type: 'upkeepPaid', player: 1, uid: 5, cost: { coal: 1 } },
  { type: 'upkeepMissed', player: 1, uid: 5 },
  { type: 'structureBuilt', player: 0, hex: key(0, 1, 0), uid: 9, structure: 'park' },
  { type: 'structureUpgraded', player: 0, uid: 1, level: 2 },
  { type: 'villageHealed', player: 0, lives: 3 },
  { type: 'resourcesSpent', player: 0, resources: { stone: 2 } },
  { type: 'bankTraded', player: 0, give: 'stone', amount: 4, receive: 'iron', received: 1, lostCredit: 1 },
  { type: 'tradeProposed', from: 0, to: 1 },
  { type: 'tradeCountered', from: 1, to: 0 },
  { type: 'tradeAccepted', from: 0, to: 1 },
  { type: 'tradeRejected', from: 0, to: 1 },
  { type: 'tradeCancelled', from: 0, to: 1 },
  { type: 'cardDrawn', player: 0, card: 0, deck: 'n1' },
  { type: 'deckReshuffled', deck: 'n2', size: 12 },
  { type: 'cardDiscarded', player: 0, card: 1, reason: 'limit' },
  { type: 'cardPlayed', player: 0, card: 2, target: { kind: 'resource', resource: 'iron' } },
  { type: 'cardDelivered', from: 0, to: 1, card: 3 },
  { type: 'cardRevealed', from: 0, to: 1, card: 3, target: { kind: 'hex', hex: key(1, 0, 0) } },
  { type: 'cardFizzled', from: 0, to: 1, card: 3, reason: 'invalidTarget' },
  { type: 'permanentInstalled', player: 1, card: 4, slot: 0 },
  { type: 'permanentRemoved', player: 1, card: 4, slot: 0, cause: 'destroyed' },
  { type: 'permanentStolen', from: 1, to: 0, card: 4, slot: 2 },
  { type: 'resourcesGained', player: 0, resources: { gold: 1 } },
  { type: 'resourcesLost', player: 1, resources: { food: 2 } },
  { type: 'structureDestroyed', player: 1, hex: key(1, 0, 1), uid: 5, structure: 'park' },
  { type: 'structureDowngraded', player: 1, hex: key(1, 0, 0), uid: 2, level: 1 },
  { type: 'structureDisabled', player: 1, hex: key(1, 0, 0), uid: 2, until: 'thisRound' },
  { type: 'structureInactive', player: 1, hex: key(1, 0, 0), uid: 2 },
  { type: 'subsoilSealed', hex: key(1, 0, 1), by: 0 },
  { type: 'subsoilCleared', hex: key(1, 0, 1), player: 1 },
  { type: 'hexYieldBoosted', hex: key(0, 1, 0), player: 0, bonus: 1 },
  { type: 'actionsChanged', player: 1, delta: -1, actionsLeft: 2 },
  { type: 'intel', player: 0, card: 5, report: { kind: 'hand', target: 1, cards: [6, 7] } },
  { type: 'choicePending', player: 0, card: 8, deck: 'n1', options: [9, 10] },
  { type: 'cardTaken', player: 0, card: 9, deck: 'n1' },
  { type: 'roundEnded', round: 2 },
  { type: 'gameOver', winners: [0, 2], reason: 'condition' },
  { type: 'eventRevealed', round: 2, event: 'ev_quake', category: 'seismic' },
  { type: 'eventDeckReshuffled', size: 12 },
  { type: 'hazardTriggered', hex: '0:1,0', hazard: 'volcano', effect: 'ashCloud' },
  { type: 'hexStatus', hex: '0:1,0', status: 'ashUntil', until: 3 },
  { type: 'hexContaminated', hex: '0:1,0', actions: 2 },
  { type: 'hexCleaned', hex: '0:1,0', player: 0 },
  { type: 'disaster', hex: '0:1,0', radius: 1 },
  { type: 'volcanoErupted', hex: '0:1,0' },
  { type: 'villageDamaged', player: 1, lives: 2 },
  { type: 'playerEliminated', player: 2 },
  { type: 'guardianSpawned', hex: '0:1,0', strength: 4 },
  { type: 'hordeAttack', from: '0:1,0', to: '0:2,0', strength: 5, defense: 2, repelled: false },
  { type: 'excavated', player: 0, hex: '0:1,0', site: 'temple' },
  { type: 'treasureDrawn', player: 0, card: 0 },
  { type: 'braced', player: 0, event: 'ev_plague' },
  { type: 'eventFoodLoss', player: 1, amount: 2 },
  { type: 'troopRecruited', player: 0, hex: '0:1,0', uid: 40, troop: 'line' },
  { type: 'troopUpgraded', player: 0, uid: 40, level: 2 },
  { type: 'tariffChanged', player: 1, resource: 'iron' },
  { type: 'tollPaid', from: 0, to: 1, resources: { iron: 2 } },
  { type: 'troopsMoved', player: 0, from: '0:1,0', to: '1:0,1', uids: [40, 41], path: ['0:1,0', '1:0,1'] },
  {
    type: 'combatResolved',
    hex: '1:0,1',
    winner: 0,
    sides: [
      { owner: 0, attacker: true, troops: 8, support: 4, modifiers: [], modifierTotal: -1, total: 11 },
      { owner: -1, attacker: false, troops: 4, support: 0, modifiers: [], modifierTotal: 0, total: 4 },
    ],
  },
  { type: 'casualtiesPending', player: 1, hex: '1:0,1', need: 1 },
  { type: 'troopsLost', player: 1, hex: '1:0,1', uids: [50] },
  { type: 'troopsRetreated', player: 1, from: '1:0,1', to: '1:0,0', uids: [51] },
  { type: 'guardianDefeated', hex: '1:0,1' },
  { type: 'villageAttacked', player: 1, by: [0] },
  { type: 'troopBoosted', player: 0, uid: 40, amount: 2 },
  { type: 'troopRooted', player: 1, uid: 51 },
  { type: 'treatyProposed', from: 0, to: 1, terms: { kind: 'pact', pact: 'pact_non_aggression' } },
  { type: 'treatyRejected', from: 0, to: 1 },
  { type: 'treatyCancelled', from: 0, to: 1 },
  {
    type: 'treatySigned',
    treaty: 1,
    parties: [0, 1],
    until: 5,
    terms: {
      kind: 'contract',
      subject: 'anySignatory',
      negated: false,
      verb: 'enter',
      object: 'territory',
      of: 'otherSignatory',
      obligor: 'actor',
      consequence: 'overrideToll',
      target: 'resource',
      resource: 'iron',
      amount: 1,
      perTroop: true,
    },
  },
  {
    type: 'treatyTriggered',
    treaty: 1,
    obligor: 0,
    beneficiary: 1,
    consequence: 'pay',
    resources: { iron: 3 },
    defaulted: false,
  },
  { type: 'treatyFulfilled', treaty: 2 },
  { type: 'treatyExpired', treaty: 3 },
  { type: 'pactBroken', treaty: 4, by: 0, pact: 'pact_closed_border' },
  { type: 'treatyTrade', treaty: 5, from: 0, to: 1, give: { gold: 1 }, receive: { food: 6 } },
  { type: 'actionDebtPaid', player: 1, amount: 1 },
];

describe.each([
  ['pt-BR', ptBR],
  ['en', en],
])('textos da partida em %s (CLAUDE.md regra 4)', (lng, dict) => {
  let t: TFunction;
  beforeAll(async () => {
    const i = i18next.createInstance();
    await i.init({ lng, resources: { [lng]: { translation: dict } }, interpolation: { escapeValue: false } });
    t = i.t;
  });

  it('todo evento do motor tem linha no registro, sem chave crua nem variável sobrando', () => {
    expect(new Set(SAMPLES.map((e) => e.type))).toEqual(new Set(Object.keys(LOG_KEYS)));
    const state = startedGame(ctx, { layers: { cards: true } });
    for (const e of SAMPLES) {
      for (const viewer of [0, 1]) {
        const line = logLine(t, e, viewer, state);
        expect(line, e.type).not.toMatch(/log\.|\{\{|undefined/);
        expect(line.length).toBeGreaterThan(5);
      }
    }
  });

  it('o recurso sondado só aparece no registro para quem sondou (D10)', () => {
    const e = SAMPLES.find((x) => x.type === 'subsoilSurveyed') as GameEvent;
    const gold = t('subsoil.sub_gold');
    expect(logLine(t, e, 0, null)).toContain(gold);
    expect(logLine(t, e, 1, null)).not.toContain(gold);
  });

  it('a carta comprada e a carta entregue só têm nome para quem pode vê-las (mão privada)', () => {
    const state = startedGame(ctx, { layers: { cards: true } });
    const drawn = SAMPLES.find((x) => x.type === 'cardDrawn') as GameEvent;
    const name = cardName(t, state, 0);
    expect(logLine(t, drawn, 0, state)).toContain(name);
    expect(logLine(t, drawn, 1, state)).not.toContain(name);
    const delivered = SAMPLES.find((x) => x.type === 'cardDelivered') as GameEvent;
    for (const viewer of [0, 1])
      expect(logLine(t, delivered, viewer, state)).not.toContain(cardName(t, state, 3));
  });

  it('nomes de estrutura, subsolo, fase e terreno existem para todo id dos dados', () => {
    const missing = (k: string) => t(k) === k;
    for (const s of ctx.data.structures) expect(missing(`structures.${s.id}`), s.id).toBe(false);
    for (const s of ctx.data.tiles.subsoil) expect(missing(`subsoil.${s.id}`), s.id).toBe(false);
    for (const p of TURN_PHASES) {
      expect(missing(`phases.${p}`), p).toBe(false);
      expect(missing(`rules.phase.${p}`), p).toBe(false);
    }
    for (const s of ctx.data.tiles.surface) expect(missing(`terrain.${s.id}`), s.id).toBe(false);
    for (const k of ['explore', 'survey', 'build', 'upgrade', 'chooseVillage']) {
      expect(missing(`noTargets.${k}`), k).toBe(false);
      expect(missing(`hud.modeHint.${k}`), k).toBe(false);
    }
    for (const r of ['setup', 'turn', 'trade']) expect(missing(`privacy.hint.${r}`), r).toBe(false);
  });

  it('rótulo de hex e quantias', () => {
    expect(hexLabel(t, '0:-1,2')).toMatch(/1.*−1.*2/);
    expect(amountsText(t, {})).toBe(t('trade.nothing'));
    expect(amountsText(t, { stone: 2, gold: 1 })).toBe(`2 ${t('resources.stone')}, 1 ${t('resources.gold')}`);
    for (const id of RESOURCE_IDS) expect(t(`resources.${id}`)).not.toBe(`resources.${id}`);
  });
});

describe('melhorar no registro usa o tipo da estrutura no estado mostrado', () => {
  it('Centro da Vila → nível 2', async () => {
    const i = i18next.createInstance();
    await i.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } } });
    const s = startedGame(ctx);
    const uid = s.hexes[key(0, 0, 0)]?.structures[0]?.uid ?? 0;
    const line = logLine(i.t, { type: 'structureUpgraded', player: 0, uid, level: 2 }, 0, s);
    expect(line).toContain(i.t('structures.village'));
    // sem estado (ou estrutura já removida): texto genérico
    expect(logLine(i.t, { type: 'structureUpgraded', player: 0, uid: 999, level: 2 }, 0, s)).toContain(
      i.t('log.structure'),
    );
  });
});

describe('parâmetros da partida na URL', () => {
  it('lê jogadores, seed, mapa e apresentação; inválido cai no padrão', () => {
    expect(parseGameParams('?view=game&players=5&seed=42&long=1&speed=instant&privacy=0')).toMatchObject({
      setup: { players: 5, seed: 42, longMap: true },
      speed: 'instant',
      privacy: false,
    });
    expect(parseGameParams('?players=9&seed=-3&speed=7')).toMatchObject({
      setup: { players: 3, seed: 1, longMap: false },
      speed: null,
      privacy: null,
    });
    expect(parseGameParams('?speed=0.5').speed).toBe(0.5);
  });
});
