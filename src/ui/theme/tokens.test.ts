import { describe, expect, it } from 'vitest';
import factions from '../../../data/factions.json';
import resources from '../../../data/resources.json';
import { cssVariables, palette } from './tokens';

describe('tokens de tema (ART_DIRECTION 2)', () => {
  it('cores de recurso batem com data/resources.json', () => {
    for (const r of resources) {
      expect(palette.resource[r.id as keyof typeof palette.resource].color.toUpperCase()).toBe(
        r.color.toUpperCase(),
      );
    }
  });

  it('cores e símbolos de facção batem com data/factions.json', () => {
    for (const f of factions) {
      const token = palette.faction[f.id as keyof typeof palette.faction];
      expect(token.color.toUpperCase()).toBe(f.color.toUpperCase());
      expect(token.symbol).toBe(f.symbol);
    }
  });

  it('gera variáveis CSS para toda a paleta', () => {
    const vars = cssVariables();
    expect(vars['--frame-900']).toBe('#141A24');
    expect(vars['--accent-orange']).toBe('#FF7A1A');
    expect(vars['--resource-gold-color']).toBe('#E8B64A');
    expect(vars['--card-tech-headerFrom']).toBe('#2F5D86');
    expect(vars['--font-display']).toContain('Barlow Condensed');
  });
});
