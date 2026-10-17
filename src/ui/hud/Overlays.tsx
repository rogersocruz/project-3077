/**
 * Sobreposições da partida: tela de privacidade do hotseat (UX_SPEC 2.15), fim de
 * pausa mínima, regras rápidas (F1), faixa de rodada e avisos.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { director, usePresentation } from '../../anim';
import { TURN_PHASES } from '../../engine';
import { seatFaction } from '../../render3d/model';
import { FactionBadge, Icon } from '../components/Bits';
import { useNav } from '../nav';
import { useSession } from '../game/session';
import { playerName } from '../game/text';
import { useUi } from '../game/uiStore';
import styles from './Game.module.css';
import hud from './Hud.module.css';

export function PrivacyScreen() {
  const { t } = useTranslation();
  const gate = usePresentation((s) => s.gate);
  const round = usePresentation((s) => s.turn?.round ?? 0);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), [gate]);
  if (!gate) return null;
  const name = playerName(t, gate.player);
  return (
    <div
      className={styles.privacy}
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-title"
      data-testid="privacy"
    >
      <div className={`${hud.plate} ${hud.rivets} ${styles.privacyPlate}`}>
        <FactionBadge faction={seatFaction(gate.player)} size={96} />
        <span className={hud.label}>{t('hud.player', { n: gate.player + 1 })}</span>
        <h2 id="privacy-title" className={styles.privacyTitle}>
          {gate.reason === 'trade' ? t('privacy.trade', { name }) : t('privacy.turn', { name })}
        </h2>
        <p className={styles.privacyHint}>{t(`privacy.hint.${gate.reason}`, { round })}</p>
        <button
          ref={button}
          type="button"
          className={`${hud.btn} ${hud.btnPrimary} ${styles.privacyBtn}`}
          onClick={() => director.release()}
          data-testid="privacy-ready"
        >
          {t('privacy.ready')}
        </button>
      </div>
    </div>
  );
}

export function PauseMenu() {
  const { t } = useTranslation();
  const open = useUi((s) => s.open);
  const go = useNav((s) => s.go);
  return (
    <div
      className={hud.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-title"
      data-testid="pause"
    >
      <div className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.pauseModal}`}>
        <h2 id="pause-title" className={hud.modalTitle}>
          {t('pause.title')}
        </h2>
        <button type="button" className={`${hud.btn} ${hud.btnPrimary}`} onClick={() => open(null)} autoFocus>
          {t('pause.resume')}
        </button>
        <button type="button" className={hud.btn} onClick={() => open({ kind: 'rules' })}>
          {t('rules.title')}
        </button>
        <button type="button" className={hud.btn} onClick={() => go('newGame')}>
          {t('end.newGame')}
        </button>
        <button type="button" className={hud.btn} onClick={() => go('home')}>
          {t('pause.menu')}
        </button>
        <p className={styles.pauseNote}>{t('pause.note')}</p>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['E', 'hud.explore'],
  ['R', 'hud.survey'],
  ['B', 'hud.build'],
  ['U', 'hud.upgrade'],
  ['M', 'hud.bank'],
  ['T', 'hud.trade'],
  ['Y', 'hud.treaty'],
  ['Enter', 'rules.keyEnd'],
  ['Ctrl+Z', 'hud.undo'],
  ['Tab', 'hud.log'],
  ['Esc', 'rules.keyEsc'],
  ['F1', 'rules.title'],
  ['WASD', 'rules.keyPan'],
  ['1–6', 'rules.keyFocus'],
  [' ␣ ', 'rules.keyMine'],
];

export function QuickRules() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const close = () => useUi.getState().open(null);
  if (!ctx) return null;
  // Números de regra vêm dos dados, nunca do texto (CLAUDE.md regra 3).
  const b = ctx.balance;
  const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
  const params: Record<string, Record<string, string | number>> = {
    upkeep: { coal: ctx.structure('mine').upkeep?.coal ?? b.production.mineCoalUpkeep },
    actions: { n: b.turn.actionsPerTurn },
    build: { range: ctx.structure('village').levels[0]?.range ?? b.range.village, slots: b.hex.slots },
    bank: { buy: signed(b.bank.buyOffset), sell: signed(b.bank.sellOffset) },
    victory: { hexes: b.victory.expansionHexes },
  };
  return (
    <div className={hud.overlay} role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.rulesModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        data-testid="rules"
      >
        <div className={hud.modalHead}>
          <h2 id="rules-title" className={hud.modalTitle}>
            {t('rules.title')}
          </h2>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnIcon}`}
            onClick={close}
            aria-label={t('common.close')}
          >
            <Icon glyph="close" size={14} />
          </button>
        </div>
        <div className={`${hud.paper} ${hud.modalBody} ${styles.rulesBody}`}>
          <section>
            <h3 className={hud.paperHeading}>{t('rules.turnTitle')}</h3>
            <ol className={styles.rulesList}>
              {TURN_PHASES.map((p) => (
                <li key={p}>
                  <strong>{t(`phases.${p}`)}</strong> — {t(`rules.phase.${p}`, params[p])}
                </li>
              ))}
            </ol>
            <h3 className={hud.paperHeading}>{t('rules.actionsTitle')}</h3>
            <ul className={styles.rulesList}>
              {(['explore', 'survey', 'build', 'upgrade', 'bank', 'trade', 'victory'] as const).map((k) => (
                <li key={k}>{t(`rules.action.${k}`, params[k])}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className={hud.paperHeading}>{t('rules.shortcuts')}</h3>
            <table className={styles.keys}>
              <tbody>
                {SHORTCUTS.map(([k, label]) => (
                  <tr key={k}>
                    <td>
                      <span className={styles.keyCap}>{k}</span>
                    </td>
                    <td>{t(label)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

export function RoundBanner() {
  const { t } = useTranslation();
  const banner = usePresentation((s) => s.banner);
  if (!banner) return null;
  return (
    <div className={styles.bannerWrap} aria-live="polite">
      <div key={banner.round} className={`${hud.plate} ${hud.rivets} ${styles.banner}`}>
        <span className={hud.label}>{t('banner.kicker')}</span>
        <span className={styles.bannerText}>{t('banner.round', { round: banner.round })}</span>
      </div>
    </div>
  );
}

export function Toast() {
  const { t } = useTranslation();
  const toast = useUi((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(
      () => useUi.setState((s) => (s.toast === toast ? { toast: null } : s)),
      2800,
    );
    return () => window.clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  return (
    <div
      key={toast.nonce}
      className={`${hud.paper} ${styles.toast} ${toast.tone === 'warn' ? styles.toastWarn : ''}`}
      role="status"
      data-testid="toast"
    >
      {t(toast.key, toast.params)}
    </div>
  );
}
