/**
 * Fase 10 — salvamento (UX_SPEC 9): o save é seed + versão + setup + log; refazer pelo log dá
 * exatamente o mesmo estado (checksum), e o arquivo inválido é recusado.
 */
import { describe, expect, it } from 'vitest';
import { createContext, replay } from '../engine';
import { makeContext, passTurn, startedGame } from '../engine/testing';
import { simData } from '../sim/run';
import { rulesOverride } from '../ui/game/params';
import { exportSave, makeSave, parseSave, stateChecksum } from '.';

describe('Save = log de ações', () => {
  const ctx = makeContext(3);
  const options = { seed: 31, layers: { cards: true, conflict: true, events: true } };
  let s = startedGame(ctx, options);
  for (let i = 0; i < 5; i++) s = passTurn(ctx, s).state;

  it('exportar → importar → refazer pelo log reproduz a partida exatamente', () => {
    const save = makeSave(s, { players: 3, seed: 31 }, 123);
    const back = parseSave(exportSave(save));
    expect(back).not.toBeNull();
    const rebuilt = replay(ctx, options, back?.log ?? []);
    expect(rebuilt).toEqual(s);
    expect(stateChecksum(rebuilt)).toBe(save.checksum);
    expect(back?.summary).toMatchObject({ round: s.round, factions: s.players.map((p) => p.faction) });
  });

  it('checksum muda quando o estado muda; arquivo inválido é recusado', () => {
    const other = passTurn(ctx, s).state;
    expect(stateChecksum(other)).not.toBe(stateChecksum(s));
    expect(parseSave('{"format":"outra coisa"}')).toBeNull();
    expect(parseSave('não é json')).toBeNull();
  });
});

describe('Regras da partida (UX_SPEC 2.3) viram sobreposição do balance.json', () => {
  it('ações por turno, limite de rodadas e trilha desligada', () => {
    const o = rulesOverride({
      actionsPerTurn: 4,
      roundLimit: 10,
      disabledTracks: ['gold', 'expansion', 'tribe'],
    });
    const ctx = createContext(simData(undefined, o), 3);
    expect(ctx.balance.turn.actionsPerTurn).toBe(4);
    expect(ctx.balance.turn.roundLimit).toBe(10);
    expect(ctx.balance.victory.resourceThresholds.gold).toBeGreaterThan(1000);
    expect(ctx.balance.victory.expansionHexes).toBeGreaterThan(1000);
    expect(ctx.balance.victory.tribeTarget.enabled).toBe(false);
    expect(startedGame(ctx, { seed: 1 }).actionsLeft).toBe(4);
    expect(rulesOverride(undefined)).toBeUndefined();
  });
});
