/**
 * Painel de jogadores (UX_SPEC 2.5): facção, vidas da Vila e trilhas de vitória. A
 * trilha mais perto de concluir pulsa; acima de 80% aparece o alerta. Passar o mouse
 * mostra o estoque e os permanentes; clicar foca a câmera no tabuleiro do jogador. Com
 * cartas: quantas na mão e envelopes a revelar; o retrato aceita a carta arrastada para
 * entrega (data-player).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { RESOURCE_IDS } from '../../data/schemas';
import type { GameState, PlayerId } from '../../engine';
import { expansionCount, progress, type TrackId } from '../../engine/rules/victory';
import { seatFaction } from '../../render3d/model';
import { useSceneStore } from '../../render3d/sceneStore';
import { FactionBadge, Icon, ResourceIcon, RollingNumber } from '../components/Bits';
import { Shape } from '../components/Shape';
import { useInstantCounters } from '../game/hooks';
import { useSession } from '../game/session';
import { playerName } from '../game/text';
import { MiniCard } from '../hand/MiniCard';
import styles from './Game.module.css';
import hud from './Hud.module.css';

const TRACKS: TrackId[] = [...RESOURCE_IDS, 'expansion'];
/** UX_SPEC 2.5: alerta quando um jogador passa de 80% de uma trilha. */
const ALERT_AT = 0.8;

export function TrackIcon({ track, size = 12 }: { track: TrackId; size?: number }) {
  if (track === 'expansion') return <Shape kind="hexagon" colorVar="--paper-300" size={size} />;
  return <ResourceIcon id={track} size={size} />;
}

function PlayerCard({ state, id }: { state: GameState; id: PlayerId }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const turn = usePresentation((s) => s.turn);
  const viewer = usePresentation((s) => s.viewer);
  const instant = useInstantCounters();
  const requestFocus = useSceneStore((s) => s.requestFocus);
  const kind = useSession((s) => s.setup?.seats[id] ?? 'human');
  const player = state.players[id];
  const prog = useMemo(() => (ctx ? progress(ctx, state, id) : null), [ctx, state, id]);
  if (!ctx || !player || !prog) return null;

  const active = turn?.stage !== 'setup' && turn?.activePlayer === id;
  const lead = TRACKS.reduce((a, b) => (prog.tracks[b] > prog.tracks[a] ? b : a));
  const alert = TRACKS.filter((k) => prog.tracks[k] >= ALERT_AT);
  const trackName = (k: TrackId) => (k === 'expansion' ? t('hud.trackExpansion') : t(`resources.${k}`));
  const pct = (k: TrackId) => Math.round(prog.tracks[k] * 100);
  const maxLives = ctx.balance.village.lives;
  const alertText = t('hud.alert', {
    list: alert.map(trackName).join(', '),
    pct: Math.round(ALERT_AT * 100),
  });
  const name = playerName(t, id);

  return (
    <li
      className={`${styles.card} ${active ? styles.cardActive : ''}`}
      data-testid={`player-${id}`}
      data-player={id}
    >
      <button
        type="button"
        className={styles.cardHead}
        onClick={() => requestFocus({ kind: 'board', boardId: player.boardId })}
        title={t('hud.focusBoard', { name, n: id + 1 })}
      >
        <FactionBadge faction={seatFaction(id)} size={20} />
        <span className={styles.cardName}>{name}</span>
        <span className={styles.lives} aria-label={t('hud.lives', { n: player.villageLives, max: maxLives })}>
          {Array.from({ length: maxLives }, (_, i) => (
            <Icon key={i} glyph={i < player.villageLives ? 'life' : 'lifeLost'} size={13} />
          ))}
        </span>
      </button>
      <div className={styles.cardSub}>
        <span>{t('hud.player', { n: id + 1 })}</span>
        {active && <span className={styles.badgeActive}>{t('hud.active')}</span>}
        {kind !== 'human' && (
          <span className={styles.badgeAi} title={t(`newGame.seat.${kind}`)} data-testid={`ai-${id}`}>
            {t('hud.ai')}
          </span>
        )}
        {viewer === id && kind === 'human' && <span className={styles.badgeYou}>{t('hud.you')}</span>}
        {state.layers.cards && (
          <span className={styles.cardCounts}>
            <span title={t('hud.handCount', { count: player.hand.length })} data-testid={`hand-count-${id}`}>
              <Icon glyph="cards" size={13} /> {player.hand.length}
            </span>
            {player.incoming.length > 0 && (
              <span className={styles.incoming} title={t('hud.incoming', { count: player.incoming.length })}>
                <Icon glyph="envelope" size={13} /> {player.incoming.length}
              </span>
            )}
          </span>
        )}
      </div>
      <div className={styles.tracks} role="list" aria-label={t('hud.tracks')}>
        {TRACKS.map((k) => (
          <div
            key={k}
            role="listitem"
            className={`${styles.track} ${k === lead && prog.tracks[k] > 0 ? styles.trackLead : ''}`}
            title={`${trackName(k)} ${pct(k)}%`}
          >
            <span className={styles.meter}>
              <span className={styles.fill} style={{ height: `${pct(k)}%` }} />
            </span>
            <TrackIcon track={k} />
          </div>
        ))}
      </div>
      <div className={styles.lead}>
        <span>{t('hud.leading', { track: trackName(lead), pct: pct(lead) })}</span>
        {alert.length > 0 && (
          <span className={styles.alert}>
            <Icon glyph="alert" size={14} title={alertText} />
          </span>
        )}
      </div>
      <div className={styles.stockPop} role="tooltip">
        <span className={hud.label}>{t('hud.stock')}</span>
        <div className={styles.stockGrid}>
          {RESOURCE_IDS.map((r) => (
            <span key={r} className={styles.stockItem}>
              <ResourceIcon id={r} size={14} />
              <RollingNumber value={player.resources[r]} instant={instant} />
            </span>
          ))}
        </div>
        <span className={styles.stockNote}>
          {t('hud.expansionCount', {
            n: expansionCount(state, id),
            total: ctx.balance.victory.expansionHexes,
          })}
        </span>
        {state.layers.cards && player.permanents.some((c) => c !== null) && (
          <>
            <span className={hud.label}>{t('hud.permanentsOf', { name })}</span>
            <span className={styles.popPermanents}>
              {player.permanents.map((c, i) =>
                c === null ? null : <MiniCard key={i} uid={c} id={state.cards.defs[c] ?? ''} width={46} />,
              )}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

export function PlayersPanel() {
  const { t } = useTranslation();
  const shown = usePresentation((s) => s.shown);
  const counters = usePresentation((s) => s.counters);
  // Trilhas e estoque andam com os contadores animados (tokens pousando).
  const live = useMemo(
    () =>
      shown && {
        ...shown,
        players: shown.players.map((p, i) => ({ ...p, resources: counters[i] ?? p.resources })),
      },
    [shown, counters],
  );
  if (!live) return null;
  return (
    <aside className={`${hud.plate} ${styles.left}`} aria-label={t('hud.players')}>
      <h2 className={`${hud.plateTitle} ${styles.panelTitle}`}>{t('hud.players')}</h2>
      <ol className={styles.cards}>
        {live.players.map((p) => (
          <PlayerCard key={p.id} state={live} id={p.id} />
        ))}
      </ol>
    </aside>
  );
}
