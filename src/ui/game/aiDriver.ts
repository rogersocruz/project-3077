/**
 * Motor da IA na interface (Fase 5): quando quem decide é um assento de IA e a fila de
 * animação está parada, espera um instante e joga pelo mesmo caminho dos botões
 * (sessão → motor → diretor). Pausa trava; velocidade instantânea não espera.
 */
import { useEffect } from 'react';
import { usePresentation } from '../../anim';
import { T } from '../../anim/timing';
import { decider } from '../../engine';
import { useSettings } from '../../settings';
import { useSession } from './session';
import { useUi } from './uiStore';

export function useAiDriver(): void {
  const state = useSession((s) => s.state);
  const agents = useSession((s) => s.agents);
  const busy = usePresentation((s) => s.busy);
  const paused = useUi((s) => s.modal?.kind === 'pause');
  const speed = useSettings((s) => s.gameplay.animationSpeed);

  useEffect(() => {
    if (!state || busy || paused || state.stage === 'over' || !agents[decider(state)]) return;
    const delay = speed === 'instant' ? 0 : (T.aiThink * 1000) / speed;
    const id = setTimeout(() => {
      // Algo mudou enquanto esperava (desfazer, revanche, outra ação): o efeito roda de novo.
      if (useSession.getState().state !== state || usePresentation.getState().busy) return;
      useSession.getState().aiStep();
    }, delay);
    return () => clearTimeout(id);
  }, [state, agents, busy, paused, speed]);
}
