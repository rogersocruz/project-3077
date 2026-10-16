/**
 * Atalhos da partida (UX_SPEC 5). A câmera (WASD/setas, 1–6, Espaço, Home) fica no
 * CameraRig; aqui ficam as ações. Sondar usa R porque S já move a câmera.
 * Teclas vêm de settings → keys (remapeáveis na Fase 10).
 */
import { useEffect } from 'react';
import { usePresentation } from '../../anim';
import { useSettings } from '../../settings';
import {
  cancel,
  chooseAction,
  endPhase,
  openBank,
  openBuildPicker,
  openTrade,
  openTreaty,
  undoLast,
} from './commands';
import { useUi } from './uiStore';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  );
}

export function useGameShortcuts(): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const keys = useSettings.getState().render.keys;
      const has = (list: string[]) => list.includes(e.code);
      const ui = useUi.getState();
      const gate = usePresentation.getState().gate;

      if (has(keys.rules)) {
        e.preventDefault();
        ui.open(ui.modal?.kind === 'rules' ? null : { kind: 'rules' });
        return;
      }
      if (has(keys.pause)) {
        e.preventDefault();
        if (!cancel() && !gate) ui.open({ kind: 'pause' });
        return;
      }
      // Tela de privacidade e modais capturam o resto (Enter confirma o botão em foco).
      if (gate || (ui.modal && ui.modal.kind !== 'buildPicker')) return;

      if (has(keys.toggleLog)) {
        e.preventDefault();
        ui.toggleLog();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && has(keys.undo)) {
        e.preventDefault();
        undoLast();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Enter encerra a fase mesmo com um botão do HUD em foco (Espaço continua ativando
      // o botão); dentro de diálogos, Enter confirma o botão como de costume.
      const inDialog = !!(e.target as HTMLElement | null)?.closest?.('[role=dialog]');
      if (has(keys.endPhase)) {
        if (inDialog) return;
        e.preventDefault();
        endPhase();
      } else if (has(keys.explore)) chooseAction({ type: 'explore' });
      else if (has(keys.survey)) chooseAction({ type: 'survey' });
      else if (has(keys.upgrade)) chooseAction({ type: 'upgrade' });
      else if (has(keys.build)) {
        if (ui.modal?.kind === 'buildPicker') ui.open(null);
        else openBuildPicker();
      } else if (has(keys.bank)) openBank();
      else if (has(keys.trade)) openTrade();
      else if (has(keys.treaty)) openTreaty();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
}
