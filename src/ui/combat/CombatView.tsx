/**
 * Combate na interface (Fase 7, UX_SPEC 2.13): o quadro de um combate com as barras de
 * força (tropas, apoio de Artilharia, modificadores com o teto), usado pela previsão antes
 * de mover e pelo painel que o diretor mostra ao resolver.
 */
import { useTranslation } from 'react-i18next';
import { seatFaction } from '../../render3d/model';
import { FactionBadge } from '../components/Bits';
import { hexLabel, playerName } from '../game/text';
import styles from './Combat.module.css';

export interface SideView {
  readonly owner: number;
  readonly attacker: boolean;
  readonly troops: number;
  readonly support: number;
  readonly modifiers: readonly { readonly key: string; readonly value: number }[];
  readonly modifierTotal: number;
  readonly total: number;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function CombatSides({
  hex,
  sides,
  winner,
  cap,
}: {
  hex: string;
  sides: readonly SideView[];
  winner: number | null;
  cap: number;
}) {
  const { t } = useTranslation();
  const max = Math.max(1, ...sides.map((s) => s.total));
  const name = (o: number) => (o < 0 ? t(o === -1 ? 'troops.guardian' : 'troops.horde') : playerName(t, o));
  return (
    <div className={styles.sides} data-testid="combat-sides">
      <h3 className={styles.where}>{t('combat.title', { hex: hexLabel(t, hex) })}</h3>
      {sides.map((s) => {
        const pos = s.modifiers.filter((m) => m.value > 0).reduce((a, m) => a + m.value, 0);
        return (
          <section key={s.owner} className={`${styles.side} ${s.owner === winner ? styles.winner : ''}`}>
            <header className={styles.sideHead}>
              {s.owner >= 0 && <FactionBadge faction={seatFaction(s.owner)} size={16} />}
              <strong>{name(s.owner)}</strong>
              <span className={styles.role}>{s.attacker ? t('combat.attacker') : t('combat.defender')}</span>
              <span className={styles.total} data-testid={`combat-total-${s.owner}`}>
                {fmt(s.total)}
              </span>
            </header>
            <div className={styles.bar} aria-hidden>
              <span className={styles.barTroops} style={{ width: `${(s.troops / max) * 100}%` }} />
              <span className={styles.barSupport} style={{ width: `${(s.support / max) * 100}%` }} />
              <span
                className={styles.barMods}
                style={{ width: `${(Math.max(0, s.modifierTotal) / max) * 100}%` }}
              />
            </div>
            <dl className={styles.parts}>
              <dt>{t('combat.troops')}</dt>
              <dd>{fmt(s.troops)}</dd>
              <dt>{t('combat.support')}</dt>
              <dd>+{fmt(s.support)}</dd>
              {s.modifiers.map((m) => (
                <div key={m.key} className={styles.mod}>
                  <dt>{t(`combat.mod.${m.key}`)}</dt>
                  <dd>
                    {m.value > 0 ? '+' : ''}
                    {m.value}
                  </dd>
                </div>
              ))}
              {pos > cap && (
                <div className={styles.mod}>
                  <dt>{t('combat.cap', { n: cap })}</dt>
                  <dd>{s.modifierTotal}</dd>
                </div>
              )}
            </dl>
          </section>
        );
      })}
      <p className={styles.result} data-testid="combat-result">
        {winner === null ? t('combat.tie') : t('combat.wins', { name: name(winner) })}
      </p>
    </div>
  );
}
