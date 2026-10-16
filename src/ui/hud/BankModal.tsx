/**
 * Banca (UX_SPEC 2.10): dar ↔ receber, quantidade, cotação de compra e venda e o troco
 * perdido em vermelho ("arredondado a favor da banca"). Preços e cotação vêm do motor
 * (rules/economy); a legalidade, de checkAction.
 */
import { useState } from 'react';
import type { EngineContext, GameState, PlayerId } from '../../engine';
import { useTranslation } from 'react-i18next';
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import { checkAction } from '../../engine';
import { bankPrices, bankQuote, minBankAmount } from '../../engine/rules/economy';
import { Icon, ResourceIcon, Stepper } from '../components/Bits';
import { perform } from '../game/hooks';
import { useSession } from '../game/session';
import { useUi } from '../game/uiStore';
import styles from './Game.module.css';
import hud from './Hud.module.css';

/**
 * Ponto de partida útil: entregar o recurso de que se tem mais (entre os que a banca
 * paga) e receber o mais valioso que esse estoque compra, na menor quantidade que compra 1.
 */
function defaultTrade(ctx: EngineContext, state: GameState, me: PlayerId) {
  const have = state.players[me]?.resources;
  if (!have) return { give: 'stone' as ResourceId, receive: 'iron' as ResourceId, amount: 1 };
  const credit = (id: ResourceId) => have[id] * bankPrices(ctx, state, me, id).sell;
  const sellable = RESOURCE_IDS.filter((id) => credit(id) > 0);
  const give = (sellable.length ? sellable : RESOURCE_IDS).reduce((a, b) => (have[b] > have[a] ? b : a));
  const affordable = RESOURCE_IDS.filter(
    (r) => r !== give && bankPrices(ctx, state, me, r).buy <= credit(give),
  );
  const receive =
    affordable.reduce<ResourceId | null>(
      (a, b) => (a === null || ctx.resourceValue(b) > ctx.resourceValue(a) ? b : a),
      null,
    ) ?? (give === 'iron' ? 'stone' : 'iron');
  const min = minBankAmount(ctx, state, me, give, receive) ?? 1;
  return { give, receive, amount: Math.max(1, Math.min(min, have[give])) };
}

export function BankModal() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const close = () => useUi.getState().open(null);
  const me = state?.activePlayer ?? 0;
  const have = state?.players[me]?.resources;
  const [initial] = useState(() =>
    ctx && state
      ? defaultTrade(ctx, state, me)
      : { give: 'stone' as ResourceId, receive: 'iron' as ResourceId, amount: 1 },
  );
  const [give, setGive] = useState<ResourceId>(initial.give);
  const [receive, setReceive] = useState<ResourceId>(initial.receive);
  const [amount, setAmount] = useState(initial.amount);
  if (!ctx || !state || !have) return null;

  const stock = have[give];
  const qty = Math.max(1, Math.min(amount, Math.max(1, stock)));
  const sell = bankPrices(ctx, state, me, give).sell;
  const buy = bankPrices(ctx, state, me, receive).buy;
  const same = give === receive;
  const quote = same ? { received: 0, lostCredit: 0 } : bankQuote(ctx, state, me, give, qty, receive);
  const min = same ? null : minBankAmount(ctx, state, me, give, receive);
  const action = { type: 'bankTrade' as const, player: me, give, amount: qty, receive };
  const check = checkAction(ctx, state, action);

  const pickGive = (id: ResourceId) => {
    setGive(id);
    if (id === receive) setReceive(RESOURCE_IDS.find((r) => r !== id) ?? 'iron');
    setAmount(1);
  };

  return (
    <div className={hud.overlay} role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-title"
        data-testid="bank"
      >
        <div className={hud.modalHead}>
          <h2 id="bank-title" className={hud.modalTitle}>
            {t('bank.title')}
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

        <div className={styles.bankSides}>
          <fieldset className={styles.side}>
            <legend className={hud.label}>{t('bank.give')}</legend>
            <div className={styles.resGrid}>
              {RESOURCE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.resTile} ${give === id ? styles.resTileOn : ''}`}
                  disabled={have[id] === 0}
                  onClick={() => pickGive(id)}
                  aria-pressed={give === id}
                  data-testid={`bank-give-${id}`}
                >
                  <ResourceIcon id={id} size={22} />
                  <span className={styles.resTileName}>{t(`resources.${id}`)}</span>
                  <span className={hud.num}>{have[id]}</span>
                  <span className={styles.resTilePrice}>
                    {t('bank.pays', { n: bankPrices(ctx, state, me, id).sell })}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.qtyRow}>
              <span className={hud.label}>{t('bank.amount')}</span>
              <Stepper
                value={qty}
                min={1}
                max={Math.max(1, stock)}
                onChange={setAmount}
                label={t('bank.amount')}
              />
            </div>
          </fieldset>

          <fieldset className={styles.side}>
            <legend className={hud.label}>{t('bank.receive')}</legend>
            <div className={styles.resGrid}>
              {RESOURCE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`${styles.resTile} ${receive === id ? styles.resTileOn : ''}`}
                  disabled={id === give}
                  onClick={() => setReceive(id)}
                  aria-pressed={receive === id}
                  data-testid={`bank-receive-${id}`}
                >
                  <ResourceIcon id={id} size={22} />
                  <span className={styles.resTileName}>{t(`resources.${id}`)}</span>
                  <span className={styles.resTilePrice}>
                    {t('bank.costs', { n: bankPrices(ctx, state, me, id).buy })}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className={`${hud.paper} ${styles.quote}`} data-testid="bank-quote">
          <p>{t('bank.credit', { amount: qty, give: t(`resources.${give}`), sell, credit: qty * sell })}</p>
          <p className={styles.quoteMain}>
            {t('bank.result', { n: quote.received, receive: t(`resources.${receive}`), buy })}
          </p>
          {quote.lostCredit > 0 && <p className={hud.danger}>{t('bank.lost', { n: quote.lostCredit })}</p>}
          {min !== null && (
            <p className={hud.muted}>
              {t('bank.minHint', {
                n: min,
                give: t(`resources.${give}`),
                receive: t(`resources.${receive}`),
              })}
            </p>
          )}
          {!check.ok && (
            <p className={hud.danger}>{t(`engine.illegal.${check.reason.key}`, check.reason.params)}</p>
          )}
        </div>

        <div className={hud.modalFoot}>
          <button type="button" className={hud.btn} onClick={close}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={!check.ok}
            onClick={() => {
              if (perform(action)) close();
            }}
            data-testid="bank-confirm"
          >
            {t('bank.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
