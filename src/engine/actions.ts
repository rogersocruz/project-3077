/**
 * Ações de jogador (união discriminada). Toda ação diz quem age; o motor confere
 * em legal.ts se esse jogador pode agir agora.
 */
import type { ResourceId } from '../data/schemas';
import type { CardTarget, CardUid, HexKey, PlayerId, Resources } from './state';

/**
 * Carta da mão usada junto com outra ação (Drone com Sondar/Construir, Contrato de Obra
 * com Construir), com o pagamento dela.
 */
export interface CardUse {
  readonly card: CardUid;
  /** Índice da alternativa em `cost.resourcesAny`. */
  readonly payment?: number;
  /** Cartas da mão descartadas como custo (`cost.discard`). */
  readonly discard?: readonly CardUid[];
}

export type Action =
  /** GDD 3.2 passo 6: escolhe uma das opções de setup.noSpecialCompensation. */
  | { type: 'chooseCompensation'; player: PlayerId; option: number; resources?: Partial<Resources> }
  /** GDD 3.2 passo 7. */
  | { type: 'chooseVillage'; player: PlayerId; hex: HexKey }
  /** GDD 6.4: linha da tabela da Universidade (só quando há mais de uma). */
  | { type: 'chooseDraw'; player: PlayerId; row: number }
  /** GDD 6.3. Drone (GDD 6.5) vai junto com Sondar ou Construir. */
  | { type: 'explore'; player: PlayerId; hex: HexKey }
  | { type: 'survey'; player: PlayerId; hex: HexKey; drone?: CardUse }
  | {
      type: 'build';
      player: PlayerId;
      structure: string;
      hex: HexKey;
      drone?: CardUse;
      /** Contrato de Obra: paga metade do custo (interpretação AH). */
      halfCost?: CardUse;
    }
  | { type: 'upgrade'; player: PlayerId; uid: number }
  /** GDD 5.2: entrega `amount` de `give` e recebe o quanto o crédito comprar de `receive`. */
  | { type: 'bankTrade'; player: PlayerId; give: ResourceId; amount: number; receive: ResourceId }
  /** GDD 5.3. */
  | {
      type: 'proposeTrade';
      player: PlayerId;
      to: PlayerId;
      give: Partial<Resources>;
      receive: Partial<Resources>;
    }
  /**
   * GDD 5.3: o destinatário contrapropõe. Substitui a proposta pendente por outra no
   * sentido inverso (interpretação O da Fase 3): agora quem responde é quem propôs.
   */
  | { type: 'counterTrade'; player: PlayerId; give: Partial<Resources>; receive: Partial<Resources> }
  | { type: 'acceptTrade'; player: PlayerId }
  | { type: 'rejectTrade'; player: PlayerId }
  | { type: 'cancelTrade'; player: PlayerId }
  /** GDD 7.1: carta própria, na fase de Ações. */
  | {
      type: 'playCard';
      player: PlayerId;
      card: CardUid;
      target?: CardTarget;
      payment?: number;
      discard?: readonly CardUid[];
    }
  /** GDD 7.4: instala tecnologia/relíquia; com slots cheios, `replace` sai do jogo. */
  | {
      type: 'installPermanent';
      player: PlayerId;
      card: CardUid;
      replace?: CardUid;
      payment?: number;
      discard?: readonly CardUid[];
    }
  /** Colapso de Galeria: o dono do tabuleiro remove o selo gastando ações. */
  | { type: 'clearSeal'; player: PlayerId; hex: HexKey }
  /** GDD 6.2 fase 7: entrega 1 carta a outro jogador (alvo escolhido na entrega). */
  | {
      type: 'deliverCard';
      player: PlayerId;
      card: CardUid;
      to: PlayerId;
      target?: CardTarget;
      sacrifice?: CardUid;
      payment?: number;
      discard?: readonly CardUid[];
    }
  /** GDD 6.2 fase 7: descarta até o limite de mão. */
  | { type: 'discardCards'; player: PlayerId; cards: readonly CardUid[] }
  /** Resolve a escolha pendente (Requisição Prioritária: a carta escolhida). */
  | { type: 'resolveChoice'; player: PlayerId; card: CardUid }
  | { type: 'endPhase'; player: PlayerId };

export type ActionType = Action['type'];

/**
 * Ações que gastam ações do turno com custo fixo (GDD 6.3). Instalar permanente e
 * Limpar galeria têm custo variável (legal.ts → actionCost).
 */
export const ACTION_COST: Record<ActionType, number> = {
  chooseCompensation: 0,
  chooseVillage: 0,
  chooseDraw: 0,
  explore: 1,
  survey: 1,
  build: 1,
  upgrade: 1,
  bankTrade: 0,
  proposeTrade: 0,
  counterTrade: 0,
  acceptTrade: 0,
  rejectTrade: 0,
  cancelTrade: 0,
  playCard: 0,
  installPermanent: 0,
  clearSeal: 0,
  deliverCard: 0,
  discardCards: 0,
  resolveChoice: 0,
  endPhase: 0,
};
