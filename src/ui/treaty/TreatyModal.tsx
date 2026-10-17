/**
 * Construtor de tratado (UX_SPEC 2.12) e tratados ativos. Árvore em passos: tipo → (pacto)
 * categoria → opção · (contrato) quem dispara → o que acontece → quem cumpre o quê; revisão
 * em linguagem natural; custo em Ouro em destaque, cobrado só no aceite. Modelos prontos
 * de treaties.json são atalhos.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import { type Action, checkAction, type PlayerId, type Treaty, type TreatyTerms } from '../../engine';
import { templateTerms } from '../../engine/legal';
import { commerceQuote, isCommercePact, treatyGoldCost, type TreatyDraft } from '../../engine/rules/treaties';
import { treatiesOf } from '../../engine/rules/treatyQueries';
import { seatFaction } from '../../render3d/model';
import { FactionBadge, Icon, ResourceIcon, Stepper } from '../components/Bits';
import { perform } from '../game/hooks';
import { useSession } from '../game/session';
import { cardName, playerName } from '../game/text';
import { useUi } from '../game/uiStore';
import hud from '../hud/Hud.module.css';
import {
  type BuilderScope,
  CONTRACT_STEPS,
  type ContractDraft,
  type ContractStep,
  negationAllowed,
  pactOptions,
  perTroopAllowed,
  resourceOptions,
  stepOptions,
  withDefaults,
  withNegation,
  withPactDefaults,
  withStep,
} from './builder';
import { pactDef, roleText, templateName, treatyText } from './describe';
import styles from './Treaty.module.css';

const CATEGORIES = ['border', 'cards', 'military', 'commerce', 'observation'] as const;

function Chips<T extends string>({
  options,
  value,
  label,
  onPick,
  testid,
}: {
  options: readonly T[];
  value: T | undefined;
  label: (v: T) => string;
  onPick: (v: T) => void;
  testid: string;
}) {
  return (
    <div className={styles.row} role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={`${hud.btn} ${styles.chip} ${value === o ? hud.btnOn : ''}`}
          onClick={() => onPick(o)}
          data-testid={`${testid}-${o}`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function ContractSteps({
  scope,
  draft,
  setDraft,
}: {
  scope: BuilderScope;
  draft: ContractDraft;
  setDraft: (d: ContractDraft) => void;
}) {
  const { t } = useTranslation();
  const names = { from: scope.from, to: scope.to, name: (id: PlayerId) => playerName(t, id) };
  const label = (step: ContractStep, v: string): string => {
    switch (step) {
      case 'subject':
      case 'of':
      case 'obligor':
        return roleText(t, v, names);
      case 'verb':
        return t(`treaty.verb.${v}`);
      case 'consequence':
        return t(`treaty.consVerb.${v}`);
      default:
        return t(`treaty.object.${v}`);
    }
  };
  const visible: ContractStep[] = [];
  for (const s of CONTRACT_STEPS) {
    visible.push(s);
    if (draft[s] === undefined) break;
  }
  const res = draft.target ? resourceOptions(scope, draft) : [];
  const owner = draft.obligor === 'me' ? scope.from : draft.obligor === 'you' ? scope.to : null;
  const perms =
    owner === null
      ? []
      : (scope.state.players[owner]?.permanents.filter((c): c is number => c !== null) ?? []);
  return (
    <div className={styles.steps}>
      {visible.map((step) => (
        <div key={step} className={styles.step}>
          <span className={hud.label}>{t(`treaty.step.${step}`)}</span>
          {step === 'subject' && negationAllowed(scope, draft) && (
            <label className={styles.row}>
              <input
                type="checkbox"
                checked={draft.negated ?? false}
                onChange={(e) => setDraft(withNegation(draft, e.target.checked))}
                data-testid="treaty-negated"
              />
              {t('treaty.negated')}
            </label>
          )}
          <Chips
            options={stepOptions(scope, draft, step)}
            value={draft[step]}
            label={(v) => label(step, v)}
            onPick={(v) => {
              const next = withStep(draft, step, v);
              setDraft(step === 'target' ? withDefaults(scope, next) : next);
            }}
            testid={`treaty-${step}`}
          />
        </div>
      ))}
      {draft.target && (
        <div className={styles.step}>
          <span className={hud.label}>{t('treaty.step.details')}</span>
          {draft.resource !== undefined && (
            <div className={styles.row}>
              {res.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${hud.btn} ${styles.chip} ${draft.resource === r ? hud.btnOn : ''}`}
                  onClick={() => setDraft({ ...draft, resource: r })}
                  aria-label={t(`resources.${r}`)}
                  data-testid={`treaty-resource-${r}`}
                >
                  <ResourceIcon id={r} size={16} />
                </button>
              ))}
            </div>
          )}
          {draft.amount !== undefined && (
            <div className={styles.row}>
              <span>{t('treaty.amount')}</span>
              <Stepper
                value={draft.amount}
                min={1}
                max={draft.consequence === 'loseAction' ? scope.ctx.balance.turn.actionsPerTurn : 9}
                onChange={(v) => setDraft({ ...draft, amount: v })}
                label={t('treaty.amount')}
              />
            </div>
          )}
          {draft.rounds !== undefined && (
            <div className={styles.row}>
              <span>{t('treaty.rounds')}</span>
              <Stepper
                value={draft.rounds}
                min={1}
                max={scope.ctx.balance.treaties.pactDurationRounds}
                onChange={(v) => setDraft({ ...draft, rounds: v })}
                label={t('treaty.rounds')}
              />
            </div>
          )}
          {(draft.perTroop || perTroopAllowed(scope, draft)) && (
            <label className={styles.row}>
              <input
                type="checkbox"
                checked={draft.perTroop ?? false}
                onChange={(e) => setDraft({ ...draft, perTroop: e.target.checked || undefined })}
              />
              {t('treaty.perTroopToggle')}
            </label>
          )}
          {draft.permanent !== undefined && (
            <Chips
              options={perms.map(String)}
              value={String(draft.permanent)}
              label={(v) => cardName(t, scope.state, Number(v))}
              onPick={(v) => setDraft({ ...draft, permanent: Number(v) })}
              testid="treaty-permanent"
            />
          )}
        </div>
      )}
    </div>
  );
}

function PactSteps({
  scope,
  draft,
  setDraft,
}: {
  scope: BuilderScope;
  draft: Extract<TreatyDraft, { kind: 'pact' }>;
  setDraft: (d: TreatyDraft) => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<string>((draft.pact && pactDef(draft.pact)?.category) ?? 'border');
  const options = pactOptions(scope, category);
  const def = draft.pact ? pactDef(draft.pact) : undefined;
  return (
    <div className={styles.steps}>
      <Chips
        options={CATEGORIES}
        value={category as (typeof CATEGORIES)[number]}
        label={(c) => t(`treaty.category.${c}`)}
        onPick={(c) => setCategory(c)}
        testid="treaty-category"
      />
      <div className={styles.step}>
        <span className={hud.label}>{t('treaty.step.pact')}</span>
        <Chips
          options={options}
          value={draft.pact}
          label={(id) => pactDef(id)?.name ?? id}
          onPick={(id) => setDraft(withPactDefaults(scope, { kind: 'pact', pact: id }))}
          testid="treaty-pact"
        />
      </div>
      {def?.params?.length ? (
        <div className={styles.step}>
          <span className={hud.label}>{t('treaty.step.details')}</span>
          <div className={styles.row}>
            {RESOURCE_IDS.filter((r) => r !== 'gold').map((r) => (
              <button
                key={r}
                type="button"
                className={`${hud.btn} ${styles.chip} ${draft.resource === r ? hud.btnOn : ''}`}
                onClick={() => setDraft({ ...draft, resource: r })}
                aria-label={t(`resources.${r}`)}
              >
                <ResourceIcon id={r} size={16} />
              </button>
            ))}
          </div>
          <div className={styles.row}>
            <span>{t('treaty.price')}</span>
            <Stepper
              value={draft.price ?? 1}
              min={1}
              max={9}
              onChange={(v) => setDraft({ ...draft, price: v })}
              label={t('treaty.price')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NewTreaty({ me }: { me: PlayerId }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const others = state?.players.filter((p) => p.id !== me && !p.eliminated).map((p) => p.id) ?? [];
  const [partner, setPartner] = useState<PlayerId>(others[0] ?? 0);
  const [draft, setDraft] = useState<TreatyDraft>({ kind: 'contract', negated: false });
  if (!ctx || !state) return null;
  const scope: BuilderScope = { ctx, state, from: me, to: partner };
  const names = {
    from: me,
    to: partner,
    name: (id: PlayerId) => playerName(t, id),
    card: (uid: number) => cardName(t, state, uid),
  };
  const action: Action = { type: 'proposeTreaty', player: me, to: partner, terms: draft as TreatyTerms };
  const check = checkAction(ctx, state, action);
  const cost = ctx.balance.treaties.goldCostEach;
  const free = [me, partner].filter((p) => treatyGoldCost(ctx, state, p) === 0);
  const close = () => useUi.getState().open(null);

  return (
    <>
      <div className={styles.row} role="radiogroup" aria-label={t('treaty.partner')}>
        <span className={hud.label}>{t('treaty.partner')}</span>
        {others.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={partner === id}
            className={`${hud.btn} ${partner === id ? hud.btnOn : ''}`}
            onClick={() => setPartner(id)}
            data-testid={`treaty-partner-${id}`}
          >
            <FactionBadge faction={seatFaction(id)} size={16} />
            {playerName(t, id)}
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <span className={hud.label}>{t('treaty.templates')}</span>
        {templateTerms(ctx).map((terms) => {
          const usable = checkAction(ctx, state, { ...action, terms }).ok;
          return (
            <button
              key={terms.template}
              type="button"
              className={`${hud.btn} ${styles.chip}`}
              disabled={!usable}
              onClick={() => setDraft(terms)}
              data-testid={`treaty-template-${terms.template}`}
            >
              {templateName(terms.template)}
            </button>
          );
        })}
      </div>
      <Chips
        options={['contract', 'pact'] as const}
        value={draft.kind}
        label={(k) => t(`treaty.${k}`)}
        onPick={(k) => setDraft(k === 'contract' ? { kind: 'contract', negated: false } : { kind: 'pact' })}
        testid="treaty-kind"
      />
      <p className={hud.muted}>
        {draft.kind === 'contract'
          ? t('treaty.contractHint', { n: ctx.balance.treaties.pactDurationRounds })
          : t('treaty.pactHint', { n: ctx.balance.treaties.pactDurationRounds })}
      </p>
      <div className={styles.body}>
        {draft.kind === 'contract' ? (
          <ContractSteps scope={scope} draft={draft} setDraft={setDraft} />
        ) : (
          <PactSteps key={partner} scope={scope} draft={draft} setDraft={setDraft} />
        )}
        <div className={`${hud.paper} ${styles.review}`}>
          <span className={hud.paperHeading}>{t('treaty.review')}</span>
          <p className={styles.sentence} data-testid="treaty-review">
            {treatyText(t, draft, names)}
          </p>
          <div className={styles.cost}>
            <ResourceIcon id="gold" size={18} onPaper />
            {t('treaty.cost', { n: cost })}
          </div>
          {free.map((p) => (
            <p key={p} className={hud.muted}>
              {t('treaty.costFree', { name: playerName(t, p) })}
            </p>
          ))}
          {!check.ok && draft.kind && (
            <p className={hud.danger}>{t(`engine.illegal.${check.reason.key}`, check.reason.params)}</p>
          )}
        </div>
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
          data-testid="treaty-send"
        >
          {t('treaty.send')}
        </button>
      </div>
    </>
  );
}

function CommerceUse({ treaty, me }: { treaty: Treaty; me: PlayerId }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const fixed = treaty.terms.kind === 'pact' ? treaty.terms.resource : undefined;
  const [give, setGive] = useState<ResourceId>(fixed ?? 'food');
  const [receive, setReceive] = useState<ResourceId>(fixed ? 'gold' : 'gold');
  const [amount, setAmount] = useState(1);
  if (!ctx || !state) return null;
  const action: Action = { type: 'useTreaty', player: me, treaty: treaty.id, give, amount, receive };
  const check = checkAction(ctx, state, action);
  const got = commerceQuote(ctx, treaty, give, amount, receive) ?? 0;
  const pick = (value: ResourceId, set: (r: ResourceId) => void, testid: string) => (
    <div className={styles.row}>
      {RESOURCE_IDS.map((r) => (
        <button
          key={r}
          type="button"
          className={`${hud.btn} ${styles.chip} ${value === r ? hud.btnOn : ''}`}
          onClick={() => set(r)}
          aria-label={t(`resources.${r}`)}
          data-testid={`${testid}-${r}`}
        >
          <ResourceIcon id={r} size={14} />
        </button>
      ))}
    </div>
  );
  return (
    <div className={styles.step} data-testid={`treaty-use-${treaty.id}`}>
      <span className={hud.label}>{t('treaty.useTitle')}</span>
      <span>{t('treaty.give')}</span>
      {pick(give, setGive, `treaty-give-${treaty.id}`)}
      <div className={styles.row}>
        <span>{t('treaty.amount')}</span>
        <Stepper value={amount} min={1} max={9} onChange={setAmount} label={t('treaty.amount')} />
      </div>
      <span>{t('treaty.receive')}</span>
      {pick(receive, setReceive, `treaty-receive-${treaty.id}`)}
      <div className={styles.row}>
        <span>{t('treaty.tradeQuote', { n: got, resource: t(`resources.${receive}`) })}</span>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnPrimary}`}
          disabled={!check.ok}
          onClick={() => perform(action)}
          title={check.ok ? undefined : t(`engine.illegal.${check.reason.key}`, check.reason.params)}
          data-testid={`treaty-trade-${treaty.id}`}
        >
          {t('treaty.trade')}
        </button>
      </div>
    </div>
  );
}

function ActiveTreaties({ me }: { me: PlayerId }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  if (!ctx || !state) return null;
  const list = treatiesOf(state, me);
  if (list.length === 0) return <p className={hud.muted}>{t('treaty.none')}</p>;
  return (
    <ul className={styles.list} data-testid="treaty-active">
      {list.map((tr) => {
        const names = {
          from: tr.parties[0],
          to: tr.parties[1],
          name: (id: PlayerId) => playerName(t, id),
          card: (uid: number) => cardName(t, state, uid),
        };
        const brk: Action = { type: 'breakTreaty', player: me, treaty: tr.id };
        const negated = tr.terms.kind === 'contract' && tr.terms.negated;
        return (
          <li key={tr.id} className={`${hud.paper} ${styles.item}`}>
            <div className={styles.itemHead}>
              <strong>#{tr.id}</strong>
              <span className={hud.muted}>
                {negated ? t('treaty.deadline', { n: tr.until }) : t('treaty.until', { n: tr.until })}
              </span>
              {tr.terms.kind === 'pact' && (
                <button
                  type="button"
                  className={hud.btn}
                  disabled={!checkAction(ctx, state, brk).ok}
                  onClick={() => useUi.getState().open({ kind: 'breakPact', action: brk })}
                  data-testid={`treaty-break-${tr.id}`}
                >
                  {t('treaty.break')}
                </button>
              )}
            </div>
            <p className={styles.sentence}>{treatyText(t, tr.terms, names)}</p>
            {isCommercePact(tr) && <CommerceUse treaty={tr} me={me} />}
          </li>
        );
      })}
    </ul>
  );
}

export function TreatyModal() {
  const { t } = useTranslation();
  const state = useSession((s) => s.state);
  const viewer = usePresentation((s) => s.viewer);
  const [tab, setTab] = useState<'new' | 'active'>('new');
  if (!state) return null;
  const me = viewer ?? state.activePlayer;
  const canPropose = me === state.activePlayer && state.phase === 'actions';
  const shown = canPropose ? tab : 'active';
  const close = () => useUi.getState().open(null);
  return (
    <div className={hud.overlay} role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="treaty-title"
        data-testid="treaty"
      >
        <div className={hud.modalHead}>
          <h2 id="treaty-title" className={hud.modalTitle}>
            {t('treaty.title')}
          </h2>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${hud.btn} ${shown === 'new' ? hud.btnOn : ''}`}
              disabled={!canPropose}
              title={canPropose ? undefined : t('treaty.notYourTurn')}
              onClick={() => setTab('new')}
              data-testid="treaty-tab-new"
            >
              {t('treaty.tabNew')}
            </button>
            <button
              type="button"
              className={`${hud.btn} ${shown === 'active' ? hud.btnOn : ''}`}
              onClick={() => setTab('active')}
              data-testid="treaty-tab-active"
            >
              {t('treaty.tabActive')}
            </button>
          </div>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnIcon}`}
            onClick={close}
            aria-label={t('common.close')}
          >
            <Icon glyph="close" size={14} />
          </button>
        </div>
        {shown === 'new' ? <NewTreaty me={me} /> : <ActiveTreaties me={me} />}
      </div>
    </div>
  );
}
