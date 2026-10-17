/**
 * Modais de combate (Fase 7): previsão antes de mover para hex com inimigo (UX_SPEC 2.13,
 * "previsão de combate antes de confirmar o movimento"), escolha de baixas do jogador humano
 * e o painel que o diretor mostra quando um combate é resolvido.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { applyAction, checkAction } from '../../engine';
import { previewCombat } from '../../engine/rules/combat';
import { perform, useCanDecide } from '../game/hooks';
import { useSession } from '../game/session';
import { useUi } from '../game/uiStore';
import { troops as troopName } from './names';
import hud from '../hud/Hud.module.css';
import styles from './Combat.module.css';
import { CombatSides } from './CombatView';

export function MovePreview() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const modal = useUi((s) => s.modal);
  if (!ctx || !state || modal?.kind !== 'movePreview') return null;
  const action = modal.action;
  // A previsão simula o movimento (o motor é puro) e monta os lados do combate no destino.
  const pv = (() => {
    try {
      return previewCombat(ctx, applyAction(ctx, state, action).state, action.to);
    } catch {
      return null;
    }
  })();
  const close = () => useUi.getState().open(null);
  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal}`}
        role="dialog"
        aria-label={t('combat.preview')}
        data-testid="move-preview"
      >
        <h2 className={hud.modalTitle}>{t('combat.preview')}</h2>
        {pv && (
          <CombatSides
            hex={pv.hex}
            sides={pv.sides.map((s) => ({ ...s, support: s.supportTotal }))}
            winner={pv.winner}
            cap={ctx.balance.combat.maxPositiveModifiers}
          />
        )}
        <div className={hud.modalFoot}>
          <button type="button" className={hud.btn} onClick={close}>
            {t('combat.cancel')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={!checkAction(ctx, state, action).ok}
            onClick={() => {
              close();
              perform(action);
            }}
            data-testid="move-confirm"
          >
            {t('combat.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** GDD 8.4 passo 4: o perdedor humano escolhe as baixas (força removida ≥ necessário, mínima). */
export function CasualtyChoice() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const viewer = usePresentation((s) => s.viewer);
  const canDecide = useCanDecide();
  const [chosen, setChosen] = useState<number[]>([]);
  const pending = state?.pending?.kind === 'casualties' ? state.pending : null;
  if (!ctx || !state || !pending || !canDecide || viewer !== pending.player) return null;
  const hex = state.hexes[pending.hex];
  const action = { type: 'chooseCasualties' as const, player: pending.player, uids: chosen };
  const ok = checkAction(ctx, state, action).ok;
  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal}`}
        role="dialog"
        aria-label={t('combat.casualtiesTitle')}
        data-testid="casualty-choice"
      >
        <h2 className={hud.modalTitle}>{t('combat.casualtiesTitle')}</h2>
        <p className={hud.muted}>{t('combat.casualtiesHint', { n: pending.need })}</p>
        <div className={styles.choices}>
          {pending.options.map((o) => {
            const tr = hex?.troops.find((x) => x.uid === o.uid);
            return (
              <label key={o.uid} className={styles.choice}>
                <input
                  type="checkbox"
                  checked={chosen.includes(o.uid)}
                  onChange={(e) =>
                    setChosen((c) => (e.target.checked ? [...c, o.uid] : c.filter((u) => u !== o.uid)))
                  }
                  data-testid={`casualty-${o.uid}`}
                />
                {tr ? troopName(t, tr.type, tr.level) : o.uid} · {o.strength}
              </label>
            );
          })}
        </div>
        <div className={hud.modalFoot}>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={!ok}
            onClick={() => {
              if (perform(action)) setChosen([]);
            }}
            data-testid="casualty-confirm"
          >
            {t('combat.confirmCasualties')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Painel do combate resolvido (o diretor liga por alguns instantes; UX_SPEC 2.13). */
export function CombatPanel() {
  const ctx = useSession((s) => s.ctx);
  const combat = usePresentation((s) => s.combat);
  if (!ctx || !combat) return null;
  return (
    <div className={`${hud.plate} ${hud.rivets} ${styles.panel}`} data-testid="combat-panel">
      <CombatSides
        hex={combat.hex}
        sides={combat.sides}
        winner={combat.winner}
        cap={ctx.balance.combat.maxPositiveModifiers}
      />
    </div>
  );
}
