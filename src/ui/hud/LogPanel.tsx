/**
 * Registro da partida (UX_SPEC 2.5): narra os eventos do motor em pt-BR, agrupados por
 * rodada, filtráveis por jogador; os detalhes automáticos (fases, custos) ficam atrás
 * de um interruptor. Tab mostra/esconde. Respeita a privacidade do subsolo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { useSession } from '../game/session';
import { eventPlayers, LOG_DETAIL, logLine, playerName } from '../game/text';
import styles from './Game.module.css';
import hud from './Hud.module.css';

export function LogPanel() {
  const { t } = useTranslation();
  const log = usePresentation((s) => s.log);
  const viewer = usePresentation((s) => s.viewer);
  const shown = usePresentation((s) => s.shown);
  const players = useSession((s) => s.state?.players.length ?? 0);
  const [who, setWho] = useState<number | 'all'>('all');
  const [details, setDetails] = useState(false);
  const list = useRef<HTMLOListElement>(null);

  const lines = useMemo(
    () =>
      log
        .filter((e) => details || !LOG_DETAIL.has(e.event.type))
        .filter((e) => who === 'all' || eventPlayers(e.event).includes(who))
        .map((e) => ({
          id: e.id,
          round: e.round,
          type: e.event.type,
          text: logLine(t, e.event, viewer, shown),
        })),
    [log, details, who, viewer, shown, t],
  );

  // Sempre na linha mais nova.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <section className={styles.log} aria-label={t('hud.log')}>
      <div className={styles.logHead}>
        <h2 className={hud.plateTitle}>{t('hud.log')}</h2>
        <span className={hud.kbd}>Tab</span>
      </div>
      <div className={styles.logFilters}>
        <select
          value={who}
          onChange={(e) => setWho(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          aria-label={t('hud.logFilter')}
        >
          <option value="all">{t('hud.logAll')}</option>
          {Array.from({ length: players }, (_, i) => (
            <option key={i} value={i}>
              {playerName(t, i)}
            </option>
          ))}
        </select>
        <label className={styles.logToggle}>
          <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
          {t('hud.logDetails')}
        </label>
      </div>
      <ol ref={list} className={`${hud.paper} ${styles.logList}`} data-testid="log">
        {lines.length === 0 && <li className={hud.muted}>{t('hud.logEmpty')}</li>}
        {lines.map((l) => (
          <li key={l.id} className={l.type === 'roundStarted' ? styles.logRound : styles.logLine}>
            {l.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
