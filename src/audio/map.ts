/**
 * Evento → som (UX_SPEC 6). Puro: o diretor de animação pede os sons de cada pista quando ela
 * começa (o som acompanha a animação) e os dos eventos que não têm pista própria.
 */
import type { Cue } from '../anim/cues';
import type { GameEvent } from '../engine/events';
import type { SoundId } from './sounds';

const WORLD: Record<string, SoundId> = {
  seismic: 'seismic',
  thermal: 'thermal',
  climatic: 'climatic',
  atmospheric: 'atmospheric',
  horde: 'horde',
  economic: 'economic',
};

export function soundsForCue(cue: Cue): SoundId[] {
  switch (cue.kind) {
    case 'round':
      return ['roundStart'];
    case 'turn':
      return ['turnStart'];
    case 'draw':
    case 'taken':
      return ['cardDraw'];
    case 'cardPlay':
      return ['cardPlay'];
    case 'deliver':
      return ['cardDeliver'];
    case 'cardReveal':
      return ['cardReveal'];
    case 'install':
      return ['install'];
    case 'steal':
      return ['steal'];
    case 'reveal':
      return ['explore'];
    case 'survey':
      return ['survey'];
    case 'village':
    case 'build':
      return ['build'];
    case 'upgrade':
      return ['upgrade'];
    case 'production':
      return cue.items.length ? ['produce'] : [];
    case 'bank':
      return ['bank'];
    case 'trade':
      return ['uiConfirm'];
    case 'destroy':
    case 'permanentGone':
      return ['destroy'];
    case 'downgrade':
      return ['downgrade'];
    case 'combat':
      return ['combat'];
    case 'treaty':
      return [
        cue.fx === 'signed' ? 'treatySigned' : cue.fx === 'triggered' ? 'treatyTriggered' : 'pactBroken',
      ];
    case 'worldEvent': {
      const id = WORLD[cue.category];
      return id ? [id] : [];
    }
    default:
      return [];
  }
}

/** Eventos sem pista própria que pedem som. */
export function soundsForEvents(events: readonly GameEvent[]): SoundId[] {
  const out = new Set<SoundId>();
  for (const e of events) {
    switch (e.type) {
      case 'troopsMoved':
        out.add('troopMove');
        break;
      case 'tollPaid':
        out.add('toll');
        break;
      case 'villageDamaged':
        out.add('villageHit');
        break;
      case 'guardianSpawned':
        out.add('guardian');
        break;
      case 'gameOver':
        out.add('victory');
        break;
      default:
        break;
    }
  }
  return [...out];
}
