// Diretor de animação: eventos do motor → timelines GSAP (Fase 3).
import { useSceneStore } from '../render3d/sceneStore';
import { prefersReducedMotion, useSettings } from '../settings';
import { Director } from './director';

export { type Batch, buildCues, type Cue } from './cues';
export { Director, type DirectorDeps } from './director';
export { type Gate, type GateReason, type LogEntry, type TurnView, usePresentation } from './presentation';

const reduced = prefersReducedMotion();

/** O diretor da partida em andamento (um por aba). */
export const director = new Director({
  speed: () => useSettings.getState().gameplay.animationSpeed,
  privacy: () => useSettings.getState().gameplay.privacyScreen,
  reducedMotion: () => reduced,
  // Velocidade instantânea também dispensa a viagem da câmera.
  focusBoard: (boardId) =>
    useSceneStore
      .getState()
      .requestFocus({ kind: 'board', boardId }, useSettings.getState().gameplay.animationSpeed === 'instant'),
  setLocalPlayer: (player) => useSceneStore.getState().setLocalPlayer(player),
});
