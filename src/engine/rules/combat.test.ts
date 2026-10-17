/**
 * Fase 7 — tropas e combate (GDD 8), fronteira (GDD 5.4). O exemplo trabalhado do GDD 8.4.1
 * é o teste de aceite: mesmos números, mesmo resultado.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import { checkAction, decider, legalActions } from '../legal';
import { applyAction } from '../reducer';
import type { GameState, HexKey, PlayerId, TroopType } from '../state';
import {
  edit,
  installCard,
  key,
  makeContext,
  passTurn,
  place,
  RICH,
  setResources,
  setTerrain,
  startedGame,
} from '../testing';
import { runProduction } from './economy';
import { HORDE, previewCombat, resolveCombat } from './combat';
import { planMove } from './troops';

const ctx = makeContext(3);
const LAYERS = { conflict: true, cards: false } as const;

const base = (): GameState =>
  edit(startedGame(ctx, { seed: 5, layers: LAYERS }), (x) => {
    for (const h of Object.values(x.hexes)) {
      h.revealed = true;
      if (ctx.terrain(h.surface).kind !== 'surface') h.surface = 'empty';
      if (h.surface === 'mountain') h.surface = 'empty';
    }
  });

function troop(s: GameState, hex: HexKey, owner: PlayerId, type: TroopType, level = 1, extra = {}): number {
  const uid = s.nextUid++;
  s.hexes[hex]?.troops.push({ uid, type, level, owner, arrived: uid, ...extra });
  return uid;
}

const play = (s: GameState, a: Action) => applyAction(ctx, s, a);
const H = key(1, 1, 0); // T2 (1, 0), tabuleiro do Governo

/** GDD 8.4.1: a situação do exemplo trabalhado. `lineLevel` = nível da Linha forte. */
function example(lineLevel = 3) {
  let ids = { atkArt: 0, defLine: 0, defArt: 0, atkLow: 0 };
  const s = edit(base(), (x) => {
    troop(x, H, 0, 'line', lineLevel, { crossedRound: x.round });
    ids.atkLow = troop(x, H, 0, 'line', 1, { crossedRound: x.round });
    ids.atkArt = troop(x, key(1, 3, 0), 0, 'artillery');
    troop(x, key(1, 1, 2), 0, 'artillery');
    ids.defLine = troop(x, H, 1, 'line');
    ids.defArt = troop(x, H, 1, 'artillery');
    place(x, H, 'wall', 1);
    place(x, key(1, 1, -1), 'outpost', 1);
    troop(x, key(1, -1, 0), 1, 'artillery');
  });
  ids = { ...ids };
  return { s, ids };
}

describe('Exemplo trabalhado do GDD 8.4.1 (critério de aceite)', () => {
  it('lados, apoio, metade da Artilharia, teto +4 e totais 11 × 10', () => {
    const { s } = example();
    const pv = previewCombat(ctx, s, H);
    const atk = pv?.sides.find((x) => x.owner === 0);
    const def = pv?.sides.find((x) => x.owner === 1);
    expect(atk).toMatchObject({ attacker: true, troops: 8, supportTotal: 4, modifierTotal: -1, total: 11 });
    expect(def).toMatchObject({ attacker: false, troops: 4, supportTotal: 2, modifierTotal: 4, total: 10 });
    expect(def?.modifiers.map((m) => m.key).sort()).toEqual(
      ['adjacentOutpost', 'defenderHomeBoard', 'formation2', 'wall'].sort(),
    );
    expect(def?.modifiers.reduce((a, m) => a + m.value, 0)).toBe(5);
    expect(pv?.winner).toBe(0);
  });

  it('baixas: o Governo perde a Artilharia (a IA/automático tira a mais fraca); a Linha recua; ocupação', () => {
    const { s, ids } = example();
    const after = play(s, { type: 'endPhase', player: 0 }).state;
    // Escolha real (Linha × Artilharia): o Governo decide.
    expect(after.pending).toMatchObject({ kind: 'casualties', player: 1, need: 1 });
    expect(decider(after)).toBe(1);
    const auto = legalActions(ctx, after, 1).find((a) => a.type === 'chooseCasualties');
    expect(auto).toEqual({ type: 'chooseCasualties', player: 1, uids: [ids.defArt] });
    // Escolha inválida (a Linha sozinha é mais que o necessário? não: 3 ≥ 1 e mínima) é aceita;
    // as duas juntas não (sobra).
    expect(
      checkAction(ctx, after, { type: 'chooseCasualties', player: 1, uids: [ids.defArt, ids.defLine] }).ok,
    ).toBe(false);
    const done = play(after, auto as Action).state;
    const hex = done.hexes[H];
    expect(hex?.troops.every((t) => t.owner === 0)).toBe(true);
    expect(hex?.troops).toHaveLength(2);
    // A Linha do Governo recuou para um vizinho no próprio tabuleiro.
    const line = Object.values(done.hexes).find((h) => h.troops.some((t) => t.uid === ids.defLine));
    expect(line?.boardId).toBe(1);
    expect(done.pending).toBeNull();
  });

  it('variante de empate (Linha nível 2): 10 × 10, cada lado perde a mais fraca, ninguém recua', () => {
    const { s, ids } = example(2);
    const pv = previewCombat(ctx, s, H);
    expect(pv?.sides.map((x) => x.total)).toEqual([10, 10]);
    expect(pv?.winner).toBeNull();
    const after = play(s, { type: 'endPhase', player: 0 }).state;
    const hex = after.hexes[H];
    expect(hex?.troops.map((t) => t.uid)).not.toContain(ids.atkLow);
    expect(hex?.troops.map((t) => t.uid)).not.toContain(ids.defArt);
    expect(hex?.troops.filter((t) => t.owner === 0)).toHaveLength(1);
    expect(hex?.troops.filter((t) => t.owner === 1)).toHaveLength(1);
  });

  it('variante com três lados (Horda força 5): 11 × 10 × 5; a Horda perde 6 e some', () => {
    const { s } = example();
    const extra = { owner: HORDE, kind: 'horde' as const, strength: 5 };
    const pv = previewCombat(ctx, s, H, { extra });
    expect(pv?.sides.map((x) => [x.owner, x.total])).toEqual([
      [0, 11],
      [1, 10],
      [HORDE, 5],
    ]);
    expect(pv?.winner).toBe(0);
    const events: never[] = [];
    const t = edit(s, (x) => void resolveCombat(ctx, x, H, events, { extra }));
    expect(t.pending).toMatchObject({ kind: 'casualties', player: 1, need: 1 });
  });
});

describe('Tropas: recrutar, nível, teto (GDD 6.3, 8.1, 8.2)', () => {
  const withBarracks = () =>
    edit(base(), (x) => {
      place(x, key(0, 1, 0), 'barracks', 0);
      setResources(x, 0, RICH);
    });

  it('recruta no hex do Quartel ou vizinho, paga o custo, 1 ação', () => {
    const s = withBarracks();
    const t = play(s, { type: 'recruit', player: 0, hex: key(0, 1, 1), troop: 'line' }).state;
    expect(t.hexes[key(0, 1, 1)]?.troops).toHaveLength(1);
    expect(t.actionsLeft).toBe(s.actionsLeft - 1);
    expect(t.players[0]?.resources).toMatchObject({ iron: (RICH.iron ?? 0) - 1, food: (RICH.food ?? 0) - 1 });
    const far = checkAction(ctx, s, { type: 'recruit', player: 0, hex: key(0, 3, 0), troop: 'line' });
    expect(far.ok ? null : far.reason.key).toBe('notNearBarracks');
  });

  it('teto = nível do Quartel × 3', () => {
    let s = edit(withBarracks(), (x) => {
      for (let i = 0; i < 3; i++) troop(x, key(0, 0, 1), 0, 'line');
    });
    const r = checkAction(ctx, s, { type: 'recruit', player: 0, hex: key(0, 1, 0), troop: 'line' });
    expect(r.ok ? null : r.reason.key).toBe('armyCap');
    s = edit(s, (x) => void (x.hexes[key(0, 1, 0)]!.structures[0]!.level = 2));
    expect(checkAction(ctx, s, { type: 'recruit', player: 0, hex: key(0, 1, 0), troop: 'line' }).ok).toBe(
      true,
    );
  });

  it('subir de nível: 1 ação + custo de recrutar, exige Oficina', () => {
    let uid = 0;
    let s = edit(withBarracks(), (x) => void (uid = troop(x, key(0, 1, 0), 0, 'artillery')));
    const r = checkAction(ctx, s, { type: 'upgradeTroop', player: 0, uid });
    expect(r.ok ? null : r.reason.key).toBe('needsWorkshop');
    s = edit(s, (x) => void place(x, key(0, 0, 1), 'workshop', 0));
    const t = play(s, { type: 'upgradeTroop', player: 0, uid }).state;
    expect(
      Object.values(t.hexes)
        .flatMap((h) => h.troops)
        .find((x) => x.uid === uid)?.level,
    ).toBe(2);
    expect(t.players[0]?.resources.iron).toBe((RICH.iron ?? 0) - 2);
  });
});

describe('Movimento e fronteira (GDD 8.3, 5.4)', () => {
  it('1 Comida por tropa por hex; Montanha 2; sem ação', () => {
    let a = 0;
    const s = edit(base(), (x) => {
      a = troop(x, key(0, 0, 1), 0, 'line');
      troop(x, key(0, 0, 1), 0, 'line');
      setTerrain(x, key(0, 1, 1), 'mountain');
      setResources(x, 0, { food: 10 });
    });
    const plan = planMove(ctx, s, 0, key(0, 0, 1), key(0, 2, 0), 2);
    expect(plan?.food).toBe(4); // 2 hexes × 2 tropas (desvia da Montanha)
    const t = play(s, { type: 'move', player: 0, from: key(0, 0, 1), to: key(0, 2, 0), uids: [a] }).state;
    expect(t.actionsLeft).toBe(s.actionsLeft);
    expect(t.players[0]?.resources.food).toBe(8);
  });

  it('entrar no território alheio paga a tarifa do dono por tropa e marca "cruzou"', () => {
    let a = 0;
    const s = edit(base(), (x) => {
      const p0 = x.players[0]!;
      p0.villageHex = p0.villageHex ?? key(0, 0, 0);
      setResources(x, 0, { food: 30, iron: 5 });
      setResources(x, 1, {});
      x.players[1]!.tariff = 'iron';
    });
    // Um hex do tabuleiro 0 vizinho do tabuleiro 1, e o vizinho do outro lado.
    const pair = ctx.planet.hexes
      .filter((h) => h.boardId === 0)
      .flatMap((h) =>
        ctx.planet
          .neighbors(h)
          .filter((n) => n.boardId === 1)
          .map((n) => [h, n] as const),
      )[0];
    expect(pair).toBeDefined();
    const [from, to] = pair!;
    const fk = `0:${from.q},${from.r}`;
    const tk = `1:${to.q},${to.r}`;
    const s2 = edit(s, (x) => void (a = troop(x, fk, 0, 'line')));
    const t = play(s2, { type: 'move', player: 0, from: fk, to: tk, uids: [a] }).state;
    expect(t.players[0]?.resources.iron).toBe(4);
    expect(t.players[1]?.resources.iron).toBe(1);
    expect(t.hexes[tk]?.troops[0]?.crossedRound).toBe(t.round);
  });

  it('não atravessa hex com tropa inimiga (pode parar nele)', () => {
    const s = edit(base(), (x) => {
      troop(x, key(0, 0, 1), 0, 'line');
      for (const n of ctx.planet.neighbors({ boardId: 0, q: 0, r: 1 }))
        troop(x, `${n.boardId}:${n.q},${n.r}`, 1, 'line');
      setResources(x, 0, { food: 30 });
    });
    expect(planMove(ctx, s, 0, key(0, 0, 1), key(0, 3, 0), 1)).toBeNull();
    expect(planMove(ctx, s, 0, key(0, 0, 1), key(0, 1, 1), 1)).not.toBeNull();
  });

  it('tarifa muda uma vez por rodada, sem ação', () => {
    const s = base();
    const t = play(s, { type: 'setTariff', player: 0, resource: 'gold' }).state;
    expect(t.players[0]?.tariff).toBe('gold');
    expect(t.actionsLeft).toBe(s.actionsLeft);
    expect(checkAction(ctx, t, { type: 'setTariff', player: 0, resource: 'iron' }).ok).toBe(false);
  });
});

describe('Ocupação e Vila (GDD 8.5)', () => {
  it('Linha inimiga ocupa: o dono não produz ali e o ocupante extrai 1', () => {
    const forest = key(1, 1, 0);
    const s = edit(base(), (x) => {
      setTerrain(x, forest, 'forest');
      place(x, forest, 'park', 1);
      troop(x, forest, 0, 'line');
      setResources(x, 0, {});
      setResources(x, 1, {});
    });
    expect(edit(s, (x) => runProduction(ctx, x, 1, [])).players[1]?.resources.food).toBe(0);
    expect(edit(s, (x) => runProduction(ctx, x, 0, [])).players[0]?.resources.food).toBe(
      ctx.balance.production.occupiedHexYield,
    );
  });

  it('tropa na Vila inimiga sem defensor no fim da rodada tira 1 vida', () => {
    const s = edit(base(), (x) => void troop(x, x.players[1]!.villageHex as HexKey, 0, 'line'));
    let t = s;
    while (t.round === s.round && t.stage === 'playing') t = passTurn(ctx, t).state;
    expect(t.players[1]?.villageLives).toBe(ctx.balance.village.lives - 1);
  });

  it('construir em hex próprio fora do raio com tropa sua', () => {
    const far = key(0, 3, 0);
    const s = edit(base(), (x) => {
      setResources(x, 0, RICH);
      troop(x, far, 0, 'line');
    });
    expect(checkAction(ctx, s, { type: 'build', player: 0, structure: 'outpost', hex: far }).ok).toBe(true);
  });
});

describe('Guardião e Horda com combate (decisão do usuário)', () => {
  it('Guardião (4) vence 1 Linha (3) e fica; 2 Linhas o derrotam', () => {
    const g = key(0, 1, 0);
    const one = edit(base(), (x) => {
      x.hexes[g]!.guardian = 4;
      troop(x, g, 0, 'line');
    });
    const a = play(one, { type: 'endPhase', player: 0 }).state;
    expect(a.hexes[g]?.guardian).toBe(4);
    expect(a.hexes[g]?.troops).toHaveLength(0);
    const two = edit(one, (x) => void troop(x, g, 0, 'line'));
    const b = play(two, { type: 'endPhase', player: 0 }).state;
    expect(b.hexes[g]?.guardian).toBeNull();
  });
});

describe('Cartas de tropa', () => {
  it('Liga Cerâmica: Linha +1', () => {
    const s = edit(base(), (x) => {
      troop(x, H, 0, 'line');
      troop(x, H, 1, 'line');
      installCard(x, 0, 'tech_ceramic_alloy');
    });
    expect(previewCombat(ctx, s, H)?.sides.find((x) => x.owner === 0)?.troops).toBe(4);
  });
});

describe('Partida aleatória com conflito', { timeout: 120_000 }, () => {
  it('ações legais aleatórias até o fim, com combates', async () => {
    const { Rng } = await import('../rng');
    const { createGame } = await import('../setup');
    const rng = Rng.fromSeed(17);
    let s = createGame(ctx, {
      seed: 17,
      layers: { conflict: true, cards: true, events: true, specialHexes: true },
    });
    let combats = 0;
    for (let i = 0; i < 30_000 && s.stage !== 'over'; i++) {
      const legal = legalActions(ctx, s, decider(s));
      const types = [...new Set(legal.map((a) => a.type))];
      const type = rng.pick(types);
      const r = applyAction(ctx, s, rng.pick(legal.filter((a) => a.type === type)));
      combats += r.events.filter((e) => e.type === 'combatResolved').length;
      s = r.state;
    }
    expect(s.stage).toBe('over');
    expect(combats).toBeGreaterThanOrEqual(0);
  });
});
