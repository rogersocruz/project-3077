/**
 * Estado da partida. Só dados simples (serializável em JSON): o salvamento é
 * seed + log, e o determinismo é checado comparando estados com toEqual.
 */
import type { ResourceId } from '../data/schemas';
import type { Action } from './actions';

export type Resources = Record<ResourceId, number>;
export type PlayerId = number;
/** Chave de hex: `${boardId}:${q},${r}` (hex.ts → boardHexKey). */
export type HexKey = string;

/** Camadas de regra (GDD 14). Economia é sempre ligada. */
export interface RuleLayers {
  readonly economy: true;
  readonly events: boolean;
  readonly specialHexes: boolean;
  readonly cards: boolean;
  readonly conflict: boolean;
  readonly artillery: boolean;
  readonly treaties: boolean;
  readonly factions: boolean;
}

export type LayerName = Exclude<keyof RuleLayers, 'economy'>;

export const DEFAULT_LAYERS: RuleLayers = {
  economy: true,
  events: false,
  specialHexes: false,
  cards: false,
  conflict: false,
  artillery: false,
  treaties: false,
  factions: false,
};

export interface StructureState {
  /** Identificador único na partida (ordem de construção). */
  readonly uid: number;
  readonly type: string;
  level: number;
  readonly owner: PlayerId;
  /** Mina: tokens de esgotamento restantes (GDD 4.2). */
  tokens?: number;
  /** Mina: não pagou Carvão na Manutenção, não produz na próxima Produção (GDD 6.2). */
  idle?: boolean;
  /** Pane Induzida: não produz na Produção desta rodada. */
  noProduceRound?: number;
  /** Bomba de Íons: desligada (não produz nem paga manutenção) até o fim desta rodada. */
  offlineRound?: number;
  /** Sobrecarga: já produziu em dobro; fica inativa na próxima Produção do dono. */
  overloaded?: boolean;
}

/** Subsolo selado (Colapso de Galeria): o dono do tabuleiro limpa gastando ações. */
export interface SubsoilSeal {
  readonly clearActions: number;
}

export interface HexState {
  readonly boardId: number;
  readonly q: number;
  readonly r: number;
  /** id de terreno: superfície comum, sítio ou hazard (tiles.json). */
  surface: string;
  /** id de subsolo (tiles.json → subsoil). */
  subsoil: string;
  revealed: boolean;
  /** Quem sondou o subsolo (DECISOES_ABERTAS D10: privado). */
  surveyedBy: PlayerId[];
  /** Subsolo esgotado por Mina que zerou os tokens. */
  depleted: boolean;
  /** Colapso de Galeria: Mina não produz nem é construída enquanto houver selo. */
  seal: SubsoilSeal | null;
  /** Terraformação: produção extra por recurso das estruturas de superfície. */
  yieldBonus: number;
  structures: StructureState[];
}

export interface PlayerState {
  readonly id: PlayerId;
  /** Tabuleiro do jogador (= assento). */
  readonly boardId: number;
  resources: Resources;
  villageHex: HexKey | null;
  villageLives: number;
  /** GDD 3.2 passo 6: compensação por ficar sem hex especial. */
  compensation: 'none' | 'pending' | 'done';
  /** Mão (privada; a contagem é pública). */
  hand: CardUid[];
  /** GDD 7.4: slots fixos e públicos de permanentes; null = vazio. */
  permanents: (CardUid | null)[];
  /** Cartas entregues por outros, na ordem de entrega; viram na Revelação (fase 1). */
  incoming: DeliveredCard[];
  /** GDD 7.1: teto de recebimento por rodada. */
  receivedThisRound: number;
  /** GDD 6.2 fase 7: entregas feitas neste turno. */
  deliveredThisTurn: number;
}

// ── Cartas (GDD 7) ───────────────────────────────────────────────────────────

/** Instância de carta: índice em `CardsState.defs`. */
export type CardUid = number;
export type DrawDeck = 'n1' | 'n2' | 'n3';
export const DRAW_DECKS: readonly DrawDeck[] = ['n1', 'n2', 'n3'];

/** Alvo escolhido para uma carta; o efeito diz qual tipo aceita. */
export type CardTarget =
  | { readonly kind: 'hex'; readonly hex: HexKey }
  | { readonly kind: 'structure'; readonly uid: number }
  | { readonly kind: 'player'; readonly player: PlayerId }
  | { readonly kind: 'resource'; readonly resource: ResourceId }
  | { readonly kind: 'permanent'; readonly player: PlayerId; readonly card: CardUid }
  | { readonly kind: 'deck'; readonly deck: DrawDeck };

/** Carta entregue esperando a Revelação do destinatário (interpretação X: alvo na entrega). */
export interface DeliveredCard {
  readonly card: CardUid;
  readonly from: PlayerId;
  readonly round: number;
  readonly target?: CardTarget;
  /** Espionagem: permanente do remetente a descartar se faltar slot (interpretação AF). */
  readonly sacrifice?: CardUid;
}

export interface CardsState {
  /** uid → id da carta (cards.json). Fixo depois do setup. */
  readonly defs: string[];
  /** Pilhas de compra; índice 0 = topo. */
  decks: Record<DrawDeck, CardUid[]>;
  discards: Record<DrawDeck, CardUid[]>;
  /** Fora do jogo: permanentes removidos (GDD 7.4). */
  removed: CardUid[];
}

/** Escolha em dois passos que trava a partida até ser resolvida. */
export interface PendingChoice {
  readonly kind: 'tutor';
  readonly player: PlayerId;
  /** A carta que pediu a escolha (Requisição Prioritária). */
  readonly card: CardUid;
  readonly deck: DrawDeck;
  /** Cartas vistas (continuam no topo do baralho até a escolha). */
  readonly options: CardUid[];
}

export interface TradeOffer {
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly give: Partial<Resources>;
  readonly receive: Partial<Resources>;
}

export const TURN_PHASES = [
  'reveal',
  'draw',
  'production',
  'upkeep',
  'actions',
  'combat',
  'delivery',
] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];

export type Stage = 'setup' | 'playing' | 'over';

export interface GameState {
  readonly rulesVersion: string;
  readonly seed: number;
  rngState: number;
  readonly layers: RuleLayers;
  readonly longMap: boolean;
  readonly playerCount: number;
  stage: Stage;
  round: number;
  activePlayer: PlayerId;
  phase: TurnPhase;
  actionsLeft: number;
  players: PlayerState[];
  hexes: Record<HexKey, HexState>;
  nextUid: number;
  pendingTrade: TradeOffer | null;
  cards: CardsState;
  pending: PendingChoice | null;
  winners: PlayerId[];
  endReason: 'condition' | 'roundLimit' | null;
  log: Action[];
}
