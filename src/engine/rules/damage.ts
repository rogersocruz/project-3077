/**
 * Dano a estruturas: destruir e rebaixar (GDD 4.4: downgrade de nível 1 destrói).
 * Usado por Demolição/Ataque Orbital agora e pelos desastres na Fase 6.
 */
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import { findStructure } from '../queries';
import type { GameState } from '../state';

/** Estrutura com a flag `indestructible` (Centro da Vila) não pode ser alvo de destruição. */
export function isIndestructible(ctx: EngineContext, type: string): boolean {
  return ctx.structure(type).flags?.includes('indestructible') ?? false;
}

/** Mutável: remove a estrutura do hex. */
export function destroyStructure(state: GameState, uid: number, events: GameEvent[]): void {
  const where = findStructure(state, uid);
  if (!where) return;
  where.hex.structures = where.hex.structures.filter((s) => s.uid !== uid);
  events.push({
    type: 'structureDestroyed',
    player: where.structure.owner,
    hex: where.key,
    uid,
    structure: where.structure.type,
  });
}

/** Mutável: perde 1 nível; no nível 1 é destruída (GDD 4.4). */
export function downgradeStructure(state: GameState, uid: number, events: GameEvent[]): void {
  const where = findStructure(state, uid);
  if (!where) return;
  if (where.structure.level <= 1) {
    destroyStructure(state, uid, events);
    return;
  }
  where.structure.level -= 1;
  events.push({
    type: 'structureDowngraded',
    player: where.structure.owner,
    hex: where.key,
    uid,
    level: where.structure.level,
  });
}
