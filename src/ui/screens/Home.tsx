/**
 * Menu principal (UX_SPEC 2.2): a mesa 3D em plano aberto com a câmera em órbita lenta ao
 * fundo, logo à esquerda, botões empilhados em placas chanfradas, rodapé com versão e idioma.
 * "Continuar" só aparece se houver save automático.
 */
import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { setMusic } from '../../audio';
import { loadGameData } from '../../data';
import { useSettings } from '../../settings';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import { hasAutosave, openSave } from '../saves/open';
import styles from './Home.module.css';

// three.js só baixa quando o menu abre; sem WebGL o menu continua de pé.
const MenuBackdrop = lazy(() => import('./MenuBackdrop').then((m) => ({ default: m.MenuBackdrop })));

export function Home() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  const language = useSettings((s) => s.gameplay.language);
  const setGameplay = useSettings((s) => s.setGameplay);
  const canContinue = useMemo(() => hasAutosave(), []);
  const version = loadGameData().balance._meta.rulesVersion;

  useEffect(() => {
    setMusic('menu');
  }, []);

  return (
    <main className={styles.screen}>
      <Suspense fallback={null}>
        <MenuBackdrop />
      </Suspense>
      <div className={styles.column}>
        <header className={styles.plate}>
          <h1 className={styles.title}>
            <span className={styles.titleWord}>{t('app.titleWord')}</span>{' '}
            <span className={styles.titleNumber}>{t('app.titleNumber')}</span>
          </h1>
          <p className={styles.tagline}>{t('home.tagline')}</p>
        </header>

        <nav className={styles.menu} aria-label={t('home.menu')}>
          {canContinue && (
            <button
              type="button"
              className={`${hud.btn} ${hud.btnPrimary} ${styles.menuMain}`}
              onClick={() => openSave('auto')}
              data-testid="continue"
            >
              {t('home.continue')}
            </button>
          )}
          <button
            type="button"
            className={`${hud.btn} ${canContinue ? '' : hud.btnPrimary} ${styles.menuMain}`}
            onClick={() => go('newGame')}
            data-testid="new-game"
          >
            {t('home.play')}
          </button>
          <button type="button" className={hud.btn} onClick={() => go('load')} data-testid="open-load">
            {t('home.load')}
          </button>
          <button type="button" className={hud.btn} onClick={() => go('lab')} data-testid="open-lab">
            {t('home.lab')}
          </button>
          <button
            type="button"
            className={hud.btn}
            onClick={() => go('settings')}
            data-testid="open-settings"
          >
            {t('home.settings')}
          </button>
          <button type="button" className={hud.btn} onClick={() => go('credits')} data-testid="open-credits">
            {t('home.credits')}
          </button>
          <button type="button" className={hud.btn} onClick={() => go('table')}>
            {t('home.showcase')}
          </button>
        </nav>
      </div>

      <footer className={styles.footer}>
        <span className={styles.versionNum}>{t('home.version', { version })}</span>
        <span className={styles.daily}>{t('home.daily')}</span>
        <button
          type="button"
          className={hud.btn}
          onClick={() => setGameplay({ language: language === 'pt-BR' ? 'en' : 'pt-BR' })}
          aria-label={t('home.language')}
          data-testid="home-language"
        >
          🌐 {language === 'pt-BR' ? 'PT' : 'EN'}
        </button>
      </footer>
    </main>
  );
}
