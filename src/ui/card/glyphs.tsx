/**
 * Glifos da carta em SVG puro (atributos, sem CSS): o mesmo desenho vai para a
 * interface e para a textura 3D rasterizada. Coordenadas centradas em (0, 0).
 */
import type { ResourceId } from '../../data/schemas';
import { GAME_ICON_BOX, GAME_ICON_PATHS, type GameIconId } from '../icons/gameIcons.generated';
import { type CardCategoryKey, palette } from '../theme/tokens';

function polygon(n: number, r: number, rot = 0): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
}

/**
 * Silhueta de um ícone de terceiros (game-icons.net, CC BY 3.0 — assets/credits.json)
 * centrada em (0, 0), do tamanho `size`, com contorno escuro por fora (paint-order).
 */
export function IconSilhouette({
  id,
  size,
  fill = palette.paper[100],
  outline = palette.ink[900],
  outlineWidth = size * 0.07,
}: {
  id: GameIconId;
  size: number;
  fill?: string;
  outline?: string;
  outlineWidth?: number;
}) {
  const s = size / GAME_ICON_BOX;
  return (
    <path
      d={GAME_ICON_PATHS[id]}
      transform={`translate(${-size / 2} ${-size / 2}) scale(${s})`}
      fill={fill}
      stroke={outline}
      strokeWidth={outlineWidth / s}
      strokeLinejoin="round"
      paintOrder="stroke"
    />
  );
}

/** Categorias com ícone: as 5 de carta (ART_DIRECTION 2.2) + Evento e Tesouro. */
export type IconCategory = CardCategoryKey | 'event' | 'treasure';

/** Ícone da categoria (ART_DIRECTION 2.2): átomo, alvo, insígnia, aperto de mão, gema… */
export function CategoryIcon({
  category,
  x,
  y,
  size,
  color,
}: {
  category: IconCategory;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <IconSilhouette id={`card-${category}`} size={size} fill={color} outlineWidth={size * 0.05} />
    </g>
  );
}

/**
 * Token do recurso (ART_DIRECTION 2.4): forma na cor do recurso, com a silhueta do
 * ícone em creme e contorno escuro por cima.
 */
export function ResourceGlyph({ id, x, y, size }: { id: ResourceId; x: number; y: number; size: number }) {
  const r = size / 2;
  const { color, shape } = palette.resource[id];
  const edge = { fill: color, stroke: palette.ink[900], strokeOpacity: 0.55, strokeWidth: size * 0.06 };
  return (
    <g transform={`translate(${x} ${y})`}>
      {shape === 'disc' && <circle r={r} {...edge} />}
      {shape === 'roundedCube' && <rect x={-r} y={-r} width={size} height={size} rx={r * 0.35} {...edge} />}
      {shape === 'hexPrism' && <path d={polygon(6, r * 1.05, -Math.PI / 2)} {...edge} />}
      {shape === 'rhombus' && <path d={`M0,${-r * 1.1}L${r},0 0,${r * 1.1} ${-r},0Z`} {...edge} />}
      {shape === 'drop' && (
        <path
          d={`M0,${-r * 1.15}C${r * 0.9},${-r * 0.2} ${r},${r * 0.95} 0,${r}C${-r},${r * 0.95} ${-r * 0.9},${-r * 0.2} 0,${-r * 1.15}Z`}
          {...edge}
        />
      )}
      {shape === 'octagon' && <path d={polygon(8, r * 1.05, Math.PI / 8)} {...edge} />}
      <g transform={shape === 'drop' ? `translate(0 ${r * 0.12})` : undefined}>
        <IconSilhouette
          id={`resource-${id}`}
          size={size * (shape === 'rhombus' || shape === 'drop' ? 0.7 : 0.82)}
          outlineWidth={size * 0.045}
        />
      </g>
    </g>
  );
}

/** Descartar cartas: duas cartas com seta para baixo. */
export function DiscardGlyph({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const s = size / 100;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      fill="none"
      stroke={color}
      strokeWidth="7"
      strokeLinejoin="round"
    >
      <rect x="-30" y="-44" width="44" height="62" rx="6" transform="rotate(-12)" opacity="0.55" />
      <rect x="-16" y="-40" width="44" height="62" rx="6" />
      <path d="M6,-18V8M-6,-2 6,10 18,-2" strokeLinecap="round" />
    </g>
  );
}

/** Ação do turno: ficha redonda (o HUD conta ações em ●●○). */
export function ActionGlyph({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const r = size / 2;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill="none" stroke={color} strokeWidth={size * 0.1} />
      <circle r={r * 0.5} fill={color} />
    </g>
  );
}
