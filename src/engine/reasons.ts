/**
 * Motivos de ação ilegal. A interface traduz `engine.illegal.<key>` via i18n e mostra
 * "por que não posso" (PROMPTS Fase 1, item 5).
 */
export const REASON_KEYS = [
  'gameOver',
  'notYourTurn',
  'wrongStage',
  'wrongPhase',
  'noActionsLeft',
  'tradePending',
  'noTradePending',
  'notTradeRecipient',
  'notTradeProposer',
  'compensationPending',
  'noCompensationDue',
  'invalidOption',
  'layerDisabled',
  'invalidAmounts',
  'villageAlreadyChosen',
  'outsideVillageZone',
  'noSuchHex',
  'notOwnBoard',
  'alreadyRevealed',
  'notAdjacentToRevealed',
  'outOfRange',
  'alreadySurveyed',
  'notBuildable',
  'rarityLocked',
  'hexHidden',
  'wrongTerrain',
  'subsoilNotSurveyed',
  'subsoilDepleted',
  'subsoilEmpty',
  'duplicateInHex',
  'hexFull',
  'outpostLimit',
  'cannotAfford',
  'proposerCannotAfford',
  'notYourStructure',
  'maxLevel',
  'needsWorkshop',
  'sameResource',
  'bankCreditTooLow',
  'invalidTradePartner',
  'boardsNotAdjacent',
  'emptyTrade',
  // Cartas (Fase 4)
  'drawChoicePending',
  'choicePending',
  'invalidChoice',
  'cardNotInHand',
  'notPlayable',
  'notInstallable',
  'notDeliverable',
  'playWithAction',
  'wrongModifier',
  'targetRequired',
  'invalidTarget',
  'invalidPayment',
  'invalidDiscard',
  'slotsFull',
  'notInstalled',
  'alreadyDelivered',
  'invalidRecipient',
  'receiveCapReached',
  'handOverLimit',
  'notOverLimit',
  'notExtraction',
  'nothingToProduce',
  'alreadyOverloaded',
  'notSealed',
  'alreadySealed',
  'subsoilSealed',
  'immuneToSteal',
  'sacrificeRequired',
  'indestructible',
  'notTargetBoard',
  'notRangeOrigin',
  'noYield',
  'resourceNotAllowed',
  'deckNotAllowed',
  'deckEmpty',
] as const;

export type ReasonKey = (typeof REASON_KEYS)[number];

export interface Reason {
  readonly key: ReasonKey;
  readonly params?: Readonly<Record<string, string | number>>;
}

export class IllegalActionError extends Error {
  constructor(readonly reason: Reason) {
    super(`ação ilegal: ${reason.key}${reason.params ? ` ${JSON.stringify(reason.params)}` : ''}`);
    this.name = 'IllegalActionError';
  }
}
