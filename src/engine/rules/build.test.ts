import { describe, expect, it } from 'vitest';
import { checkAction, legalActions } from '../legal';
import { applyAction } from '../reducer';
import { edit, key, makeContext, place, RICH, setResources, setTerrain, startedGame } from '../testing';
import { inRange, outpostLimit } from './build';

const ctx = makeContext(3);
const base = edit(startedGame(ctx), (d) => setResources(d, 0, RICH));
const V = key(0, 0, 0);

describe('Explorar (GDD 6.3)', () => {
  it('revela 1 hex oculto vizinho de um hex revelado do próprio tabuleiro e gasta 1 ação', () => {
    const target = key(0, 2, 0);
    const { state, events } = applyAction(ctx, base, { type: 'explore', player: 0, hex: target });
    expect(state.hexes[target]!.revealed).toBe(true);
    expect(state.actionsLeft).toBe(base.actionsLeft - 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hexRevealed', hex: target }));
  });

  it('recusa hex não vizinho, já revelado ou de outro tabuleiro', () => {
    expect(checkAction(ctx, base, { type: 'explore', player: 0, hex: key(0, 3, 0) })).toMatchObject({
      reason: { key: 'notAdjacentToRevealed' },
    });
    expect(checkAction(ctx, base, { type: 'explore', player: 0, hex: key(0, 1, 0) })).toMatchObject({
      reason: { key: 'alreadyRevealed' },
    });
    expect(checkAction(ctx, base, { type: 'explore', player: 0, hex: key(1, 2, 0) })).toMatchObject({
      reason: { key: 'notOwnBoard' },
    });
  });

  it('sem ações restantes, nenhuma ação que custa ação é legal', () => {
    const s = edit(base, (d) => {
      d.actionsLeft = 0;
    });
    expect(checkAction(ctx, s, { type: 'explore', player: 0, hex: key(0, 2, 0) })).toMatchObject({
      reason: { key: 'noActionsLeft' },
    });
    expect(
      legalActions(ctx, s, 0).every((a) => ['endPhase', 'bankTrade', 'proposeTrade'].includes(a.type)),
    ).toBe(true);
  });
});

describe('Sondar (GDD 4.2, 6.3)', () => {
  it('revela o subsolo só para quem sondou, dentro do raio, mesmo com superfície oculta', () => {
    const target = key(0, 2, 0);
    const { state, events } = applyAction(ctx, base, { type: 'survey', player: 0, hex: target });
    expect(state.hexes[target]!.surveyedBy).toEqual([0]);
    expect(state.hexes[target]!.revealed).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'subsoilSurveyed', player: 0 }));
    expect(checkAction(ctx, state, { type: 'survey', player: 0, hex: target })).toMatchObject({
      reason: { key: 'alreadySurveyed' },
    });
  });

  it('fora do raio é ilegal', () => {
    expect(checkAction(ctx, base, { type: 'survey', player: 0, hex: key(0, 3, 0) })).toMatchObject({
      reason: { key: 'outOfRange' },
    });
  });
});

describe('Raio de construção (GDD 6.5)', () => {
  it('Centro da Vila alcança raio 2', () => {
    expect(inRange(ctx, base, 0, base.hexes[key(0, 2, 0)]!)).toBe(true);
    expect(inRange(ctx, base, 0, base.hexes[key(0, 3, 0)]!)).toBe(false);
  });

  it('Posto de Observação estende o alcance; em Montanha, raio 4', () => {
    const plain = edit(base, (d) => {
      setTerrain(d, key(0, 2, 0), 'empty');
      place(d, key(0, 2, 0), 'outpost', 0);
    });
    expect(inRange(ctx, plain, 0, plain.hexes[key(0, -3, 3)]!)).toBe(false); // distância 4 do Posto
    expect(inRange(ctx, plain, 0, plain.hexes[key(0, 3, -1)]!)).toBe(true);

    const mountain = edit(base, (d) => {
      setTerrain(d, key(0, 2, 0), 'mountain');
      place(d, key(0, 2, 0), 'outpost', 0);
    });
    expect(inRange(ctx, mountain, 0, mountain.hexes[key(0, -2, 3)]!)).toBe(true); // distância 4
  });

  it('o raio não atravessa fronteira (DECISOES_ABERTAS D12)', () => {
    // Um Posto na borda alcançaria hexes do tabuleiro vizinho; mesmo assim é proibido.
    const s = edit(base, (d) => place(d, key(0, 3, 0), 'outpost', 0));
    const other = ctx.planet.neighbors({ boardId: 0, q: 3, r: 0 }).find((h) => h.boardId !== 0);
    expect(other).toBeDefined();
    expect(inRange(ctx, s, 0, s.hexes[`${other!.boardId}:${other!.q},${other!.r}`]!)).toBe(false);
  });
});

describe('Construir (GDD 6.3, 6.6, 11)', () => {
  const N = key(0, 1, 0);

  it('Parque em Floresta: paga o custo do nível 1 e gasta 1 ação', () => {
    const s = edit(base, (d) => setTerrain(d, N, 'forest'));
    const { state } = applyAction(ctx, s, { type: 'build', player: 0, structure: 'park', hex: N });
    expect(state.hexes[N]!.structures).toMatchObject([{ type: 'park', level: 1, owner: 0 }]);
    expect(state.players[0]!.resources.stone).toBe(50 - 2);
    expect(state.actionsLeft).toBe(base.actionsLeft - 1);
  });

  it('terreno errado, hex oculto e recurso insuficiente são recusados com motivo', () => {
    const s = edit(base, (d) => setTerrain(d, N, 'empty'));
    expect(checkAction(ctx, s, { type: 'build', player: 0, structure: 'park', hex: N })).toMatchObject({
      reason: { key: 'wrongTerrain' },
    });
    const hidden = edit(base, (d) => setTerrain(d, key(0, 2, 0), 'forest', undefined, false));
    expect(
      checkAction(ctx, hidden, { type: 'build', player: 0, structure: 'park', hex: key(0, 2, 0) }),
    ).toMatchObject({ reason: { key: 'hexHidden' } });
    const poor = edit(s, (d) => {
      setResources(d, 0, {});
      setTerrain(d, N, 'forest');
    });
    expect(checkAction(ctx, poor, { type: 'build', player: 0, structure: 'park', hex: N })).toMatchObject({
      reason: { key: 'cannotAfford' },
    });
  });

  it('o Centro da Vila não é construível', () => {
    expect(checkAction(ctx, base, { type: 'build', player: 0, structure: 'village', hex: N })).toMatchObject({
      reason: { key: 'notBuildable' },
    });
  });

  it('limite de 3 espaços por hex (a Vila ocupa 1) e uma estrutura de cada tipo por hex', () => {
    const s = edit(base, (d) => {
      place(d, V, 'workshop', 0);
      place(d, V, 'barracks', 0);
    });
    expect(checkAction(ctx, s, { type: 'build', player: 0, structure: 'wall', hex: V })).toMatchObject({
      reason: { key: 'hexFull' },
    });
    const one = edit(base, (d) => place(d, N, 'workshop', 0));
    expect(checkAction(ctx, one, { type: 'build', player: 0, structure: 'workshop', hex: N })).toMatchObject({
      reason: { key: 'duplicateInHex' },
    });
  });

  it('limite de Postos = nível da Vila + 1', () => {
    expect(outpostLimit(ctx, base, 0)).toBe(2);
    const s = edit(base, (d) => {
      place(d, key(0, 1, 0), 'outpost', 0);
      place(d, key(0, 0, 1), 'outpost', 0);
    });
    expect(
      checkAction(ctx, s, { type: 'build', player: 0, structure: 'outpost', hex: key(0, -1, 0) }),
    ).toMatchObject({ reason: { key: 'outpostLimit', params: { limit: 2 } } });
    const lvl2 = edit(s, (d) => {
      d.hexes[V]!.structures[0]!.level = 2;
    });
    expect(
      checkAction(ctx, lvl2, { type: 'build', player: 0, structure: 'outpost', hex: key(0, -1, 0) }).ok,
    ).toBe(true);
  });

  it('estruturas r2 (Mina, Arquivo, Mercado) exigem Universidade 2', () => {
    expect(checkAction(ctx, base, { type: 'build', player: 0, structure: 'market', hex: N })).toMatchObject({
      reason: { key: 'rarityLocked' },
    });
    const s = edit(base, (d) => place(d, V, 'university', 0, 2));
    expect(checkAction(ctx, s, { type: 'build', player: 0, structure: 'market', hex: N }).ok).toBe(true);
  });

  it('Mina exige subsolo sondado pelo jogador, não vazio e não esgotado (GDD 4.2)', () => {
    const uni = edit(base, (d) => {
      place(d, V, 'university', 0, 2);
      setTerrain(d, N, 'empty', 'sub_gold');
    });
    expect(checkAction(ctx, uni, { type: 'build', player: 0, structure: 'mine', hex: N })).toMatchObject({
      reason: { key: 'subsoilNotSurveyed' },
    });
    const surveyed = applyAction(ctx, uni, { type: 'survey', player: 0, hex: N }).state;
    const built = applyAction(ctx, surveyed, { type: 'build', player: 0, structure: 'mine', hex: N }).state;
    expect(built.hexes[N]!.structures[0]).toMatchObject({
      type: 'mine',
      tokens: ctx.balance.production.mineTokens,
    });

    const empty = edit(surveyed, (d) => {
      d.hexes[N]!.subsoil = 'sub_empty';
    });
    expect(checkAction(ctx, empty, { type: 'build', player: 0, structure: 'mine', hex: N })).toMatchObject({
      reason: { key: 'subsoilEmpty' },
    });
    const depleted = edit(surveyed, (d) => {
      d.hexes[N]!.depleted = true;
    });
    expect(checkAction(ctx, depleted, { type: 'build', player: 0, structure: 'mine', hex: N })).toMatchObject(
      {
        reason: { key: 'subsoilDepleted' },
      },
    );
  });
});

describe('Melhorar (GDD 6.3)', () => {
  const N = key(0, 1, 0);
  const withPark = edit(base, (d) => {
    setTerrain(d, N, 'forest');
    place(d, N, 'park', 0);
  });
  const parkUid = withPark.hexes[N]!.structures[0]!.uid;

  it('nível 2 exige Oficina; nível 3 exige Oficina 2', () => {
    expect(checkAction(ctx, withPark, { type: 'upgrade', player: 0, uid: parkUid })).toMatchObject({
      reason: { key: 'needsWorkshop', params: { level: 2 } },
    });
    const ws = edit(withPark, (d) => place(d, V, 'workshop', 0));
    const up = applyAction(ctx, ws, { type: 'upgrade', player: 0, uid: parkUid }).state;
    expect(up.hexes[N]!.structures[0]!.level).toBe(2);
    expect(up.players[0]!.resources).toMatchObject({ stone: 49, iron: 49 });
    const again = edit(up, (d) => {
      d.actionsLeft = 3;
    });
    expect(checkAction(ctx, again, { type: 'upgrade', player: 0, uid: parkUid })).toMatchObject({
      reason: { key: 'needsWorkshop', params: { level: 3 } },
    });
  });

  it('nível máximo e estrutura alheia são recusados', () => {
    const s = edit(base, (d) => place(d, V, 'wall', 0));
    const wallUid = s.hexes[V]!.structures[1]!.uid;
    expect(checkAction(ctx, s, { type: 'upgrade', player: 0, uid: wallUid })).toMatchObject({
      reason: { key: 'maxLevel' },
    });
    const villageOf1 = s.hexes[key(1, 0, 0)]!.structures[0]!.uid;
    expect(checkAction(ctx, s, { type: 'upgrade', player: 0, uid: villageOf1 })).toMatchObject({
      reason: { key: 'notYourStructure' },
    });
  });

  it('Oficina 3 dá desconto: tira 1 unidade do recurso mais valioso do custo', () => {
    const s = edit(withPark, (d) => place(d, V, 'workshop', 0, 3));
    const { state } = applyAction(ctx, s, { type: 'upgrade', player: 0, uid: parkUid });
    // Parque 2 custa 1 Pedregulho + 1 Ferro (valor 2 cada): sai 1 Ferro (último de maior valor).
    expect(state.players[0]!.resources).toMatchObject({ stone: 49, iron: 50 });
  });

  it('upgrade da Vila regenera 1 vida sem passar de 3 (GDD 13.2)', () => {
    const s = edit(base, (d) => {
      place(d, key(0, 1, 0), 'workshop', 0);
      d.players[0]!.villageLives = 1;
    });
    const vUid = s.hexes[V]!.structures[0]!.uid;
    const { state } = applyAction(ctx, s, { type: 'upgrade', player: 0, uid: vUid });
    expect(state.players[0]!.villageLives).toBe(2);
    expect(outpostLimit(ctx, state, 0)).toBe(3);
  });
});
