/** Configurações a partir do menu principal (UX_SPEC 1 e 3). */
import { useTranslation } from 'react-i18next';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import { SettingsPanel } from '../settings/SettingsPanel';
import styles from '../settings/Settings.module.css';

export function SettingsScreen() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  return (
    <main className={styles.screen}>
      <section className={`${hud.plate} ${hud.rivets} ${styles.page}`}>
        <div className={styles.pageHead}>
          <h1 className={hud.modalTitle}>{t('settings.title')}</h1>
          <button type="button" className={hud.btn} onClick={() => go('home')} data-testid="settings-back">
            {t('common.back')}
          </button>
        </div>
        <SettingsPanel />
      </section>
    </main>
  );
}
