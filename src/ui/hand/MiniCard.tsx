/** Carta pequena clicável (escolher descarte, permanente, slot); botão direito = zoom. */
import { useTranslation } from 'react-i18next';
import type { CardUid } from '../../engine';
import { Card } from '../card/Card';
import { cardFace, cardVersion } from '../card/faces';
import { useUi } from '../game/uiStore';
import styles from './Cards.module.css';

export function MiniCard({
  uid,
  id,
  width = 72,
  selected = false,
  disabled = false,
  onClick,
  testid,
}: {
  uid?: CardUid;
  id: string;
  width?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  testid?: string;
}) {
  const { t } = useTranslation();
  const face = cardFace(id);
  return (
    <button
      type="button"
      className={`${styles.mini} ${selected ? styles.miniOn : ''}`}
      disabled={disabled}
      aria-pressed={onClick ? selected : undefined}
      title={face.title}
      aria-label={t('hand.cardLabel', { title: face.title })}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        useUi.getState().setZoom(uid === undefined ? { id } : { card: uid });
      }}
      data-testid={testid}
    >
      <Card face={face} width={width} version={cardVersion()} />
    </button>
  );
}
