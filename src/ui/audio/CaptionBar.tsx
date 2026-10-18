/**
 * Legendas dos sons (UX_SPEC 3.5): cada som relevante aparece como texto por alguns
 * segundos (ou até o clique, com "tempo ilimitado").
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useCaptions } from '../../audio';
import { useSettings } from '../../settings';
import styles from './CaptionBar.module.css';

export function CaptionBar() {
  const { t } = useTranslation();
  const on = useSettings((s) => s.accessibility.captions);
  const unlimited = useSettings((s) => s.accessibility.unlimitedTime);
  const items = useCaptions((s) => s.items);
  const drop = useCaptions((s) => s.drop);
  useEffect(() => {
    if (unlimited || items.length === 0) return;
    const first = items[0];
    if (!first) return;
    const id = window.setTimeout(() => drop(first.id), 2600);
    return () => window.clearTimeout(id);
  }, [items, unlimited, drop]);
  if (!on || items.length === 0) return null;
  return (
    <div className={styles.bar} role="log" aria-live="polite" data-testid="captions">
      {items.map((c) => (
        <button key={c.id} type="button" className={styles.caption} onClick={() => drop(c.id)}>
          [{t(`captions.${c.sound}`)}]
        </button>
      ))}
    </div>
  );
}
