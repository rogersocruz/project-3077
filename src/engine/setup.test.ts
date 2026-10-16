import { describe, expect, it } from 'vitest';
import { applyAction } from './reducer';
import { checkAction, legalActions } from './legal';
import { distance, ORIGIN } from './hex';
import { apportion, createGame, isFoodTile, isGoldSubsoil, surfaceDeck } from './setup';
import { key, makeContext } from './testing';

const PLAYER_COUNTS = [3, 4, 5, 6] as const;

describe('apportion (maior resto)', () => {
  it('soma exatamente o total e respeita as razões', () => {
    expect(apportion([16, 16], 111)).toEqual([56, 55]);
    expect(apportion([3, 1, 4, 3, 3, 1], 15)).toEqual([3, 1, 4, 3, 3, 1]);
    for (const total of [0, 1, 7, 37, 222]) {
      expect(apportion([3, 3, 3, 3, 2, 11], total).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('setup — baralho geral de tiles (GDD 3.2 passo 1, tiles.json)', () => {
  it.each(PLAYER_COUNTS)('%i jogadores: 37 × N tiles, sítios escalados, hazards únicos', (n) => {
    const ctx = makeContext(n);
    const deck = surfaceDeck(ctx, true);
    expect(deck).toHaveLength(37 * n);
    for (const site of ctx.data.tiles.sites) {
      expect(deck.filter((t) => t === site.id)).toHaveLength(Math.round((site.copiesFor6 * n) / 6));
    }
    for (const hazard of ctx.data.tiles.hazards) {
      expect(deck.filter((t) => t === hazard.id)).toHaveLength(1);
    }
  });

  it('sem a camada de hexes especiais o baralho só tem terreno comum', () => {
    const ctx = makeContext(4);
    const deck = surfaceDeck(ctx, false);
    expect(deck).toHaveLength(37 * 4);
    expect(deck.every((t) => ctx.terrain(t).kind === 'surface')).toBe(true);
  });

  it('o restante segue a razão Recurso:Vazio de categoryWeights', () => {
    const ctx = makeContext(6);
    const deck = surfaceDeck(ctx, false);
    const empty = deck.filter((t) => t === 'empty').length;
    expect(Math.abs(empty - deck.length / 2)).toBeLessThanOrEqual(1);
  });
});

describe('setup — distribuição e garantias (GDD 3.2 passos 2–5)', () => {
  it.each(PLAYER_COUNTS)('%i jogadores: todo tabuleiro tem ≥ 3 Comida e ≥ 1 Ouro no subsolo', (n) => {
    const ctx = makeContext(n);
    const { minFoodHexesPerBoard, guaranteedGoldSubsoilPerBoard } = ctx.balance.setup;
    for (let seed = 0; seed < 40; seed++) {
      for (const specialHexes of [false, true]) {
        const s = createGame(ctx, { seed, layers: { specialHexes } });
        for (const board of ctx.planet.boards) {
          const hexes = Object.values(s.hexes).filter((h) => h.boardId === board.id);
          expect(hexes).toHaveLength(37);
          expect(hexes.filter((h) => isFoodTile(ctx, h.surface)).length).toBeGreaterThanOrEqual(
            minFoodHexesPerBoard,
          );
          expect(hexes.filter((h) => isGoldSubsoil(ctx, h.subsoil)).length).toBeGreaterThanOrEqual(
            guaranteedGoldSubsoilPerBoard,
          );
        }
      }
    }
  });

  it('garantias não alteram a composição do baralho (só trocam tiles de lugar)', () => {
    const ctx = makeContext(5);
    const s = createGame(ctx, { seed: 99, layers: { specialHexes: true } });
    const placed = Object.values(s.hexes)
      .map((h) => h.surface)
      .sort();
    expect(placed).toEqual(surfaceDeck(ctx, true).sort());
  });

  it('mesma seed → mesmo planeta; seed diferente → planeta diferente', () => {
    const ctx = makeContext(4);
    expect(createGame(ctx, { seed: 'abc' })).toEqual(createGame(ctx, { seed: 'abc' }));
    expect(createGame(ctx, { seed: 1 }).hexes).not.toEqual(createGame(ctx, { seed: 2 }).hexes);
  });

  it('todo hex começa oculto, com os recursos iniciais e as vidas da Vila (GDD 3.3, 13.2)', () => {
    const ctx = makeContext(3);
    const s = createGame(ctx, { seed: 5 });
    expect(Object.values(s.hexes).every((h) => !h.revealed)).toBe(true);
    for (const p of s.players) {
      expect(p.resources).toEqual(ctx.balance.setup.startingResources);
      expect(p.villageLives).toBe(ctx.balance.village.lives);
    }
  });
});

describe('setup — compensação sem hex especial (GDD 3.2 passo 6)', () => {
  it('só quem não tem sítio nem hazard no tabuleiro fica com compensação pendente', () => {
    const ctx = makeContext(3);
    let found = false;
    for (let seed = 0; seed < 300 && !found; seed++) {
      const s = createGame(ctx, { seed, layers: { specialHexes: true } });
      for (const p of s.players) {
        const hasSpecial = Object.values(s.hexes).some(
          (h) => h.boardId === p.boardId && ctx.terrain(h.surface).kind !== 'surface',
        );
        expect(p.compensation).toBe(hasSpecial ? 'none' : 'pending');
        if (!hasSpecial) found = true;
      }
    }
    // Sem especiais ligados, ninguém recebe compensação.
    expect(createGame(ctx, { seed: 1 }).players.every((p) => p.compensation === 'none')).toBe(true);
  });

  it('compensação: recursos à escolha somando o total; opção de carta exige a camada de cartas', () => {
    const ctx = makeContext(3);
    const s = createGame(ctx, { seed: 1 });
    s.players[0]!.compensation = 'pending';
    const opt = ctx.balance.setup.noSpecialCompensation.choose.findIndex((o) => 'resourcesOfChoice' in o);
    const card = ctx.balance.setup.noSpecialCompensation.choose.findIndex((o) => 'drawFromDeck' in o);

    expect(
      checkAction(ctx, s, { type: 'chooseCompensation', player: 0, option: opt, resources: { gold: 1 } }),
    ).toEqual({ ok: false, reason: { key: 'invalidAmounts', params: { total: 3 } } });
    expect(checkAction(ctx, s, { type: 'chooseCompensation', player: 0, option: card }).ok).toBe(false);
    // Vila só depois da compensação.
    expect(checkAction(ctx, s, { type: 'chooseVillage', player: 0, hex: key(0, 0, 0) })).toMatchObject({
      reason: { key: 'compensationPending' },
    });

    const { state } = applyAction(ctx, s, {
      type: 'chooseCompensation',
      player: 0,
      option: opt,
      resources: { gold: 2, oil: 1 },
    });
    expect(state.players[0]!.resources.gold).toBe(s.players[0]!.resources.gold + 2);
    expect(state.players[0]!.resources.oil).toBe(1);
    expect(state.players[0]!.compensation).toBe('done');
  });
});

describe('setup — Vila (GDD 3.2 passo 7, 3.3)', () => {
  it('a Vila só pode ir na zona central do próprio tabuleiro', () => {
    const ctx = makeContext(3);
    const s = createGame(ctx, { seed: 3 });
    const villageMoves = legalActions(ctx, s, 0).filter((a) => a.type === 'chooseVillage');
    expect(villageMoves.length).toBeGreaterThan(0);
    for (const a of villageMoves) {
      if (a.type !== 'chooseVillage') continue;
      const h = s.hexes[a.hex]!;
      expect(h.boardId).toBe(0);
      expect(distance(ORIGIN, h)).toBeLessThanOrEqual(ctx.balance.map.villageStartRing);
    }
    expect(checkAction(ctx, s, { type: 'chooseVillage', player: 0, hex: key(0, 2, 0) })).toMatchObject({
      reason: { key: 'outsideVillageZone' },
    });
    expect(checkAction(ctx, s, { type: 'chooseVillage', player: 0, hex: key(1, 0, 0) })).toMatchObject({
      reason: { key: 'notOwnBoard' },
    });
    expect(checkAction(ctx, s, { type: 'chooseVillage', player: 1, hex: key(1, 0, 0) })).toMatchObject({
      reason: { key: 'notYourTurn' },
    });
  });

  it('fundar a Vila revela o hex e os 6 adjacentes; depois de todos, começa a rodada 1', () => {
    const ctx = makeContext(3);
    let s = createGame(ctx, { seed: 3 });
    for (const p of [0, 1, 2]) {
      s.hexes[key(p, 0, 0)]!.surface = 'forest';
      s = applyAction(ctx, s, { type: 'chooseVillage', player: p, hex: key(p, 0, 0) }).state;
    }
    for (const p of [0, 1, 2]) {
      expect(Object.values(s.hexes).filter((h) => h.boardId === p && h.revealed)).toHaveLength(7);
      expect(s.hexes[key(p, 0, 0)]!.structures).toMatchObject([{ type: 'village', level: 1, owner: p }]);
    }
    expect(s.stage).toBe('playing');
    expect(s.round).toBe(1);
    expect(s.activePlayer).toBe(0);
    expect(s.phase).toBe('actions');
  });
});
