/**
 * Face da carta (ART_DIRECTION 4): modelo derivado dos dados e layout do texto.
 * O desenho em si é conferido por captura de tela (galeria `?view=cards`).
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../data';
import en from '../../i18n/en.json';
import ptBR from '../../i18n/pt-BR.json';
import { fitLine, layoutText, type Measure, parseRich, words, wrap } from './layout';
import { approxMeasurer } from './measure';
import { cardCategory, costItems, faceOfCard, faceOfTreaty, hashId, versionTag } from './model';

const data = loadGameData();
const card = (id: string) => {
  const c = data.cards.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

/** Medida fixa: 10 por caractere (negrito 11), para contas exatas. */
const mono: Measure = (text, bold) => text.length * (bold ? 11 : 10);

describe('modelo da face', () => {
  it('categoria pela hora de resolver (GDD 7.1): própria, entregue, tecnologia, relíquia', () => {
    expect(cardCategory(card('strategic_retreat'))).toBe('own');
    expect(cardCategory(card('ion_bomb'))).toBe('delivered');
    expect(cardCategory(card('tech_orbital_logistics'))).toBe('tech');
    expect(cardCategory(card('relic_nav_core'))).toBe('relic');
    expect(cardCategory(card('treasure_cache'))).toBe('relic');
    expect(faceOfCard(card('treasure_cache')).ribbon).toBe('treasure');
  });

  it('linha de custo: recursos, alternativas (Drone), descarte e ações', () => {
    expect(costItems(card('gallery_collapse').cost)).toEqual([
      { kind: 'resources', amounts: { coal: 1 } },
      { kind: 'discard', n: 1 },
    ]);
    expect(costItems(card('drone_1').cost)).toEqual([{ kind: 'choice', options: [{ coal: 2 }, { oil: 1 }] }]);
    expect(costItems(card('tech_silos').cost)).toEqual([
      { kind: 'resources', amounts: { stone: 1 } },
      { kind: 'actions', n: 1 },
    ]);
    expect(costItems(card('thermal_sweep').cost)).toEqual([]);
  });

  it('Contrato vem do modelo de tratado, sem selo de nível, custando o Ouro do aceite (GDD 10)', () => {
    const tpl = data.treaties.templates.find((t) => t.id === 'tpl_preferential_tariff');
    if (!tpl) throw new Error('modelo');
    const face = faceOfTreaty(tpl, data);
    expect(face).toMatchObject({ category: 'contract', ribbon: 'contract', tier: null, motif: 'pact' });
    expect(face.cost).toEqual([{ kind: 'resources', amounts: { gold: data.balance.treaties.goldCostEach } }]);
  });

  it('semente estável por id e etiqueta de versão curta', () => {
    expect(hashId('ion_bomb')).toBe(hashId('ion_bomb'));
    expect(hashId('ion_bomb')).not.toBe(hashId('drone_1'));
    expect(versionTag('1.0.0')).toBe('v1.0');
  });

  it('toda fita, verso e rótulo da carta tem texto nos dois idiomas', () => {
    for (const dict of [ptBR, en]) {
      const cards = dict.cards as Record<string, unknown>;
      for (const k of ['tech', 'delivered', 'own', 'contract', 'pact', 'relic', 'treasure']) {
        expect((cards['ribbon'] as Record<string, string>)[k], k).toBeTruthy();
      }
      expect(cards['or']).toBeTruthy();
      expect(cards['free']).toBeTruthy();
    }
  });
});

describe('texto da carta (layout)', () => {
  it('**trecho** e palavra-chave em MAIÚSCULAS saem em negrito (ART_DIRECTION 3)', () => {
    expect(parseRich('A **dobro** b')).toEqual([
      { text: 'A ', bold: false },
      { text: 'dobro', bold: true },
      { text: ' b', bold: false },
    ]);
    const w = words('consomem CARVÃO naquele **hex**.');
    expect(w.map((x) => x.map((p) => p.bold))).toEqual([[false], [true], [false], [true, false]]);
    expect(words('SE um TERRITÓRIO, ENTÃO')[3]).toEqual([{ text: 'ENTÃO', bold: true }]);
  });

  it('quebra gulosa respeita a largura; pontuação colada ao negrito fica na mesma palavra', () => {
    const lines = wrap('aaa bbb ccc **dd**.', 75, 10, mono);
    // "aaa bbb" = 70; "ccc dd." = 30 + 10 + 22 + 10 = 72
    expect(lines.map((l) => l.map((p) => p.text).join('|'))).toEqual(['aaa|bbb', 'ccc|dd|.']);
    const last = lines[1] ?? [];
    expect(last.map((p) => p.x)).toEqual([0, 40, 62]);
  });

  it('reduz a fonte até caber no número de linhas; sinaliza se nem a menor coube', () => {
    const measure: Measure = (t, b, size) => t.length * size * (b ? 0.6 : 0.5);
    const text = 'um texto de efeito comprido o bastante para precisar de várias linhas na carta';
    const fit = layoutText(text, {
      width: 200,
      maxLines: 4,
      sizes: [30, 24, 18, 12],
      lineHeight: 1.2,
      measure,
    });
    expect(fit.overflow).toBe(false);
    expect(fit.lines.length).toBeLessThanOrEqual(4);
    expect(fit.fontSize).toBeLessThan(30);
    const tight = layoutText(text, { width: 60, maxLines: 2, sizes: [20, 10], lineHeight: 1.2, measure });
    expect(tight.overflow).toBe(true);
    const sized: Measure = (t, _b, size) => t.length * size * 0.5;
    expect(fitLine('TÍTULO', 60, [20, 10, 8], true, sized)).toBe(20);
    expect(fitLine('TÍTULO', 40, [20, 10, 8], true, sized)).toBe(10);
    expect(fitLine('TÍTULO LONGO DEMAIS', 50, [20, 10], true, sized)).toBe(10);
  });

  it('todo texto de efeito dos dados cabe em 5 linhas na carta (medida aproximada)', () => {
    for (const c of data.cards) {
      const block = layoutText(c.effect, {
        width: 526,
        maxLines: 5,
        sizes: [31, 29, 27, 25, 23, 21],
        lineHeight: 1.22,
        measure: approxMeasurer.body,
      });
      expect(block.overflow, c.id).toBe(false);
    }
  });
});
