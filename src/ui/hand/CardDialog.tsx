/**
 * Uso de uma carta (UX_SPEC 2.5 e 2.8): painel flutuante sobre a mesa — o mapa segue
 * clicável para alvos de hex/estrutura. Passos conforme a carta: destinatário (entrega;
 * quem já recebeu o teto aparece bloqueado com o motivo), alvo, pagamento alternativo,
 * descarte, permanente a trocar; e confirmar. Drone/Contrato armam Sondar/Construir.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type CardTarget,
  type CardUid,
  cardDefOf,
  cardResourceCost,
  checkAction,
  effectOf,
  type PlayerId,
} from '../../engine';
import { findStructure } from '../../engine/queries';
import { seatFaction } from '../../render3d/model';
import { Card } from '../card/Card';
import { cardFace, cardVersion } from '../card/faces';
import { CostLine, FactionBadge, Icon, ResourceIcon } from '../components/Bits';
import { RichText } from '../components/RichText';
import { flowCheck, flowNeeds, flowTargets, targetsAt } from '../game/cardFlow';
import { armFlow, chooseCardTarget, chooseRecipient, confirmFlow, updateFlow } from '../game/commands';
import { useCanDecide } from '../game/hooks';
import { useSession } from '../game/session';
import { describeTarget, playerName } from '../game/text';
import { useUi } from '../game/uiStore';
import hud from '../hud/Hud.module.css';
import styles from './Cards.module.css';
import { MiniCard } from './MiniCard';

/** Recusas que só dizem "ainda falta escolher": não aparecem em vermelho. */
const PENDING_KEYS = new Set(['targetRequired', 'invalidDiscard', 'sacrificeRequired']);

function Step({ title, children, done }: { title: string; children: ReactNode; done: boolean }) {
  return (
    <section className={styles.step}>
      <h3 className={`${hud.label} ${done ? styles.stepDone : ''}`}>{title}</h3>
      {children}
    </section>
  );
}

const same = (a: CardTarget | undefined, b: CardTarget) => !!a && JSON.stringify(a) === JSON.stringify(b);

export function CardDialog() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const flow = useUi((s) => s.flow);
  const canDecide = useCanDecide();
  if (!ctx || !state || !flow) return null;

  const player = state.activePlayer;
  const me = state.players[player];
  const def = cardDefOf(ctx, state, flow.card);
  const face = cardFace(def.id);
  const needs = flowNeeds(ctx, state, player, flow);
  const targets = flowTargets(ctx, state, player, flow);
  const check = flowCheck(ctx, state, player, flow);
  const modifier = effectOf(def).modifier;
  const idOf = (uid: CardUid) => state.cards.defs[uid] ?? '';

  // ── Destinatário ──
  const recipients = state.players
    .filter((p) => p.id !== player)
    .map((p) => {
      const c = checkAction(ctx, state, {
        type: 'deliverCard',
        player,
        card: flow.card,
        to: p.id,
        ...(flow.payment === undefined ? {} : { payment: flow.payment }),
      });
      const blocked = !c.ok && (c.reason.key === 'receiveCapReached' || c.reason.key === 'invalidRecipient');
      return { id: p.id, blocked, reason: c.ok ? null : c.reason, received: p.receivedThisRound };
    });

  // ── Alvo ──
  const mapTarget = needs.target === 'hex' || needs.target === 'structure';
  const chosenHex =
    flow.target?.kind === 'hex'
      ? flow.target.hex
      : flow.target?.kind === 'structure'
        ? (findStructure(state, flow.target.uid)?.key ?? null)
        : null;
  const atHex = chosenHex ? targetsAt(state, targets, chosenHex) : [];

  const targetStep = (() => {
    if (needs.target === 'none') return null;
    if (needs.recipient && flow.to === undefined)
      return <p className={hud.muted}>{t('hand.pickRecipientFirst')}</p>;
    if (targets.length === 0) return <p className={hud.danger}>{t('hand.noTargets')}</p>;
    if (mapTarget) {
      return (
        <>
          <p className={styles.stepHint}>
            {flow.target
              ? describeTarget(t, state, flow.target)
              : t('hand.pickOnMap', { count: targets.length })}
          </p>
          {atHex.length > 1 && (
            <div className={styles.choices}>
              {atHex.map((tg) => (
                <button
                  key={JSON.stringify(tg)}
                  type="button"
                  className={`${hud.btn} ${same(flow.target, tg) ? hud.btnOn : ''}`}
                  onClick={() => chooseCardTarget(tg)}
                >
                  {describeTarget(t, state, tg)}
                </button>
              ))}
            </div>
          )}
        </>
      );
    }
    return (
      <div className={styles.choices} role="radiogroup">
        {targets.map((tg) => {
          const on = same(flow.target, tg);
          const key = JSON.stringify(tg);
          if (tg.kind === 'permanent') {
            return (
              <MiniCard
                key={key}
                uid={tg.card}
                id={idOf(tg.card)}
                selected={on}
                onClick={() => chooseCardTarget(tg)}
                testid={`target-permanent-${tg.card}`}
              />
            );
          }
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              className={`${hud.btn} ${on ? hud.btnOn : ''}`}
              onClick={() => chooseCardTarget(tg)}
              data-testid={`target-${tg.kind}-${tg.kind === 'resource' ? tg.resource : tg.kind === 'player' ? tg.player : tg.kind === 'deck' ? tg.deck : ''}`}
            >
              {tg.kind === 'resource' && <ResourceIcon id={tg.resource} size={16} />}
              {tg.kind === 'player' && <FactionBadge faction={seatFaction(tg.player)} size={16} />}
              {describeTarget(t, state, tg)}
            </button>
          );
        })}
      </div>
    );
  })();

  // ── Pagamento ──
  const payments = def.cost.resourcesAny?.map((_, i) => ({
    i,
    cost: cardResourceCost(ctx, state, player, def, i) ?? {},
  }));

  // ── Descarte ──
  const handOthers = (me?.hand ?? []).filter((c) => c !== flow.card);
  const toggleDiscard = (c: CardUid) => {
    const has = flow.discard.includes(c);
    if (has) updateFlow({ discard: flow.discard.filter((x) => x !== c) });
    else if (flow.discard.length < needs.discard) updateFlow({ discard: [...flow.discard, c] });
  };

  // ── Permanente que sai ──
  const mine = (me?.permanents ?? []).filter((c): c is CardUid => c !== null);
  const outKey = needs.replace ? 'replace' : 'sacrifice';
  const out = needs.replace ? flow.replace : flow.sacrifice;

  const confirmLabel = t(`hand.confirm.${flow.mode}`);
  const showReason =
    !check.ok && !PENDING_KEYS.has(check.reason.key) && !(needs.recipient && flow.to === undefined);

  return (
    <section
      className={`${hud.plate} ${hud.rivets} ${styles.dialog}`}
      role="dialog"
      aria-labelledby="card-dialog-title"
      data-testid="card-dialog"
    >
      <header className={styles.dialogHead}>
        <h2 id="card-dialog-title" className={hud.plateTitle}>
          {t(`hand.mode.${flow.mode}`)} <em className={styles.dialogTitle}>{face.title}</em>
        </h2>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnIcon}`}
          onClick={() => useUi.getState().setFlow(null)}
          aria-label={t('common.close')}
        >
          <Icon glyph="close" size={14} />
        </button>
      </header>
      <div className={styles.dialogBody}>
        <button
          type="button"
          className={styles.dialogCard}
          onClick={() => useUi.getState().setZoom({ card: flow.card })}
          title={t('hand.zoom')}
        >
          <Card face={face} width={124} version={cardVersion()} />
        </button>
        <div className={styles.steps}>
          <p className={`${hud.paper} ${styles.effect}`}>
            <RichText text={def.effect} />
          </p>
          {needs.recipient && (
            <Step title={t('hand.step.recipient')} done={flow.to !== undefined}>
              <div className={styles.choices} role="radiogroup">
                {recipients.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={flow.to === r.id}
                    disabled={r.blocked}
                    title={
                      r.blocked && r.reason ? t(`engine.illegal.${r.reason.key}`, r.reason.params) : undefined
                    }
                    className={`${hud.btn} ${flow.to === r.id ? hud.btnOn : ''}`}
                    onClick={() => chooseRecipient(r.id as PlayerId)}
                    data-testid={`recipient-${r.id}`}
                  >
                    <FactionBadge faction={seatFaction(r.id)} size={16} />
                    {playerName(t, r.id)}
                    <span className={hud.kbd}>
                      {r.received}/{ctx.balance.cards.receiveCapPerRound}
                    </span>
                  </button>
                ))}
              </div>
            </Step>
          )}
          {targetStep && (
            <Step title={t('hand.step.target')} done={!!flow.target}>
              {targetStep}
            </Step>
          )}
          {payments && (
            <Step title={t('hand.step.payment')} done>
              <div className={styles.choices} role="radiogroup">
                {payments.map((p) => (
                  <button
                    key={p.i}
                    type="button"
                    role="radio"
                    aria-checked={(flow.payment ?? 0) === p.i}
                    className={`${hud.btn} ${(flow.payment ?? 0) === p.i ? hud.btnOn : ''}`}
                    onClick={() => updateFlow({ payment: p.i })}
                    data-testid={`payment-${p.i}`}
                  >
                    <CostLine cost={p.cost} have={me?.resources} />
                  </button>
                ))}
              </div>
            </Step>
          )}
          {needs.discard > 0 && (
            <Step
              title={t('hand.step.discard', { n: needs.discard, chosen: flow.discard.length })}
              done={flow.discard.length === needs.discard}
            >
              <div className={styles.choices}>
                {handOthers.map((c) => (
                  <MiniCard
                    key={c}
                    uid={c}
                    id={idOf(c)}
                    width={58}
                    selected={flow.discard.includes(c)}
                    onClick={() => toggleDiscard(c)}
                    testid={`discard-${c}`}
                  />
                ))}
              </div>
            </Step>
          )}
          {(needs.replace || needs.sacrifice) && (
            <Step title={t(`hand.step.${outKey}`)} done={out !== undefined}>
              <div className={styles.choices}>
                {mine.map((c) => (
                  <MiniCard
                    key={c}
                    uid={c}
                    id={idOf(c)}
                    width={58}
                    selected={out === c}
                    onClick={() => updateFlow(needs.replace ? { replace: c } : { sacrifice: c })}
                    testid={`${outKey}-${c}`}
                  />
                ))}
              </div>
            </Step>
          )}
          {!payments &&
            needs.target === 'none' &&
            needs.discard === 0 &&
            !needs.recipient &&
            !needs.replace && (
              <p className={styles.stepHint}>
                <CostLine cost={cardResourceCost(ctx, state, player, def) ?? {}} have={me?.resources} />
              </p>
            )}
        </div>
      </div>
      {showReason && !check.ok && (
        <p className={`${hud.danger} ${styles.reason}`}>
          {t(`engine.illegal.${check.reason.key}`, check.reason.params)}
        </p>
      )}
      <footer className={styles.dialogFoot}>
        <button type="button" className={hud.btn} onClick={() => useUi.getState().setFlow(null)}>
          {t('common.cancel')}
        </button>
        {modifier ? (
          <>
            {modifier === 'drone' && (
              <button
                type="button"
                className={`${hud.btn} ${hud.btnPrimary}`}
                disabled={!canDecide || !check.ok}
                onClick={() => armFlow('survey')}
                data-testid="arm-survey"
              >
                {t('hand.armSurvey')} <span className={hud.kbd}>R</span>
              </button>
            )}
            <button
              type="button"
              className={`${hud.btn} ${hud.btnPrimary}`}
              disabled={!canDecide || !check.ok}
              onClick={() => armFlow('build')}
              data-testid="arm-build"
            >
              {t('hand.armBuild')} <span className={hud.kbd}>B</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={!canDecide || !check.ok}
            onClick={() => confirmFlow()}
            data-testid="card-confirm"
          >
            {confirmLabel}
          </button>
        )}
      </footer>
    </section>
  );
}
