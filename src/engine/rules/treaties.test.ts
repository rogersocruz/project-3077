/**
 * Fase 8 — tratados (GDD 10): validação na assinatura, Ouro só no aceite, limite de 2,
 * cada gatilho e cada consequência, inadimplência, "SE NÃO" com prazo, quebra de pacto,
 * efeitos dos pactos e a partida com Contrato de Tarifa Preferencial (critério de aceite).
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import type { GameEvent } from '../events';
import { checkAction, decider, legalActions, templateTerms } from '../legal';
import { applyAction, replay } from '../reducer';
import type { ContractTerms, GameState, HexKey, PactTerms, PlayerId, Treaty, TreatyTerms } from '../state';
import {
  edit,
  giveCard,
  installCard,
  key,
  makeContext,
  passTurn,
  place,
  RICH,
  setResources,
  startedGame,
} from '../testing';
import { contestedHexes } from './combat';
import { checkTreatyTerms, observeTreaties, pactsBrokenBy } from './treaties';

const ctx = makeContext(3);
const LAYERS = { conflict: true, cards: true, treaties: true } as const;

const base = (layers: object = LAYERS): GameState =>
  // Variante de laboratório: o estoque farto (RICH) não encerra a partida no fim da rodada.
  edit(startedGame(ctx, { seed: 7, layers, playToRoundLimit: true }), (x) => {
    for (const h of Object.values(x.hexes)) {
      h.revealed = true;
      if (ctx.terrain(h.surface).kind !== 'surface' || h.surface === 'mountain') h.surface = 'empty';
    }
    for (const p of x.players) setResources(x, p.id, RICH);
  });

const play = (s: GameState, a: Action) => applyAction(ctx, s, a);

/** Um hex do tabuleiro `a` vizinho de um hex do tabuleiro `b` (fronteira). */
function border(a: number, b: number): [HexKey, HexKey] {
  for (const h of ctx.planet.hexes) {
    if (h.boardId !== a) continue;
    const n = ctx.planet.neighbors(h).find((x) => x.boardId === b);
    if (n) return [`${h.boardId}:${h.q},${h.r}`, `${n.boardId}:${n.q},${n.r}`];
  }
  throw new Error('tabuleiros não vizinhos');
}
const [A, B] = border(0, 1);

function troops(s: GameState, hex: HexKey, owner: PlayerId, n = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const uid = s.nextUid++;
    s.hexes[hex]?.troops.push({ uid, type: 'line', level: 1, owner, arrived: uid });
    out.push(uid);
  }
  return out;
}

/** Assina direto (cenário): `parties` = [quem propôs, quem aceitou]. */
function sign(s: GameState, parties: [PlayerId, PlayerId], terms: TreatyTerms, until = s.round + 4): Treaty {
  const t: Treaty = { id: s.treaties.nextId++, parties, terms, signedRound: s.round, until };
  s.treaties.active.push(t);
  return t;
}

const contract = (c: Partial<ContractTerms>): ContractTerms => ({
  kind: 'contract',
  subject: 'me',
  negated: false,
  verb: 'enter',
  object: 'territory',
  of: 'you',
  obligor: 'me',
  consequence: 'pay',
  target: 'resource',
  resource: 'iron',
  amount: 2,
  ...c,
});
const pact = (id: string, extra: Partial<PactTerms> = {}): PactTerms => ({
  kind: 'pact',
  pact: id,
  ...extra,
});

/** Move as tropas de `from` (do jogador ativo 0) para `to`. */
const moveAll = (s: GameState, from: HexKey, to: HexKey) =>
  play(s, {
    type: 'move',
    player: 0,
    from,
    to,
    uids: (s.hexes[from]?.troops ?? []).filter((t) => t.owner === 0).map((t) => t.uid),
  });

const types = (events: GameEvent[]) => events.map((e) => e.type);

/** Passa turnos até a rodada `round` começar. */
function untilRound(s: GameState, round: number): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let st = s;
  while (st.round < round && st.stage === 'playing') {
    const r = passTurn(ctx, st);
    st = r.state;
    events.push(...r.events);
  }
  return { state: st, events };
}

describe('Validação na assinatura (GDD 10)', () => {
  const s = base();
  const ok = (terms: TreatyTerms) => checkTreatyTerms(ctx, s, 0, 1, terms);

  it('modelos prontos de treaties.json são válidos', () => {
    for (const terms of templateTerms(ctx)) expect(ok(terms)).toBeNull();
  });

  it('quem cumpre tem de ser signatário; "quem agiu" só se o sujeito for signatário', () => {
    expect(ok(contract({ obligor: 'third' as never }))?.key).toBe('treatyInvalid');
    expect(ok(contract({ subject: 'third', obligor: 'actor', of: 'you' }))?.key).toBe('treatyInvalid');
    expect(ok(contract({ subject: 'third', obligor: 'otherSignatory', of: 'eitherSignatory' }))).toBeNull();
  });

  it('objeto precisa ser do verbo; tratado não aponta para tratado', () => {
    expect(ok(contract({ verb: 'enter', object: 'village' }))?.key).toBe('treatyInvalid');
    expect(ok(contract({ verb: 'attack', object: 'treaty' }))?.key).toBe('treatyInvalid');
    expect(ok(contract({ target: 'treaty' }))?.key).toBe('treatyInvalid');
  });

  it('"terceiro" exige um terceiro jogador; mesmo papel dos dois lados é inválido', () => {
    // Com o terceiro fora da partida, não há "terceiro".
    const two = edit(base(), (x) => void (x.players[2]!.eliminated = true));
    expect(checkTreatyTerms(ctx, two, 0, 1, contract({ subject: 'third', obligor: 'you' }))?.params).toEqual({
      part: 'third',
    });
    expect(ok(contract({ subject: 'me', of: 'me' }))?.key).toBe('treatyInvalid');
  });

  it('"SE NÃO" exige sujeito determinado; PAGA EM VEZ DA TARIFA só com ENTRAR', () => {
    expect(ok(contract({ negated: true, subject: 'anySignatory', obligor: 'you' }))?.params).toEqual({
      part: 'negated',
    });
    expect(ok(contract({ negated: true }))).toBeNull();
    expect(
      ok(contract({ verb: 'attack', object: 'troop', consequence: 'overrideToll', obligor: 'actor' }))?.key,
    ).toBe('treatyInvalid');
  });

  it('camadas: pacto militar sem Conflito e entregar carta sem Cartas são recusados', () => {
    const eco = base({ treaties: true });
    expect(checkTreatyTerms(ctx, eco, 0, 1, pact('pact_non_aggression'))?.key).toBe('layerDisabled');
    expect(
      checkTreatyTerms(
        ctx,
        eco,
        0,
        1,
        contract({ consequence: 'give', target: 'card', resource: undefined, amount: undefined }),
      )?.key,
    ).toBe('layerDisabled');
    expect(checkTreatyTerms(ctx, eco, 0, 1, pact('pact_open_survey'))).toBeNull();
  });

  it('pactos iguais ou contraditórios entre os mesmos dois são recusados', () => {
    const s2 = edit(base(), (x) => void sign(x, [0, 1], pact('pact_free_passage')));
    expect(checkTreatyTerms(ctx, s2, 1, 0, pact('pact_free_passage'))?.key).toBe('treatyConflict');
    expect(checkTreatyTerms(ctx, s2, 1, 0, pact('pact_closed_border'))?.key).toBe('treatyConflict');
    expect(checkTreatyTerms(ctx, s2, 0, 2, pact('pact_closed_border'))).toBeNull();
  });

  it('rascunho parcial só confere o que já foi escolhido (o construtor nunca oferece inválido)', () => {
    expect(checkTreatyTerms(ctx, s, 0, 1, { kind: 'contract', subject: 'me' }, false)).toBeNull();
    expect(checkTreatyTerms(ctx, s, 0, 1, { kind: 'contract', subject: 'me' }, true)?.key).toBe(
      'treatyInvalid',
    );
    expect(checkTreatyTerms(ctx, s, 0, 1, { kind: 'contract', subject: 'me', verb: 'fly' }, false)?.key).toBe(
      'treatyInvalid',
    );
  });
});

describe('Proposta e aceite (GDD 10)', () => {
  const nonAggression = pact('pact_non_aggression');

  it('propor é grátis; o Ouro sai de cada um só no aceite; o destinatário decide', () => {
    const s = base();
    const r = play(s, { type: 'proposeTreaty', player: 0, to: 1, terms: nonAggression });
    expect(r.state.players[0]?.resources.gold).toBe(50);
    expect(decider(r.state)).toBe(1);
    expect(checkAction(ctx, r.state, { type: 'endPhase', player: 0 })).toMatchObject({ ok: false });
    expect(legalActions(ctx, r.state, 1).map((a) => a.type)).toContain('acceptTreaty');
    const a = play(r.state, { type: 'acceptTreaty', player: 1 });
    expect(a.state.players[0]?.resources.gold).toBe(49);
    expect(a.state.players[1]?.resources.gold).toBe(49);
    expect(a.state.treaties.active).toHaveLength(1);
    expect(a.state.treaties.active[0]).toMatchObject({ parties: [0, 1], until: s.round + 4 });
    expect(types(a.events)).toContain('treatySigned');
  });

  it('recusar não cobra nada; uma proposta por turno', () => {
    const s = base();
    const r = play(play(s, { type: 'proposeTreaty', player: 0, to: 1, terms: nonAggression }).state, {
      type: 'rejectTreaty',
      player: 1,
    });
    expect(r.state.players.map((p) => p.resources.gold)).toEqual([50, 50, 50]);
    expect(
      checkAction(ctx, r.state, { type: 'proposeTreaty', player: 0, to: 2, terms: nonAggression }),
    ).toEqual({
      ok: false,
      reason: { key: 'treatyAlreadyProposed' },
    });
  });

  it('falta de Ouro no aceite recusa; Tratados Livres zera o Ouro do dono', () => {
    let s = edit(base(), (x) => setResources(x, 1, { gold: 0 }));
    s = play(s, { type: 'proposeTreaty', player: 0, to: 1, terms: nonAggression }).state;
    expect(checkAction(ctx, s, { type: 'acceptTreaty', player: 1 })).toMatchObject({
      ok: false,
      reason: { key: 'treatyGold' },
    });
    s = edit(s, (x) => void installCard(x, 1, 'tech_corporate_diplomacy'));
    const a = play(s, { type: 'acceptTreaty', player: 1 });
    expect(a.state.players[1]?.resources.gold).toBe(0);
    expect(a.state.players[0]?.resources.gold).toBe(49);
  });

  it('máximo de 2 tratados ativos por jogador', () => {
    const s = edit(base(), (x) => {
      sign(x, [1, 0], pact('pact_free_passage'));
      sign(x, [2, 0], pact('pact_open_survey'));
    });
    expect(
      checkAction(ctx, s, { type: 'proposeTreaty', player: 0, to: 1, terms: nonAggression }),
    ).toMatchObject({
      ok: false,
      reason: { key: 'treatyLimit' },
    });
  });
});

describe('Gatilhos (GDD 10, interpretação BE)', () => {
  it('ENTRAR EM território: contrato dispara ao mover e paga ao outro signatário', () => {
    const s = edit(base(), (x) => {
      troops(x, A, 0, 2);
      sign(x, [0, 1], contract({ perTroop: true }));
    });
    const r = moveAll(s, A, B);
    expect(types(r.events)).toContain('treatyTriggered');
    expect(r.state.players[0]?.resources.iron).toBe(50 - 4);
    expect(r.state.players[1]?.resources.iron).toBe(50 + 4);
    expect(r.state.treaties.active).toHaveLength(0);
  });

  it('ATACAR tropa: mover para hex com tropa da vítima', () => {
    const s = edit(base(), (x) => {
      troops(x, A, 0);
      troops(x, B, 1);
      sign(x, [0, 1], contract({ verb: 'attack', object: 'troop', resource: 'gold', amount: 3 }));
    });
    const r = moveAll(s, A, B);
    expect(r.state.players[1]?.resources.gold).toBe(53);
  });

  it('ATACAR Vila: terceiro entra na Vila de um signatário (Seguro Mútuo)', () => {
    const tpl = templateTerms(ctx).find((t) => t.template === 'tpl_mutual_insurance') as TreatyTerms;
    const village = key(1, 0, 0);
    const neighbor = `1:${ctx.planet.neighbors({ boardId: 1, q: 0, r: 0 }).find((n) => n.boardId === 1)?.q},${ctx.planet.neighbors({ boardId: 1, q: 0, r: 0 }).find((n) => n.boardId === 1)?.r}`;
    const s = edit(base(), (x) => {
      troops(x, neighbor, 0);
      sign(x, [1, 2], tpl);
    });
    const r = moveAll(s, neighbor, village);
    // Terceiro (0) atacou a Vila de 1: o outro signatário (2) paga 3 Ferro a 1.
    expect(r.state.players[2]?.resources.iron).toBe(47);
    expect(r.state.players[1]?.resources.iron).toBe(53);
  });

  it('DAR ALVO EM carta: a carta entregue é revelada e o contrato dispara contra o remetente', () => {
    let s = edit(base(), (x) => {
      giveCard(x, 0, 'plunder');
      sign(x, [0, 1], contract({ verb: 'target', object: 'card', resource: 'gold', amount: 2 }));
    });
    s = play(s, { type: 'endPhase', player: 0 }).state;
    const card = s.players[0]?.hand.find((c) => s.cards.defs[c] === 'plunder') as number;
    s = play(s, {
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'resource', resource: 'food' },
    }).state;
    const r = passTurn(ctx, s);
    expect(r.events.some((e) => e.type === 'treatyTriggered')).toBe(true);
    expect(r.state.players[1]?.resources.gold).toBeGreaterThan(50);
  });

  it('ROUBAR recurso: Pilhagem revelada conta como roubo de quem entregou', () => {
    let s = edit(base(), (x) => {
      giveCard(x, 0, 'plunder');
      sign(
        x,
        [1, 0],
        contract({
          subject: 'you',
          of: 'me',
          verb: 'steal',
          object: 'resource',
          obligor: 'you',
          resource: 'oil',
          amount: 2,
        }),
      );
    });
    s = play(s, { type: 'endPhase', player: 0 }).state;
    const card = s.players[0]?.hand.find((c) => s.cards.defs[c] === 'plunder') as number;
    s = play(s, {
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'resource', resource: 'food' },
    }).state;
    const r = passTurn(ctx, s);
    expect(r.state.players[0]?.resources.oil).toBe(48);
    expect(r.state.players[1]?.resources.oil).toBe(52);
  });

  // Gatilhos lidos direto dos eventos do motor (o mapeamento evento → ocorrência).
  const fire = (terms: ContractTerms, events: GameEvent[], parties: [PlayerId, PlayerId] = [0, 1]) => {
    const s = edit(base(), (x) => void sign(x, parties, terms));
    const out = [...events];
    observeTreaties(ctx, s, out, null);
    return { s, out };
  };

  it('DESTRUIR estrutura: rebaixar pela carta revelada; o autor é o remetente', () => {
    const { out } = fire(contract({ verb: 'destroy', object: 'structure' }), [
      { type: 'cardRevealed', from: 0, to: 1, card: 0 },
      { type: 'structureDowngraded', player: 1, hex: key(1, 0, 0), uid: 1, level: 1 },
    ]);
    expect(types(out)).toContain('treatyTriggered');
  });

  it('DESTRUIR tropa: baixa do combate é do vencedor', () => {
    const { out } = fire(contract({ verb: 'destroy', object: 'troop' }), [
      {
        type: 'combatResolved',
        hex: B,
        winner: 0,
        sides: [
          { owner: 0, attacker: true, troops: 3, support: 0, modifiers: [], modifierTotal: 0, total: 3 },
          { owner: 1, attacker: false, troops: 1, support: 0, modifiers: [], modifierTotal: 0, total: 1 },
        ],
      },
      { type: 'troopsLost', player: 1, hex: B, uids: [9] },
    ]);
    expect(types(out).filter((t) => t === 'treatyTriggered')).toHaveLength(1);
  });

  it('ROUBAR permanente, OBSERVAR subsolo/território e COLETAR território', () => {
    const steal = fire(contract({ verb: 'steal', object: 'permanent' }), [
      { type: 'permanentStolen', from: 1, to: 0, card: 3, slot: 0 },
    ]);
    expect(types(steal.out)).toContain('treatyTriggered');
    const observe = fire(contract({ verb: 'observe', object: 'subsoil' }), [
      { type: 'subsoilSurveyed', hex: key(1, 1, 0), player: 0, subsoil: 'rock' },
    ]);
    expect(types(observe.out)).toContain('treatyTriggered');
    const intel = fire(contract({ verb: 'observe', object: 'territory' }), [
      {
        type: 'intel',
        player: 0,
        card: 0,
        report: { kind: 'structures', target: 1, origin: null, structures: [] },
      },
    ]);
    expect(types(intel.out)).toContain('treatyTriggered');
    const collect = fire(contract({ verb: 'collect', object: 'territory' }), [
      { type: 'produced', player: 0, hex: key(1, 1, 0), uid: -1, resource: 'food', amount: 1 },
    ]);
    expect(types(collect.out)).toContain('treatyTriggered');
  });

  it('o sujeito precisa bater: terceiro não dispara contrato de "me"', () => {
    const { out } = fire(contract({}), [
      { type: 'troopsMoved', player: 2, from: A, to: B, uids: [1], path: [A, B] },
    ]);
    expect(types(out)).not.toContain('treatyTriggered');
  });

  it('evento automático (desastre) não tem autor e não dispara', () => {
    const { out } = fire(contract({ verb: 'destroy', object: 'structure' }), [
      { type: 'roundStarted', round: 2 },
      { type: 'structureDowngraded', player: 1, hex: key(1, 0, 0), uid: 1, level: 1 },
    ]);
    expect(types(out)).not.toContain('treatyTriggered');
  });
});

describe('Consequências, inadimplência e prazos (GDD 10)', () => {
  const enter = (c: Partial<ContractTerms>, setup?: (x: GameState) => void) => {
    const s = edit(base(), (x) => {
      troops(x, A, 0);
      setup?.(x);
      sign(x, [0, 1], contract(c));
    });
    return moveAll(s, A, B);
  };

  it('PAGA carta, ENTREGA carta e DESCARTA vêm da mão do obrigado', () => {
    const hand = (x: GameState) => {
      x.players[0]!.hand = [];
      giveCard(x, 0, 'plunder');
      giveCard(x, 0, 'audit');
    };
    const pay = enter({ target: 'card', resource: undefined, amount: 2 }, hand);
    expect(pay.state.players[0]?.hand).toHaveLength(0);
    expect(pay.state.players[1]?.hand.length).toBe(2 + (base().players[1]?.hand.length ?? 0));
    const give = enter({ consequence: 'give', target: 'card', resource: undefined, amount: undefined }, hand);
    expect(give.state.players[0]?.hand).toHaveLength(1);
    const discard = enter({ consequence: 'discard', target: 'card', resource: undefined, amount: 1 }, hand);
    expect(discard.state.players[0]?.hand).toHaveLength(1);
    expect(discard.events.some((e) => e.type === 'cardDiscarded' && e.reason === 'treaty')).toBe(true);
  });

  it('ENTREGA permanente escolhido na proposta vai para o slot do beneficiário', () => {
    let perm = -1;
    const s = edit(base(), (x) => {
      troops(x, A, 0);
      perm = installCard(x, 0, 'tech_corporate_diplomacy');
      sign(
        x,
        [0, 1],
        contract({
          consequence: 'give',
          target: 'permanent',
          resource: undefined,
          amount: undefined,
          permanent: perm,
        }),
      );
    });
    const g = moveAll(s, A, B);
    expect(g.state.players[0]?.permanents).not.toContain(perm);
    expect(g.state.players[1]?.permanents).toContain(perm);
  });

  it('PERDE ação: no próprio turno sai na hora; fora do turno, no começo do próximo', () => {
    const now = enter({ consequence: 'loseAction', target: 'action', resource: undefined, amount: 1 });
    const before = base().actionsLeft;
    expect(now.state.actionsLeft).toBe(before - 1);
    // Obrigado = you (jogador 1): dívida para o próximo turno dele.
    const later = enter({
      obligor: 'you',
      consequence: 'loseAction',
      target: 'action',
      resource: undefined,
      amount: 1,
    });
    expect(later.state.players[1]?.actionDebt).toBe(1);
    let s = later.state;
    while (s.activePlayer !== 1) s = passTurn(ctx, s).state;
    expect(s.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn - 1);
    expect(s.players[1]?.actionDebt).toBe(0);
  });

  it('NÃO PODE: depois do disparo o motor recusa a ação contra o beneficiário', () => {
    const s = edit(base(), (x) => {
      troops(x, A, 0, 2);
      sign(
        x,
        [0, 1],
        contract({
          consequence: 'forbid',
          target: 'enter',
          resource: undefined,
          amount: undefined,
          rounds: 2,
        }),
      );
    });
    const uids = s.hexes[A]?.troops.map((t) => t.uid) ?? [];
    const first = play(s, { type: 'move', player: 0, from: A, to: B, uids: [uids[0] as number] });
    expect(first.state.treaties.restrictions).toHaveLength(1);
    expect(
      checkAction(ctx, first.state, { type: 'move', player: 0, from: A, to: B, uids: [uids[1] as number] }),
    ).toMatchObject({
      ok: false,
      reason: { key: 'treatyForbids' },
    });
  });

  it('inadimplência: paga o que puder e perde 1 ação', () => {
    const r = enter({ resource: 'oil', amount: 5 }, (x) => setResources(x, 0, { ...RICH, oil: 2 }));
    expect(r.state.players[0]?.resources.oil).toBe(0);
    expect(r.state.players[1]?.resources.oil).toBe(52);
    const e = r.events.find((x) => x.type === 'treatyTriggered');
    expect(e).toMatchObject({ defaulted: true, resources: { oil: 2 } });
    expect(r.state.actionsLeft).toBe(base().actionsLeft - 1);
  });

  it('"SE NÃO": dispara no fim da rodada seguinte se o sujeito não fez', () => {
    const s = edit(base(), (x) => {
      sign(
        x,
        [0, 1],
        contract({
          negated: true,
          subject: 'you',
          of: 'me',
          verb: 'attack',
          object: 'troop',
          obligor: 'you',
          resource: 'gold',
          amount: 2,
        }),
        x.round + 1,
      );
    });
    const mid = untilRound(s, 2);
    expect(mid.state.treaties.active).toHaveLength(1);
    const end = untilRound(mid.state, 3);
    expect(end.state.treaties.active).toHaveLength(0);
    expect(end.events.some((e) => e.type === 'treatyTriggered' && e.obligor === 1)).toBe(true);
  });

  it('"SE NÃO" cumprido: o sujeito fez e o contrato termina sem consequência', () => {
    const s = edit(base(), (x) => {
      troops(x, A, 0);
      sign(x, [0, 1], contract({ negated: true }), x.round + 1);
    });
    const r = moveAll(s, A, B);
    expect(types(r.events)).toContain('treatyFulfilled');
    expect(r.state.players[0]?.resources.iron).toBe(50);
  });

  it('contratos e pactos expiram no fim da rodada `until` (5 rodadas contando a atual)', () => {
    let s = base();
    s = play(s, { type: 'proposeTreaty', player: 0, to: 1, terms: pact('pact_open_survey') }).state;
    s = play(s, { type: 'acceptTreaty', player: 1 }).state;
    const t = s.treaties.active[0] as Treaty;
    expect(t.until).toBe(s.round + ctx.balance.treaties.pactDurationRounds - 1);
    const last = untilRound(s, t.until);
    expect(last.state.treaties.active).toHaveLength(1);
    const after = untilRound(last.state, t.until + 1);
    expect(after.state.treaties.active).toHaveLength(0);
    expect(types(after.events)).toContain('treatyExpired');
  });
});

describe('Pactos (GDD 10, interpretações BB e BF)', () => {
  it('Fronteira Fechada: entrar rompe; quem rompe descarta a mão e perde 1 ação', () => {
    const s = edit(base(), (x) => {
      troops(x, A, 0);
      x.players[0]!.hand = [];
      giveCard(x, 0, 'audit');
      sign(x, [0, 1], pact('pact_closed_border'));
    });
    const r = moveAll(s, A, B);
    expect(types(r.events)).toContain('pactBroken');
    expect(r.state.players[0]?.hand).toHaveLength(0);
    expect(r.state.actionsLeft).toBe(s.actionsLeft - 1);
    expect(r.state.treaties.active).toHaveLength(0);
  });

  it('Não Agressão: mover sobre tropa do outro rompe; Romper pacto tem a mesma penalidade', () => {
    const s = edit(base(), (x) => {
      troops(x, A, 0);
      troops(x, B, 1);
      sign(x, [0, 1], pact('pact_non_aggression'));
    });
    expect(types(moveAll(s, A, B).events)).toContain('pactBroken');
    const id = s.treaties.active[0]?.id as number;
    const b = play(s, { type: 'breakTreaty', player: 0, treaty: id });
    expect(b.state.treaties.active).toHaveLength(0);
    expect(b.state.actionsLeft).toBe(s.actionsLeft - 1);
  });

  it('Corredor Livre zera o pedágio; Muralha Comercial dobra para terceiros', () => {
    const free = edit(base(), (x) => {
      troops(x, A, 0);
      sign(x, [0, 1], pact('pact_free_passage'));
    });
    expect(moveAll(free, A, B).events.some((e) => e.type === 'tollPaid')).toBe(false);
    const wall = edit(base(), (x) => {
      troops(x, A, 0);
      sign(x, [1, 2], pact('pact_double_toll'));
    });
    const paid = moveAll(wall, A, B).events.find((e) => e.type === 'tollPaid');
    expect(paid).toMatchObject({ from: 0, to: 1, resources: { food: 2 } });
  });

  it('Base Avançada: os dois no mesmo hex não lutam', () => {
    const s = edit(base(), (x) => {
      troops(x, B, 0);
      troops(x, B, 1);
    });
    expect(contestedHexes(s)).toContain(B);
    const allied = edit(s, (x) => void sign(x, [0, 1], pact('pact_staging')));
    expect(contestedHexes(allied)).not.toContain(B);
  });

  it('Canal Aberto: o teto de recebimento sobe 1 entre os signatários', () => {
    let s = edit(base(), (x) => {
      giveCard(x, 0, 'plunder');
      x.players[1]!.receivedThisRound = ctx.balance.cards.receiveCapPerRound;
    });
    s = play(s, { type: 'endPhase', player: 0 }).state;
    const card = s.players[0]?.hand.find((c) => s.cards.defs[c] === 'plunder') as number;
    const a: Action = {
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'resource', resource: 'food' },
    };
    expect(checkAction(ctx, s, a).ok).toBe(false);
    expect(
      checkAction(
        ctx,
        edit(s, (x) => void sign(x, [0, 1], pact('pact_extra_delivery'))),
        a,
      ).ok,
    ).toBe(true);
  });

  it('Livre Comércio: valor base sem aceite, 1 vez por turno; Preço Fixo: recurso ⇄ Ouro', () => {
    const s = edit(base(), (x) => {
      sign(x, [0, 1], pact('pact_no_spread'));
      sign(x, [0, 2], pact('pact_fixed_price', { resource: 'iron', price: 2 }));
    });
    const [free, fixed] = s.treaties.active as [Treaty, Treaty];
    const r = play(s, {
      type: 'useTreaty',
      player: 0,
      treaty: free.id,
      give: 'gold',
      amount: 1,
      receive: 'food',
    });
    expect(r.state.players[0]?.resources.food).toBe(
      50 + ctx.resourceValue('gold') / ctx.resourceValue('food'),
    );
    expect(
      checkAction(ctx, r.state, {
        type: 'useTreaty',
        player: 0,
        treaty: free.id,
        give: 'gold',
        amount: 1,
        receive: 'food',
      }),
    ).toMatchObject({
      ok: false,
      reason: { key: 'treatyUsed' },
    });
    const f = play(s, {
      type: 'useTreaty',
      player: 0,
      treaty: fixed.id,
      give: 'iron',
      amount: 3,
      receive: 'gold',
    });
    expect(f.state.players[0]?.resources.gold).toBe(56);
    expect(f.state.players[2]?.resources.iron).toBe(53);
    expect(
      checkAction(ctx, s, {
        type: 'useTreaty',
        player: 0,
        treaty: fixed.id,
        give: 'food',
        amount: 3,
        receive: 'gold',
      }).ok,
    ).toBe(false);
  });

  it('Céu Aberto deixa sondar o território do outro; Sigilo rompe ao sondar', () => {
    const target = B;
    const s = edit(base(), (x) => void place(x, A, 'outpost', 0, 3));
    const survey: Action = { type: 'survey', player: 0, hex: target };
    expect(checkAction(ctx, s, survey).ok).toBe(false);
    const open = edit(s, (x) => void sign(x, [0, 1], pact('pact_open_survey')));
    expect(checkAction(ctx, open, survey).ok).toBe(true);
    const secret = edit(s, (x) => void sign(x, [0, 1], pact('pact_closed_survey')));
    expect(pactsBrokenBy(ctx, secret, survey).map((t) => t.id)).toEqual([secret.treaties.active[0]?.id]);
  });
});

describe('Critério de aceite: partida com Contrato de Tarifa Preferencial', () => {
  it('assinado pelo construtor, o invasor paga 1 Ferro por tropa em vez da tarifa, em toda entrada', () => {
    const tpl = templateTerms(ctx).find((t) => t.template === 'tpl_preferential_tariff') as TreatyTerms;
    let s = edit(base(), (x) => void troops(x, A, 0, 2));
    const before = s.players.map((p) => ({ ...p.resources }));
    s = play(s, { type: 'proposeTreaty', player: 0, to: 1, terms: tpl }).state;
    s = play(s, { type: 'acceptTreaty', player: 1 }).state;
    expect(s.players[0]?.resources.gold).toBe((before[0]?.gold ?? 0) - 1);

    const food0 = s.players[0]?.resources.food ?? 0;
    const r = moveAll(s, A, B);
    const toll = r.events.find((e) => e.type === 'tollPaid');
    expect(toll).toMatchObject({ from: 0, to: 1, resources: { iron: 2 } });
    expect(r.events.find((e) => e.type === 'treatyTriggered')).toMatchObject({
      consequence: 'overrideToll',
      obligor: 0,
      beneficiary: 1,
      resources: { iron: 2 },
    });
    // Comida só do movimento (a tarifa declarada de 1 Comida por tropa não é cobrada).
    const moveFood = food0 - (r.state.players[0]?.resources.food ?? 0);
    expect(r.state.players[1]?.resources.food).toBe(s.players[1]?.resources.food);
    expect(moveFood).toBeGreaterThan(0);
    expect(r.state.treaties.active).toHaveLength(1);

    // Volta e entra de novo na rodada seguinte: o contrato continua valendo (BC).
    let s2 = play(r.state, {
      type: 'move',
      player: 0,
      from: B,
      to: A,
      uids: r.state.hexes[B]?.troops.map((t) => t.uid) ?? [],
    }).state;
    s2 = untilRound(s2, s2.round + 1).state;
    const again = moveAll(s2, A, B);
    expect(again.events.find((e) => e.type === 'tollPaid')).toMatchObject({ resources: { iron: 2 } });

    // Sem o contrato, a tarifa declarada (Comida) volta.
    const plain = moveAll(
      edit(s2, (x) => (x.treaties.active = [])),
      A,
      B,
    );
    expect(plain.events.find((e) => e.type === 'tollPaid')).toMatchObject({ resources: { food: 2 } });
  });

  it('determinismo: a mesma seed e o mesmo log refazem os tratados', () => {
    const tpl = templateTerms(ctx).find((t) => t.template === 'tpl_non_aggression') as TreatyTerms;
    const opts = { seed: 11, layers: LAYERS };
    let s = startedGame(ctx, opts);
    s = play(s, { type: 'proposeTreaty', player: 0, to: 2, terms: tpl }).state;
    s = play(s, { type: 'acceptTreaty', player: 2 }).state;
    s = passTurn(ctx, s).state;
    expect(replay(ctx, opts, s.log)).toEqual(s);
  });
});
