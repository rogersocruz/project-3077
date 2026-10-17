/**
 * Barra de baixo (UX_SPEC 2.5): recursos de quem está diante da tela (contadores que
 * rolam), ações restantes, ações com alvo (Explorar/Sondar/Construir/Melhorar), Banca,
 * Comércio, Tratado, os 5 slots de permanentes e o botão de encerrar fase.
 */
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import combatStyles from '../combat/Combat.module.css';
import { type ActionTemplate, canUndo, decider } from '../../engine';
import { braceActions } from '../../engine/rules/world';
import { useSettings } from '../../settings';
import { Icon, ResourceIcon, RollingNumber } from '../components/Bits';
import {
  chooseAction,
  endPhase,
  openBank,
  openBuildPicker,
  openTrade,
  openTreaty,
  undoLast,
} from '../game/commands';
import { perform, useCanDecide, useInstantCounters } from '../game/hooks';
import { useSession } from '../game/session';
import { eventName, playerName } from '../game/text';
import { useUi } from '../game/uiStore';
import { cardFace } from '../card/faces';
import { MiniCard } from '../hand/MiniCard';
import { BuildPicker } from './BuildPicker';
import styles from './Game.module.css';
import hud from './Hud.module.css';

const MODES: { type: ActionTemplate['type']; key: string; label: string }[] = [
  { type: 'explore', key: 'E', label: 'hud.explore' },
  { type: 'survey', key: 'R', label: 'hud.survey' },
  { type: 'build', key: 'B', label: 'hud.build' },
  { type: 'upgrade', key: 'U', label: 'hud.upgrade' },
];

export function BottomBar() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const viewer = usePresentation((s) => s.viewer);
  const counters = usePresentation((s) => s.counters);
  const turn = usePresentation((s) => s.turn);
  const mode = useUi((s) => s.mode);
  const armed = useUi((s) => s.armed);
  const shown = usePresentation((s) => s.shown);
  const modal = useUi((s) => s.modal);
  const undoOn = useSettings((s) => s.gameplay.undo);
  const canDecide = useCanDecide();
  const seats = useSession((s) => s.setup?.seats);
  const instant = useInstantCounters();
  if (!ctx || !state || !turn) return null;

  const me = viewer ?? turn.activePlayer;
  // Contra-ação do evento da rodada (GDD 9): "quem gastar N ações fica imune".
  const braceN = braceActions(ctx, state);
  const braced = state.world.braced.includes(state.activePlayer);
  // Vez de um assento de IA: a barra diz quem está pensando (a entrada fica travada).
  const who = state.stage === 'over' ? null : decider(state);
  const aiName =
    who !== null && seats?.[who] !== undefined && seats[who] !== 'human' ? playerName(t, who) : null;
  const res = counters[me];
  const total = ctx.balance.turn.actionsPerTurn;
  const playing = turn.stage === 'playing';
  const mineTurn = canDecide && playing && viewer === state.activePlayer && !state.pendingTrade;
  const inActions = mineTurn && state.phase === 'actions';
  // A Entrega só espera decisão com a camada de cartas (Fase 4).
  const endLabel =
    state.phase === 'delivery' && state.layers.cards ? t('hud.endDelivery') : t('hud.endActions');
  const armedNames = [armed.drone, armed.halfCost]
    .filter((u) => u !== undefined)
    .map((u) => cardFace(state.cards.defs[u.card] ?? '').title)
    .join(' + ');
  const hint = mode
    ? t(`hud.modeHint.${mode.type}`, {
        structure: mode.type === 'build' ? t(`structures.${mode.structure}`) : '',
      })
    : armedNames
      ? t('hud.armed', { list: armedNames })
      : aiName
        ? t('hud.aiThinking', { name: aiName })
        : turn.stage === 'setup' && canDecide
          ? t('hud.setupHint')
          : mineTurn && state.phase === 'delivery' && state.layers.cards
            ? t('hud.deliveryHint')
            : '';
  const mySlots = shown?.players[me]?.permanents ?? [];

  return (
    <footer className={`${hud.plate} ${hud.rivets} ${styles.bottom}`}>
      <div className={styles.resources} data-testid="resources" aria-label={t('hud.resources')}>
        {RESOURCE_IDS.map((id) => (
          <span key={id} className={styles.res} title={t(`resources.${id}`)} data-testid={`res-${id}`}>
            <ResourceIcon id={id} size={24} />
            <RollingNumber value={res?.[id] ?? 0} instant={instant} />
          </span>
        ))}
      </div>

      <div className={styles.permanents} aria-label={t('hud.permanents')}>
        <span className={hud.label}>{t('hud.permanents')}</span>
        {Array.from({ length: ctx.balance.permanents.slots }, (_, i) => {
          const uid = mySlots[i] ?? null;
          const id = uid === null ? undefined : shown?.cards.defs[uid];
          return id === undefined ? (
            <span key={i} className={styles.slot} title={t('hud.emptySlot')} data-slot={i} />
          ) : (
            <span key={i} className={styles.slotCard} data-slot={i} data-testid={`slot-${i}`}>
              <MiniCard
                uid={uid ?? undefined}
                id={id}
                width={32}
                onClick={() => useUi.getState().setZoom({ id })}
              />
            </span>
          );
        })}
      </div>

      <div className={styles.actionsRow}>
        <div
          className={styles.dots}
          aria-label={t('hud.actionsLeft', { n: turn.actionsLeft, total })}
          data-testid="actions-left"
        >
          <span className={hud.label}>{t('hud.actions')}</span>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < (playing ? turn.actionsLeft : 0) ? styles.dotOn : styles.dot} />
          ))}
        </div>
        {MODES.map((m) => {
          const on = mode?.type === m.type || (m.type === 'build' && modal?.kind === 'buildPicker');
          return (
            <div key={m.type} className={styles.modeWrap}>
              <button
                type="button"
                className={`${hud.btn} ${on ? hud.btnOn : ''}`}
                disabled={!inActions}
                onClick={() =>
                  m.type === 'build' ? openBuildPicker() : chooseAction({ type: m.type } as ActionTemplate)
                }
                data-testid={`mode-${m.type}`}
              >
                {t(m.label)} <span className={hud.kbd}>{m.key}</span>
              </button>
              {m.type === 'build' && modal?.kind === 'buildPicker' && <BuildPicker />}
            </div>
          );
        })}
      </div>

      <div className={styles.hint} aria-live="polite">
        {hint}
      </div>

      <div className={styles.tradeRow}>
        {state.layers.conflict && (
          <label className={combatStyles.tariff} title={t('tariff.hint')}>
            {t('tariff.label')}
            <select
              value={state.players[me]?.tariff ?? 'food'}
              disabled={!inActions || state.players[me]?.tariffRound === state.round}
              onChange={(e) =>
                perform({ type: 'setTariff', player: me, resource: e.target.value as ResourceId })
              }
              data-testid="tariff"
            >
              {RESOURCE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`resources.${id}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={hud.btn}
          disabled={!inActions}
          onClick={openBank}
          data-testid="open-bank"
        >
          {t('hud.bank')} <span className={hud.kbd}>M</span>
        </button>
        <button
          type="button"
          className={hud.btn}
          disabled={!inActions}
          onClick={openTrade}
          data-testid="open-trade"
        >
          {t('hud.trade')} <span className={hud.kbd}>T</span>
        </button>
        {braceN > 0 && (
          <button
            type="button"
            className={`${hud.btn} ${braced ? hud.btnOn : ''}`}
            disabled={!inActions || braced || turn.actionsLeft < braceN}
            onClick={() => perform({ type: 'brace', player: state.activePlayer })}
            title={t('events.braceHint', { n: braceN, event: eventName(state.world.current ?? '') })}
            data-testid="brace"
          >
            {braced ? t('events.braced') : t('events.brace')}
          </button>
        )}
        <button
          type="button"
          className={hud.btn}
          disabled={!mineTurn}
          onClick={openTreaty}
          title={t('hud.treatyLocked')}
        >
          {t('hud.treaty')} <span className={hud.kbd}>Y</span>
        </button>
        {undoOn && (
          <button
            type="button"
            className={`${hud.btn} ${styles.undo}`}
            disabled={!inActions || !canUndo(state)}
            onClick={undoLast}
            data-testid="undo"
            title={t('hud.undoHint')}
          >
            <Icon glyph="undo" size={15} /> {t('hud.undo')} <span className={hud.kbd}>Ctrl Z</span>
          </button>
        )}
      </div>

      <button
        type="button"
        className={`${hud.btn} ${hud.btnPrimary} ${styles.endBtn}`}
        disabled={!mineTurn}
        onClick={endPhase}
        data-testid="end-phase"
      >
        <span>{endLabel}</span>
        <span className={hud.kbd}>Enter</span>
      </button>
    </footer>
  );
}
