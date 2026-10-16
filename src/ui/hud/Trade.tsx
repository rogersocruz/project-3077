/**
 * Comércio entre jogadores (UX_SPEC 2.11): proposta em duas colunas (eu dou / eu
 * recebo) e a resposta do destinatário — Aceitar, Recusar ou Contrapropor. Em hotseat,
 * o diretor passa o dispositivo com a tela de privacidade antes de cada resposta.
 * Cartas e permanentes entram nas trocas com a camada de cartas (Fase 4).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import { type Action, checkAction, type PlayerId, type Resources } from '../../engine';
import { seatFaction } from '../../render3d/model';
import { FactionBadge, Icon, ResourceIcon, Stepper } from '../components/Bits';
import { perform } from '../game/hooks';
import { useSession } from '../game/session';
import { amountsText, playerName } from '../game/text';
import { useUi } from '../game/uiStore';
import styles from './Game.module.css';
import hud from './Hud.module.css';

type Amounts = Partial<Resources>;

function clean(a: Amounts): Amounts {
  return Object.fromEntries(Object.entries(a).filter(([, v]) => (v ?? 0) > 0));
}

function Column({
  title,
  amounts,
  max,
  onChange,
  testid,
}: {
  title: string;
  amounts: Amounts;
  max: Resources;
  onChange: (id: ResourceId, v: number) => void;
  testid: string;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className={styles.side} data-testid={testid}>
      <legend className={hud.label}>{title}</legend>
      <ul className={styles.tradeList}>
        {RESOURCE_IDS.map((id) => (
          <li key={id} className={styles.tradeItem}>
            <ResourceIcon id={id} size={18} />
            <span className={styles.resTileName}>{t(`resources.${id}`)}</span>
            <span className={`${hud.muted} ${styles.tradeHas}`}>{t('trade.has', { n: max[id] })}</span>
            <Stepper
              value={amounts[id] ?? 0}
              min={0}
              max={max[id]}
              onChange={(v) => onChange(id, v)}
              label={`${title} · ${t(`resources.${id}`)}`}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** Montar proposta (ou contraproposta) para outro jogador. */
export function TradeModal({ counter }: { counter: boolean }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const close = () => useUi.getState().open(null);
  const pending = state?.pendingTrade ?? null;
  const me: PlayerId = counter && pending ? pending.to : (state?.activePlayer ?? 0);
  const others = state?.players.filter((p) => p.id !== me).map((p) => p.id) ?? [];
  const [partner, setPartner] = useState<PlayerId>(counter && pending ? pending.from : (others[0] ?? 0));
  // Contraproposta parte da proposta recebida, invertida.
  const [give, setGive] = useState<Amounts>(counter && pending ? { ...pending.receive } : {});
  const [receive, setReceive] = useState<Amounts>(counter && pending ? { ...pending.give } : {});
  if (!ctx || !state) return null;

  const mine = state.players[me]?.resources;
  const theirs = state.players[partner]?.resources;
  if (!mine || !theirs) return null;
  const action: Action = counter
    ? { type: 'counterTrade', player: me, give: clean(give), receive: clean(receive) }
    : { type: 'proposeTrade', player: me, to: partner, give: clean(give), receive: clean(receive) };
  const check = checkAction(ctx, state, action);

  return (
    <div className={hud.overlay} role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.tradeModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-title"
        data-testid="trade"
      >
        <div className={hud.modalHead}>
          <h2 id="trade-title" className={hud.modalTitle}>
            {counter ? t('trade.counterTitle', { name: playerName(t, partner) }) : t('trade.title')}
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

        {!counter && (
          <div className={styles.partners} role="radiogroup" aria-label={t('trade.partner')}>
            <span className={hud.label}>{t('trade.partner')}</span>
            {others.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={partner === id}
                className={`${hud.btn} ${partner === id ? hud.btnOn : ''}`}
                onClick={() => {
                  setPartner(id);
                  setReceive({});
                }}
                data-testid={`trade-partner-${id}`}
              >
                <FactionBadge faction={seatFaction(id)} size={16} />
                {playerName(t, id)}
              </button>
            ))}
          </div>
        )}

        <div className={styles.bankSides}>
          <Column
            title={t('trade.iGive')}
            amounts={give}
            max={mine}
            onChange={(id, v) => setGive((g) => ({ ...g, [id]: v }))}
            testid="trade-give"
          />
          <Column
            title={t('trade.iReceive')}
            amounts={receive}
            max={theirs}
            onChange={(id, v) => setReceive((r) => ({ ...r, [id]: v }))}
            testid="trade-receive"
          />
        </div>

        <div className={`${hud.paper} ${styles.quote}`}>
          <p>
            {t('trade.summary', {
              give: amountsText(t, clean(give)),
              receive: amountsText(t, clean(receive)),
              name: playerName(t, partner),
            })}
          </p>
          {!check.ok && (
            <p className={hud.danger}>{t(`engine.illegal.${check.reason.key}`, check.reason.params)}</p>
          )}
        </div>

        <div className={hud.modalFoot}>
          <button type="button" className={hud.btn} onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={!check.ok}
            onClick={() => {
              if (perform(action)) close();
            }}
            data-testid="trade-send"
          >
            {counter ? t('trade.sendCounter') : t('trade.send')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Resposta do destinatário a uma proposta pendente. */
export function TradeReply() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const viewer = usePresentation((s) => s.viewer);
  const open = useUi((s) => s.open);
  const pending = state?.pendingTrade;
  if (!ctx || !state || !pending || viewer !== pending.to) return null;
  const me = pending.to;
  const accept: Action = { type: 'acceptTrade', player: me };
  const check = checkAction(ctx, state, accept);

  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reply-title"
        data-testid="trade-reply"
      >
        <div className={hud.modalHead}>
          <h2 id="reply-title" className={hud.modalTitle}>
            {t('trade.proposalFrom', { name: playerName(t, pending.from) })}
          </h2>
          <FactionBadge faction={seatFaction(pending.from)} size={28} />
        </div>
        <div className={`${hud.paper} ${hud.modalBody} ${styles.replyBody}`}>
          <p>
            <span className={hud.label}>{t('trade.youGive')}</span>
            <strong>{amountsText(t, pending.receive)}</strong>
          </p>
          <p>
            <span className={hud.label}>{t('trade.youReceive')}</span>
            <strong>{amountsText(t, pending.give)}</strong>
          </p>
          {!check.ok && (
            <p className={hud.danger}>{t(`engine.illegal.${check.reason.key}`, check.reason.params)}</p>
          )}
        </div>
        <div className={hud.modalFoot}>
          <button
            type="button"
            className={hud.btn}
            onClick={() => perform({ type: 'rejectTrade', player: me })}
            data-testid="trade-reject"
          >
            {t('trade.reject')}
          </button>
          <button
            type="button"
            className={hud.btn}
            onClick={() => open({ kind: 'trade', counter: true })}
            data-testid="trade-counter"
          >
            {t('trade.counter')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={!check.ok}
            onClick={() => perform(accept)}
            data-testid="trade-accept"
          >
            {t('trade.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
