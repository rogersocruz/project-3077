/**
 * Aplica as configurações de tela e acessibilidade (UX_SPEC 3.1 e 3.5) na raiz do documento:
 * escala da interface, tamanho de texto, alto contraste e modo daltônico.
 *
 * Modo daltônico: troca as cores de facção e de recurso por uma paleta segura para
 * deuteranopia, protanopia e tritanopia (base Okabe–Ito; validada com o validador da skill de
 * visualização: separação ΔE ≥ 8 em todos os pares para deutan/protan, ≥ 6,8 para tritan). A
 * forma do token (recurso) e o símbolo (facção) continuam como segunda pista — as cores não
 * são a única informação. A paleta JS também muda (a cena 3D é remontada pela chave).
 */
import type { AccessibilitySettings, ColorMode, RenderSettings } from '../../settings';
import { cssVariables, type FactionKey, palette, type ResourceKey } from './tokens';

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

/** Cores originais (ART_DIRECTION 2.4 e 2.5), guardadas para voltar do modo daltônico. */
const ORIGINAL = {
  faction: Object.fromEntries(Object.entries(palette.faction).map(([k, v]) => [k, v.color])) as Record<
    FactionKey,
    string
  >,
  resource: Object.fromEntries(Object.entries(palette.resource).map(([k, v]) => [k, v.color])) as Record<
    ResourceKey,
    string
  >,
};

/** Paleta segura (mesma para os três tipos; o reforço é forma + símbolo). */
const SAFE = {
  faction: {
    revolutionaries: '#D55E00',
    government: '#0072B2',
    helix: '#E69F00',
    vantage: '#56B4E9',
    pirates: '#F0E442',
    natives: '#009E73',
  } satisfies Record<FactionKey, string>,
  resource: {
    food: '#009E73',
    stone: '#EDEDED',
    iron: '#56B4E9',
    coal: '#3D3B38',
    oil: '#D55E00',
    gold: '#F0E442',
  } satisfies Record<ResourceKey, string>,
};

/** Troca as cores da paleta (JS e variáveis CSS). Devolve true se algo mudou. */
export function applyColorMode(mode: ColorMode): boolean {
  const target = mode === 'normal' ? ORIGINAL : SAFE;
  const p = palette as unknown as Mutable<typeof palette>;
  let changed = false;
  for (const k of Object.keys(target.faction) as FactionKey[]) {
    if (p.faction[k].color !== target.faction[k]) changed = true;
    p.faction[k].color = target.faction[k] as never;
  }
  for (const k of Object.keys(target.resource) as ResourceKey[]) {
    if (p.resource[k].color !== target.resource[k]) changed = true;
    p.resource[k].color = target.resource[k] as never;
  }
  if (typeof document !== 'undefined') {
    for (const [name, value] of Object.entries(cssVariables()))
      document.documentElement.style.setProperty(name, value);
  }
  return changed;
}

/** Escala da interface, texto, contraste e cores. */
export function applyDisplay(render: RenderSettings, a: AccessibilitySettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(render.uiScale));
  root.style.setProperty('--text-scale', String(a.textScale));
  root.dataset['contrast'] = a.highContrast ? 'high' : 'normal';
  root.dataset['colorMode'] = a.colorMode;
  applyColorMode(a.colorMode);
}
