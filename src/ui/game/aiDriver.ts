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
  // Pausa, salvar/carregar e configurações seguram a IA.
  const paused = useUi((s) => ['pause', 'saves', 'settings'].includes(s.modal?.kind ?? ''));
  const speed = useSettings((s) => s.gameplay.animationSpeed);
  // UX_SPEC 3.3 velocidade da IA: pausa entre as decisões.
  const aiSpeed = useSettings((s) => s.gameplay.aiSpeed);

  useEffect(() => {
    if (!state || busy || paused || state.stage === 'over' || !agents[decider(state)]) return;
    const pace = aiSpeed === 'slow' ? 2.5 : aiSpeed === 'fast' ? 0.3 : 1;
    const delay = speed === 'instant' ? 0 : (T.aiThink * 1000 * pace) / speed;
    const id = setTimeout(() => {
      // Algo mudou enquanto esperava (desfazer, revanche, outra ação): o efeito roda de novo.
      if (useSession.getState().state !== state || usePresentation.getState().busy) return;
      useSession.getState().aiStep();
    }, delay);
    return () => clearTimeout(id);
  }, [state, agents, busy, paused, speed, aiSpeed]);
}
