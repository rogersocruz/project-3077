/**
 * Eventos emitidos pelo motor a cada ação. O diretor de animação (src/anim) toca a
 * fila; o motor nunca espera (CLAUDE.md, regra de arquitetura 2).
 */
import type { ResourceId } from '../data/schemas';
import type { CardTarget, CardUid, DrawDeck, HexKey, PlayerId, Resources, TurnPhase } from './state';
import type { ReasonKey } from './reasons';

/** Uma estrutura vista por carta de informação (Auditoria, Reconhecimento). */
export interface IntelStructure {
  readonly hex: HexKey;
  readonly uid: number;
  readonly type: string;
  readonly level: number;
  readonly owner: PlayerId;
  /** Produção por turno (só a Auditoria mostra). */
  readonly produces?: Partial<Resources>;
}

/** Relatório privado de carta de informação: só quem jogou vê. */
export type IntelReport =
  | { readonly kind: 'hand'; readonly target: PlayerId; readonly cards: readonly CardUid[] }
  | {
      readonly kind: 'stocks';
      readonly stocks: readonly { readonly player: PlayerId; readonly resources: Resources }[];
    }
  | {
      readonly kind: 'structures';
      readonly target: PlayerId | null;
      readonly origin: HexKey | null;
      readonly structures: readonly IntelStructure[];
    };

export type PermanentRemoval = 'replaced' | 'destroyed' | 'sacrificed' | 'stolen';

export type GameEvent =
  | { type: 'compensationChosen'; player: PlayerId; option: number; resources: Partial<Resources> }
  | { type: 'villageFounded'; player: PlayerId; hex: HexKey }
  | { type: 'hexRevealed'; hex: HexKey; surface: string; by: PlayerId | null }
  | { type: 'subsoilSurveyed'; hex: HexKey; player: PlayerId; subsoil: string }
  | { type: 'roundStarted'; round: number }
  | { type: 'turnStarted'; player: PlayerId; round: number }
  | { type: 'phaseChanged'; player: PlayerId; phase: TurnPhase }
  | { type: 'produced'; player: PlayerId; hex: HexKey; uid: number; resource: ResourceId; amount: number }
  | { type: 'mineIdle'; player: PlayerId; hex: HexKey; uid: number }
  | { type: 'mineDepleted'; player: PlayerId; hex: HexKey; uid: number }
  | { type: 'upkeepPaid'; player: PlayerId; uid: number; cost: Partial<Resources> }
  | { type: 'upkeepMissed'; player: PlayerId; uid: number }
  | { type: 'structureBuilt'; player: PlayerId; hex: HexKey; uid: number; structure: string }
  | { type: 'structureUpgraded'; player: PlayerId; uid: number; level: number }
  | { type: 'villageHealed'; player: PlayerId; lives: number }
  | { type: 'resourcesSpent'; player: PlayerId; resources: Partial<Resources> }
  | {
      type: 'bankTraded';
      player: PlayerId;
      give: ResourceId;
      amount: number;
      receive: ResourceId;
      received: number;
      lostCredit: number;
    }
  | { type: 'tradeProposed'; from: PlayerId; to: PlayerId }
  /** `from` é quem contrapropôs (o antigo destinatário). */
  | { type: 'tradeCountered'; from: PlayerId; to: PlayerId }
  | { type: 'tradeAccepted'; from: PlayerId; to: PlayerId }
  | { type: 'tradeRejected'; from: PlayerId; to: PlayerId }
  | { type: 'tradeCancelled'; from: PlayerId; to: PlayerId }
  // ── Cartas (GDD 7) ──
  /** O id da carta é privado: o registro só mostra a quem comprou. */
  | { type: 'cardDrawn'; player: PlayerId; card: CardUid; deck: DrawDeck }
  | { type: 'deckReshuffled'; deck: DrawDeck; size: number }
  | { type: 'cardDiscarded'; player: PlayerId; card: CardUid; reason: 'cost' | 'limit' }
  | { type: 'cardPlayed'; player: PlayerId; card: CardUid; target?: CardTarget }
  /** Entrega lacrada: a carta só é conhecida na Revelação. */
  | { type: 'cardDelivered'; from: PlayerId; to: PlayerId; card: CardUid }
  | { type: 'cardRevealed'; from: PlayerId; to: PlayerId; card: CardUid; target?: CardTarget }
  /** O alvo deixou de valer até a Revelação (interpretação X). */
  | { type: 'cardFizzled'; from: PlayerId; to: PlayerId; card: CardUid; reason: ReasonKey }
  | { type: 'permanentInstalled'; player: PlayerId; card: CardUid; slot: number }
  | { type: 'permanentRemoved'; player: PlayerId; card: CardUid; slot: number; cause: PermanentRemoval }
  | { type: 'permanentStolen'; from: PlayerId; to: PlayerId; card: CardUid; slot: number }
  | { type: 'resourcesGained'; player: PlayerId; resources: Partial<Resources>; card?: CardUid }
  | { type: 'resourcesLost'; player: PlayerId; resources: Partial<Resources>; card?: CardUid }
  | { type: 'structureDestroyed'; player: PlayerId; hex: HexKey; uid: number; structure: string }
  | { type: 'structureDowngraded'; player: PlayerId; hex: HexKey; uid: number; level: number }
  /** Estrutura parada por carta: `until` diz por quanto tempo. */
  | {
      type: 'structureDisabled';
      player: PlayerId;
      hex: HexKey;
      uid: number;
      until: 'thisTurn' | 'thisRound' | 'nextProduction';
    }
  /** Na Produção: estrutura que não produziu por causa de uma carta. */
  | { type: 'structureInactive'; player: PlayerId; hex: HexKey; uid: number }
  | { type: 'subsoilSealed'; hex: HexKey; by: PlayerId }
  | { type: 'subsoilCleared'; hex: HexKey; player: PlayerId }
  | { type: 'hexYieldBoosted'; hex: HexKey; player: PlayerId; bonus: number }
  | { type: 'actionsChanged'; player: PlayerId; delta: number; actionsLeft: number }
  | { type: 'intel'; player: PlayerId; card: CardUid; report: IntelReport }
  | { type: 'choicePending'; player: PlayerId; card: CardUid; deck: DrawDeck; options: CardUid[] }
  /** Requisição Prioritária: a carta escolhida é revelada a todos. */
  | { type: 'cardTaken'; player: PlayerId; card: CardUid; deck: DrawDeck }
  | { type: 'roundEnded'; round: number }
  // ── Eventos globais, hazards e sítios (Fase 6) ──
  /** GDD 9: evento da rodada (id de events.json). */
  | { type: 'eventRevealed'; round: number; event: string; category: string }
  | { type: 'eventDeckReshuffled'; size: number }
  /** O hazard sofreu o próprio dano (gatilho da categoria do evento). */
  | { type: 'hazardTriggered'; hex: HexKey; hazard: string; effect: string }
  | { type: 'hexStatus'; hex: HexKey; status: string; until: number }
  | { type: 'hexContaminated'; hex: HexKey; actions: number }
  | { type: 'hexCleaned'; hex: HexKey; player: PlayerId }
  /** GDD 4.4: desastre no hex + raio. */
  | { type: 'disaster'; hex: HexKey; radius: number }
  | { type: 'volcanoErupted'; hex: HexKey }
  | { type: 'villageDamaged'; player: PlayerId; lives: number }
  | { type: 'playerEliminated'; player: PlayerId }
  | { type: 'guardianSpawned'; hex: HexKey; strength: number }
  | { type: 'hordeAttack'; from: HexKey; to: HexKey; strength: number; defense: number; repelled: boolean }
  | { type: 'excavated'; player: PlayerId; hex: HexKey; site: string }
  | { type: 'treasureDrawn'; player: PlayerId; card: CardUid }
  /** Contra-ação do evento ("quem gastar N ações fica imune"). */
  | { type: 'braced'; player: PlayerId; event: string }
  | { type: 'eventFoodLoss'; player: PlayerId; amount: number }
  | { type: 'gameOver'; winners: PlayerId[]; reason: 'condition' | 'roundLimit' };
