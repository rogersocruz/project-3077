/** Carregar partida a partir do menu principal (UX_SPEC 1). */
import { useTranslation } from 'react-i18next';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import { SavesPanel } from '../saves/SavesPanel';
import styles from '../settings/Settings.module.css';

export function LoadScreen() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  return (
    <main className={styles.screen}>
      <section className={`${hud.plate} ${hud.rivets} ${styles.page}`}>
        <div className={styles.pageHead}>
          <h1 className={hud.modalTitle}>{t('saves.loadTitle')}</h1>
          <button type="button" className={hud.btn} onClick={() => go('home')}>
            {t('common.back')}
          </button>
        </div>
        <SavesPanel mode="load" />
      </section>
    </main>
  );
}
