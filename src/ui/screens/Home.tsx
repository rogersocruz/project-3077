import { useTranslation } from 'react-i18next';
import { RichText } from '../components/RichText';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import { Shape } from '../components/Shape';
import { type FactionKey, palette, type ResourceKey } from '../theme/tokens';
import styles from './Home.module.css';

const RESOURCES = Object.keys(palette.resource) as ResourceKey[];
const FACTIONS = Object.keys(palette.faction) as FactionKey[];

export function Home() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);

  return (
    <main className={styles.screen}>
      <header className={styles.plate}>
        <h1 className={styles.title}>
          <span className={styles.titleWord}>{t('app.titleWord')}</span>{' '}
          <span className={styles.titleNumber}>{t('app.titleNumber')}</span>
        </h1>
        <p className={styles.tagline}>{t('home.tagline')}</p>
      </header>

      <nav className={styles.menu}>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnPrimary} ${styles.menuMain}`}
          onClick={() => go('newGame')}
          data-testid="new-game"
        >
          {t('home.play')}
        </button>
        <button type="button" className={hud.btn} onClick={() => go('lab')} data-testid="open-lab">
          {t('home.lab')}
        </button>
        <button type="button" className={hud.btn} onClick={() => go('table')}>
          {t('home.showcase')}
        </button>
      </nav>

      <section className={styles.paper}>
        <p className={styles.flavor}>{t('home.flavor')}</p>

        <div className={styles.columns}>
          <div>
            <h2 className={styles.heading}>{t('home.resourcesHeading')}</h2>
            <ul className={styles.list}>
              {RESOURCES.map((id) => (
                <li key={id} className={styles.item}>
                  <Shape kind={palette.resource[id].shape} colorVar={`--resource-${id}-color`} />
                  {t(`resources.${id}`)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className={styles.heading}>{t('home.factionsHeading')}</h2>
            <ul className={styles.list}>
              {FACTIONS.map((id) => (
                <li key={id} className={styles.item}>
                  <Shape kind={palette.faction[id].symbol} colorVar={`--faction-${id}-color`} size={22} />
                  {t(`factions.${id}`)}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className={styles.heading}>{t('home.typeHeading')}</h2>
            <p className={styles.typeDisplay}>{t('home.typeDisplay')}</p>
            <p className={styles.typeNumeric}>{t('home.typeNumeric')}</p>
            <p className={styles.typeBody}>
              <RichText text={t('home.typeBody')} />
            </p>
            <p className={styles.typeLore}>{t('home.typeLore')}</p>
          </div>
        </div>

        <span className={styles.version}>{t('home.versionTag')}</span>
      </section>

      <footer className={styles.status}>{t('home.status')}</footer>
    </main>
  );
}
