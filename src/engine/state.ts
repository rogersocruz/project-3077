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

/** GDD 8.1: papéis de tropa. */
export type TroopType = 'line' | 'artillery';

export interface TroopState {
  readonly uid: number;
  readonly type: TroopType;
  level: number;
  readonly owner: PlayerId;
  /** Ordem de chegada ao hex (quem chegou por último é o atacante, se o ativo não luta ali). */
  arrived: number;
  /** GDD 8.4: cruzou fronteira nesta rodada (atacante −1). */
  crossedRound?: number;
  /** Deserção: não pode se mover nesta rodada. */
  rootedRound?: number;
  /** Reforço Orbital: +força até o fim da rodada. */
  bonusRound?: number;
  bonusAmount?: number;
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
  /** Estados com prazo de hazards e eventos (Fase 6). */
  status: HexStatus;
  /** Guardião parado no hex (força); bloqueia escavar e construir (interpretação AK). */
  guardian: number | null;
  /** Quem escavou a Ruína (uma vez por Ruína; o bônus passivo é dele — AN). */
  excavatedBy: PlayerId | null;
  /** GDD 8: tropas no hex (cada uma ocupa 1 espaço). */
  troops: TroopState[];
}

/**
 * Marcas com prazo num hex (GDD 4.3). "Até a rodada N" = vale enquanto round ≤ N.
 * Contaminação não tem prazo: sai quando alguém gasta as ações de limpeza.
 */
export interface HexStatus {
  /** Cinzas: o hex não produz. */
  ashUntil?: number;
  /** Geiser seco: sem bônus. */
  dryUntil?: number;
  /** Pântano contaminado: ações que faltam para limpar (sem bônus e sem produção). */
  contaminated?: number;
  /** Cânion: drones de quem tem estrutura aqui ficam no chão. */
  groundedUntil?: number;
  /** Porto fechado: sem bônus e spread dobrado de quem tem estrutura aqui. */
  closedUntil?: number;
  /** Anomalia invertida: cartas na área com efeito dobrado, sem escudo. */
  amplifiedUntil?: number;
  /** Crosta colapsada: subsolo selado (sem Mina). */
  sealedUntil?: number;
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
  /** GDD 13.2: Vila com 0 vidas — fora da partida (D11: sai da partida). */
  eliminated: boolean;
  /** GDD 5.4: tarifa de fronteira declarada (1 unidade por tropa que entra). */
  tariff: ResourceId;
  /** Rodada em que a tarifa mudou (uma vez por rodada — interpretação AR). */
  tariffRound: number;
  /** Recursos a mais na tarifa (cartas/tratados), teto `border.maxModifiers`. */
  tariffMods: ResourceId[];
  /** GDD 10: rodada da última proposta de tratado (uma por turno — interpretação BA). */
  treatyRound: number;
  /** Ações a perder no próximo turno (inadimplência e quebra de pacto fora do próprio turno). */
  actionDebt: number;
  /** GDD 12: facção (id de factions.json). Sem a camada de facções, só identidade visual. */
  readonly faction: string;
  /** GDD 13.1 Alvo de tribo: jogador-alvo sorteado (público); null sem a condição. */
  readonly tribeTarget: PlayerId | null;
  /** Quem deu o último dano à Vila ("por mão própria"; vazio = desastre/horda). */
  lastHitBy: PlayerId[];
  /** D11 "facção neutra": eliminado que segue jogando pela IA, sem poder vencer. */
  neutral: boolean;
  /** Raízes: rodada e quantos Sondar grátis já usou nela. */
  freeSurveyRound: number;
  freeSurveyUsed: number;
  /** Unidades compradas da banca na rodada `bankBoughtRound` (limite experimental). */
  bankBought: number;
  bankBoughtRound: number;
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
  | { readonly kind: 'deck'; readonly deck: DrawDeck }
  | { readonly kind: 'troop'; readonly uid: number };

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
  /** Baralho do Tesouro (GDD 4.3, Escavar) e o descarte dele. */
  treasure: CardUid[];
  treasureDiscard: CardUid[];
}

/** Eventos globais (GDD 9). */
export interface WorldState {
  /** Baralho ativo (ids de events.json), topo = 0. */
  deck: string[];
  /** Já revelados (voltam embaralhados quando o baralho acaba — interpretação AJ). */
  used: string[];
  /** Evento desta rodada. */
  current: string | null;
  /** Quem fez a contra-ação do evento desta rodada. */
  braced: PlayerId[];
  /** Veio Exposto: alguém já sondou nesta rodada. */
  firstSurveyDone: boolean;
  /**
   * Interpretação AQ: o que o evento com contra-ação tirou na Produção deste turno (Minas
   * paradas, Comida/recursos cortados). A contra-ação nas Ações devolve.
   */
  withheld: WithheldProduction[];
}

export interface WithheldProduction {
  readonly player: PlayerId;
  mines: number[];
  lost: Partial<Resources>;
}

/** Escolha em dois passos que trava a partida até ser resolvida. */
export type PendingChoice = TutorChoice | CasualtyChoice;

export interface TutorChoice {
  readonly kind: 'tutor';
  readonly player: PlayerId;
  /** A carta que pediu a escolha (Requisição Prioritária). */
  readonly card: CardUid;
  readonly deck: DrawDeck;
  /** Cartas vistas (continuam no topo do baralho até a escolha). */
  readonly options: CardUid[];
}

/** GDD 8.4 passo 4: o perdedor escolhe quais tropas perde (força removida ≥ `need`). */
export interface CasualtyChoice {
  readonly kind: 'casualties';
  readonly player: PlayerId;
  readonly hex: HexKey;
  readonly need: number;
  /** Tropas do perdedor no hex e a força com que lutaram. */
  readonly options: { readonly uid: number; readonly strength: number }[];
}

/** Fase 6 em andamento: hexes já resolvidos e Artilharias que já apoiaram neste turno. */
export interface CombatPhase {
  done: HexKey[];
  supportUsed: number[];
  /** Escolhas de baixas ainda a fazer (a primeira está em `pending`). */
  queue?: {
    readonly hex: HexKey;
    readonly player: PlayerId;
    readonly need: number;
    readonly options: { readonly uid: number; readonly strength: number }[];
  }[];
}

// ── Tratados (GDD 10) ────────────────────────────────────────────────────────

/** Papéis de treaties.json → contract: me = quem propôs, you = quem recebeu a proposta. */
export type TreatySubject = 'me' | 'you' | 'anySignatory' | 'third' | 'anyone';
export type TreatyVictim = 'me' | 'you' | 'eitherSignatory' | 'otherSignatory' | 'third' | 'anyone';
export type TreatyObligor = 'me' | 'you' | 'actor' | 'otherSignatory';

/** Contrato SE (gatilho) → ENTÃO (consequência). */
export interface ContractTerms {
  readonly kind: 'contract';
  readonly subject: TreatySubject;
  /** "SE NÃO": dispara se o sujeito não fizer até o prazo. */
  readonly negated: boolean;
  readonly verb: string;
  readonly object: string;
  readonly of: TreatyVictim;
  readonly obligor: TreatyObligor;
  readonly consequence: string;
  readonly target: string;
  readonly resource?: ResourceId;
  readonly amount?: number;
  /** Pagamento multiplicado pelas tropas do gatilho (Tarifa Preferencial). */
  readonly perTroop?: boolean;
  /** NÃO PODE: por quantas rodadas. */
  readonly rounds?: number;
  /** ENTREGA permanente: qual (do obrigado, escolhido na proposta). */
  readonly permanent?: CardUid;
  /** Modelo pronto de origem (treaties.json → templates). */
  readonly template?: string;
}

export interface PactTerms {
  readonly kind: 'pact';
  readonly pact: string;
  /** Preço Fixo: recurso e preço em Ouro por unidade. */
  readonly resource?: ResourceId;
  readonly price?: number;
  readonly template?: string;
}

export type TreatyTerms = ContractTerms | PactTerms;

export interface TreatyProposal {
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly terms: TreatyTerms;
}

export interface Treaty {
  readonly id: number;
  /** [quem propôs, quem aceitou]: resolve os papéis me/you. */
  readonly parties: readonly [PlayerId, PlayerId];
  readonly terms: TreatyTerms;
  readonly signedRound: number;
  /** Vale até o fim desta rodada (contrato com "SE NÃO": prazo). */
  readonly until: number;
  /** Pacto de comércio: rodada do último uso de cada signatário (na ordem de `parties`). */
  used?: [number, number];
}

/** Consequência NÃO PODE em vigor: `player` não faz `verb` contra `against` até `until`. */
export interface TreatyRestriction {
  readonly treaty: number;
  readonly player: PlayerId;
  readonly against: PlayerId;
  readonly verb: string;
  readonly until: number;
}

export interface TreatiesState {
  active: Treaty[];
  restrictions: TreatyRestriction[];
  pending: TreatyProposal | null;
  nextId: number;
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
  treaties: TreatiesState;
  cards: CardsState;
  pending: PendingChoice | null;
  world: WorldState;
  /** Combate do turno em andamento (null fora da fase 6). */
  combat: CombatPhase | null;
  /** Variantes de laboratório (GameOptions.playToRoundLimit); ausente em partida normal. */
  readonly variant?: { readonly playToRoundLimit?: boolean };
  /** GDD 13.2 / D11: o que acontece com o eliminado (opção do setup). */
  readonly eliminatedRule: 'leave' | 'neutral';
  winners: PlayerId[];
  endReason: 'condition' | 'roundLimit' | null;
  log: Action[];
}
