/**
 * effectId → handler (CLAUDE.md, regra 6). Toda carta de cards.json precisa de um
 * handler com parâmetros válidos, e todo effectId de eventos/hazards/facções precisa
 * estar em WORLD_EFFECTS: o contrário falha na carga dos dados, nunca no meio da partida.
 */
import type { GameData } from '../../data/schemas';
import type { CardDef } from '../context';
import type { RuleLayers } from '../state';
import { drawFromDeck, tutor } from './decks';
import * as gated from './gated';
import { revealBoard, revealHand, revealStocks, revealStructures, revealSubsoilArea } from './info';
import { droneRange, halfCostBuild } from './modifiers';
import * as perm from './permanents';
import { extraAction, gainResource, gainResourceChoice, loseAction, stealResource } from './resources';
import {
  destroyTargetStructure,
  freeUpgrade,
  hexYieldBonus,
  ionPulse,
  overload,
  sealSubsoil,
  structureNoProduce,
} from './structures';
import type { EffectHandler } from './types';
import { WORLD_EFFECTS } from './world';

export const CARD_EFFECTS: Readonly<Record<string, EffectHandler>> = {
  // Recursos e ações do turno
  gainResourceChoice,
  gainResource,
  stealResource,
  extraAction,
  loseAction,
  // Estruturas e hexes
  overload,
  structureNoProduce,
  ionPulse,
  hexYieldBonus,
  sealSubsoil,
  destroyStructure: destroyTargetStructure,
  freeUpgrade,
  // Informação
  revealStructures,
  revealSubsoilArea,
  revealBoard,
  revealHand,
  revealStocks,
  // Baralhos
  tutor,
  drawFromDeck,
  // Modificadores de Sondar/Construir
  droneRange,
  halfCostBuild,
  // Permanentes
  destroyPermanent: perm.destroyPermanent,
  stealPermanent: perm.stealPermanent,
  droneDiscount: perm.droneDiscount,
  silos: perm.silos,
  mineTokensBonus: perm.mineTokensBonus,
  outpostRangeBonus: perm.outpostRangeBonus,
  immuneToSteal: perm.immuneToSteal,
  parkBonus: perm.parkBonus,
  freeDrones: perm.freeDrones,
  rangeBonusAll: perm.rangeBonusAll,
  autoSurveyAdjacent: perm.starMap,
  // Camadas futuras
  troopStrengthBonus: gated.troopStrengthBonus,
  troopRoot: gated.troopRoot,
  revealTroops: gated.revealTroops,
  freeRetreat: gated.freeRetreat,
  lineStrengthBonus: gated.lineStrengthBonus,
  antigrav: gated.antigrav,
  spawnGuardian: gated.spawnGuardian,
  freeTreaties: gated.freeTreaties,
  disasterResist: gated.disasterResist,
};

export function effectOf(def: CardDef): EffectHandler {
  const handler = CARD_EFFECTS[def.effectId];
  if (!handler) throw new Error(`effectId desconhecido: ${def.effectId} (carta ${def.id})`);
  return handler;
}

/** A carta entra no baralho: efeito implementado e camadas exigidas ligadas (interpretação U). */
export function cardEnabled(def: CardDef, layers: RuleLayers): boolean {
  const handler = CARD_EFFECTS[def.effectId];
  return !!handler && handler.implemented && handler.requires.every((layer) => layers[layer]);
}

export interface EffectIssue {
  readonly file: 'cards.json' | 'events.json' | 'tiles.json' | 'factions.json';
  readonly path: string;
  readonly message: string;
}

/** Problemas de effectId nos dados (usado por createContext e por `npm run data:check`). */
export function effectIssues(data: GameData): EffectIssue[] {
  const issues: EffectIssue[] = [];
  data.cards.forEach((card, i) => {
    const handler = CARD_EFFECTS[card.effectId];
    if (!handler) {
      issues.push({
        file: 'cards.json',
        path: `[${i}].effectId`,
        message: `effectId "${card.effectId}" sem handler`,
      });
      return;
    }
    const bad = handler.validateParams(card.params);
    if (bad) issues.push({ file: 'cards.json', path: `[${i}].params`, message: `"${card.id}": ${bad}` });
  });
  const world = (file: EffectIssue['file'], path: string, id: string) => {
    if (!(id in WORLD_EFFECTS)) issues.push({ file, path, message: `effectId "${id}" desconhecido` });
  };
  data.events.forEach((e, i) => world('events.json', `[${i}].effectId`, e.effectId));
  data.tiles.hazards.forEach((h, i) => {
    world('tiles.json', `.hazards[${i}].bonus.effectId`, h.bonus.effectId);
    world('tiles.json', `.hazards[${i}].damage.effectId`, h.damage.effectId);
  });
  data.factions.forEach((f, i) => world('factions.json', `[${i}].ability.effectId`, f.ability.effectId));
  return issues;
}

export function assertEffects(data: GameData): void {
  const issues = effectIssues(data);
  if (issues.length) {
    throw new Error(
      `effectIds inválidos:\n${issues.map((i) => `${i.file}${i.path}: ${i.message}`).join('\n')}`,
    );
  }
}
