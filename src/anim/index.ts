// Diretor de animação: eventos do motor → timelines GSAP (Fase 3).
import { useSceneStore } from '../render3d/sceneStore';
import { prefersReducedMotion, useSettings } from '../settings';
import { Director } from './director';
import { music, playSound } from '../audio';

export { type Batch, buildCues, type Cue } from './cues';
export { Director, type DirectorDeps } from './director';
export { type Gate, type GateReason, type LogEntry, type TurnView, usePresentation } from './presentation';

/** O diretor da partida em andamento (um por aba). */
export const director = new Director({
  speed: () => useSettings.getState().gameplay.animationSpeed,
  privacy: () => useSettings.getState().gameplay.privacyScreen,
  reducedMotion: () => prefersReducedMotion(),
  autoAdvance: () => useSettings.getState().gameplay.autoAdvance,
  sound: (id) => playSound(id),
  tension: () => music.tension(),
  shake: () => {
    const a = useSettings.getState().accessibility;
    if (a.cameraShake && !prefersReducedMotion()) useSceneStore.getState().shake();
  },
  // Velocidade instantânea também dispensa a viagem da câmera.
  focusBoard: (boardId) =>
    useSceneStore
      .getState()
      .requestFocus({ kind: 'board', boardId }, useSettings.getState().gameplay.animationSpeed === 'instant'),
  setLocalPlayer: (player) => useSceneStore.getState().setLocalPlayer(player),
});
