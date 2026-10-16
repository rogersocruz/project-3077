/**
 * effectIds de eventos, hazards e facções (events.json, tiles.json, factions.json).
 * Ainda sem regra: só a camada a que pertencem, para a carga dos dados reconhecê-los
 * (CLAUDE.md regra 6). Os handlers entram nas Fases 6 (eventos/hazards) e 9 (facções).
 */
import type { LayerName } from '../state';

export const WORLD_EFFECTS: Readonly<Record<string, LayerName>> = {
  // events.json (Fase 6)
  ashCloud: 'events',
  bankSpread: 'events',
  disasterAtTerrain: 'events',
  dronesOff: 'events',
  firstSurveyBonus: 'events',
  halfMoveCost: 'events',
  loseFoodWithCounter: 'events',
  minesOff: 'events',
  minesOffWithCounter: 'events',
  parksMinusWithCounter: 'events',
  spawnHorde: 'events',
  surveyBlocked: 'events',
  templeGuardians: 'events',
  terrainYieldBonus: 'events',
  volcanoErupt: 'events',
  // tiles.json: bônus e dano dos hazards (Fase 6)
  contaminate: 'specialHexes',
  doubleFood: 'specialHexes',
  freeDroneFromHere: 'specialHexes',
  freeMineUpkeep: 'specialHexes',
  freePort: 'specialHexes',
  geyserDry: 'specialHexes',
  groundDrones: 'specialHexes',
  mineCollapse: 'specialHexes',
  portClosed: 'specialHexes',
  produce: 'specialHexes',
  sabotageAmplify: 'specialHexes',
  sabotageShield: 'specialHexes',
  thinCrust: 'specialHexes',
  // factions.json (Fase 9)
  betterBank: 'factions',
  freeSurvey: 'factions',
  ignoreDiscardOnSabotage: 'factions',
  parkEfficiency: 'factions',
  protocol: 'factions',
  underdogAction: 'factions',
};
