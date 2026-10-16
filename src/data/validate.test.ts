import { describe, expect, it } from 'vitest';
import { RAW_DATA } from './index';
import { cardCostPoints, formatPath, type RawDataFiles, validateGameData } from './validate';

const clone = (): RawDataFiles => structuredClone(RAW_DATA);
const errorsOf = (raw: RawDataFiles) => validateGameData(raw).issues.filter((i) => i.severity === 'error');

describe('data — validação dos JSON reais', () => {
  it('data/*.json atuais são válidos (sem erros)', () => {
    const { data, issues } = validateGameData(RAW_DATA);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(data).not.toBeNull();
  });

  it('avisos de faixa de custo são exatamente as cartas de DECISOES_ABERTAS D9', () => {
    const warned = validateGameData(RAW_DATA)
      .issues.filter((i) => i.severity === 'warning')
      .map((i) => i.message.match(/^"(.+?)"/)?.[1])
      .sort();
    expect(warned).toEqual(
      [
        'Blindagem Sísmica',
        'Engenharia Reversa',
        'Espionagem Industrial',
        'Pesquisa Avançada',
        'Propulsão Antigrav',
        'Requisição Prioritária',
      ].sort(),
    );
  });
});

describe('data — erros apontam o caminho do campo', () => {
  it('recurso inexistente no custo de carta', () => {
    const raw = clone();
    (raw['cards.json'] as { cost: { resources: Record<string, number> } }[])[0]!.cost.resources = { gld: 1 };
    expect(errorsOf(raw)).toContainEqual(
      expect.objectContaining({ file: 'cards.json', path: '[0].cost.resources.gld' }),
    );
  });

  it('campo com nome errado (objeto estrito)', () => {
    const raw = clone();
    (raw['balance.json'] as { turn: Record<string, number> }).turn.actionPerTurn = 3;
    expect(errorsOf(raw)).toContainEqual(
      expect.objectContaining({ file: 'balance.json', path: '.turn.actionPerTurn' }),
    );
  });

  it('tipo errado', () => {
    const raw = clone();
    (raw['balance.json'] as { turn: Record<string, unknown> }).turn.roundLimit = '15';
    expect(errorsOf(raw)).toContainEqual(
      expect.objectContaining({ file: 'balance.json', path: '.turn.roundLimit' }),
    );
  });

  it('referência cruzada: estrutura construída em terreno inexistente', () => {
    const raw = clone();
    (raw['structures.json'] as { buildOn?: string[] }[])[1]!.buildOn = ['floresta'];
    expect(errorsOf(raw)).toContainEqual(
      expect.objectContaining({ file: 'structures.json', path: '[1].buildOn[0]' }),
    );
  });

  it('referência cruzada: evento mira terreno inexistente', () => {
    const raw = clone();
    (raw['events.json'] as { terrainTargets: string[] }[])[0]!.terrainTargets = ['atlantis'];
    expect(errorsOf(raw)).toContainEqual(
      expect.objectContaining({ file: 'events.json', path: '[0].terrainTargets[0]' }),
    );
  });

  it('id repetido', () => {
    const raw = clone();
    const cards = raw['cards.json'] as { id: string }[];
    cards[1]!.id = cards[0]!.id;
    expect(errorsOf(raw)).toContainEqual(expect.objectContaining({ file: 'cards.json', path: '[1].id' }));
  });

  it('valor duplicado incoerente entre balance.json e structures.json', () => {
    const raw = clone();
    (raw['balance.json'] as { production: { mineTokens: number } }).production.mineTokens = 9;
    expect(errorsOf(raw)).toContainEqual(expect.objectContaining({ file: 'structures.json' }));
  });

  it('caminho provisório inexistente', () => {
    const raw = clone();
    (raw['balance.json'] as { provisional: string[] }).provisional.push('turn.naoExiste');
    expect(errorsOf(raw)).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/^\.provisional/) }));
  });

  it('layout com contagem errada de tabuleiros', () => {
    const raw = clone();
    (raw['layouts.json'] as { layouts: Record<string, unknown[]> }).layouts['3']!.pop();
    expect(errorsOf(raw)).toContainEqual(expect.objectContaining({ file: 'layouts.json' }));
  });
});

describe('data — utilidades', () => {
  it('formatPath', () => {
    expect(formatPath([12, 'cost', 'resources', 'gld'])).toBe('[12].cost.resources.gld');
    expect(formatPath(['layouts', '3'])).toBe('.layouts["3"]');
  });

  it('cardCostPoints (GDD 7.3): recurso + descarte, alternativa mais barata', () => {
    const points = { food: 1, stone: 2, iron: 2, coal: 3, oil: 6, gold: 6, discardCard: 2, opponentDraws: 3, action: 3 };
    expect(cardCostPoints({ resources: { oil: 1 }, discard: 2 }, points)).toBe(10);
    expect(cardCostPoints({ resourcesAny: [{ coal: 2 }, { oil: 1 }] }, points)).toBe(6);
    expect(cardCostPoints({ actions: 1, resources: { iron: 3 } }, points)).toBe(6);
    expect(cardCostPoints({}, points)).toBe(0);
  });
});
