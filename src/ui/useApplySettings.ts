/**
 * Liga as configurações ao documento: tela/acessibilidade (theme/accessibility.ts), idioma
 * (i18next) e tela cheia. Montado uma vez em App.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../settings';
import { applyDisplay } from './theme/accessibility';

/** Tela cheia pela API do navegador (precisa vir de um clique; chamado pela tela de ajustes). */
export async function setFullscreen(on: boolean): Promise<void> {
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // O navegador pode negar (sem gesto do usuário, iframe): a opção volta ao estado real.
  }
  useSettings.getState().setRender({ fullscreen: !!document.fullscreenElement });
}

export function useApplySettings(): void {
  const render = useSettings((s) => s.render);
  const accessibility = useSettings((s) => s.accessibility);
  const language = useSettings((s) => s.gameplay.language);
  const { i18n } = useTranslation();

  useEffect(() => applyDisplay(render, accessibility), [render, accessibility]);
  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);
  }, [i18n, language]);
  useEffect(() => {
    const sync = () => useSettings.getState().setRender({ fullscreen: !!document.fullscreenElement });
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
}
