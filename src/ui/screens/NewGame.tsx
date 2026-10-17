/**
 * Nova partida mínima: jogadores, quem joga cada assento (pessoa ou IA, Fase 5), seed,
 * tamanho do mapa e a camada de Cartas (Fase 4). Todos IA = modo espectador. O setup
 * completo (UX_SPEC 2.3) é da Fase 10.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { freshSeed } from '../../engine/rng';
import { seatFaction } from '../../render3d/model';
import { useSettings } from '../../settings';
import { FactionBadge } from '../components/Bits';
import type { SeatKind } from '../game/params';
import { playerName } from '../game/text';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import styles from './NewGame.module.css';

const COUNTS = [3, 4, 5, 6];
const KINDS: readonly SeatKind[] = ['human', 'easy', 'normal', 'hard'];
const MAX = COUNTS[COUNTS.length - 1] ?? 6;

export function NewGame() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  const privacy = useSettings((s) => s.gameplay.privacyScreen);
  const setGameplay = useSettings((s) => s.setGameplay);
  const [players, setPlayers] = useState(3);
  const [seed, setSeed] = useState(() => freshSeed());
  const [longMap, setLongMap] = useState(false);
  const [cards, setCards] = useState(true);
  // Assentos guardados para 6: mudar a contagem não perde a escolha.
  const [seats, setSeats] = useState<SeatKind[]>(() => Array.from({ length: MAX }, () => 'human'));
  const active = seats.slice(0, players);
  const setSeat = (i: number, kind: SeatKind) => setSeats((list) => list.map((k, j) => (j === i ? kind : k)));

  return (
    <main className={styles.screen}>
      <form
        className={`${hud.plate} ${hud.rivets} ${styles.panel}`}
        onSubmit={(e) => {
          e.preventDefault();
          go('game', { players, seed, long: longMap, cards, seats: active.join(',') });
        }}
      >
        <header className={styles.head}>
          <h1 className={styles.title}>{t('newGame.title')}</h1>
          <p className={styles.subtitle}>{t('newGame.subtitle')}</p>
        </header>

        <fieldset className={styles.field}>
          <legend className={hud.label}>{t('newGame.players')}</legend>
          <div className={styles.counts} role="radiogroup">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={players === n}
                className={`${hud.btn} ${players === n ? hud.btnOn : ''}`}
                onClick={() => setPlayers(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <ul className={styles.seats}>
            {active.map((kind, i) => (
              <li key={i}>
                <FactionBadge faction={seatFaction(i)} size={16} />
                <span>{playerName(t, i)}</span>
                <select
                  className={styles.seatKind}
                  value={kind}
                  onChange={(e) => setSeat(i, e.target.value as SeatKind)}
                  aria-label={t('newGame.seatLabel', { player: playerName(t, i) })}
                  data-testid={`seat-${i}`}
                >
                  {KINDS.map((k) => (
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
              onClick={() => setSeats((list) => list.map((_, i) => (i === 0 ? 'human' : 'normal')))}
            >
              {t('newGame.vsAi')}
            </button>
            <button
              type="button"
              className={hud.btn}
              onClick={() => setSeats((list) => list.map(() => 'normal'))}
              data-testid="all-ai"
            >
              {t('newGame.watchAi')}
            </button>
            <button
              type="button"
              className={hud.btn}
              onClick={() => setSeats((list) => list.map(() => 'human'))}
            >
              {t('newGame.allHuman')}
            </button>
          </div>
        </fieldset>

        <fieldset className={styles.field}>
          <legend className={hud.label}>{t('newGame.map')}</legend>
          <label className={styles.option}>
            <input type="radio" checked={!longMap} onChange={() => setLongMap(false)} />
            {t('newGame.edge4')}
          </label>
          <label className={styles.option}>
            <input type="radio" checked={longMap} onChange={() => setLongMap(true)} />
            {t('newGame.edge5')}
          </label>
        </fieldset>

        <fieldset className={styles.field}>
          <legend className={hud.label}>{t('newGame.seed')}</legend>
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
              {t('newGame.randomSeed')}
            </button>
          </div>
        </fieldset>

        <label className={styles.option}>
          <input
            type="checkbox"
            checked={cards}
            onChange={(e) => setCards(e.target.checked)}
            data-testid="layer-cards"
          />
          {t('newGame.cards')}
        </label>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={privacy}
            onChange={(e) => setGameplay({ privacyScreen: e.target.checked })}
          />
          {t('newGame.privacy')}
        </label>
        <p className={styles.note}>{t('newGame.layersNote')}</p>

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
