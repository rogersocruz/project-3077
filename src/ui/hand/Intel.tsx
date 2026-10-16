/**
 * Relatório de carta de informação (Dossiê, Auditoria, Reconhecimento, Vazamento de
 * Mercado): só para quem jogou (hotseat: quem está diante da tela). A fila de animação
 * espera o "Entendi".
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { director, usePresentation } from '../../anim';
import { RESOURCE_IDS } from '../../data/schemas';
import { seatFaction } from '../../render3d/model';
import { cardFace } from '../card/faces';
import { FactionBadge, ResourceIcon } from '../components/Bits';
import { amountsText, hexLabel, playerName } from '../game/text';
import hud from '../hud/Hud.module.css';
import styles from './Cards.module.css';
import { MiniCard } from './MiniCard';

export function IntelReport() {
  const { t } = useTranslation();
  const intel = usePresentation((s) => s.intel);
  const viewer = usePresentation((s) => s.viewer);
  const shown = usePresentation((s) => s.shown);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), [intel]);
  if (!intel || intel.player !== viewer || !shown) return null;
  const r = intel.report;
  const title =
    r.kind === 'hand'
      ? t('intel.hand', { name: playerName(t, r.target) })
      : r.kind === 'stocks'
        ? t('intel.stocks')
        : r.target !== null
          ? t('intel.board', { name: playerName(t, r.target) })
          : t('intel.area', { hex: r.origin ? hexLabel(t, r.origin) : '' });

  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.tutorModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intel-title"
        data-testid="intel"
      >
        <h2 id="intel-title" className={hud.modalTitle}>
          {t('intel.title')} <em>{cardFace(intel.card).title}</em>
        </h2>
        <div className={`${hud.paper} ${hud.modalBody}`}>
          <h3 className={hud.paperHeading}>{title}</h3>
          {r.kind === 'hand' &&
            (r.cards.length ? (
              <div className={styles.choices}>
                {r.cards.map((c) => (
                  <MiniCard key={c} uid={c} id={shown.cards.defs[c] ?? ''} width={110} />
                ))}
              </div>
            ) : (
              <p>{t('intel.none')}</p>
            ))}
          {r.kind === 'stocks' && (
            <table className={styles.intelTable}>
              <tbody>
                {r.stocks.map((s) => (
                  <tr key={s.player}>
                    <th>
                      <FactionBadge faction={seatFaction(s.player)} size={14} /> {playerName(t, s.player)}
                    </th>
                    {RESOURCE_IDS.map((id) => (
                      <td key={id}>
                        <ResourceIcon id={id} size={13} onPaper /> {s.resources[id]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {r.kind === 'structures' &&
            (r.structures.length ? (
              <ul className={styles.intelList}>
                {r.structures.map((s) => (
                  <li key={s.uid}>
                    <FactionBadge faction={seatFaction(s.owner)} size={13} />
                    <strong>{t(`structures.${s.type}`)}</strong> {t('intel.level', { level: s.level })} ·{' '}
                    {hexLabel(t, s.hex)}
                    {s.produces && Object.keys(s.produces).length > 0 && (
                      <> · {t('intel.produces', { list: amountsText(t, s.produces) })}</>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('intel.none')}</p>
            ))}
        </div>
        <p className={hud.muted}>{t('intel.private')}</p>
        <div className={hud.modalFoot}>
          <button
            ref={ok}
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            onClick={() => director.dismissIntel()}
            data-testid="intel-ok"
          >
            {t('intel.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
