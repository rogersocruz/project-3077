/**
 * Textos derivados do estado: nome do jogador, rótulo de hex, quantias e as linhas do
 * registro. Tudo passa por i18n (CLAUDE.md regra 4). O registro respeita a privacidade
 * do subsolo (D10): o recurso sondado só aparece para quem sondou.
 */
import type { TFunction } from 'i18next';
import { loadGameData } from '../../data';
import { RESOURCE_IDS } from '../../data/schemas';
import type { CardTarget, CardUid, GameEvent, GameState, HexKey, PlayerId } from '../../engine';
import { findStructure, type ResourceAmounts } from '../../engine/queries';
import { seatFaction } from '../../render3d/model';

export const playerName = (t: TFunction, id: PlayerId) => t(`factions.${seatFaction(id)}`);

let cardNames: Map<string, string> | null = null;

/** Nome da carta (texto do cards.json, fonte da verdade dos conteúdos). */
export function cardName(t: TFunction, state: GameState | null, card: CardUid): string {
  const id = state?.cards.defs[card];
  if (id === undefined) return t('log.card');
  cardNames ??= new Map(loadGameData().cards.map((c) => [c.id, c.name]));
  return cardNames.get(id) ?? t('log.card');
}

let eventNames: Map<string, string> | null = null;

/** Nome do evento global (events.json). */
export function eventName(id: string): string {
  eventNames ??= new Map(loadGameData().events.map((e) => [e.id, e.name]));
  return eventNames.get(id) ?? id;
}

export function parseHexKey(key: HexKey): { board: number; q: number; r: number } | null {
  const m = /^(\d+):(-?\d+),(-?\d+)$/.exec(key);
  return m ? { board: Number(m[1]), q: Number(m[2]), r: Number(m[3]) } : null;
}

/** "T1 (0, −1)": tabuleiro (1-based) e coordenadas axiais. */
export function hexLabel(t: TFunction, key: HexKey): string {
  const h = parseHexKey(key);
  if (!h) return key;
  const fmt = (n: number) => (n < 0 ? `−${-n}` : String(n));
  return t('hexLabel', { board: h.board + 1, q: fmt(h.q), r: fmt(h.r) });
}

export function amountsText(t: TFunction, amounts: ResourceAmounts): string {
  const parts = RESOURCE_IDS.filter((id) => (amounts[id] ?? 0) > 0).map(
    (id) => `${amounts[id]} ${t(`resources.${id}`)}`,
  );
  return parts.length ? parts.join(', ') : t('trade.nothing');
}

/** Chave i18n de cada evento no registro (`log.<chave>`). */
export const LOG_KEYS: Record<GameEvent['type'], string> = {
  compensationChosen: 'compensationChosen',
  villageFounded: 'villageFounded',
  hexRevealed: 'hexRevealed',
  subsoilSurveyed: 'subsoilSurveyed',
  roundStarted: 'roundStarted',
  turnStarted: 'turnStarted',
  phaseChanged: 'phaseChanged',
  produced: 'produced',
  mineIdle: 'mineIdle',
  mineDepleted: 'mineDepleted',
  upkeepPaid: 'upkeepPaid',
  upkeepMissed: 'upkeepMissed',
  structureBuilt: 'structureBuilt',
  structureUpgraded: 'structureUpgraded',
  villageHealed: 'villageHealed',
  resourcesSpent: 'resourcesSpent',
  bankTraded: 'bankTraded',
  tradeProposed: 'tradeProposed',
  tradeCountered: 'tradeCountered',
  tradeAccepted: 'tradeAccepted',
  tradeRejected: 'tradeRejected',
  tradeCancelled: 'tradeCancelled',
  cardDrawn: 'cardDrawn',
  deckReshuffled: 'deckReshuffled',
  cardDiscarded: 'cardDiscarded',
  cardPlayed: 'cardPlayed',
  cardDelivered: 'cardDelivered',
  cardRevealed: 'cardRevealed',
  cardFizzled: 'cardFizzled',
  permanentInstalled: 'permanentInstalled',
  permanentRemoved: 'permanentRemoved',
  permanentStolen: 'permanentStolen',
  resourcesGained: 'resourcesGained',
  resourcesLost: 'resourcesLost',
  structureDestroyed: 'structureDestroyed',
  structureDowngraded: 'structureDowngraded',
  structureDisabled: 'structureDisabled',
  structureInactive: 'structureInactive',
  subsoilSealed: 'subsoilSealed',
  subsoilCleared: 'subsoilCleared',
  hexYieldBoosted: 'hexYieldBoosted',
  actionsChanged: 'actionsChanged',
  intel: 'intel',
  choicePending: 'choicePending',
  cardTaken: 'cardTaken',
  roundEnded: 'roundEnded',
  gameOver: 'gameOver',
  eventRevealed: 'eventRevealed',
  eventDeckReshuffled: 'eventDeckReshuffled',
  hazardTriggered: 'hazardTriggered',
  hexStatus: 'hexStatus',
  hexContaminated: 'hexContaminated',
  hexCleaned: 'hexCleaned',
  disaster: 'disaster',
  volcanoErupted: 'volcanoErupted',
  villageDamaged: 'villageDamaged',
  playerEliminated: 'playerEliminated',
  guardianSpawned: 'guardianSpawned',
  hordeAttack: 'hordeAttack',
  excavated: 'excavated',
  treasureDrawn: 'treasureDrawn',
  braced: 'braced',
  eventFoodLoss: 'eventFoodLoss',
};

/** Detalhes que poluem o registro; ficam atrás do filtro "detalhes". */
export const LOG_DETAIL: ReadonlySet<GameEvent['type']> = new Set<GameEvent['type']>([
  'phaseChanged',
  'resourcesSpent',
  'upkeepPaid',
  'roundEnded',
  'deckReshuffled',
  'eventDeckReshuffled',
  'hexStatus',
]);

/** Jogador a quem o evento diz respeito (filtro por jogador). */
export function eventPlayers(e: GameEvent): PlayerId[] {
  if ('player' in e) return [e.player];
  if ('from' in e && e.type !== 'hordeAttack') return [e.from, e.to];
  if (e.type === 'subsoilSealed') return [e.by];
  if (e.type === 'gameOver') return e.winners;
  return [];
}

/** Alvo de carta em texto: "T1 (0, 1)", "Parque, T2 (1, 0)", "Revolucionários"… */
export function describeTarget(t: TFunction, state: GameState | null, target: CardTarget): string {
  return (() => {
    switch (target.kind) {
      case 'hex':
        return hexLabel(t, target.hex);
      case 'structure': {
        const where = state ? findStructure(state, target.uid) : undefined;
        return where
          ? `${t(`structures.${where.structure.type}`)}, ${hexLabel(t, where.key)}`
          : t('log.structure');
      }
      case 'player':
        return playerName(t, target.player);
      case 'resource':
        return t(`resources.${target.resource}`);
      case 'permanent':
        return `${cardName(t, state, target.card)} (${playerName(t, target.player)})`;
      case 'deck':
        return t(`cards.deck.${target.deck}`);
    }
  })();
}

/** Alvo de carta no registro: " — T1 (0, 1)" (vazio sem alvo). */
function targetText(t: TFunction, state: GameState | null, target: CardTarget | undefined): string {
  return target ? t('log.target', { what: describeTarget(t, state, target) }) : '';
}

/** Estrutura do evento pelo uid (no estado mostrado). */
function structureOf(t: TFunction, state: GameState | null, uid: number): string {
  const where = state ? findStructure(state, uid) : undefined;
  return where ? t(`structures.${where.structure.type}`) : t('log.structure');
}

export function logLine(
  t: TFunction,
  e: GameEvent,
  viewer: PlayerId | null,
  state: GameState | null,
): string {
  const key = `log.${LOG_KEYS[e.type]}`;
  const name = (id: PlayerId) => playerName(t, id);
  const structureName = (type: string) => t(`structures.${type}`);
  switch (e.type) {
    case 'compensationChosen':
      return t(key, { name: name(e.player), list: amountsText(t, e.resources) });
    case 'villageFounded':
      return t(key, { name: name(e.player), hex: hexLabel(t, e.hex) });
    case 'hexRevealed':
      return t(key, { hex: hexLabel(t, e.hex), terrain: t(`terrain.${e.surface}`) });
    case 'subsoilSurveyed':
      return viewer === e.player
        ? t('log.subsoilSurveyedOwn', {
            name: name(e.player),
            hex: hexLabel(t, e.hex),
            subsoil: t(`subsoil.${e.subsoil}`),
          })
        : t(key, { name: name(e.player), hex: hexLabel(t, e.hex) });
    case 'roundStarted':
    case 'roundEnded':
      return t(key, { round: e.round });
    case 'turnStarted':
      return t(key, { name: name(e.player), round: e.round });
    case 'phaseChanged':
      return t(key, { name: name(e.player), phase: t(`phases.${e.phase}`) });
    case 'produced':
      return t(key, {
        name: name(e.player),
        amount: e.amount,
        resource: t(`resources.${e.resource}`),
        hex: hexLabel(t, e.hex),
      });
    case 'mineIdle':
    case 'mineDepleted':
      return t(key, { name: name(e.player), hex: hexLabel(t, e.hex) });
    case 'upkeepPaid':
      return t(key, { name: name(e.player), list: amountsText(t, e.cost) });
    case 'upkeepMissed':
      return t(key, { name: name(e.player) });
    case 'structureBuilt':
      return t(key, { name: name(e.player), structure: structureName(e.structure), hex: hexLabel(t, e.hex) });
    case 'structureUpgraded': {
      const where = state ? findStructure(state, e.uid) : undefined;
      return t(key, {
        name: name(e.player),
        structure: where ? structureName(where.structure.type) : t('log.structure'),
        level: e.level,
      });
    }
    case 'villageHealed':
      return t(key, { name: name(e.player), lives: e.lives });
    case 'resourcesSpent':
      return t(key, { name: name(e.player), list: amountsText(t, e.resources) });
    case 'bankTraded':
      return t(key, {
        name: name(e.player),
        give: `${e.amount} ${t(`resources.${e.give}`)}`,
        receive: `${e.received} ${t(`resources.${e.receive}`)}`,
      });
    case 'tradeProposed':
    case 'tradeCountered':
    case 'tradeAccepted':
    case 'tradeRejected':
    case 'tradeCancelled':
      return t(key, { from: name(e.from), to: name(e.to) });
    // ── Cartas ──
    case 'cardDrawn':
      // A mão é privada: só quem comprou vê qual carta veio.
      return viewer === e.player
        ? t('log.cardDrawnOwn', {
            name: name(e.player),
            card: cardName(t, state, e.card),
            deck: t(`cards.deck.${e.deck}`),
          })
        : t(key, { name: name(e.player), deck: t(`cards.deck.${e.deck}`) });
    case 'deckReshuffled':
      return t(key, { deck: t(`cards.deck.${e.deck}`), size: e.size });
    case 'cardDiscarded':
      return t(key, { name: name(e.player), card: cardName(t, state, e.card) });
    case 'cardPlayed':
      return t(key, {
        name: name(e.player),
        card: cardName(t, state, e.card),
        target: targetText(t, state, e.target),
      });
    case 'cardDelivered':
      return t(key, { from: name(e.from), to: name(e.to) });
    case 'cardRevealed':
      return t(key, {
        from: name(e.from),
        to: name(e.to),
        card: cardName(t, state, e.card),
        target: targetText(t, state, e.target),
      });
    case 'cardFizzled':
      return t(key, {
        from: name(e.from),
        card: cardName(t, state, e.card),
        reason: t(`engine.illegal.${e.reason}`),
      });
    case 'permanentInstalled':
      return t(key, { name: name(e.player), card: cardName(t, state, e.card) });
    case 'permanentRemoved':
      return t(key, {
        name: name(e.player),
        card: cardName(t, state, e.card),
        cause: t(`log.removal.${e.cause}`),
      });
    case 'permanentStolen':
      return t(key, { from: name(e.from), to: name(e.to), card: cardName(t, state, e.card) });
    case 'resourcesGained':
    case 'resourcesLost':
      return t(key, { name: name(e.player), list: amountsText(t, e.resources) });
    case 'structureDestroyed':
      return t(key, { name: name(e.player), structure: structureName(e.structure), hex: hexLabel(t, e.hex) });
    case 'structureDowngraded':
      return t(key, {
        name: name(e.player),
        structure: structureOf(t, state, e.uid),
        hex: hexLabel(t, e.hex),
        level: e.level,
      });
    case 'structureDisabled':
      return t(key, {
        name: name(e.player),
        structure: structureOf(t, state, e.uid),
        hex: hexLabel(t, e.hex),
        until: t(`log.until.${e.until}`),
      });
    case 'structureInactive':
      return t(key, {
        name: name(e.player),
        structure: structureOf(t, state, e.uid),
        hex: hexLabel(t, e.hex),
      });
    case 'subsoilSealed':
      return t(key, { name: name(e.by), hex: hexLabel(t, e.hex) });
    case 'subsoilCleared':
      return t(key, { name: name(e.player), hex: hexLabel(t, e.hex) });
    case 'hexYieldBoosted':
      return t(key, { name: name(e.player), hex: hexLabel(t, e.hex), bonus: e.bonus });
    case 'actionsChanged':
      return t(key, { name: name(e.player), n: e.actionsLeft });
    case 'intel':
      return t(key, { name: name(e.player), card: cardName(t, state, e.card) });
    case 'choicePending':
      return t(key, { name: name(e.player), n: e.options.length, deck: t(`cards.deck.${e.deck}`) });
    case 'cardTaken':
      return t(key, {
        name: name(e.player),
        card: cardName(t, state, e.card),
        deck: t(`cards.deck.${e.deck}`),
      });
    case 'gameOver':
      return t(key, { names: e.winners.map(name).join(', ') });
    // ── Eventos globais, hazards e sítios (Fase 6) ──
    case 'eventRevealed':
      return t(key, { event: eventName(e.event), category: t(`events.category.${e.category}`) });
    case 'eventDeckReshuffled':
      return t(key, { size: e.size });
    case 'hazardTriggered':
      return t(key, { hazard: t(`terrain.${e.hazard}`), hex: hexLabel(t, e.hex) });
    case 'hexStatus':
      return t(key, { hex: hexLabel(t, e.hex), status: t(`events.status.${e.status}`), round: e.until });
    case 'hexContaminated':
      return t(key, { hex: hexLabel(t, e.hex), n: e.actions });
    case 'hexCleaned':
      return t(key, { name: name(e.player), hex: hexLabel(t, e.hex) });
    case 'disaster':
      return t(key, { hex: hexLabel(t, e.hex) });
    case 'volcanoErupted':
      return t(key, { hex: hexLabel(t, e.hex) });
    case 'villageDamaged':
      return t(key, { name: name(e.player), lives: e.lives });
    case 'playerEliminated':
      return t(key, { name: name(e.player) });
    case 'guardianSpawned':
      return t(key, { hex: hexLabel(t, e.hex), strength: e.strength });
    case 'hordeAttack':
      return t(e.repelled ? 'log.hordeRepelled' : key, {
        from: hexLabel(t, e.from),
        to: hexLabel(t, e.to),
        strength: e.strength,
        defense: e.defense,
      });
    case 'excavated':
      return t(key, { name: name(e.player), site: t(`terrain.${e.site}`), hex: hexLabel(t, e.hex) });
    case 'treasureDrawn':
      return viewer === e.player
        ? t('log.treasureDrawnOwn', { name: name(e.player), card: cardName(t, state, e.card) })
        : t(key, { name: name(e.player) });
    case 'braced':
      return t(key, { name: name(e.player), event: eventName(e.event) });
    case 'eventFoodLoss':
      return t(key, { name: name(e.player), n: e.amount });
  }
}
