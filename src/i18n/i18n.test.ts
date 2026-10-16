import { describe, expect, it } from 'vitest';
import en from './en.json';
import ptBR from './pt-BR.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n', () => {
  it('pt-BR e en têm exatamente as mesmas chaves', () => {
    expect(keys(en).sort()).toEqual(keys(ptBR).sort());
  });

  it('nenhum texto vazio', () => {
    for (const dict of [ptBR, en]) {
      const walk = (o: object): void =>
        Object.values(o).forEach((v) => (typeof v === 'string' ? expect(v.trim()).not.toBe('') : walk(v)));
      walk(dict);
    }
  });
});
