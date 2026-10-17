/**
 * Peças de tratado fora do construtor: resposta do destinatário (com a tela de privacidade
 * do diretor antes), confirmação de quebra de pacto (interpretação BB), faixa dourada de
 * tratados ativos no painel do jogador e o selo de assinatura/disparo/quebra.
 */
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { checkAction, type GameState, type PlayerId } from '../../engine';
import { pactsBrokenBy, treatyGoldCost } from '../../engine/rules/treaties';
import { partnerOf, treatiesOf } from '../../engine/rules/treatyQueries';
import { seatFaction } from '../../render3d/model';
import { FactionBadge, ResourceIcon } from '../components/Bits';
import { perform } from '../game/hooks';
import { useSession } from '../game/session';
import { cardName, logLine, playerName } from '../game/text';
import { useUi } from '../game/uiStore';
import hud from '../hud/Hud.module.css';
import { pactDef, treatyText } from './describe';
import styles from './Treaty.module.css';

export function TreatyReply() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const viewer = usePresentation((s) => s.viewer);
  const pending = state?.treaties.pending;
  if (!ctx || !state || !pending || viewer !== pending.to) return null;
  const me = pending.to;
  const accept = { type: 'acceptTreaty' as const, player: me };
  const check = checkAction(ctx, state, accept);
  const names = {
    from: pending.from,
    to: pending.to,
    name: (id: PlayerId) => playerName(t, id),
    card: (uid: number) => cardName(t, state, uid),
  };
  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="treaty-reply-title"
        data-testid="treaty-reply"
      >
        <div className={hud.modalHead}>
          <h2 id="treaty-reply-title" className={hud.modalTitle}>
            {t('treaty.proposalFrom', { name: playerName(t, pending.from) })}
          </h2>
          <FactionBadge faction={seatFaction(pending.from)} size={28} />
        </div>
        <div className={`${hud.paper} ${styles.review}`}>
          <p className={styles.sentence} data-testid="treaty-reply-text">
            {treatyText(t, pending.terms, names)}
          </p>
          <div className={styles.cost}>
            <ResourceIcon id="gold" size={18} onPaper />
            {t('treaty.cost', { n: treatyGoldCost(ctx, state, me) })}
          </div>
          {!check.ok && (
            <p className={hud.danger}>{t(`engine.illegal.${check.reason.key}`, check.reason.params)}</p>
          )}
        </div>
        <div className={hud.modalFoot}>
          <button
            type="button"
            className={hud.btn}
            onClick={() => perform({ type: 'rejectTreaty', player: me })}
            data-testid="treaty-reject"
          >
            {t('treaty.reject')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={!check.ok}
            onClick={() => perform(accept)}
            data-testid="treaty-accept"
          >
            {t('treaty.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A ação rompe pactos: confirmar (quem rompe descarta a mão e perde 1 ação). */
export function BreakPactConfirm() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const modal = useUi((s) => s.modal);
  if (!ctx || !state || modal?.kind !== 'breakPact') return null;
  const action = modal.action;
  const broken =
    action.type === 'breakTreaty'
      ? state.treaties.active.filter((x) => x.id === action.treaty)
      : pactsBrokenBy(ctx, state, action);
  const list = broken
    .map((x) => (x.terms.kind === 'pact' ? (pactDef(x.terms.pact)?.name ?? x.terms.pact) : `#${x.id}`))
    .join(', ');
  const close = () => useUi.getState().open(null);
  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="break-title"
        data-testid="break-pact"
      >
        <h2 id="break-title" className={hud.modalTitle}>
          {t('treaty.breakTitle')}
        </h2>
        <p className={`${hud.paper} ${hud.modalBody}`}>{t('treaty.breakWarn', { list })}</p>
        <div className={hud.modalFoot}>
          <button type="button" className={hud.btn} onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            onClick={() => {
              close();
              perform(action, true);
            }}
            data-testid="break-pact-confirm"
          >
            {t('treaty.breakConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Faixa dourada (UX_SPEC 2.12): um selo por tratado ativo do jogador, na cor de quem tem a
 * obrigação e com o ícone do beneficiário. Pacto: obrigação dos dois (cor do jogador e
 * símbolo do parceiro).
 */
export function TreatyBand({ state, player }: { state: GameState; player: PlayerId }) {
  const { t } = useTranslation();
  const list = treatiesOf(state, player);
  const flash = usePresentation((s) => s.treatyFx);
  if (list.length === 0) return null;
  return (
    <div
      className={styles.band}
      aria-label={t('treaty.band', { name: playerName(t, player) })}
      data-testid={`treaty-band-${player}`}
    >
      {list.map((tr) => {
        const c = tr.terms.kind === 'contract' ? tr.terms : null;
        const obligor =
          c?.obligor === 'me' ? tr.parties[0] : c?.obligor === 'you' ? tr.parties[1] : c ? null : player;
        const beneficiary = obligor === null ? partnerOf(tr, player) : partnerOf(tr, obligor);
        const color =
          obligor === null ? 'var(--resource-gold-color)' : `var(--faction-${seatFaction(obligor)}-color)`;
        const text = treatyText(t, tr.terms, {
          from: tr.parties[0],
          to: tr.parties[1],
          name: (id) => playerName(t, id),
          card: (uid) => cardName(t, state, uid),
        });
        return (
          <span
            key={tr.id}
            className={`${styles.pill} ${flash?.treaty === tr.id ? styles.flash : ''}`}
            style={{ borderColor: color }}
            title={`#${tr.id} · ${text} · ${t('treaty.until', { n: tr.until })}`}
            data-testid={`treaty-pill-${tr.id}`}
          >
            <FactionBadge faction={seatFaction(beneficiary)} size={11} />#{tr.id}
          </span>
        );
      })}
    </div>
  );
}

/** Selo central enquanto o diretor toca assinatura, disparo ou quebra. */
export function TreatyFx() {
  const { t } = useTranslation();
  const fx = usePresentation((s) => s.treatyFx);
  const viewer = usePresentation((s) => s.viewer);
  const state = useSession((s) => s.state);
  if (!fx) return null;
  return (
    <div
      className={`${hud.plate} ${styles.fx} ${fx.kind === 'broken' ? styles.fxBroken : ''}`}
      role="status"
      data-testid="treaty-fx"
    >
      <p className={styles.fxTitle}>{t(`treaty.${fx.kind}`)}</p>
      <p className={styles.sentence}>{logLine(t, fx.event, viewer, state)}</p>
    </div>
  );
}
