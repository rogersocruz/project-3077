/**
 * Splash (UX_SPEC 2.1): 3 s, pulável (clique ou tecla). A placa "PROJETO 3077" desce sobre a
 * mesa com impacto metálico; uma barra discreta na base. Uma vez por sessão do navegador.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playSound } from '../../audio';
import { prefersReducedMotion } from '../../settings';
import styles from './Splash.module.css';

const SEEN = 'p3077.splash';
const DURATION = 3000;

function seen(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('splash')) return false;
    // Testes automatizados (Playwright) entram direto; `?splash=1` força o splash.
    if (navigator.webdriver || q.has('nosplash')) return true;
    return sessionStorage.getItem(SEEN) === '1';
  } catch {
    return true;
  }
}

export function Splash() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !seen());
  useEffect(() => {
    if (!open) return;
    const close = () => {
      try {
        sessionStorage.setItem(SEEN, '1');
      } catch {
        // sem sessionStorage: o splash só não lembra
      }
      setOpen(false);
    };
    const id = window.setTimeout(close, DURATION);
    const impact = window.setTimeout(() => playSound('splashImpact'), prefersReducedMotion() ? 0 : 450);
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(impact);
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close);
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className={styles.splash} role="presentation" data-testid="splash">
      <div className={`${styles.plate} ${prefersReducedMotion() ? '' : styles.drop}`}>
        <span className={styles.word}>{t('app.titleWord')}</span>
        <span className={styles.number}>{t('app.titleNumber')}</span>
      </div>
      <div className={styles.bar}>
        <span className={styles.fill} />
      </div>
      <p className={styles.skip}>{t('splash.skip')}</p>
    </div>
  );
}
