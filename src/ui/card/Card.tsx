/**
 * Face da carta em SVG (ART_DIRECTION 4) — fonte única para a mão, o zoom e a textura
 * 3D (rasterize.ts). Retrato 63 × 88 mm em unidades de 0,1 mm. Só atributos SVG (sem
 * CSS), para a rasterização desenhar igual.
 */
import { type ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { RESOURCE_IDS } from '../../data/schemas';
import { fonts, palette } from '../theme/tokens';
import { mix } from './color';
import { CARD_H, CARD_W, chamferPath } from './geometry';
import { ActionGlyph, CategoryIcon, DiscardGlyph, ResourceGlyph } from './glyphs';
import { ART_H, ART_W, Illustration } from './Illustration';
import { fitLine, layoutText } from './layout';
import { type Measurer, useMeasurer } from './measure';
import type { CardFace, CostItem } from './model';

const CHAMFER = Math.round(CARD_W * 0.06);
const M = 22;
const HEADER = { top: M, bottom: 104 };
const ART = { x: M, y: HEADER.bottom };
const RIBBON = { top: 520, bottom: 566, topW: 360, bottomW: 316 };
const PANEL = { x: 28, y: 574, w: CARD_W - 56, h: 258 };
const COST_Y = 614;
const TEXT = { x: 52, width: 526, top: 682, maxLines: 5 };

export interface CardProps {
  readonly face: CardFace;
  /** Largura em px do elemento (a altura segue a proporção 63 × 88). */
  readonly width?: number;
  /** Sem recurso para jogar: dessaturada 60%, custo em vermelho (ART_DIRECTION 4). */
  readonly blocked?: boolean;
  /** Etiqueta de versão ("v1.0"). */
  readonly version: string;
  /** Medidor de texto (padrão: canvas com as fontes do jogo). */
  readonly measurer?: Measurer;
  readonly className?: string;
}

function CostLine({
  items,
  measurer,
  danger,
  freeLabel,
  orLabel,
}: {
  items: readonly CostItem[];
  measurer: Measurer;
  danger: boolean;
  freeLabel: string;
  orLabel: string;
}) {
  const ink = danger ? palette.ui.danger : palette.ink[900];
  const numSize = 34;
  const out: ReactNode[] = [];
  let x = TEXT.x;
  const number = (n: number, key: string) => {
    const text = String(n);
    out.push(
      <text
        key={key}
        x={x}
        y={COST_Y + 12}
        fontFamily={fonts.numeric}
        fontWeight={700}
        fontSize={numSize}
        fill={ink}
      >
        {text}
      </text>,
    );
    x += measurer.numeric(text, numSize) + 16;
  };
  const amounts = (a: Partial<Record<(typeof RESOURCE_IDS)[number], number>>, key: string) => {
    for (const id of RESOURCE_IDS) {
      const n = a[id];
      if (!n) continue;
      out.push(<ResourceGlyph key={`${key}${id}`} id={id} x={x + 15} y={COST_Y} size={30} />);
      x += 36;
      number(n, `${key}${id}n`);
    }
  };
  if (items.length === 0) {
    out.push(
      <text
        key="free"
        x={x}
        y={COST_Y + 9}
        fontFamily={fonts.display}
        fontWeight={700}
        fontSize={26}
        letterSpacing={2}
        fill={palette.ink[600]}
      >
        {freeLabel.toLocaleUpperCase('pt-BR')}
      </text>,
    );
  }
  items.forEach((item, i) => {
    if (i > 0) x += 10;
    switch (item.kind) {
      case 'resources':
        amounts(item.amounts, `r${i}`);
        break;
      case 'choice':
        item.options.forEach((opt, k) => {
          if (k > 0) {
            out.push(
              <text
                key={`or${i}${k}`}
                x={x}
                y={COST_Y + 8}
                fontFamily={fonts.body}
                fontStyle="italic"
                fontWeight={400}
                fontSize={24}
                fill={palette.ink[600]}
              >
                {orLabel}
              </text>,
            );
            x += measurer.body(orLabel, false, 24) + 14;
          }
          amounts(opt, `o${i}${k}`);
        });
        break;
      case 'discard':
        out.push(<DiscardGlyph key={`d${i}`} x={x + 18} y={COST_Y} size={40} color={ink} />);
        x += 42;
        number(item.n, `dn${i}`);
        break;
      case 'actions':
        out.push(<ActionGlyph key={`a${i}`} x={x + 15} y={COST_Y} size={28} color={ink} />);
        x += 36;
        number(item.n, `an${i}`);
        break;
    }
  });
  return <g>{out}</g>;
}

export function Card({ face, width = 252, blocked = false, version, measurer, className }: CardProps) {
  const { t } = useTranslation();
  const auto = useMeasurer();
  const m = measurer ?? auto;
  const id = `c${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cat = palette.card[face.category];
  const title = face.title.toLocaleUpperCase('pt-BR');
  const titleSize = fitLine(title, 470, [46, 42, 38, 34, 31, 28, 25], true, (s, _b, size) =>
    m.display(s, size),
  );
  const ribbon = t(`cards.ribbon.${face.ribbon}`).toLocaleUpperCase('pt-BR');
  const ribbonSize = fitLine(ribbon, RIBBON.bottomW - 40, [28, 26, 24, 22, 20], true, (s, _b, size) =>
    m.display(s, size),
  );
  const block = layoutText(face.text, {
    width: TEXT.width,
    maxLines: TEXT.maxLines,
    sizes: [31, 29, 27, 25, 23, 21],
    lineHeight: 1.22,
    measure: m.body,
  });
  const rx = (CARD_W - RIBBON.topW) / 2;
  const bx = (CARD_W - RIBBON.bottomW) / 2;
  const height = (width * CARD_H) / CARD_W;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      width={width}
      height={height}
      role="img"
      aria-label={t('cards.aria', { title: face.title, ribbon })}
      className={className}
    >
      <defs>
        <linearGradient id={`${id}hdr`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={cat.headerFrom} />
          <stop offset="1" stopColor={cat.headerTo} />
        </linearGradient>
        <linearGradient id={`${id}frm`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={mix(palette.frame[800], palette.frame.edge, 0.12)} />
          <stop offset="1" stopColor={palette.frame[800]} />
        </linearGradient>
        <clipPath id={`${id}art`}>
          <rect x={ART.x} y={ART.y} width={ART_W} height={ART_H} />
        </clipPath>
        <filter id={`${id}gray`}>
          <feColorMatrix type="saturate" values="0.4" />
        </filter>
      </defs>
      <g filter={blocked ? `url(#${id}gray)` : undefined}>
        {/* Moldura metálica chanfrada, bisel e rebites discretos. */}
        <path d={chamferPath(0, 0, CARD_W, CARD_H, CHAMFER)} fill={`url(#${id}frm)`} />
        <path
          d={chamferPath(8, 8, CARD_W - 16, CARD_H - 16, CHAMFER - 6)}
          fill="none"
          stroke={palette.frame.edge}
          strokeWidth={3}
          strokeOpacity={0.55}
        />
        {[
          [70, 14],
          [CARD_W - 70, 14],
          [70, CARD_H - 14],
          [CARD_W - 70, CARD_H - 14],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={palette.frame.edge} opacity={0.6} />
        ))}

        {/* Ilustração (sangra até a moldura lateral). */}
        <g clipPath={`url(#${id}art)`}>
          <g transform={`translate(${ART.x} ${ART.y})`}>
            <Illustration motif={face.motif} seed={face.seed} category={face.category} idPrefix={id} />
          </g>
        </g>

        {/* Header na cor da categoria. */}
        <path
          d={`M${M + 28},${HEADER.top}H${CARD_W - M - 28}L${CARD_W - M},${HEADER.top + 28}V${HEADER.bottom}H${M}V${HEADER.top + 28}Z`}
          fill={`url(#${id}hdr)`}
        />
        <path
          d={`M${M + 28},${HEADER.top + 2}H${CARD_W - M - 28}`}
          stroke={palette.paper[100]}
          strokeOpacity={0.3}
          strokeWidth={2}
        />
        <path d={`M${M},${HEADER.bottom}H${CARD_W - M}`} stroke={palette.frame[900]} strokeWidth={3} />
        <circle cx={66} cy={63} r={29} fill={palette.frame[900]} opacity={0.35} />
        <CategoryIcon category={face.category} x={66} y={63} size={42} color={palette.paper[100]} />
        <text
          x={104}
          y={63 + titleSize * 0.36}
          fontFamily={fonts.display}
          fontWeight={700}
          fontSize={titleSize}
          letterSpacing={1}
          fill={palette.paper[100]}
        >
          {title}
        </text>

        {/* Selo de nível. */}
        {face.tier !== null && (
          <g>
            <path
              d={chamferPath(36, 120, 76, 78, 14)}
              fill={palette.frame[900]}
              fillOpacity={0.88}
              stroke={palette.frame.edge}
              strokeWidth={2.5}
            />
            <text
              x={74}
              y={170}
              textAnchor="middle"
              fontFamily={fonts.numeric}
              fontWeight={700}
              fontSize={36}
              fill={palette.paper[100]}
            >
              {`n${face.tier}`}
            </text>
            {[0, 1, 2].map((i) => (
              <rect
                key={i}
                x={58 + i * 12}
                y={180}
                width={8}
                height={8}
                fill={i < (face.tier ?? 0) ? palette.accent.orange : palette.frame[700]}
              />
            ))}
          </g>
        )}

        {/* Fita trapezoidal do tipo. */}
        <path
          d={`M${rx},${RIBBON.top}H${CARD_W - rx}L${CARD_W - bx},${RIBBON.bottom}H${bx}Z`}
          fill={cat.ribbon}
          stroke={palette.frame[900]}
          strokeWidth={2.5}
        />
        <path
          d={`M${rx + 8},${RIBBON.top + 5}H${CARD_W - rx - 8}`}
          stroke={palette.paper[100]}
          strokeOpacity={0.3}
          strokeWidth={2}
        />
        <text
          x={CARD_W / 2}
          y={(RIBBON.top + RIBBON.bottom) / 2 + ribbonSize * 0.36}
          textAnchor="middle"
          fontFamily={fonts.display}
          fontWeight={700}
          fontSize={ribbonSize}
          letterSpacing={3}
          fill={palette.paper[100]}
        >
          {ribbon}
        </text>

        {/* Painel creme: custo e efeito (o texto nunca vai sobre a ilustração). */}
        <rect
          x={PANEL.x + 4}
          y={PANEL.y + 4}
          width={PANEL.w}
          height={PANEL.h}
          rx={6}
          fill={palette.paper[300]}
        />
        <rect x={PANEL.x} y={PANEL.y} width={PANEL.w} height={PANEL.h} rx={6} fill={palette.paper[100]} />
        <path
          d={`M${PANEL.x + 18},${COST_Y + 28}H${PANEL.x + PANEL.w - 18}`}
          stroke={palette.paper[300]}
          strokeWidth={2}
        />
        <text fontFamily={fonts.body} fill={palette.ink[900]} fontSize={block.fontSize}>
          {block.lines.map((line, li) =>
            line.map((p, pi) => (
              <tspan
                key={`${li}-${pi}`}
                x={TEXT.x + p.x}
                y={TEXT.top + li * block.lineHeight}
                fontWeight={p.bold ? 700 : 500}
              >
                {p.text}
              </tspan>
            )),
          )}
        </text>

        {/* Etiqueta de versão. */}
        <text
          x={CARD_W - 52}
          y={CARD_H - 15}
          textAnchor="end"
          fontFamily={fonts.body}
          fontWeight={500}
          fontSize={17}
          fill={palette.frame.edge}
        >
          {version}
        </text>
        <path
          d={`M${CARD_W - 46},${CARD_H - 14}H${CARD_W - 32}V${CARD_H - 28}Z`}
          fill={palette.accent.orange}
        />
      </g>
      {/* Custo fora do filtro: vermelho vivo quando bloqueada. */}
      <CostLine
        items={face.cost}
        measurer={m}
        danger={blocked}
        freeLabel={t('cards.free')}
        orLabel={t('cards.or')}
      />
    </svg>
  );
}
