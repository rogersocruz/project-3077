/**
 * Ilustração substituta da carta (PROMPTS Fase 4 item 7; CLAUDE.md regra 7): céu
 * quente, cordilheiras em camadas na cor da categoria e uma silhueta pelo motivo da
 * carta. Determinística pela semente do id. A arte pintada entra depois, por manifesto.
 */
import type { ReactNode } from 'react';
import { RESOURCE_IDS } from '../../data/schemas';
import { Rng } from '../../engine/rng';
import { type CardCategoryKey, palette, scene } from '../theme/tokens';
import { mix } from './color';
import { ResourceGlyph } from './glyphs';
import type { Motif } from './model';

export const ART_W = 586;
export const ART_H = 436;
const GROUND = 340;

interface Tones {
  readonly skyTop: string;
  readonly skyLow: string;
  readonly far: string;
  readonly mid: string;
  readonly ground: string;
  readonly ink: string;
  readonly rim: string;
  readonly glow: string;
}

function tones(category: CardCategoryKey): Tones {
  const c = palette.card[category];
  return {
    skyTop: mix(c.headerTo, palette.frame[900], 0.25),
    skyLow: mix(c.headerFrom, scene.light.key, 0.62),
    far: mix(c.headerFrom, palette.frame[700], 0.45),
    mid: mix(c.headerTo, palette.frame[900], 0.35),
    ground: mix(c.headerTo, palette.frame[900], 0.62),
    ink: mix(palette.frame[900], c.headerTo, 0.18),
    rim: mix(scene.light.key, c.headerFrom, 0.25),
    glow: category === 'delivered' ? palette.accent.orange : mix(c.headerFrom, palette.paper[100], 0.35),
  };
}

/** Cordilheira: picos aleatórios entre `base − amp` e `base`. */
function ridge(rng: Rng, base: number, amp: number, steps: number): string {
  const pts: string[] = [`M0,${ART_H}`, `L0,${base - rng.next() * amp * 0.5}`];
  for (let i = 1; i <= steps; i++) {
    const x = (i * ART_W) / steps;
    const y = base - amp * (0.25 + rng.next() * 0.75);
    pts.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
  }
  pts.push(`L${ART_W},${ART_H}Z`);
  return pts.join(' ');
}

function soldier(x: number, s: number, t: Tones, armed: boolean, key: string): ReactNode {
  return (
    <g
      key={key}
      transform={`translate(${x} ${GROUND}) scale(${s})`}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.4}
    >
      <path d="M-15,-62h30l7,42h-44Z" />
      <path d="M-14,-20h11v20h-11ZM3,-20h11v20h-11Z" />
      <circle cx="0" cy="-73" r="11" />
      <path d="M-15,-75a15,13 0 0 1 30,0Z" />
      {armed && <path d="M8,-52 38,-84" strokeWidth={5} stroke={t.ink} />}
      {armed && <path d="M8,-52 38,-84" strokeWidth={1.2} stroke={t.rim} />}
    </g>
  );
}

function motifTroop(rng: Rng, t: Tones): ReactNode {
  const n = 3 + rng.int(0, 2);
  return Array.from({ length: n }, (_, i) => {
    const x = 120 + (i * 360) / (n - 1) + rng.int(-14, 14);
    return soldier(x, 1.3 + rng.next() * 0.6, t, true, `s${i}`);
  });
}

function motifStructure(rng: Rng, t: Tones): ReactNode {
  const out: ReactNode[] = [];
  let x = 40;
  let i = 0;
  while (x < ART_W - 60) {
    const w = 50 + rng.int(0, 60);
    const h = 70 + rng.int(0, 120);
    out.push(
      <rect
        key={`b${i}`}
        x={x}
        y={GROUND - h}
        width={w}
        height={h}
        fill={t.ink}
        stroke={t.rim}
        strokeWidth={1.5}
      />,
    );
    for (let k = 0; k < 3; k++) {
      out.push(
        <rect
          key={`w${i}${k}`}
          x={x + 10 + k * 14}
          y={GROUND - h + 18}
          width={7}
          height={10}
          fill={palette.accent.orange}
          opacity={rng.next() > 0.35 ? 0.85 : 0.15}
        />,
      );
    }
    if (rng.next() > 0.45) {
      const cx = x + w * 0.7;
      out.push(
        <rect
          key={`c${i}`}
          x={cx}
          y={GROUND - h - 50}
          width={12}
          height={50}
          fill={t.ink}
          stroke={t.rim}
          strokeWidth={1.2}
        />,
      );
      for (let k = 0; k < 3; k++) {
        out.push(
          <circle
            key={`p${i}${k}`}
            cx={cx + 6 + k * 14}
            cy={GROUND - h - 64 - k * 18}
            r={10 + k * 6}
            fill={palette.paper[300]}
            opacity={0.22 - k * 0.05}
          />,
        );
      }
    }
    x += w + 8 + rng.int(0, 20);
    i++;
  }
  out.push(
    <path
      key="dome"
      d={`M${ART_W - 170},${GROUND}a70,62 0 0 1 140,0Z`}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.5}
    />,
  );
  out.push(<circle key="beacon" cx={ART_W - 100} cy={GROUND - 70} r={5} fill={palette.accent.orange} />);
  return out;
}

function crate(x: number, y: number, s: number, t: Tones, key: string): ReactNode {
  return (
    <g key={key} transform={`translate(${x} ${y})`} fill={t.ink} stroke={t.rim} strokeWidth={1.5}>
      <rect x={0} y={-s} width={s} height={s} />
      <path d={`M0,${-s}L${s},0M${s},${-s}L0,0`} strokeWidth={1} />
    </g>
  );
}

function motifResource(rng: Rng, t: Tones): ReactNode {
  const out: ReactNode[] = [
    crate(130, GROUND, 70, t, 'c1'),
    crate(200, GROUND, 70, t, 'c2'),
    crate(165, GROUND - 70, 70, t, 'c3'),
    crate(390, GROUND, 56, t, 'c4'),
  ];
  for (let i = 0; i < 7; i++) {
    const id = RESOURCE_IDS[rng.int(0, RESOURCE_IDS.length - 1)] ?? 'gold';
    out.push(
      <ResourceGlyph
        key={`t${i}`}
        id={id}
        x={300 + rng.int(-30, 200)}
        y={GROUND - 8 - rng.int(0, 40)}
        size={22 + rng.int(0, 10)}
      />,
    );
  }
  return out;
}

function figure(x: number, s: number, flip: boolean, t: Tones, key: string): ReactNode {
  return (
    <g
      key={key}
      transform={`translate(${x} ${GROUND}) scale(${flip ? -s : s} ${s})`}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.4}
    >
      <path d="M-16,-64h32l10,64h-52Z" />
      <circle cx="0" cy="-76" r="12" />
      <path d="M14,-56 34,-40" strokeWidth={6} stroke={t.ink} />
    </g>
  );
}

function motifPact(rng: Rng, t: Tones): ReactNode {
  const cy = GROUND - 150;
  const r = 46 + rng.int(0, 10);
  return [
    figure(150, 1.8, false, t, 'f1'),
    figure(ART_W - 150, 1.8, true, t, 'f2'),
    <rect
      key="ped"
      x={ART_W / 2 - 30}
      y={GROUND - 60}
      width={60}
      height={60}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.5}
    />,
    <circle key="halo" cx={ART_W / 2} cy={cy} r={r + 18} fill={t.glow} opacity={0.18} />,
    <g key="globe" fill="none" stroke={t.glow} strokeWidth={2.5} opacity={0.9}>
      <circle cx={ART_W / 2} cy={cy} r={r} />
      <ellipse cx={ART_W / 2} cy={cy} rx={r} ry={r * 0.35} />
      <ellipse cx={ART_W / 2} cy={cy} rx={r * 0.4} ry={r} />
      <path d={`M${ART_W / 2},${cy + r}V${GROUND - 60}`} strokeDasharray="6 6" />
    </g>,
  ];
}

function motifSubsoil(rng: Rng, t: Tones): ReactNode {
  const top = 170;
  const layers = [
    scene.terrain.mountain[1],
    scene.terrain.ruin[1],
    scene.terrain.mountain[0],
    scene.terrain.vein_coal[1],
  ];
  const out: ReactNode[] = [];
  layers.forEach((color, i) => {
    const y = top + i * 62;
    const wave = Array.from({ length: 9 }, (_, k) => `L${(k * ART_W) / 8},${y + rng.int(-10, 10)}`).join(' ');
    out.push(
      <path
        key={`l${i}`}
        d={`M0,${ART_H} L0,${y} ${wave} L${ART_W},${ART_H}Z`}
        fill={mix(color, t.ground, 0.25)}
      />,
    );
  });
  const veins = [scene.terrain.vein_gold[3], scene.terrain.vein_iron[3], scene.terrain.vein_coal[3]];
  for (let i = 0; i < 9; i++) {
    const x = rng.int(30, ART_W - 30);
    const y = rng.int(top + 30, ART_H - 20);
    out.push(
      <path
        key={`v${i}`}
        d={`M${x},${y}l${rng.int(8, 18)},-10l${rng.int(6, 14)},12l-${rng.int(10, 20)},8Z`}
        fill={veins[i % veins.length]}
        opacity={0.9}
      />,
    );
  }
  out.push(<path key="drill" d={`M330,${top - 60}V${top + 150}`} stroke={t.rim} strokeWidth={6} />);
  out.push(
    <path
      key="rig"
      d={`M300,${top}L330,${top - 80}L360,${top}Z`}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.5}
    />,
  );
  out.push(<circle key="bit" cx={330} cy={top + 156} r={9} fill={palette.accent.orange} />);
  return out;
}

const HEX_TERRAINS = ['forest', 'lagoon', 'mountain', 'empty', 'vein_iron', 'vein_gold'] as const;

function motifHex(rng: Rng, t: Tones): ReactNode {
  const out: ReactNode[] = [];
  const R = 46;
  const hexPath = (cx: number, cy: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      return `${k ? 'L' : 'M'}${(cx + Math.cos(a) * R).toFixed(1)},${(cy + Math.sin(a) * R * 0.55).toFixed(1)}`;
    }).join('') + 'Z';
  const hot = rng.int(3, 8);
  let n = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = -1; col < 7; col++) {
      const cx = col * R * 1.73 + (row % 2 ? R * 0.87 : 0) + 60;
      const cy = GROUND - 30 + row * R * 0.82;
      const terrain = HEX_TERRAINS[rng.int(0, HEX_TERRAINS.length - 1)] ?? 'empty';
      const fill = mix(scene.terrain[terrain][1], t.ground, 0.35);
      out.push(
        <path
          key={`h${row}${col}`}
          d={hexPath(cx, cy)}
          fill={fill}
          stroke={n === hot ? palette.accent.orange : t.ink}
          strokeWidth={n === hot ? 4 : 2}
        />,
      );
      n++;
    }
  }
  const dx = 300 + rng.int(-60, 60);
  out.push(
    <g
      key="drone"
      transform={`translate(${dx} ${GROUND - 170})`}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.5}
    >
      <rect x={-26} y={-8} width={52} height={16} rx={5} />
      <ellipse cx={-38} cy={-12} rx={18} ry={4} />
      <ellipse cx={38} cy={-12} rx={18} ry={4} />
      <path d="M0,8V150" stroke={t.glow} strokeDasharray="5 7" opacity={0.8} />
    </g>,
  );
  return out;
}

function motifCard(rng: Rng, t: Tones, category: CardCategoryKey): ReactNode {
  const c = palette.card[category];
  return [-18, 0, 18].map((angle, i) => (
    <g
      key={`k${i}`}
      transform={`translate(${ART_W / 2 + (i - 1) * 60} ${GROUND + 10}) rotate(${angle + rng.int(-4, 4)})`}
    >
      <rect
        x={-70}
        y={-200}
        width={140}
        height={196}
        rx={10}
        fill={palette.frame[800]}
        stroke={t.rim}
        strokeWidth={2}
      />
      <rect x={-62} y={-192} width={124} height={26} fill={c.headerFrom} />
      <rect x={-62} y={-96} width={124} height={84} fill={palette.paper[100]} opacity={0.9} />
    </g>
  ));
}

function motifDevice(rng: Rng, t: Tones): ReactNode {
  const x = 200 + rng.int(-30, 30);
  return [
    <rect
      key="base"
      x={x - 60}
      y={GROUND - 60}
      width={120}
      height={60}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.5}
    />,
    <path key="mast" d={`M${x},${GROUND - 60}V${GROUND - 170}`} stroke={t.ink} strokeWidth={10} />,
    <ellipse
      key="dish"
      cx={x}
      cy={GROUND - 180}
      rx={70}
      ry={26}
      transform={`rotate(-24 ${x} ${GROUND - 180})`}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={2}
    />,
    <g key="waves" fill="none" stroke={t.glow} strokeWidth={4} strokeLinecap="round" opacity={0.85}>
      {[40, 70, 100].map((r) => (
        <path
          key={r}
          d={`M${x + 30 + r * 0.7},${GROUND - 250 - r * 0.2}a${r},${r} 0 0 1 ${r * 0.5},${r * 0.9}`}
        />
      ))}
    </g>,
    <g
      key="sat"
      transform={`translate(${430 + rng.int(-30, 30)} ${90 + rng.int(0, 30)}) rotate(${rng.int(-20, 20)})`}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.5}
    >
      <rect x={-12} y={-12} width={24} height={24} />
      <rect x={-62} y={-8} width={44} height={16} />
      <rect x={18} y={-8} width={44} height={16} />
    </g>,
  ];
}

function motifArtifact(rng: Rng, t: Tones): ReactNode {
  const cx = ART_W / 2;
  const cy = GROUND - 170;
  return [
    <rect
      key="ped"
      x={cx - 70}
      y={GROUND - 50}
      width={140}
      height={50}
      fill={t.ink}
      stroke={t.rim}
      strokeWidth={1.5}
    />,
    <circle key="halo" cx={cx} cy={cy} r={110} fill={t.glow} opacity={0.16} />,
    <ellipse
      key="r1"
      cx={cx}
      cy={cy}
      rx={120}
      ry={30}
      fill="none"
      stroke={t.glow}
      strokeWidth={3}
      transform={`rotate(${rng.int(-15, 15)} ${cx} ${cy})`}
    />,
    <path
      key="gem"
      d={`M${cx - 44},${cy - 20}L${cx - 22},${cy - 52}H${cx + 22}L${cx + 44},${cy - 20}L${cx},${cy + 70}Z`}
      fill={mix(t.glow, palette.frame[900], 0.35)}
      stroke={t.glow}
      strokeWidth={3}
    />,
    <path
      key="facets"
      d={`M${cx - 44},${cy - 20}H${cx + 44}M${cx - 22},${cy - 52}L${cx - 12},${cy - 20}L${cx},${cy + 70}L${cx + 12},${cy - 20}L${cx + 22},${cy - 52}`}
      fill="none"
      stroke={t.glow}
      strokeWidth={2}
      opacity={0.8}
    />,
    ...Array.from({ length: 6 }, (_, i) => (
      <circle
        key={`sp${i}`}
        cx={cx + rng.int(-150, 150)}
        cy={cy + rng.int(-110, 60)}
        r={2 + rng.int(0, 3)}
        fill={palette.paper[100]}
        opacity={0.8}
      />
    )),
  ];
}

export function Illustration({
  motif,
  seed,
  category,
  idPrefix,
}: {
  motif: Motif;
  seed: number;
  category: CardCategoryKey;
  idPrefix: string;
}) {
  const rng = Rng.fromSeed(seed);
  const t = tones(category);
  const sunX = 80 + rng.int(0, ART_W - 160);
  const sunY = 70 + rng.int(0, 70);
  const far = ridge(rng, GROUND - 120, 110, 12);
  const mid = ridge(rng, GROUND - 40, 80, 9);
  const motifs: Record<Motif, () => ReactNode> = {
    troop: () => motifTroop(rng, t),
    structure: () => motifStructure(rng, t),
    resource: () => motifResource(rng, t),
    pact: () => motifPact(rng, t),
    subsoil: () => motifSubsoil(rng, t),
    hex: () => motifHex(rng, t),
    card: () => motifCard(rng, t, category),
    device: () => motifDevice(rng, t),
    artifact: () => motifArtifact(rng, t),
  };
  return (
    <g>
      <defs>
        <linearGradient id={`${idPrefix}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.skyTop} />
          <stop offset="0.75" stopColor={t.skyLow} />
        </linearGradient>
        <radialGradient id={`${idPrefix}sun`}>
          <stop offset="0" stopColor={scene.light.key} stopOpacity="1" />
          <stop offset="0.35" stopColor={scene.light.key} stopOpacity="0.85" />
          <stop offset="1" stopColor={scene.light.key} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${idPrefix}shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor={palette.frame[900]} stopOpacity="0" />
          <stop offset="1" stopColor={palette.frame[900]} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width={ART_W} height={ART_H} fill={`url(#${idPrefix}sky)`} />
      <circle cx={sunX} cy={sunY} r={70} fill={`url(#${idPrefix}sun)`} />
      <path d={far} fill={t.far} opacity={0.9} />
      <path d={mid} fill={t.mid} />
      <rect y={GROUND} width={ART_W} height={ART_H - GROUND} fill={t.ground} />
      {motifs[motif]()}
      <rect width={ART_W} height={ART_H} fill={`url(#${idPrefix}shade)`} />
    </g>
  );
}
