/**
 * Modelo da face da carta (ART_DIRECTION 4): tudo que o SVG desenha, derivado dos dados
 * (cards.json, treaties.json). Puro e testado; o componente só desenha.
 */
import type { GameData } from '../../data/schemas';
import type { ResourceAmounts } from '../../engine/queries';
import type { CardCategoryKey } from '../theme/tokens';

type CardDef = GameData['cards'][number];
type TreatyTemplate = GameData['treaties']['templates'][number];

/** Texto da fita do tipo (i18n `cards.ribbon.<chave>`). */
export type RibbonKey = 'tech' | 'delivered' | 'own' | 'contract' | 'pact' | 'relic' | 'treasure';

/** Motivo da ilustração substituta (ART_DIRECTION 10: arte entra depois, por manifesto). */
export type Motif =
  'troop' | 'structure' | 'resource' | 'pact' | 'subsoil' | 'hex' | 'card' | 'device' | 'artifact';

export type CostItem =
  | { readonly kind: 'resources'; readonly amounts: ResourceAmounts }
  | { readonly kind: 'choice'; readonly options: readonly ResourceAmounts[] }
  | { readonly kind: 'discard'; readonly n: number }
  | { readonly kind: 'actions'; readonly n: number };

export interface CardFace {
  readonly id: string;
  readonly title: string;
  readonly category: CardCategoryKey;
  readonly ribbon: RibbonKey;
  /** Selo de nível (n1–n3); null = sem selo (Tesouro, Contrato). */
  readonly tier: 1 | 2 | 3 | null;
  readonly cost: readonly CostItem[];
  /** Texto de efeito; `**trecho**` sai em negrito. */
  readonly text: string;
  readonly motif: Motif;
  /** Variação da ilustração (hash do id). */
  readonly seed: number;
}

/** FNV-1a: semente estável a partir do id. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** GDD 7.1: categoria (cor da moldura) pelo momento em que a carta resolve. */
export function cardCategory(def: CardDef): CardCategoryKey {
  if (def.type === 'tech') return 'tech';
  if (def.type === 'relic' || def.type === 'treasure') return 'relic';
  return def.timing === 'delivered' ? 'delivered' : 'own';
}

function ribbonOf(def: CardDef): RibbonKey {
  if (def.type === 'treasure') return 'treasure';
  if (def.type === 'relic') return 'relic';
  if (def.type === 'tech') return 'tech';
  return def.timing === 'delivered' ? 'delivered' : 'own';
}

function motifOf(def: CardDef): Motif {
  if (def.type === 'tech') return 'device';
  if (def.type === 'relic' || def.type === 'treasure') return 'artifact';
  switch (def.target) {
    case 'troop':
    case 'structure':
    case 'resource':
    case 'subsoil':
    case 'hex':
    case 'card':
      return def.target;
    case 'player':
      return 'pact';
    case 'permanent':
      return 'device';
  }
}

/** Linha de custo na ordem das cartas físicas: recursos (ou alternativas), descarte, ações. */
export function costItems(cost: CardDef['cost']): CostItem[] {
  const out: CostItem[] = [];
  if (cost.resources && Object.values(cost.resources).some((n) => (n ?? 0) > 0)) {
    out.push({ kind: 'resources', amounts: cost.resources });
  }
  if (cost.resourcesAny) out.push({ kind: 'choice', options: cost.resourcesAny });
  if (cost.discard) out.push({ kind: 'discard', n: cost.discard });
  if (cost.actions) out.push({ kind: 'actions', n: cost.actions });
  return out;
}

export function faceOfCard(def: CardDef): CardFace {
  return {
    id: def.id,
    title: def.name,
    category: cardCategory(def),
    ribbon: ribbonOf(def),
    tier: def.tier,
    cost: costItems(def.cost),
    text: def.effect,
    motif: motifOf(def),
    seed: hashId(def.id),
  };
}

/**
 * Contrato/Pacto (Fase 8 traz o motor; a face já sai daqui). Custo: Ouro de cada
 * participante no aceite (GDD 10). O texto do pacto vem da lista de pactos.
 */
export function faceOfTreaty(tpl: TreatyTemplate, data: GameData): CardFace {
  const text =
    tpl.type === 'contract' ? tpl.text : (data.treaties.pacts.find((p) => p.id === tpl.pact)?.text ?? '');
  const gold = data.balance.treaties.goldCostEach;
  return {
    id: tpl.id,
    title: tpl.name,
    category: 'contract',
    ribbon: tpl.type === 'contract' ? 'contract' : 'pact',
    tier: null,
    cost: gold > 0 ? [{ kind: 'resources', amounts: { gold } }] : [],
    text,
    motif: 'pact',
    seed: hashId(tpl.id),
  };
}

/** "1.0.0" → "v1.0" (etiqueta de versão no canto da carta). */
export function versionTag(rulesVersion: string): string {
  const [major = '0', minor = '0'] = rulesVersion.split('.');
  return `v${major}.${minor}`;
}
