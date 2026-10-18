/**
 * Métricas detalhadas no Laboratório (sim/metricsReport.ts): ritmo, curvas por rodada (por
 * facção e por assento), ações e construção, cartas por categoria, conflito e matrizes de
 * interação por assento. Tudo com IC de 95% onde é taxa ou média.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { seatFaction } from '../../render3d/model';
import type { GameRecord } from '../../sim/game';
import { economyCsv, type MetricsSummary, summarizeMetrics } from '../../sim/metricsReport';
import type { Interval } from '../../sim/stats';
import { FactionBadge } from '../components/Bits';
import { LineChart, type Series } from '../end/LineChart';
import hud from '../hud/Hud.module.css';
import type { FactionKey } from '../theme/tokens';
import { BarList, type BarRow } from './Charts';
import styles from './Lab.module.css';

const ci = (i: Interval, d = 2) => `${i.value.toFixed(d)} [${i.lo.toFixed(d)}–${i.hi.toFixed(d)}]`;
const pc = (i: Interval) =>
  `${(i.value * 100).toFixed(1)}% [${(i.lo * 100).toFixed(1)}–${(i.hi * 100).toFixed(1)}]`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Matrix({ title, m }: { title: string; m: number[][] }) {
  return (
    <figure>
      <figcaption className={hud.label}>{title}</figcaption>
      <table className={styles.table}>
        <thead>
          <tr>
            <th />
            {m.map((_, i) => (
              <th key={i}>A{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.map((row, i) => (
            <tr key={i}>
              <th>A{i + 1}</th>
              {row.map((v, j) => (
                <td key={j}>{i === j ? '—' : v.toFixed(2)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Panel({ s }: { s: MetricsSummary }) {
  const { t } = useTranslation();
  const color = (f: string) => `var(--faction-${f}-color)`;
  const byFaction: Series[] = Object.entries(s.stockByFaction).map(([f, pts], i) => ({
    id: i,
    name: t(`factions.${f}`),
    color: color(f),
    points: pts.filter((p) => p.n >= 5).map((p) => ({ x: p.round, y: Math.round(p.mean) })),
  }));
  const bySeat: Series[] = s.stockBySeat.map((pts, i) => ({
    id: i,
    name: t('lab.seatN', { n: i + 1 }),
    color: color(seatFaction(i)),
    points: pts.filter((p) => p.n >= 5).map((p) => ({ x: p.round, y: Math.round(p.mean) })),
  }));
  const one = (name: string, pick: (p: MetricsSummary['curve'][number]) => number, k = 1): Series[] => [
    {
      id: 0,
      name,
      color: 'var(--accent-orange)',
      points: s.curve
        .filter((p) => p.n >= 5)
        .map((p) => ({ x: p.round, y: Math.round(pick(p) * k * 10) / 10 })),
    },
  ];
  const actions: BarRow[] = Object.entries(s.actions)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([k, v]) => ({
      key: k,
      label: t(`lab.action.${k}`, { defaultValue: k }),
      value: v.value,
      display: v.value.toFixed(2),
      title: ci(v),
    }));
  const cards: BarRow[] = Object.entries(s.cards)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([k, v]) => ({
      key: k,
      label: t(`lab.cardCat.${k}`, { defaultValue: k }),
      value: v.value,
      display: v.value.toFixed(2),
      title: ci(v),
    }));

  return (
    <section className={styles.metrics} data-testid="lab-metrics">
      <header className={styles.panelHead}>
        <h3 className={styles.h2}>{t('lab.metrics')}</h3>
        <button type="button" className={hud.btn} onClick={() => download('economy.csv', economyCsv(s))}>
          {t('lab.csvEconomy')}
        </button>
      </header>

      <h4 className={hud.label}>{t('lab.pace')}</h4>
      <div className={styles.stats} data-testid="lab-pace">
        <div className={styles.stat}>
          <span className={styles.statValue}>{s.pace.first50.value.toFixed(1)}</span>
          <span className={hud.label} title={ci(s.pace.first50)}>
            {t('lab.first50')}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{s.pace.first80.value.toFixed(1)}</span>
          <span className={hud.label} title={ci(s.pace.first80)}>
            {t('lab.first80')}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{s.pace.leadChanges.value.toFixed(2)}</span>
          <span className={hud.label} title={ci(s.pace.leadChanges)}>
            {t('lab.leadChanges')}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{s.pace.margin.value.toFixed(0)} p.p.</span>
          <span className={hud.label} title={ci(s.pace.margin, 1)}>
            {t('lab.margin')}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{(s.pace.comeback.value * 100).toFixed(1)}%</span>
          <span className={hud.label} title={pc(s.pace.comeback)}>
            {t('lab.comeback')}
          </span>
        </div>
      </div>

      <h4 className={hud.label}>{t('lab.economy')}</h4>
      <div className={styles.curves}>
        <div>
          <div className={styles.legend}>
            {Object.keys(s.stockByFaction).map((f) => (
              <span key={f}>
                <FactionBadge faction={f as FactionKey} size={12} /> {t(`factions.${f}`)}
              </span>
            ))}
          </div>
          <LineChart title={t('lab.stockByFaction')} unit={t('lab.unitPoints')} series={byFaction} />
        </div>
        <div>
          <div className={styles.legend}>
            {s.stockBySeat.map((_, i) => (
              <span key={i}>
                <FactionBadge faction={seatFaction(i)} size={12} /> {t('lab.seatN', { n: i + 1 })}
              </span>
            ))}
          </div>
          <LineChart title={t('lab.stockBySeat')} unit={t('lab.unitPoints')} series={bySeat} />
        </div>
        <LineChart
          title={t('lab.income')}
          unit={t('lab.unitPoints')}
          series={one(t('lab.income'), (p) => p.produced.value)}
        />
        <LineChart
          title={t('lab.armyCurve')}
          unit={t('lab.unitStrength')}
          series={one(t('lab.armyCurve'), (p) => p.army.value)}
        />
        <LineChart
          title={t('lab.progressCurve')}
          unit="%"
          series={one(t('lab.progressCurve'), (p) => p.progress.value, 100)}
        />
      </div>

      <div className={styles.charts}>
        <figure>
          <figcaption className={hud.label}>{t('lab.actionsPerPlayer')}</figcaption>
          <BarList rows={actions} label={t('lab.actionsPerPlayer')} testId="lab-actions" />
          <p className={styles.note}>{t('lab.wasted', { v: ci(s.wasted) })}</p>
        </figure>
        <figure>
          <figcaption className={hud.label}>{t('lab.builds')}</figcaption>
          <table className={styles.table} data-testid="lab-builds">
            <thead>
              <tr>
                <th />
                <th>{t('lab.perPlayer')}</th>
                <th>{t('lab.firstRound')}</th>
                <th>{t('lab.finalLevel')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(s.builds).map(([k, b]) => (
                <tr key={k}>
                  <th>{t(`structures.${k}`)}</th>
                  <td title={ci(b.perPlayer)}>{b.perPlayer.value.toFixed(2)}</td>
                  <td>{b.firstRound ?? '—'}</td>
                  <td>{b.level === null ? '—' : b.level.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
        <figure>
          <figcaption className={hud.label}>{t('lab.cardsByCategory')}</figcaption>
          <BarList rows={cards} label={t('lab.cardsByCategory')} />
        </figure>
        <figure>
          <figcaption className={hud.label}>{t('lab.conflict')}</figcaption>
          <table className={styles.table}>
            <tbody>
              <tr>
                <th>{t('lab.combatsPerGame')}</th>
                <td>{ci(s.conflict.combats)}</td>
              </tr>
              <tr>
                <th>{t('lab.attackerWin')}</th>
                <td>{pc(s.conflict.attackerWin)}</td>
              </tr>
              <tr>
                <th>{t('lab.villageHitsPerGame')}</th>
                <td>{ci(s.conflict.villageHits)}</td>
              </tr>
            </tbody>
          </table>
        </figure>
        <Matrix title={t('lab.tradesMatrix')} m={s.trades} />
        <Matrix title={t('lab.treatiesMatrix')} m={s.treaties} />
        <Matrix title={t('lab.sabotageMatrix')} m={s.sabotage} />
      </div>
    </section>
  );
}

export function MetricsPanel({ records }: { records: readonly GameRecord[] }) {
  const s = useMemo(() => summarizeMetrics(records), [records]);
  return s ? <Panel s={s} /> : null;
}
