/**
 * Peças pequenas da interface: ícone de recurso e de facção (forma + cor,
 * ART_DIRECTION 1.3), linha de custo com déficit em vermelho (UX_SPEC 7.3), contador
 * que rola, seletor de quantidade e glifos vetoriais.
 */
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import type { ResourceAmounts } from '../../engine/queries';
import type { Resources } from '../../engine/state';
import { type FactionKey, palette } from '../theme/tokens';
import styles from './Bits.module.css';
import { Shape } from './Shape';

export function ResourceIcon({
  id,
  size = 18,
  onPaper = false,
}: {
  id: ResourceId;
  size?: number;
  onPaper?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className={`${styles.icon} ${onPaper ? styles.onPaper : ''}`} title={t(`resources.${id}`)}>
      <Shape kind={palette.resource[id].shape} colorVar={`--resource-${id}-color`} size={size} />
    </span>
  );
}

export function FactionBadge({ faction, size = 22 }: { faction: FactionKey; size?: number }) {
  return (
    <span className={styles.icon}>
      <Shape kind={palette.faction[faction].symbol} colorVar={`--faction-${faction}-color`} size={size} />
    </span>
  );
}

/** Custo com ícones; o que falta vem em vermelho ("Falta 1 Ferro" no texto ao lado). */
export function CostLine({
  cost,
  have,
  onPaper = false,
}: {
  cost: ResourceAmounts;
  have?: Resources;
  onPaper?: boolean;
}) {
  const { t } = useTranslation();
  const items = RESOURCE_IDS.filter((id) => (cost[id] ?? 0) > 0);
  if (items.length === 0) return <span className={styles.free}>{t('inspector.free')}</span>;
  return (
    <span className={styles.cost}>
      {items.map((id) => {
        const need = cost[id] ?? 0;
        const short = have !== undefined && have[id] < need;
        return (
          <span key={id} className={`${styles.costItem} ${short ? styles.short : ''}`}>
            <ResourceIcon id={id} size={14} onPaper={onPaper} />
            {need}
          </span>
        );
      })}
    </span>
  );
}

/** Número que rola até o valor novo e pisca verde/vermelho (UX_SPEC 6: "contador do HUD rola"). */
export function RollingNumber({ value, instant = false }: { value: number; instant?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const [trend, setTrend] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown.current === value) return;
    setTrend(value > shown.current ? 'up' : 'down');
    const obj = { v: shown.current };
    shown.current = value;
    const done = () => setTrend(null);
    if (instant) {
      el.textContent = String(value);
      const id = window.setTimeout(done, 250);
      return () => window.clearTimeout(id);
    }
    const tween = gsap.to(obj, {
      v: value,
      duration: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = String(Math.round(obj.v));
      },
      onComplete: () => window.setTimeout(done, 200),
    });
    return () => {
      tween.kill();
      el.textContent = String(value);
    };
  }, [value, instant]);

  return (
    <span ref={ref} className={`${styles.roll} ${trend ? styles[trend] : ''}`}>
      {value}
    </span>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={styles.stepper} role="group" aria-label={label}>
      <button
        type="button"
        className={styles.stepBtn}
        disabled={value <= min}
        aria-label={t('common.less', { what: label })}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <span className={styles.stepValue} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={styles.stepBtn}
        disabled={value >= max}
        aria-label={t('common.more', { what: label })}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </span>
  );
}

export type Glyph =
  'gear' | 'pause' | 'help' | 'undo' | 'close' | 'alert' | 'life' | 'lifeLost' | 'log' | 'cards' | 'envelope';

/** Glifos vetoriais simples (cor = currentColor). */
export function Icon({ glyph, size = 18, title }: { glyph: Glyph; size?: number; title?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    className: styles.svg,
    'aria-hidden': !title,
  };
  const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const hex = 'M12 2.5 20.2 7.25v9.5L12 21.5 3.8 16.75v-9.5Z';
  return (
    <svg {...common} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {glyph === 'gear' && (
        <g {...stroke}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
        </g>
      )}
      {glyph === 'pause' && (
        <g fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </g>
      )}
      {glyph === 'help' && (
        <g {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.8" />
          <path d="M12 17.2h.01" />
        </g>
      )}
      {glyph === 'undo' && (
        <g {...stroke}>
          <path d="M9 7 4.5 11.5 9 16" />
          <path d="M5 11.5h9a5 5 0 0 1 0 10h-3" />
        </g>
      )}
      {glyph === 'close' && <path {...stroke} d="M6 6l12 12M18 6 6 18" />}
      {glyph === 'alert' && (
        <g>
          <path d="M12 3 22 20H2Z" fill="currentColor" />
          <path d="M12 9.5v5M12 17.2h.01" stroke="var(--frame-900)" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {glyph === 'life' && <path d={hex} fill="currentColor" />}
      {glyph === 'lifeLost' && <path d={hex} {...stroke} strokeWidth={1.6} opacity={0.5} />}
      {glyph === 'log' && <path {...stroke} d="M5 6h14M5 12h14M5 18h9" />}
      {glyph === 'cards' && (
        <g {...stroke}>
          <rect x="4" y="5" width="11" height="15" rx="1.5" transform="rotate(-10 9.5 12.5)" />
          <rect x="9" y="4" width="11" height="15" rx="1.5" />
        </g>
      )}
      {glyph === 'envelope' && (
        <g {...stroke}>
          <rect x="3" y="6" width="18" height="12" rx="1.5" />
          <path d="M3.5 7 12 13l8.5-6" />
        </g>
      )}
    </svg>
  );
}
