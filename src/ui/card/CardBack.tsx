/**
 * Versos (ART_DIRECTION 4, Variações): frame.900 com grade hexagonal sutil e o logo
 * "3077" em laranja. n1/n2/n3 com 1–3 barras, Tesouro dourado, Evento horizontal.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { fonts, palette } from '../theme/tokens';
import { CARD_H, CARD_W, chamferPath } from './geometry';
import { mix } from './color';

export type BackKind = 'n1' | 'n2' | 'n3' | 'treasure' | 'event';

export function CardBack({
  kind,
  width = 252,
  className,
}: {
  kind: BackKind;
  width?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const id = `b${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const horizontal = kind === 'event';
  const W = horizontal ? CARD_H : CARD_W;
  const H = horizontal ? CARD_W : CARD_H;
  const gold = palette.card.contract.headerFrom;
  const accent = kind === 'treasure' ? gold : palette.accent.orange;
  const grid = kind === 'treasure' ? mix(gold, palette.frame[900], 0.55) : palette.frame[700];
  const bars = kind === 'n1' ? 1 : kind === 'n2' ? 2 : kind === 'n3' ? 3 : 0;
  const label =
    kind === 'treasure'
      ? t('cards.back.treasure')
      : kind === 'event'
        ? t('cards.back.event')
        : t(`cards.deck.${kind}`);
  const cx = W / 2;
  const cy = H / 2;
  const r = 34;
  const hex = `M${r},0L${r / 2},${r * 0.866}L${-r / 2},${r * 0.866}L${-r},0L${-r / 2},${-r * 0.866}L${r / 2},${-r * 0.866}Z`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={width}
      height={(width * H) / W}
      role="img"
      aria-label={t('cards.backAria', { deck: label })}
      className={className}
    >
      <defs>
        <pattern id={`${id}hex`} width={r * 3} height={r * 1.732} patternUnits="userSpaceOnUse">
          <path d={hex} transform={`translate(${r} 0)`} fill="none" stroke={grid} strokeWidth={2} />
          <path
            d={hex}
            transform={`translate(${r * 2.5} ${r * 0.866})`}
            fill="none"
            stroke={grid}
            strokeWidth={2}
          />
          <path
            d={hex}
            transform={`translate(${r} ${r * 1.732})`}
            fill="none"
            stroke={grid}
            strokeWidth={2}
          />
        </pattern>
        <radialGradient id={`${id}glow`}>
          <stop offset="0" stopColor={accent} stopOpacity="0.28" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={chamferPath(0, 0, W, H, 38)} fill={palette.frame[900]} />
      <path d={chamferPath(18, 18, W - 36, H - 36, 30)} fill={`url(#${id}hex)`} opacity={0.6} />
      <path
        d={chamferPath(10, 10, W - 20, H - 20, 32)}
        fill="none"
        stroke={palette.frame.edge}
        strokeOpacity={0.55}
        strokeWidth={3}
      />
      <path
        d={chamferPath(18, 18, W - 36, H - 36, 30)}
        fill="none"
        stroke={accent}
        strokeOpacity={0.35}
        strokeWidth={2}
      />
      <circle cx={cx} cy={cy} r={Math.min(W, H) * 0.42} fill={`url(#${id}glow)`} />
      <text
        x={cx}
        y={cy - 92}
        textAnchor="middle"
        fontFamily={fonts.display}
        fontWeight={700}
        fontSize={42}
        letterSpacing={10}
        fill={palette.paper[300]}
      >
        {t('app.titleWord').toLocaleUpperCase('pt-BR')}
      </text>
      <text
        x={cx}
        y={cy + 52}
        textAnchor="middle"
        fontFamily={fonts.numeric}
        fontWeight={700}
        fontSize={168}
        fill={accent}
      >
        {t('app.titleNumber')}
      </text>
      {Array.from({ length: bars }, (_, i) => (
        <rect key={i} x={cx - 130} y={cy + 92 + i * 30} width={260} height={16} rx={3} fill={accent} />
      ))}
      <text
        x={cx}
        y={cy + (bars ? 92 + bars * 30 + 44 : 120)}
        textAnchor="middle"
        fontFamily={fonts.display}
        fontWeight={700}
        fontSize={34}
        letterSpacing={6}
        fill={palette.paper[300]}
      >
        {bars ? label : label.toLocaleUpperCase('pt-BR')}
      </text>
    </svg>
  );
}
