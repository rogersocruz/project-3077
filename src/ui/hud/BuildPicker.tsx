/**
 * "O que construir?" (tecla B): lista as estruturas com custo e quantos hexes aceitam
 * cada uma agora. Escolher destaca esses hexes no mapa. Sem alvo, mostra o motivo mais
 * útil vindo do motor (desbloqueio, recurso, limite…).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { actionTargets, checkAction, type Reason, type ReasonKey } from '../../engine';
import { deficit } from '../../engine/queries';
import { buildCost } from '../../engine/rules/build';
import { CostLine } from '../components/Bits';
import { chooseAction, withArmed } from '../game/commands';
import { useSession } from '../game/session';
import { useUi } from '../game/uiStore';
import { amountsText } from '../game/text';
import styles from './Game.module.css';
import hud from './Hud.module.css';

/** Ordem de utilidade do motivo quando nenhum hex aceita a estrutura. */
const PRIORITY: ReasonKey[] = [
  'rarityLocked',
  'cannotAfford',
  'outpostLimit',
  'duplicateInHex',
  'hexFull',
  'subsoilNotSurveyed',
  'subsoilEmpty',
  'subsoilDepleted',
  'wrongTerrain',
];

export function BuildPicker() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  // Drone/Contrato armados mudam alcance e custo (a lista acompanha).
  const armed = useUi((s) => s.armed);

  const rows = useMemo(() => {
    if (!ctx || !state) return [];
    const me = state.activePlayer;
    const own = Object.keys(state.hexes).filter(
      (k) => state.hexes[k]?.boardId === state.players[me]?.boardId,
    );
    return ctx.data.structures
      .filter((d) => d.buildable !== false)
      .map((d) => {
        const template = withArmed({ type: 'build', structure: d.id }, armed);
        const targets = actionTargets(ctx, state, me, template);
        const half = template.type === 'build' && !!template.halfCost;
        let reason: Reason | null = null;
        if (targets.length === 0) {
          const reasons = own
            .map((hex) =>
              checkAction(ctx, state, { ...template, type: 'build', player: me, structure: d.id, hex }),
            )
            .flatMap((c) => (c.ok ? [] : [c.reason]));
          reason = PRIORITY.map((k) => reasons.find((r) => r.key === k)).find((r) => r !== undefined) ?? {
            key: 'outOfRange',
          };
        }
        return { id: d.id, cost: buildCost(ctx, d.id, half), targets: targets.length, reason };
      });
  }, [ctx, state, armed]);

  if (!state) return null;
  const have = state.players[state.activePlayer]?.resources;

  return (
    <div className={`${hud.plate} ${styles.picker}`} role="dialog" aria-label={t('hud.pickStructure')}>
      <h2 className={hud.plateTitle}>{t('hud.pickStructure')}</h2>
      <ul className={styles.pickList}>
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className={styles.pickBtn}
              disabled={r.targets === 0}
              onClick={() => chooseAction({ type: 'build', structure: r.id })}
              data-testid={`pick-${r.id}`}
            >
              <span className={styles.pickName}>{t(`structures.${r.id}`)}</span>
              <CostLine cost={r.cost} have={have} />
              <span className={styles.pickInfo}>
                {r.reason ? (
                  <span className={hud.danger}>
                    {r.reason.key === 'cannotAfford' && have
                      ? t('inspector.missing', { list: amountsText(t, deficit(have, r.cost)) })
                      : t(`engine.illegal.${r.reason.key}`, r.reason.params)}
                  </span>
                ) : (
                  t('hud.targetsCount', { count: r.targets })
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
