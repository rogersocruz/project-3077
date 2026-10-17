/**
 * Fim de partida (UX_SPEC 2.16): câmera em órbita lenta no tabuleiro vencedor, placa
 * "VITÓRIA — {condição}" e abas Classificação · Gráficos · Linha do tempo · Exportar.
 * Botões: Revanche (mesma seed), Nova partida, Menu.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import type { GameState, PlayerId } from '../../engine';
import { playerTracks, progress, type TrackId } from '../../engine/rules/victory';
import { seatFaction } from '../../render3d/model';
import { useSceneStore } from '../../render3d/sceneStore';
import { prefersReducedMotion } from '../../settings';
import { FactionBadge } from '../components/Bits';
import { useSession } from '../game/session';
import { logLine, playerName } from '../game/text';
import gameStyles from '../hud/Game.module.css';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import styles from './End.module.css';
import { exportGame, gameHistory, type GameHistory } from './history';
import { LineChart } from './LineChart';

type Tab = 'standings' | 'charts' | 'timeline' | 'export';
const TABS: readonly Tab[] = ['standings', 'charts', 'timeline', 'export'];

function useTrackName() {
  const { t } = useTranslation();
  return (state: GameState, player: PlayerId, k: TrackId) => {
    if (k === 'expansion') return t('end.expansion');
    if (k === 'tribe')
      return t('end.tribe', { name: playerName(t, state.players[player]?.tribeTarget ?? 0) });
    return t('end.hoard', { resource: t(`resources.${k}`) });
  };
}

function Standings({ state }: { state: GameState }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const trackName = useTrackName();
  if (!ctx) return null;
  const rows = state.players
    .map((p) => ({ id: p.id, prog: progress(ctx, state, p.id), p }))
    .sort((a, b) => b.prog.total - a.prog.total);
  return (
    <table className={gameStyles.standings} data-testid="end-standings">
      <thead>
        <tr>
          <th>#</th>
          <th>{t('end.player')}</th>
          <th>{t('end.progress')}</th>
          <th>{t('end.best')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => {
          const tracks = playerTracks(state, s.id);
          const best = tracks.reduce((a, b) => (s.prog.tracks[b] > s.prog.tracks[a] ? b : a));
          return (
            <tr key={s.id} className={state.winners.includes(s.id) ? gameStyles.winRow : ''}>
              <td className={hud.num}>{i + 1}</td>
              <td>
                <FactionBadge faction={seatFaction(s.id)} size={14} /> {playerName(t, s.id)}
                {s.p.eliminated && (
                  <span className={hud.muted}> · {t(s.p.neutral ? 'end.neutral' : 'end.eliminated')}</span>
                )}
              </td>
              <td className={hud.num}>{Math.round(s.prog.total * 100)}%</td>
              <td>
                {trackName(state, s.id, best)} {Math.round(s.prog.tracks[best] * 100)}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Charts({ history, state }: { history: GameHistory; state: GameState }) {
  const { t } = useTranslation();
  const series = (pick: (p: GameHistory['rounds'][number]['players'][number]) => number) =>
    state.players.map((p) => ({
      id: p.id,
      name: playerName(t, p.id),
      color: `var(--faction-${seatFaction(p.id)}-color)`,
      points: history.rounds.map((r) => ({ x: r.round, y: pick(r.players[p.id] ?? r.players[0]!) })),
    }));
  return (
    <>
      <div className={styles.legend}>
        {state.players.map((p) => (
          <span key={p.id} className={styles.legendItem}>
            <FactionBadge faction={seatFaction(p.id)} size={14} />
            {playerName(t, p.id)}
          </span>
        ))}
      </div>
      <div className={styles.charts} data-testid="end-charts">
        <LineChart title={t('end.chartStock')} unit={t('end.unitPoints')} series={series((p) => p.stock)} />
        <LineChart
          title={t('end.chartMilitary')}
          unit={t('end.unitStrength')}
          series={series((p) => p.military)}
        />
        <LineChart title={t('end.chartCards')} unit={t('end.unitCards')} series={series((p) => p.cards)} />
        <LineChart
          title={t('end.chartProgress')}
          unit="%"
          series={series((p) => Math.round(p.progress * 100))}
        />
      </div>
    </>
  );
}

function Timeline({ history, state }: { history: GameHistory; state: GameState }) {
  const { t } = useTranslation();
  const viewer = usePresentation((s) => s.viewer);
  let last = -1;
  return (
    <ol className={styles.timeline} data-testid="end-timeline">
      {history.timeline.map((item, i) => {
        const head = item.round !== last;
        last = item.round;
        return (
          <li key={i} className={styles.tlItem}>
            {head && <span className={styles.tlRound}>{t('end.round', { n: item.round })}</span>}
            <span>{logLine(t, item.event, viewer, state)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Export({ state }: { state: GameState }) {
  const { t } = useTranslation();
  const options = useSession((s) => s.options);
  if (!options) return null;
  const download = () => {
    const blob = new Blob([exportGame(state, options)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projeto-3077-seed-${state.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={styles.export}>
      <p>{t('end.exportHint', { n: state.log.length })}</p>
      <button
        type="button"
        className={`${hud.btn} ${hud.btnPrimary}`}
        onClick={download}
        data-testid="end-export"
      >
        {t('end.export')}
      </button>
    </div>
  );
}

export function EndScreen() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const options = useSession((s) => s.options);
  const state = useSession((s) => s.state);
  const rematch = useSession((s) => s.rematch);
  const shown = usePresentation((s) => s.shown);
  const reduced = prefersReducedMotion();
  const go = useNav((s) => s.go);
  const [tab, setTab] = useState<Tab>('standings');
  const trackName = useTrackName();
  const over = !!ctx && !!shown && shown.stage === 'over';
  const winners = shown?.winners ?? [];
  const first = winners[0];

  // UX_SPEC 2.16: câmera no tabuleiro vencedor em órbita lenta.
  useEffect(() => {
    if (!over || first === undefined || !shown) return;
    const board = shown.players[first]?.boardId ?? first;
    useSceneStore.getState().requestFocus({ kind: 'board', boardId: board });
    useSceneStore.getState().setOrbit(!reduced);
    return () => useSceneStore.getState().setOrbit(false);
  }, [over, first, shown, reduced]);

  // O histórico refaz a partida pelo log: só quando a aba precisa.
  const needsHistory = tab === 'charts' || tab === 'timeline';
  const history = useMemo(
    () => (over && needsHistory && ctx && options && state ? gameHistory(ctx, options, state.log) : null),
    [over, needsHistory, ctx, options, state],
  );
  if (!over || !shown) return null;

  const met = [...new Set(winners.flatMap((w) => progress(ctx, shown, w).met.map((k) => ({ w, k }))))];
  const alive = shown.players.filter((p) => !p.eliminated).length;
  const condition =
    shown.endReason === 'roundLimit'
      ? t('end.roundLimit')
      : met.length
        ? [...new Set(met.map(({ w, k }) => trackName(shown, w, k)))].join(' · ')
        : alive === 1
          ? t('end.elimination')
          : '';

  return (
    <div
      className={`${hud.overlay} ${styles.overlay}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-title"
      data-testid="end"
    >
      <div className={`${hud.plate} ${hud.rivets} ${hud.modal} ${gameStyles.endModal} ${styles.modal}`}>
        <h2 id="end-title" className={gameStyles.endTitle}>
          {t('end.victory')} <span>—</span> <em data-testid="end-condition">{condition}</em>
        </h2>
        <div className={gameStyles.winners}>
          {winners.map((w) => (
            <span key={w} className={gameStyles.winner}>
              <FactionBadge faction={seatFaction(w)} size={34} />
              {playerName(t, w)}
            </span>
          ))}
          {winners.length > 1 && <span className={hud.label}>{t('end.shared')}</span>}
        </div>
        <div className={styles.tabs} role="tablist">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`${hud.btn} ${tab === k ? hud.btnOn : ''}`}
              onClick={() => setTab(k)}
              data-testid={`end-tab-${k}`}
            >
              {t(`end.tab.${k}`)}
            </button>
          ))}
        </div>
        <div className={`${hud.paper} ${hud.modalBody} ${styles.body}`}>
          {tab === 'standings' && <Standings state={shown} />}
          {tab === 'charts' && history && <Charts history={history} state={shown} />}
          {tab === 'timeline' && history && <Timeline history={history} state={shown} />}
          {tab === 'export' && <Export state={state ?? shown} />}
          <p className={hud.muted}>{t('end.rounds', { round: shown.round })}</p>
        </div>
        <div className={hud.modalFoot}>
          <button type="button" className={hud.btn} onClick={() => go('home')}>
            {t('end.menu')}
          </button>
          <button type="button" className={hud.btn} onClick={() => go('newGame')}>
            {t('end.newGame')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            onClick={rematch}
            data-testid="rematch"
          >
            {t('end.rematch')}
          </button>
        </div>
      </div>
    </div>
  );
}
