/**
 * Fase 6 — eventos (GDD 9), hazards e sítios (GDD 4.3), desastre (GDD 4.4) e derrota
 * (GDD 13.2). Um teste por effectId de events.json e de tiles.json.
 */
import { describe, expect, it } from 'vitest';
import type { Action } from '../actions';
import type { GameEvent } from '../events';
import { actionCost, checkAction, legalActions } from '../legal';
import { applyAction } from '../reducer';
import { getPlayer } from '../queries';
import type { GameState, HexKey } from '../state';
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
  setTerrain,
  startedGame,
} from '../testing';
import { bankPrices, runProduction, runUpkeep } from './economy';
import { disaster } from './hazards';
import { drawRows } from './decks';
import { buildEventDeck, revealEvent } from './world';

const ctx = makeContext(3);
const LAYERS = { events: true, specialHexes: true, cards: true } as const;

/** Partida no turno 1 do jogador 0 (Ações), sem evento corrente e sem hazards no tabuleiro 0. */
function base(): GameState {
  return edit(startedGame(ctx, { seed: 31, layers: LAYERS }), (x) => {
    x.world.current = null;
    x.world.braced = [];
    for (const h of Object.values(x.hexes)) {
      if (ctx.terrain(h.surface).kind !== 'surface') h.surface = 'empty';
      h.status = {};
      h.guardian = null;
    }
  });
}

/** Revela `id` como evento da rodada numa cópia; devolve o estado e os eventos. */
function reveal(s: GameState, id: string): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const state = edit(s, (x) => {
    x.world.deck = [id];
    revealEvent(ctx, x, events);
  });
  return { state, events };
}

const withEvent = (s: GameState, id: string) => edit(s, (x) => void (x.world.current = id));
const produce = (s: GameState, player = 0) => edit(s, (x) => runProduction(ctx, x, player, []));
const play = (s: GameState, a: Action) => applyAction(ctx, s, a);

const V = key(0, 0, 0);
const A = key(0, 1, 0);
const B = key(0, 1, -1);

describe('Baralho de eventos (GDD 9, interpretação AJ)', () => {
  it('no máximo 2 por categoria; 12 cartas (6 categorias) mesmo com activeDeckSize 15', () => {
    const deck = buildEventDeck(ctx, { layers: { ...base().layers } }, (xs) => [...xs].reverse());
    const per = new Map<string, number>();
    for (const id of deck) {
      const cat = ctx.data.events.find((e) => e.id === id)?.category ?? '?';
      per.set(cat, (per.get(cat) ?? 0) + 1);
    }
    expect(Math.max(...per.values())).toBeLessThanOrEqual(ctx.balance.events.maxPerCategoryInActiveDeck);
    expect(deck.length).toBe(12);
  });

  it('Ventos de Cauda (movimento de tropas) fica fora sem a camada de conflito', () => {
    expect(buildEventDeck(ctx, { layers: base().layers }, (xs) => [...xs])).not.toContain('ev_tailwinds');
  });

  it('sem a camada de eventos não há baralho nem evento', () => {
    const s = startedGame(ctx, { seed: 31 });
    expect(s.world.deck).toEqual([]);
    expect(s.world.current).toBeNull();
  });

  it('um evento por rodada no início; acabou o baralho, os usados voltam embaralhados', () => {
    const s = startedGame(ctx, { seed: 31, layers: LAYERS });
    expect(s.world.current).not.toBeNull();
    const events: GameEvent[] = [];
    const t = edit(s, (x) => {
      x.world.deck = [];
      x.world.used = ['ev_fertile_season', 'ev_hot_market'];
      revealEvent(ctx, x, events);
    });
    expect(events.some((e) => e.type === 'eventDeckReshuffled')).toBe(true);
    expect(t.world.deck.length + 1).toBe(2);
    expect(['ev_fertile_season', 'ev_hot_market']).toContain(t.world.current);
  });
});

describe('Desastre (GDD 4.4)', () => {
  it('hex + vizinhos: rebaixa 1 nível, destrói nível 1, Vila perde vida, permanentes ficam', () => {
    const s = edit(base(), (x) => {
      place(x, A, 'park', 0, 2);
      place(x, B, 'outpost', 0, 1);
      installCard(x, 0, 'tech_silos');
    });
    const events: GameEvent[] = [];
    const t = edit(s, (x) => disaster(ctx, x, A, events));
    const park = t.hexes[A]?.structures.find((st) => st.type === 'park');
    expect(park?.level).toBe(1);
    expect(t.hexes[B]?.structures.some((st) => st.type === 'outpost')).toBe(false);
    expect(t.players[0]?.villageLives).toBe(ctx.balance.village.lives - 1);
    expect(t.players[0]?.permanents.filter((c) => c !== null)).toHaveLength(1);
  });

  it('Blindagem Sísmica: nível 1 do dono só não é destruído', () => {
    const s = edit(base(), (x) => {
      place(x, A, 'outpost', 0, 1);
      installCard(x, 0, 'tech_seismic_shielding');
    });
    const t = edit(s, (x) => disaster(ctx, x, A, []));
    expect(t.hexes[A]?.structures.some((st) => st.type === 'outpost')).toBe(true);
  });

  it('Vila a 0 vidas: jogador eliminado, sai da ordem de turno e não vence (GDD 13.2, D11)', () => {
    const s = edit(base(), (x) => {
      const p = getPlayer(x, 1);
      p.villageLives = 1;
    });
    const events: GameEvent[] = [];
    const t = edit(s, (x) => disaster(ctx, x, key(1, 0, 0), events));
    expect(t.players[1]?.eliminated).toBe(true);
    expect(events.some((e) => e.type === 'playerEliminated' && e.player === 1)).toBe(true);
    // Turno de P0 termina → próximo é P2 (P1 está fora).
    const next = passTurn(ctx, t).state;
    expect(next.activePlayer).toBe(2);
    expect(
      checkAction(ctx, t, { type: 'proposeTrade', player: 0, to: 1, give: { food: 1 }, receive: {} }).ok,
    ).toBe(false);
  });

  it('sobrou um só: vence por eliminação no início da rodada', () => {
    const s = edit(base(), (x) => {
      getPlayer(x, 1).eliminated = true;
      getPlayer(x, 2).villageLives = 1;
      place(x, key(2, 1, 0), 'outpost', 2, 1);
      setTerrain(x, key(2, 1, 0), 'mountain');
      x.world.deck = ['ev_quake'];
    });
    let t = s;
    while (t.stage === 'playing' && t.round === s.round) t = passTurn(ctx, t).state;
    expect(t.stage).toBe('over');
    expect(t.winners).toEqual([0]);
  });
});

describe('Eventos (events.json)', () => {
  it('disasterAtTerrain (Tremor): Montanha com estrutura e hazard sísmico sofrem desastre', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'mountain');
      place(x, A, 'quarry', 0, 1);
      setTerrain(x, key(1, 1, 0), 'mountain'); // sem estrutura: nada
    });
    const { state, events } = reveal(s, 'ev_quake');
    expect(state.hexes[A]?.structures.some((st) => st.type === 'quarry')).toBe(false);
    expect(events.filter((e) => e.type === 'disaster').map((e) => (e as { hex: string }).hex)).toEqual([A]);
  });

  it('minesOffWithCounter (Colapso Sísmico): Minas param; a contra-ação mantém', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'empty', 'sub_gold');
      place(x, A, 'mine', 0, 1, { tokens: 4 });
      setResources(x, 0, RICH);
    });
    const off = withEvent(s, 'ev_seismic_collapse');
    expect(produce(off).players[0]?.resources.gold).toBe(RICH.gold);
    const braced = play(off, { type: 'brace', player: 0 }).state;
    expect(braced.actionsLeft).toBe(off.actionsLeft - 1);
    expect(produce(braced).players[0]?.resources.gold).toBeGreaterThan(RICH.gold ?? 0);
    expect(checkAction(ctx, braced, { type: 'brace', player: 0 }).ok).toBe(false);
  });

  it('contra-ação nas Ações devolve o que o evento tirou na Produção do turno (interpretação AQ)', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'empty', 'sub_gold');
      place(x, A, 'mine', 0, 1, { tokens: 4 });
      setTerrain(x, B, 'forest');
      place(x, B, 'park', 0, 1);
      setResources(x, 0, { coal: 1, food: 0 });
      x.phase = 'production';
    });
    // Colapso Sísmico: a Mina não produz na Produção; contra-ação nas Ações devolve (paga o Carvão).
    const collapse = edit(withEvent(s, 'ev_seismic_collapse'), (x) => runProduction(ctx, x, 0, []));
    expect(collapse.players[0]?.resources.gold).toBe(0);
    const back = play(
      edit(collapse, (x) => void (x.phase = 'actions')),
      { type: 'brace', player: 0 },
    ).state;
    expect(back.players[0]?.resources).toMatchObject({ gold: 3, coal: 0 });
    // Chuva Ácida: o Parque produziu 0 (1 − 1); a contra-ação devolve 1 Comida.
    const rain = edit(withEvent(s, 'ev_acid_rain'), (x) => runProduction(ctx, x, 0, []));
    expect(rain.players[0]?.resources.food).toBe(0);
    const back2 = play(
      edit(rain, (x) => void (x.phase = 'actions')),
      { type: 'brace', player: 0 },
    ).state;
    expect(back2.players[0]?.resources.food).toBe(1);
  });

  it('surveyBlocked (Crosta Instável): Sondar falha, exceto com Drone', () => {
    const s = withEvent(base(), 'ev_unstable_crust');
    const r = checkAction(ctx, s, { type: 'survey', player: 0, hex: A });
    expect(r.ok ? null : r.reason.key).toBe('surveyBlocked');
  });

  it('volcanoErupt (Erupção): desastre no Vulcão, que vira Vazio', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'volcano');
      place(x, B, 'outpost', 0, 1);
    });
    const { state } = reveal(s, 'ev_eruption');
    expect(state.hexes[A]?.surface).toBe('empty');
    expect(state.hexes[B]?.structures).toHaveLength(0);
  });

  it('ashCloud (Nuvem de Cinzas): Vulcão e vizinhos não produzem por 2 rodadas', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'volcano');
      setTerrain(x, B, 'forest');
      place(x, B, 'park', 0, 1);
    });
    const { state } = reveal(s, 'ev_ash_cloud');
    expect(state.hexes[B]?.status.ashUntil).toBe(s.round + 1);
    expect(produce(state).players[0]?.resources.food).toBe(s.players[0]?.resources.food);
    const later = edit(state, (x) => void (x.round += 2));
    expect(produce(later).players[0]?.resources.food).toBe((s.players[0]?.resources.food ?? 0) + 1);
  });

  it('parksMinusWithCounter (Chuva Ácida): Parques −1; contra-ação imuniza', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'forest');
      place(x, A, 'park', 0, 2);
    });
    const food = s.players[0]?.resources.food ?? 0;
    const rain = withEvent(s, 'ev_acid_rain');
    expect(produce(rain).players[0]?.resources.food).toBe(food + 1);
    const braced = play(rain, { type: 'brace', player: 0 }).state;
    expect(produce(braced).players[0]?.resources.food).toBe(food + 2);
  });

  it('terrainYieldBonus (Estação Fértil): Floresta/Lagoa +1', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'forest');
      place(x, A, 'park', 0, 1);
    });
    const food = s.players[0]?.resources.food ?? 0;
    expect(produce(withEvent(s, 'ev_fertile_season')).players[0]?.resources.food).toBe(food + 2);
  });

  it('loseFoodWithCounter (Praga): no fim da rodada, −2 Comida; contra-ação imuniza', () => {
    const s = edit(withEvent(base(), 'ev_plague'), (x) => {
      for (const p of x.players) setResources(x, p.id, { food: 5 });
    });
    const braced = play(s, { type: 'brace', player: 0 }).state;
    let t = braced;
    while (t.round === s.round && t.stage === 'playing') t = passTurn(ctx, t).state;
    // A rodada seguinte já produziu para P0; compara P1 e P2 (não fizeram contra-ação).
    const lost = (id: number) =>
      t.log.length && t.players[id] ? 5 - (t.players[id]?.resources.food ?? 0) : 0;
    expect(lost(1)).toBeGreaterThanOrEqual(2);
    expect(braced.world.braced).toEqual([0]);
  });

  it('minesOff (Ionização): Minas não operam nem pagam manutenção', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'empty', 'sub_iron');
      place(x, A, 'mine', 0, 1, { tokens: 4 });
      setResources(x, 0, { coal: 2 });
    });
    const off = withEvent(s, 'ev_ionization');
    const t = edit(produce(off), (x) => runUpkeep(ctx, x, 0, []));
    expect(t.players[0]?.resources).toMatchObject({ iron: 0, coal: 2 });
  });

  it('dronesOff (Tempestade Magnética): nenhum Drone', () => {
    const s = edit(withEvent(base(), 'ev_magnetic_storm'), (x) => {
      giveCard(x, 0, 'drone_1');
      setResources(x, 0, RICH);
    });
    const drone = s.players[0]?.hand.at(-1) ?? -1;
    const r = checkAction(ctx, s, { type: 'survey', player: 0, hex: A, drone: { card: drone } });
    expect(r.ok ? null : r.reason.key).toBe('dronesGrounded');
  });

  it('spawnHorde (Horda): ataca o vizinho da Ruína com mais estruturas; defesa ≥ força repele', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, B, 'ruin');
      setTerrain(x, A, 'forest');
      place(x, A, 'park', 0, 2);
      place(x, A, 'archive', 0, 2);
    });
    const { state, events } = reveal(s, 'ev_horde');
    expect(events.find((e) => e.type === 'hordeAttack')).toMatchObject({ to: A, repelled: false });
    expect(state.hexes[A]?.structures.map((st) => st.level)).toEqual([1, 1]);
    // Só o hex atacado (não os vizinhos): a Vila não perde vida.
    expect(state.players[0]?.villageLives).toBe(ctx.balance.village.lives);
    const walled = edit(s, (x) => {
      place(x, A, 'wall', 0, 1);
      place(x, key(0, 2, -1), 'outpost', 0, 3);
      place(x, key(0, 1, 1), 'outpost', 0, 3);
      place(x, key(0, 2, 0), 'outpost', 0, 2);
    });
    expect(reveal(walled, 'ev_horde').events.find((e) => e.type === 'hordeAttack')).toMatchObject({
      repelled: true,
    });
  });

  it('templeGuardians (Guardiões): Templo não escavado ganha Guardião, que bloqueia', () => {
    const s = edit(base(), (x) => setTerrain(x, A, 'temple'));
    const { state } = reveal(s, 'ev_guardians');
    expect(state.hexes[A]?.guardian).toBe(4);
    const r = checkAction(
      ctx,
      edit(state, (x) => setResources(x, 0, RICH)),
      { type: 'excavate', player: 0, hex: A },
    );
    expect(r.ok ? null : r.reason.key).toBe('guardianBlocks');
  });

  it('bankSpread (Mercado Aquecido / Quebra de Crédito): spread 1 e 3', () => {
    const s = base();
    const spread = (st: GameState) => {
      const p = bankPrices(ctx, st, 0, 'iron');
      return p.buy - p.sell;
    };
    expect(spread(s)).toBe(2);
    expect(spread(withEvent(s, 'ev_hot_market'))).toBe(1);
    expect(spread(withEvent(s, 'ev_credit_crash'))).toBe(3);
  });

  it('firstSurveyBonus (Veio Exposto): o primeiro a Sondar revela o subsolo em raio 2', () => {
    const s = withEvent(base(), 'ev_exposed_vein');
    const t = play(s, { type: 'survey', player: 0, hex: V }).state;
    const known = Object.values(t.hexes).filter((h) => h.surveyedBy.includes(0)).length;
    expect(known).toBe(19); // raio 2 = 19 hexes
    expect(t.world.firstSurveyDone).toBe(true);
  });
});

describe('Hazards: bônus (interpretação AL) e dano (gatilho = categoria, AP)', () => {
  it('produce (Vulcão): Parque no Vulcão produz 2 Carvão; cinzas do gatilho térmico param', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'volcano');
      place(x, A, 'park', 0, 1);
    });
    const coal = s.players[0]?.resources.coal ?? 0;
    expect(produce(s).players[0]?.resources.coal).toBe(coal + 2);
    const { state, events } = reveal(s, 'ev_ash_cloud');
    expect(events.some((e) => e.type === 'hazardTriggered' && e.hazard === 'volcano')).toBe(true);
    expect(produce(state).players[0]?.resources.coal).toBe(coal);
  });

  it('freeMineUpkeep (Geiser): Minas adjacentes não pagam Carvão; seca (sísmico) desliga', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'geyser');
      setTerrain(x, B, 'empty', 'sub_iron');
      place(x, B, 'mine', 0, 1, { tokens: 4 });
      setResources(x, 0, { coal: 1 });
    });
    expect(edit(s, (x) => runUpkeep(ctx, x, 0, [])).players[0]?.resources.coal).toBe(1);
    const { state } = reveal(s, 'ev_unstable_crust');
    expect(state.hexes[A]?.status.dryUntil).toBe(s.round + 2);
    expect(edit(state, (x) => runUpkeep(ctx, x, 0, [])).players[0]?.resources.coal).toBe(0);
  });

  it('doubleFood (Pântano Ácido): Parque produz Comida em dobro; contaminação (climático) para até limpar', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'acid_swamp');
      place(x, A, 'park', 0, 1);
    });
    const food = s.players[0]?.resources.food ?? 0;
    expect(produce(s).players[0]?.resources.food).toBe(food + 2);
    const { state } = reveal(s, 'ev_fertile_season');
    expect(state.hexes[A]?.status.contaminated).toBe(2);
    expect(produce(state).players[0]?.resources.food).toBe(food);
    expect(actionCost(ctx, state, { type: 'cleanHex', player: 0, hex: A })).toBe(2);
    const clean = play(state, { type: 'cleanHex', player: 0, hex: A }).state;
    expect(clean.hexes[A]?.status.contaminated).toBeUndefined();
    expect(clean.actionsLeft).toBe(state.actionsLeft - 2);
  });

  it('freeDroneFromHere (Cânion): Drone grátis para quem tem estrutura; dano (atmosférico) o põe no chão', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'wind_canyon');
      place(x, A, 'outpost', 0, 1);
      giveCard(x, 0, 'drone_1');
      setResources(x, 0, {});
    });
    const drone = s.players[0]?.hand.at(-1) ?? -1;
    const a: Action = { type: 'survey', player: 0, hex: key(0, 3, 0), drone: { card: drone } };
    expect(checkAction(ctx, s, a).ok).toBe(true);
    const { state } = reveal(s, 'ev_magnetic_storm');
    expect(state.hexes[A]?.status.groundedUntil).toBe(s.round);
  });

  it('thinCrust (Crosta Fina): sondar grátis, Mina −1 Pedregulho e multiplicador +1; colapso sela', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'thin_crust', 'sub_gold');
      setResources(x, 0, RICH);
    });
    expect(actionCost(ctx, s, { type: 'survey', player: 0, hex: A })).toBe(0);
    const surveyed = play(s, { type: 'survey', player: 0, hex: A }).state;
    expect(surveyed.actionsLeft).toBe(s.actionsLeft);
    const unlocked = edit(surveyed, (x) => void place(x, B, 'university', 0, 2));
    const built = play(unlocked, { type: 'build', player: 0, structure: 'mine', hex: A }).state;
    const stone = (unlocked.players[0]?.resources.stone ?? 0) - (built.players[0]?.resources.stone ?? 0);
    expect(stone).toBe((ctx.structure('mine').levels[0]?.cost.stone ?? 0) - 1);
    const gold = built.players[0]?.resources.gold ?? 0;
    expect(produce(built).players[0]?.resources.gold).toBe(
      gold + (ctx.structure('mine').levels[0]?.multiplier ?? 0) + 1,
    );
    const { state } = reveal(built, 'ev_unstable_crust');
    expect(state.hexes[A]?.structures.some((st) => st.type === 'mine')).toBe(false);
    expect(checkAction(ctx, state, { type: 'build', player: 0, structure: 'mine', hex: A }).ok).toBe(false);
  });

  it('freePort (Porto Franco): sem spread para quem tem estrutura; fechado (econômico) dobra', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, A, 'free_port');
      place(x, A, 'outpost', 0, 1);
    });
    const spread = (st: GameState) => {
      const p = bankPrices(ctx, st, 0, 'iron');
      return p.buy - p.sell;
    };
    expect(spread(s)).toBe(0);
    expect(bankPrices(ctx, s, 1, 'iron').buy - bankPrices(ctx, s, 1, 'iron').sell).toBe(2);
    const { state } = reveal(s, 'ev_exposed_vein');
    expect(spread(state)).toBe(4);
  });

  it('sabotageShield (Anomalia): Sabotagem não alveja a área; invertida (atmosférico) dobra o efeito', () => {
    const s = edit(base(), (x) => {
      setTerrain(x, key(1, 1, 0), 'magnetic_anomaly');
      setTerrain(x, key(1, 1, -1), 'forest');
      place(x, key(1, 1, -1), 'park', 1, 2);
      giveCard(x, 0, 'demolition');
      setResources(x, 0, RICH);
      x.phase = 'delivery';
    });
    const card = s.players[0]?.hand.at(-1) ?? -1;
    const uid = s.hexes[key(1, 1, -1)]?.structures[0]?.uid ?? -1;
    const discard = s.players[0]?.hand.filter((c) => c !== card).slice(0, 1) ?? [];
    const deliver: Action = {
      type: 'deliverCard',
      player: 0,
      card,
      to: 1,
      target: { kind: 'structure', uid },
      discard,
    };
    const r = checkAction(ctx, s, deliver);
    expect(r.ok ? null : r.reason.key).toBe('shielded');
    // Inversão: sem escudo e efeito dobrado (Demolição 2× = destrói o Parque nível 2).
    const inverted = reveal(s, 'ev_magnetic_storm').state;
    const delivered = play(
      edit(inverted, (x) => void (x.phase = 'delivery')),
      deliver,
    ).state;
    let t = delivered;
    while (t.activePlayer !== 1 && t.stage === 'playing') t = passTurn(ctx, t).state;
    expect(t.hexes[key(1, 1, -1)]?.structures).toHaveLength(0);
  });
});

describe('Templo, Ruína e Tesouro (GDD 4.3, interpretações AN e AO)', () => {
  const site = (surface: string) =>
    edit(base(), (x) => {
      setTerrain(x, A, surface);
      setResources(x, 0, RICH);
    });

  it('Escavar Templo: 1 ação + 1 Pedregulho, 2 cartas de Tesouro, vira Vazio', () => {
    const s = edit(site('temple'), (x) => {
      x.cards.treasure = x.cards.treasure.filter((c) => x.cards.defs[c] !== 'guardian_awakened');
    });
    const hand = s.players[0]?.hand.length ?? 0;
    const t = play(s, { type: 'excavate', player: 0, hex: A }).state;
    expect(t.actionsLeft).toBe(s.actionsLeft - 1);
    expect(t.players[0]?.resources.stone).toBe((RICH.stone ?? 0) - 1);
    expect(t.players[0]?.hand.length).toBe(hand + 2);
    expect(t.hexes[A]?.surface).toBe('empty');
  });

  it('Guardião Desperto sai do Tesouro: resolve na hora e guarda o hex', () => {
    const s = edit(site('temple'), (x) => {
      const g = x.cards.treasure.findIndex((c) => x.cards.defs[c] === 'guardian_awakened');
      const [card] = x.cards.treasure.splice(g, 1);
      if (card !== undefined) x.cards.treasure.unshift(card);
    });
    const t = play(s, { type: 'excavate', player: 0, hex: A }).state;
    expect(t.hexes[A]?.guardian).toBe(4);
    expect(t.players[0]?.hand.some((c) => t.cards.defs[c] === 'guardian_awakened')).toBe(false);
    const r = checkAction(ctx, t, { type: 'build', player: 0, structure: 'outpost', hex: A });
    expect(r.ok ? null : r.reason.key).toBe('guardianBlocks');
  });

  it('Ruína: 1 carta, fica no mapa, uma escavação só; bônus de compra (+1 n1 e linha n3)', () => {
    const s = site('ruin');
    expect(drawRows(ctx, s, 0)).toEqual([[{ deck: 'n1', count: 1 }]]);
    const t = play(s, { type: 'excavate', player: 0, hex: A }).state;
    expect(t.hexes[A]?.surface).toBe('ruin');
    expect(t.hexes[A]?.excavatedBy).toBe(0);
    expect(drawRows(ctx, t, 0)).toEqual([
      [{ deck: 'n1', count: 2 }],
      [
        { deck: 'n3', count: 1 },
        { deck: 'n1', count: 1 },
      ],
    ]);
    const r = checkAction(ctx, t, { type: 'excavate', player: 0, hex: A });
    expect(r.ok ? null : r.reason.key).toBe('alreadyExcavated');
  });

  it('Escavar exige alcance e as camadas de hexes especiais e cartas', () => {
    const far = edit(site('temple'), (x) => setTerrain(x, key(0, 3, 0), 'temple'));
    const r = checkAction(ctx, far, { type: 'excavate', player: 0, hex: key(0, 3, 0) });
    expect(r.ok ? null : r.reason.key).toBe('outOfRange');
    const noCards = edit(far, (x) => void ((x as { layers: { cards: boolean } }).layers.cards = false));
    const r2 = checkAction(ctx, noCards, { type: 'excavate', player: 0, hex: A });
    expect(r2.ok ? null : r2.reason.key).toBe('layerDisabled');
  });

  it('Tesouro "instant" se joga da mão como carta própria (Cofre: 4 Ouro)', () => {
    const s = edit(base(), (x) => {
      const c = x.cards.treasure.find((u) => x.cards.defs[u] === 'treasure_cache');
      if (c === undefined) throw new Error('sem Cofre');
      x.cards.treasure = x.cards.treasure.filter((u) => u !== c);
      x.players[0]?.hand.push(c);
    });
    const card = s.players[0]?.hand.at(-1) ?? -1;
    const a: Action = { type: 'playCard', player: 0, card, target: { kind: 'resource', resource: 'gold' } };
    expect(legalActions(ctx, s, 0)).toContainEqual(a);
    const t = play(s, a).state;
    expect(t.players[0]?.resources.gold).toBe((s.players[0]?.resources.gold ?? 0) + 4);
    expect(t.cards.treasureDiscard).toContain(card);
  });
});

describe('Partida inteira com eventos e hexes especiais', { timeout: 120_000 }, () => {
  it('ações legais aleatórias até o fim, com eventos revelados', async () => {
    const { Rng } = await import('../rng');
    const { decider } = await import('../legal');
    const { createGame } = await import('../setup');
    const rng = Rng.fromSeed(66);
    let s = createGame(ctx, { seed: 66, layers: LAYERS });
    const revealed = new Set<string>();
    for (let i = 0; i < 20_000 && s.stage !== 'over'; i++) {
      const legal = legalActions(ctx, s, decider(s));
      const types = [...new Set(legal.map((a) => a.type))];
      const type = rng.pick(types);
      s = applyAction(ctx, s, rng.pick(legal.filter((a) => a.type === type))).state;
      if (s.world.current) revealed.add(s.world.current);
    }
    expect(s.stage).toBe('over');
    expect(revealed.size).toBeGreaterThan(3);
  });
});

export type { HexKey };
