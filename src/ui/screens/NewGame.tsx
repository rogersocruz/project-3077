/**
 * Setup de nova partida (UX_SPEC 2.3): assentos (Humano / IA Fácil, Normal, Difícil /
 * Fechado), facção por assento com símbolo, cor, habilidade e lore ("Aleatória" sorteia pela
 * seed), mapa (aresta 4/5, prévia da roseta, seed), camadas com presets, condições de vitória e
 * limite de rodadas, avançado (ações por turno, velocidade da IA, regra do eliminado). Resumo
 * à direita com a duração estimada. As regras da partida viram sobreposição gravada no save.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadGameData } from '../../data';
import { RESOURCE_IDS } from '../../data/schemas';
import { freshSeed } from '../../engine/rng';
import { SEAT_FACTIONS as FACTIONS, seatFaction } from '../../render3d/model';
import { useSettings } from '../../settings';
import { FactionBadge, ResourceIcon, Stepper } from '../components/Bits';
import type { SeatKind } from '../game/params';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import { type FactionKey, palette } from '../theme/tokens';
import styles from './NewGame.module.css';

const MAX = 6;
const MIN = 3;
type Seat = SeatKind | 'closed';
const KINDS: readonly Seat[] = ['human', 'easy', 'normal', 'hard', 'closed'];
type LayerKey = 'cards' | 'events' | 'special' | 'conflict' | 'treaties' | 'factions';
const LAYERS: readonly LayerKey[] = ['events', 'special', 'cards', 'conflict', 'treaties', 'factions'];
type Preset = 'intro' | 'standard' | 'full' | 'custom';
const PRESETS: Record<Exclude<Preset, 'custom'>, Record<LayerKey, boolean>> = {
  intro: { cards: true, events: false, special: false, conflict: false, treaties: false, factions: false },
  standard: { cards: true, events: true, special: true, conflict: true, treaties: false, factions: false },
  full: { cards: true, events: true, special: true, conflict: true, treaties: true, factions: true },
};
const TRACKS = [...RESOURCE_IDS, 'expansion', 'tribe'] as const;

/**
 * Duração estimada (UX_SPEC 2.3). Rodadas típicas medidas no simulador (docs/SIMULACAO.md e
 * BALANCEAMENTO.md: ~9,5 só com Economia+Cartas, ~8,6 com todas as camadas), limitadas pelo
 * limite de rodadas; minutos por turno: estimativa de mesa (pessoa ≈ 3 min, IA ≈ 0,3 min).
 */
function estimateMinutes(
  seats: readonly SeatKind[],
  layers: Record<LayerKey, boolean>,
  roundLimit: number,
): number {
  const many = LAYERS.filter((l) => layers[l]).length;
  const rounds = Math.min(roundLimit, many >= 5 ? 8.6 : many >= 3 ? 9 : 9.5);
  const perRound = seats.reduce((m, k) => m + (k === 'human' ? 3 : 0.3), 0) * (1 + many * 0.08);
  return Math.round((rounds * perRound) / 5) * 5;
}

/** Prévia 2D da roseta (layouts.json): um hexágono por tabuleiro, na cor da facção. */
function LayoutPreview({ players, colors }: { players: number; colors: readonly string[] }) {
  const layout = loadGameData().layouts.layouts[String(players)] ?? [];
  const R = 26;
  const pts = layout.map((c) => ({ x: R * 1.75 * (c.q + c.r / 2), y: R * 1.5 * c.r }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = R + 4;
  const box = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  return (
    <svg viewBox={box} className={styles.preview} role="img" data-testid="layout-preview">
      {pts.map((p, i) => (
        <g key={i}>
          <polygon
            points={Array.from({ length: 6 }, (_, k) => {
              const a = (Math.PI / 3) * k + Math.PI / 6;
              return `${p.x + R * Math.cos(a)},${p.y + R * Math.sin(a)}`;
            }).join(' ')}
            fill={colors[i] ?? palette.frame[700]}
            stroke={palette.frame[900]}
            strokeWidth={2}
          />
          <text x={p.x} y={p.y + 5} textAnchor="middle" className={styles.previewNum}>
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function NewGame() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  const privacy = useSettings((s) => s.gameplay.privacyScreen);
  const aiSpeed = useSettings((s) => s.gameplay.aiSpeed);
  const setGameplay = useSettings((s) => s.setGameplay);
  const data = loadGameData();
  const [seats, setSeats] = useState<Seat[]>(() => ['human', 'human', 'human', 'closed', 'closed', 'closed']);
  const [seed, setSeed] = useState(() => freshSeed());
  const [longMap, setLongMap] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(PRESETS.full);
  const [picks, setPicks] = useState<string[]>(() => Array.from({ length: MAX }, () => 'random'));
  const [focus, setFocus] = useState(0);
  const [elim, setElim] = useState<'leave' | 'neutral'>('leave');
  const [off, setOff] = useState<string[]>([]);
  const [roundLimit, setRoundLimit] = useState(data.balance.turn.roundLimit);
  const [actions, setActions] = useState(data.balance.turn.actionsPerTurn);

  // "Fechado" encerra a lista: os assentos depois do primeiro fechado também fecham.
  const firstClosed = seats.indexOf('closed');
  const players = firstClosed < 0 ? MAX : firstClosed;
  const active = seats.slice(0, players) as SeatKind[];
  const setSeat = (i: number, k: Seat) =>
    setSeats((list) => {
      if (k === 'closed' && i < MIN) return list;
      const next = list.map((x, j) => (j === i ? k : x));
      if (k === 'closed') return next.map((x, j) => (j > i ? 'closed' : x));
      return next.map((x, j) => (j < i && x === 'closed' ? 'human' : x));
    });
  const setAll = (k: SeatKind) => setSeats((list) => list.map((x, i) => (i < players ? k : x)));
  const preset: Preset =
    (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((p) =>
      LAYERS.every((l) => PRESETS[p][l] === layers[l]),
    ) ?? 'custom';
  const pickOf = (i: number) => (layers.factions && picks[i] !== 'random' ? (picks[i] as FactionKey) : null);
  const colors = Array.from(
    { length: players },
    (_, i) => palette.faction[pickOf(i) ?? seatFaction(i)].color,
  );
  const shown = pickOf(focus) ?? seatFaction(focus);
  const def = data.factions.find((f) => f.id === shown);
  const minutes = useMemo(() => estimateMinutes(active, layers, roundLimit), [active, layers, roundLimit]);
  const tribePossible = layers.conflict;

  const start = () => {
    const tracks = off.filter((k) => k !== 'tribe' || tribePossible);
    go('game', {
      players,
      seed,
      long: longMap,
      cards: layers.cards,
      events: layers.events,
      special: layers.special,
      conflict: layers.conflict,
      treaties: layers.treaties,
      factions: layers.factions,
      fac: picks.slice(0, players).join(','),
      elim,
      seats: active.join(','),
      ...(actions !== data.balance.turn.actionsPerTurn ? { apt: actions } : {}),
      ...(roundLimit !== data.balance.turn.roundLimit ? { rl: roundLimit } : {}),
      ...(tracks.length ? { off: tracks.join(',') } : {}),
    });
  };

  return (
    <main className={styles.screen}>
      <form
        className={`${hud.plate} ${hud.rivets} ${styles.panel}`}
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <header className={styles.head}>
          <h1 className={styles.title}>{t('newGame.title')}</h1>
          <p className={styles.subtitle}>{t('newGame.subtitle')}</p>
        </header>

        <div className={styles.columns}>
          <div className={styles.main}>
            <fieldset className={styles.field}>
              <legend className={hud.label}>{t('newGame.players')}</legend>
              <ul className={`${styles.seats} ${styles.seatsWide}`}>
                {seats.map((kind, i) => (
                  <li
                    key={i}
                    className={kind === 'closed' ? styles.closed : ''}
                    onMouseEnter={() => setFocus(i)}
                  >
                    <FactionBadge faction={pickOf(i) ?? seatFaction(i)} size={16} />
                    <span className={styles.seatName}>{t('hud.player', { n: i + 1 })}</span>
                    {layers.factions && kind !== 'closed' && (
                      <select
                        className={styles.seatKind}
                        value={picks[i]}
                        onFocus={() => setFocus(i)}
                        onChange={(e) => {
                          const f = e.target.value;
                          setPicks((list) => list.map((k, j) => (j === i ? f : k)));
                          setFocus(i);
                        }}
                        aria-label={t('newGame.factionLabel', { n: i + 1 })}
                        data-testid={`faction-${i}`}
                      >
                        <option value="random">{t('newGame.factionRandom')}</option>
                        {FACTIONS.map((f) => (
                          <option
                            key={f}
                            value={f}
                            disabled={picks.slice(0, players).some((p, j) => j !== i && p === f)}
                          >
                            {t(`factions.${f}`)}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      className={styles.seatKind}
                      value={kind}
                      onChange={(e) => setSeat(i, e.target.value as Seat)}
                      aria-label={t('newGame.seatLabel', { player: i + 1 })}
                      data-testid={`seat-${i}`}
                    >
                      {KINDS.filter((k) => k !== 'closed' || i >= MIN).map((k) => (
                        <option key={k} value={k}>
                          {t(`newGame.seat.${k}`)}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
              <div className={styles.seatPresets}>
                <button
                  type="button"
                  className={hud.btn}
                  onClick={() =>
                    setSeats((list) => list.map((x, i) => (i >= players ? x : i === 0 ? 'human' : 'normal')))
                  }
                >
                  {t('newGame.vsAi')}
                </button>
                <button
                  type="button"
                  className={hud.btn}
                  onClick={() => setAll('normal')}
                  data-testid="all-ai"
                >
                  {t('newGame.watchAi')}
                </button>
                <button type="button" className={hud.btn} onClick={() => setAll('human')}>
                  {t('newGame.allHuman')}
                </button>
              </div>
            </fieldset>

            <fieldset className={styles.field}>
              <legend className={hud.label}>{t('newGame.layers')}</legend>
              <div className={styles.seatPresets} role="radiogroup">
                {(['intro', 'standard', 'full', 'custom'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={preset === p}
                    className={`${hud.btn} ${preset === p ? hud.btnOn : ''}`}
                    disabled={p === 'custom'}
                    onClick={() => p !== 'custom' && setLayers(PRESETS[p])}
                    data-testid={`preset-${p}`}
                  >
                    {t(`newGame.preset.${p}`)}
                  </button>
                ))}
              </div>
              <label className={styles.option}>
                <input type="checkbox" checked disabled />
                {t('newGame.economy')}
              </label>
              {LAYERS.map((l) => (
                <label key={l} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={layers[l]}
                    onChange={(e) => setLayers((x) => ({ ...x, [l]: e.target.checked }))}
                    data-testid={`layer-${l}`}
                  />
                  {t(`newGame.${l}`)}
                </label>
              ))}
              <label className={styles.option}>
                <input type="checkbox" checked={layers.conflict} disabled />
                {t('newGame.artillery')}
              </label>
            </fieldset>

            <fieldset className={styles.field}>
              <legend className={hud.label}>{t('newGame.victory')}</legend>
              <div className={styles.tracks}>
                {TRACKS.map((k) => (
                  <label key={k} className={styles.option}>
                    <input
                      type="checkbox"
                      checked={!off.includes(k)}
                      disabled={k === 'tribe' && !tribePossible}
                      onChange={(e) =>
                        setOff((x) => (e.target.checked ? x.filter((y) => y !== k) : [...x, k]))
                      }
                      data-testid={`win-${k}`}
                    />
                    {k === 'expansion' || k === 'tribe' ? (
                      t(`newGame.track.${k}`)
                    ) : (
                      <>
                        <ResourceIcon id={k} size={14} /> {t(`resources.${k}`)}
                      </>
                    )}
                  </label>
                ))}
              </div>
              <div className={styles.option}>
                {t('newGame.roundLimit')}
                <Stepper
                  value={roundLimit}
                  min={5}
                  max={30}
                  onChange={setRoundLimit}
                  label={t('newGame.roundLimit')}
                />
              </div>
            </fieldset>

            <fieldset className={styles.field}>
              <legend className={hud.label}>{t('newGame.advanced')}</legend>
              <div className={styles.option}>
                {t('newGame.actionsPerTurn')}
                <Stepper
                  value={actions}
                  min={1}
                  max={6}
                  onChange={setActions}
                  label={t('newGame.actionsPerTurn')}
                />
              </div>
              <label className={styles.option}>
                {t('newGame.aiSpeed')}
                <select
                  className={styles.seatKind}
                  value={aiSpeed}
                  onChange={(e) => setGameplay({ aiSpeed: e.target.value as 'slow' | 'normal' | 'fast' })}
                >
                  {(['slow', 'normal', 'fast'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`settings.gameplay.ai_${v}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.option}>
                {t('newGame.eliminated')}
                <select
                  className={styles.seatKind}
                  value={elim}
                  onChange={(e) => setElim(e.target.value as 'leave' | 'neutral')}
                  data-testid="eliminated-rule"
                >
                  <option value="leave">{t('newGame.elimLeave')}</option>
                  <option value="neutral">{t('newGame.elimNeutral')}</option>
                </select>
              </label>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={privacy}
                  onChange={(e) => setGameplay({ privacyScreen: e.target.checked })}
                />
                {t('newGame.privacy')}
              </label>
            </fieldset>
          </div>

          <aside className={styles.side}>
            <fieldset className={styles.field}>
              <legend className={hud.label}>{t('newGame.map')}</legend>
              <LayoutPreview players={players} colors={colors} />
              <label className={styles.option}>
                <input type="radio" checked={!longMap} onChange={() => setLongMap(false)} />
                {t('newGame.edge4')}
              </label>
              <label className={styles.option}>
                <input type="radio" checked={longMap} onChange={() => setLongMap(true)} />
                {t('newGame.edge5')}
              </label>
              <div className={styles.seedRow}>
                <input
                  className={styles.seed}
                  type="number"
                  min={0}
                  value={seed}
                  onChange={(e) => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  aria-label={t('newGame.seed')}
                />
                <button type="button" className={hud.btn} onClick={() => setSeed(freshSeed())}>
                  🎲 {t('newGame.randomSeed')}
                </button>
              </div>
            </fieldset>

            {layers.factions && def && (
              <section className={`${hud.paper} ${styles.faction}`} data-testid="faction-card">
                <header className={styles.factionHead}>
                  <FactionBadge faction={shown} size={40} />
                  <div>
                    <strong>{t(`factions.${shown}`)}</strong>
                    <div className={hud.muted}>
                      {picks[focus] === 'random' ? t('newGame.factionRandom') : def.alignment}
                    </div>
                  </div>
                </header>
                <p>
                  <strong>{def.ability.name}:</strong> {def.ability.text}
                </p>
                <p className={styles.lore}>{def.lore}</p>
              </section>
            )}

            <section className={`${hud.paper} ${styles.summary}`} data-testid="setup-summary">
              <span className={hud.label}>{t('newGame.summary')}</span>
              <p>
                {t('newGame.summaryPlayers', {
                  n: players,
                  humans: active.filter((k) => k === 'human').length,
                })}
              </p>
              <p>{t('newGame.duration', { min: minutes })}</p>
            </section>
          </aside>
        </div>

        <div className={styles.actions}>
          <button type="button" className={hud.btn} onClick={() => go('home')}>
            {t('common.back')}
          </button>
          <button
            type="submit"
            className={`${hud.btn} ${hud.btnPrimary} ${styles.start}`}
            data-testid="start"
          >
            {t('newGame.start')}
          </button>
        </div>
      </form>
    </main>
  );
}
