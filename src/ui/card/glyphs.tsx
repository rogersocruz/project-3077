/**
 * Glifos da carta em SVG puro (atributos, sem CSS): o mesmo desenho vai para a
 * interface e para a textura 3D rasterizada. Coordenadas centradas em (0, 0).
 */
import type { ResourceId } from '../../data/schemas';
import { type CardCategoryKey, palette } from '../theme/tokens';

const ring = (r: number) => `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;

function polygon(n: number, r: number, rot = 0): string {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  });
  return `M${pts.join('L')}Z`;
}

/** Ícone da categoria (ART_DIRECTION 2.2): átomo, alvo, insígnia, aperto de mão, gema. */
export function CategoryIcon({
  category,
  x,
  y,
  size,
  color,
}: {
  category: CardCategoryKey;
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  const s = size / 100;
  const stroke = { fill: 'none', stroke: color, strokeWidth: 7, strokeLinecap: 'round' as const };
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {category === 'tech' && (
        <g {...stroke}>
          <ellipse rx="44" ry="16" />
          <ellipse rx="44" ry="16" transform="rotate(60)" />
          <ellipse rx="44" ry="16" transform="rotate(-60)" />
          <circle r="9" fill={color} stroke="none" />
        </g>
      )}
      {category === 'delivered' && (
        <g {...stroke}>
          <path d={ring(36)} />
          <path d={ring(18)} />
          <path d="M0,-48V-26M0,26V48M-48,0H-26M26,0H48" />
          <circle r="6" fill={color} stroke="none" />
        </g>
      )}
      {category === 'own' && (
        <g {...stroke} strokeLinejoin="round">
          <path d="M-34,6 0,-28 34,6" />
          <path d="M-34,32 0,-2 34,32" />
          <path d="M0,-46V-34" />
        </g>
      )}
      {category === 'contract' && (
        <g {...stroke} strokeLinejoin="round">
          <path d="M-46,-6 -24,-22 -6,-12 10,-24 46,-6" />
          <path d="M-30,-14 -6,14a8,8 0 0,0 12,-2l20,-14" />
          <path d="M-14,4 0,22a7,7 0 0,0 11,-1M4,-4 20,12" />
          <path d="M-46,-6V18M46,-6V18" />
        </g>
      )}
      {category === 'relic' && (
        <g strokeLinejoin="round">
          <path d="M-30,-20 -14,-38H14L30,-20 0,40Z" fill={color} opacity="0.35" />
          <path
            d="M-30,-20 -14,-38H14L30,-20 0,40ZM-30,-20H30M-14,-38 -8,-20 0,40 8,-20 14,-38"
            {...stroke}
          />
        </g>
      )}
    </g>
  );
}

/** Token do recurso: forma + cor (ART_DIRECTION 2.4). */
export function ResourceGlyph({ id, x, y, size }: { id: ResourceId; x: number; y: number; size: number }) {
  const r = size / 2;
  const { color, shape } = palette.resource[id];
  const edge = { fill: color, stroke: palette.ink[900], strokeOpacity: 0.45, strokeWidth: size * 0.06 };
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
