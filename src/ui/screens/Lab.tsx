/**
 * Laboratório (UX_SPEC 2.18, PROMPTS Fase 5): edita balance.json ao vivo, liga camadas e
 * roda N partidas IA × IA em Web Workers, com barra de progresso, gráficos e CSV.
 */
import { WINCONS } from '../../data/gameRules';
import { MetricsPanel } from '../lab/MetricsPanel';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AI_FOCI } from '../../ai/types';
import { RESOURCE_IDS } from '../../data/schemas';
import { cardsCsv, gamesCsv, type SimSummary, summaryText } from '../../sim/report';
import { SIM_LAYERS } from '../../sim/run';
import { cardFace } from '../card/faces';
import { playerName } from '../game/text';
import hud from '../hud/Hud.module.css';
import { BalanceEditor } from '../lab/BalanceEditor';
import { type BarRow, BarList } from '../lab/Charts';
import { draftErrors, LEVEL_OPTIONS, useLab } from '../lab/labStore';
import styles from '../lab/Lab.module.css';
import { useNav } from '../nav';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function trackName(t: TFunction, track: string): string {
  if ((RESOURCE_IDS as readonly string[]).includes(track)) return t(`resources.${track}`);
  return t(`lab.track.${track}`);
}

function SimControls() {
  const { t } = useTranslation();
  const config = useLab((s) => s.config);
  const run = useLab((s) => s.run);
  const draft = useLab((s) => s.draft);
  const { setConfig, setLayer, start, stop } = useLab.getState();
  const running = !!run && run.finishedAt === null;
  const errors = draftErrors(draft);
  const level = config.levels.length === 1 ? config.levels[0] : 'mix';

  return (
    <section className={`${hud.plate} ${styles.controls}`} aria-label={t('lab.simulator')}>
      <header className={styles.panelHead}>
        <h2 className={styles.h2}>{t('lab.simulator')}</h2>
      </header>
      <div className={styles.form}>
        <label>
          <span className={hud.label}>{t('lab.games')}</span>
          <input
            type="number"
            min={1}
            max={5000}
            value={config.games}
            onChange={(e) => setConfig({ games: Math.max(1, Math.floor(e.target.valueAsNumber || 1)) })}
            data-testid="lab-games"
          />
        </label>
        <label>
          <span className={hud.label}>{t('lab.players')}</span>
          <select value={config.players} onChange={(e) => setConfig({ players: Number(e.target.value) })}>
            {[3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={hud.label}>{t('lab.seed')}</span>
          <input
            type="number"
            min={0}
            value={config.seed}
            onChange={(e) => setConfig({ seed: Math.max(0, Math.floor(e.target.valueAsNumber || 0)) })}
          />
        </label>
        <label>
          <span className={hud.label}>{t('lab.level')}</span>
          <select
            value={level}
            onChange={(e) =>
              setConfig({
                levels:
                  e.target.value === 'mix'
                    ? ['easy', 'normal', 'hard']
                    : [e.target.value as (typeof LEVEL_OPTIONS)[number]],
              })
            }
          >
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {t(`newGame.seat.${l}`)}
              </option>
            ))}
            <option value="mix">{t('lab.levelMix')}</option>
          </select>
        </label>
        <label>
          <span className={hud.label}>{t('lab.style')}</span>
          <select
            value={config.style}
            onChange={(e) => setConfig({ style: e.target.value === 'balanced' ? 'balanced' : 'mixed' })}
          >
            <option value="mixed">{t('lab.styleMixed')}</option>
            <option value="balanced">{t('lab.styleBalanced')}</option>
          </select>
        </label>
        <label className={`${styles.check} ${styles.wide}`}>
          <input
            type="checkbox"
            checked={config.longMap}
            onChange={(e) => setConfig({ longMap: e.target.checked })}
          />
          {t('newGame.edge5')}
        </label>
      </div>
      <fieldset className={styles.layers}>
        <legend className={hud.label}>{t('lab.layers')}</legend>
        <label className={styles.check}>
          <input type="checkbox" checked disabled />
          {t('lab.layer.economy')}
        </label>
        {SIM_LAYERS.map((l) => (
          <label key={l} className={styles.check}>
            <input
              type="checkbox"
              checked={!!config.layers[l]}
              onChange={(e) => setLayer(l, e.target.checked)}
              data-testid={`lab-layer-${l}`}
            />
            {t(`lab.layer.${l}`)}
          </label>
        ))}
        <p className={styles.note}>{t('lab.layersNote')}</p>
      </fieldset>
      <fieldset className={styles.layers}>
        <legend className={hud.label}>{t('lab.wincons')}</legend>
        {WINCONS.map((w) => {
          const on = !config.wincons || config.wincons.includes(w);
          const last = on && (config.wincons?.length ?? WINCONS.length) === 1;
          return (
            <label key={w} className={styles.check}>
              <input
                type="checkbox"
                checked={on}
                disabled={last}
                onChange={(e) => useLab.getState().setWincon(w, e.target.checked)}
                data-testid={`lab-win-${w}`}
              />
              {trackName(t, w)}
            </label>
          );
        })}
        <p className={styles.note}>{t('lab.winconsNote')}</p>
      </fieldset>
      {errors.length > 0 && (
        <div className={styles.errors} role="alert">
          <strong>{t('lab.invalid')}</strong>
          <ul>
            {errors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.buttons}>
        {running ? (
          <button type="button" className={hud.btn} onClick={stop} data-testid="lab-stop">
            {t('lab.stop')}
          </button>
        ) : (
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            onClick={start}
            disabled={errors.length > 0}
            data-testid="lab-run"
          >
            {t('lab.run')}
          </button>
        )}
      </div>
      {run && (
        <div className={styles.progress} data-testid="lab-progress">
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={run.total}
            aria-valuenow={run.done}
          >
            <span style={{ width: `${(run.done / run.total) * 100}%` }} />
          </div>
          <span>
            {t('lab.progress', { done: run.done, total: run.total })}
            {run.finishedAt !== null &&
              ` · ${t('lab.elapsed', { s: ((run.finishedAt - run.startedAt) / 1000).toFixed(1) })}`}
          </span>
        </div>
      )}
    </section>
  );
}

function Results({ s }: { s: SimSummary }) {
  const { t } = useTranslation();
  const records = useLab((st) => st.records);
  const n = Math.max(1, s.games);
  const byTrack: BarRow[] = Object.entries(s.winsByTrack)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: trackName(t, k), value: v / n, display: pct(v / n), muted: v === 0 }));
  const bySeat: BarRow[] = s.winsBySeat.map((v, i) => ({
    key: String(i),
    label: playerName(t, i),
    value: v / n,
    display: pct(v / n),
  }));
  // Fase 9: vitória por facção (% das partidas em que jogou).
  const byFaction: BarRow[] = Object.entries(s.winsByFaction)
    .map(([f, v]) => ({ f, rate: v.wins / Math.max(1, v.seats), v }))
    .sort((a, b) => b.rate - a.rate)
    .map(({ f, rate, v }) => ({
      key: f,
      label: t(`factions.${f}`),
      value: rate,
      display: pct(rate),
      title: t('lab.factionTitle', { seats: v.seats }),
    }));
  const foci = Object.entries(s.winsByFocus);
  const byFocus: BarRow[] = AI_FOCI.filter((f) => s.winsByFocus[f]).map((f) => {
    const v = s.winsByFocus[f]!;
    const rate = v.onFocus / Math.max(1, v.seats);
    return {
      key: f,
      label: trackName(t, f),
      value: rate,
      display: pct(rate),
      title: t('lab.focusTitle', {
        seats: v.seats,
        wins: pct(v.wins / Math.max(1, v.seats)),
        own: pct(rate),
      }),
      muted: v.onFocus === 0,
    };
  });
  const levels = Object.entries(s.winsByLevel);
  const byLevel: BarRow[] = levels.map(([k, v]) => ({
    key: k,
    label: t(`newGame.seat.${k}`),
    value: v.wins / Math.max(1, v.seats),
    display: pct(v.wins / Math.max(1, v.seats)),
  }));
  const rounds: BarRow[] = Object.entries(s.roundsHistogram)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([r, c]) => ({ key: r, label: t('lab.roundN', { n: r }), value: c, display: String(c) }));
  const hazards: BarRow[] = Object.entries(s.hazards)
    .sort((a, b) => b[1].hitGames / b[1].games - a[1].hitGames / a[1].games)
    .map(([k, v]) => ({
      key: k,
      label: t(`terrain.${k}`),
      value: v.hitGames / Math.max(1, v.games),
      display: pct(v.hitGames / Math.max(1, v.games)),
      title: t('lab.hazardTitle', { n: (v.hits / Math.max(1, v.games)).toFixed(2) }),
    }));
  const played = s.cards.filter((c) => c.drawn > 0 || c.played > 0);
  const least = [...played].sort((a, b) => a.played - b.played || a.rate - b.rate).slice(0, 6);

  return (
    <section
      className={`${hud.plate} ${styles.results}`}
      aria-label={t('lab.results')}
      data-testid="lab-results"
    >
      <header className={styles.panelHead}>
        <h2 className={styles.h2}>{t('lab.results')}</h2>
        <div className={styles.buttons}>
          <button
            type="button"
            className={hud.btn}
            onClick={() => download('games.csv', gamesCsv(records), 'text/csv')}
          >
            {t('lab.csvGames')}
          </button>
          <button
            type="button"
            className={hud.btn}
            onClick={() => download('cards.csv', cardsCsv(s), 'text/csv')}
          >
            {t('lab.csvCards')}
          </button>
          <button
            type="button"
            className={hud.btn}
            onClick={() => download('summary.txt', summaryText(s) + '\n', 'text/plain')}
          >
            {t('lab.txtSummary')}
          </button>
        </div>
      </header>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{s.rounds.mean.toFixed(1)}</span>
          <span className={hud.label}>{t('lab.meanRounds')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{pct(s.roundLimitRate)}</span>
          <span className={hud.label}>{t('lab.roundLimitRate')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{s.tradesAcceptedPerGame.toFixed(2)}</span>
          <span className={hud.label}>{t('lab.tradesPerGame')}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{(s.msPerGame / 1000).toFixed(2)} s</span>
          <span className={hud.label}>{t('lab.cpuPerGame')}</span>
        </div>
      </div>
      <div className={styles.charts}>
        <figure>
          <figcaption className={hud.label}>{t('lab.winsByTrack')}</figcaption>
          <BarList rows={byTrack} label={t('lab.winsByTrack')} testId="chart-tracks" />
        </figure>
        {foci.length > 1 && (
          <figure>
            <figcaption className={hud.label}>{t('lab.winsByFocus')}</figcaption>
            <BarList rows={byFocus} label={t('lab.winsByFocus')} />
          </figure>
        )}
        {byFaction.length > 1 && (
          <figure>
            <figcaption className={hud.label}>{t('lab.winsByFaction')}</figcaption>
            <BarList rows={byFaction} label={t('lab.winsByFaction')} testId="chart-factions" />
          </figure>
        )}
        <figure>
          <figcaption className={hud.label}>{t('lab.winsBySeat')}</figcaption>
          <BarList rows={bySeat} label={t('lab.winsBySeat')} />
        </figure>
        {levels.length > 1 && (
          <figure>
            <figcaption className={hud.label}>{t('lab.winsByLevel')}</figcaption>
            <BarList rows={byLevel} label={t('lab.winsByLevel')} />
          </figure>
        )}
        {hazards.length > 0 && (
          <figure>
            <figcaption className={hud.label}>{t('lab.hazards')}</figcaption>
            <BarList rows={hazards} label={t('lab.hazards')} testId="chart-hazards" />
          </figure>
        )}
        <figure>
          <figcaption className={hud.label}>{t('lab.duration')}</figcaption>
          <BarList rows={rounds} label={t('lab.duration')} />
        </figure>
        <figure>
          <figcaption className={hud.label}>{t('lab.resources')}</figcaption>
          <table className={styles.table}>
            <thead>
              <tr>
                <th />
                <th>{t('lab.produced')}</th>
                <th>{t('lab.bank')}</th>
                <th>{t('lab.traded')}</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCE_IDS.map((id) => (
                <tr key={id}>
                  <th>{t(`resources.${id}`)}</th>
                  <td>{s.producedPerGame[id].toFixed(1)}</td>
                  <td>{s.bankTradedPerGame[id].toFixed(1)}</td>
                  <td>{s.playerTradedPerGame[id].toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
        <figure>
          <figcaption className={hud.label}>{t('lab.cardsMost')}</figcaption>
          <table className={styles.table}>
            <tbody>
              {played.slice(0, 6).map((c) => (
                <tr key={c.id}>
                  <th>{cardFace(c.id).title}</th>
                  <td>{c.played}</td>
                  <td>{pct(c.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <figcaption className={hud.label}>{t('lab.cardsLeast')}</figcaption>
          <table className={styles.table}>
            <tbody>
              {least.map((c) => (
                <tr key={c.id}>
                  <th>{cardFace(c.id).title}</th>
                  <td>{c.played}</td>
                  <td>{pct(c.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </div>
      <MetricsPanel records={records} />
    </section>
  );
}

export function Lab() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  const summary = useLab((s) => s.summary);
  const error = useLab((s) => s.error);
  return (
    <main className={styles.screen} data-testid="lab">
      <header className={styles.top}>
        <button type="button" className={hud.btn} onClick={() => go('home')}>
          {t('common.back')}
        </button>
        <h1 className={styles.title}>{t('lab.title')}</h1>
        <p className={styles.note}>{t('lab.subtitle')}</p>
      </header>
      <div className={styles.layout}>
        <BalanceEditor />
        <div className={styles.side}>
          <SimControls />
          {error && (
            <div className={styles.errors} role="alert">
              {error}
            </div>
          )}
          {summary && <Results s={summary} />}
        </div>
      </div>
    </main>
  );
}
