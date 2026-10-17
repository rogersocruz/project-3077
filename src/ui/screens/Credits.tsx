/**
 * Créditos gerados de assets/credits.json, agrupados por autor, no formato que cada
 * licença pede (game-icons.net, CC BY 3.0: "Icons made by {autor}. Available on …").
 */
import { useTranslation } from 'react-i18next';
import credits from '../../../assets/credits.json';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import styles from './Credits.module.css';

interface Credit {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly source: string;
}

export function Credits() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  const byAuthor = new Map<string, Credit[]>();
  for (const c of credits.assets as readonly Credit[]) {
    byAuthor.set(c.author, [...(byAuthor.get(c.author) ?? []), c]);
  }
  return (
    <main className={styles.screen} data-testid="credits">
      <section className={`${hud.plate} ${hud.rivets} ${styles.panel}`}>
        <h1 className={styles.title}>{t('credits.title')}</h1>
        <h2 className={hud.label}>{t('credits.icons')}</h2>
        <ul className={styles.list}>
          {[...byAuthor.entries()]
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
            .map(([author, items]) => (
              <li key={author}>
                <p className={styles.line}>{t('credits.line', { author })}</p>
                <p className={styles.small}>
                  <a href={items[0]?.licenseUrl} target="_blank" rel="noreferrer">
                    {t('credits.license', { license: items[0]?.license.replace(/-/g, ' ') })}
                  </a>
                  {' · '}
                  {t('credits.items', { count: items.length, list: items.map((i) => i.name).join(', ') })}
                </p>
              </li>
            ))}
        </ul>
        <button type="button" className={hud.btn} onClick={() => go('home')}>
          {t('common.back')}
        </button>
      </section>
    </main>
  );
}
