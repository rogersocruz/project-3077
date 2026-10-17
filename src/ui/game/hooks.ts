/** Atalhos de leitura da partida para os componentes do HUD. */
import { usePresentation } from '../../anim';
import { type Action, decider } from '../../engine';
import { pactsBrokenBy } from '../../engine/rules/treaties';
import { useSettings } from '../../settings';
import { useSession } from './session';
import { useUi } from './uiStore';

/** A interface não aceita ações: fila de animação tocando, privacidade ou fim de partida. */
export function useLocked(): boolean {
  const busy = usePresentation((s) => s.busy);
  const over = usePresentation((s) => s.shown?.stage === 'over');
  return busy || over;
}

/** Quem está diante da tela pode decidir agora (é a vez dele e nada está tocando). */
export function useCanDecide(): boolean {
  const locked = useLocked();
  const viewer = usePresentation((s) => s.viewer);
  const state = useSession((s) => s.state);
  const human = useSession((s) => viewer === null || (s.setup?.seats[viewer] ?? 'human') === 'human');
  return !locked && !!state && viewer !== null && human && decider(state) === viewer;
}

export function useInstantCounters(): boolean {
  return useSettings((s) => s.gameplay.animationSpeed === 'instant');
}

/**
 * Executa pela sessão; ação ilegal vira aviso com o motivo do motor. Ação que rompe pacto
 * (GDD 10, interpretação BB) pede confirmação antes, a menos que `confirmed`.
 */
export function perform(action: Action, confirmed = false): boolean {
  const { ctx, state } = useSession.getState();
  if (!confirmed && ctx && state && pactsBrokenBy(ctx, state, action).length > 0) {
    useUi.getState().open({ kind: 'breakPact', action });
    return false;
  }
  const r = useSession.getState().dispatch(action);
  if (!r.ok) useUi.getState().refuse(r.reason);
  return r.ok;
}
