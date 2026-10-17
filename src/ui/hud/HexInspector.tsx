/**
 * Inspetor de hex (UX_SPEC 2.6): terreno, subsolo (se conhecido por quem olha), dono,
 * estruturas com nível, os 3 espaços e as ações possíveis. Cada ação é um botão com o
 * custo; ilegal, mostra o motivo vindo de legal.ts e o que falta (UX_SPEC 7.3).
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import {
  type Action,
  actionAt,
  actionCost,
  actionTargets,
  checkAction,
  type HexKey,
  type Reason,
} from '../../engine';
import { troopStrength } from '../../engine/rules/troops';
import { chooseAction } from '../game/commands';
import { deficit, type ResourceAmounts, slotsUsed } from '../../engine/queries';
import { buildCostAt, upgradeCost } from '../../engine/rules/build';
import { useSceneStore } from '../../render3d/sceneStore';
import { CostLine, Icon } from '../components/Bits';
import { perform, useCanDecide } from '../game/hooks';
import { useSession } from '../game/session';
import { amountsText, hexLabel, playerName } from '../game/text';
import styles from './Game.module.css';
import hud from './Hud.module.css';

interface Option {
  readonly id: string;
  readonly label: string;
  readonly key?: string;
  readonly action: Action;
  readonly cost: ResourceAmounts;
  /** Em vez de executar: ex. Mover entra no modo de destino. */
  readonly onClick?: () => void;
}

function ReasonText({ reason, cost }: { reason: Reason; cost: ResourceAmounts }) {
  const { t } = useTranslation();
  const have = useSession((s) => (s.state ? s.state.players[s.state.activePlayer]?.resources : undefined));
  const missing = reason.key === 'cannotAfford' && have ? deficit(have, cost) : null;
  return (
    <span className={`${hud.danger} ${styles.reason}`}>
      {t(`engine.illegal.${reason.key}`, reason.params)}
      {missing &&
        Object.keys(missing).length > 0 &&
        ` ${t('inspector.missing', { list: amountsText(t, missing) })}`}
    </span>
  );
}

function ActionRow({ option }: { option: Option }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  if (!ctx || !state) return null;
  const check = checkAction(ctx, state, option.action);
  const have = state.players[state.activePlayer]?.resources;
  const actions = actionCost(ctx, state, option.action);
  return (
    <li className={styles.actRow}>
      <button
        type="button"
        className={`${hud.btn} ${hud.btnInk} ${styles.actBtn}`}
        disabled={!check.ok}
        onClick={() => (option.onClick ? option.onClick() : perform(option.action))}
        data-testid={`act-${option.id}`}
      >
        <span className={styles.actLabel}>
          {option.label}
          {option.key && <span className={hud.kbd}>{option.key}</span>}
        </span>
        <span className={styles.actCost}>
          <CostLine cost={option.cost} have={have} />
          {actions > 0 && (
            <span className={styles.actChip}>{t('inspector.actions', { count: actions })}</span>
          )}
        </span>
      </button>
      {!check.ok && <ReasonText reason={check.reason} cost={option.cost} />}
    </li>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.inspSection}>
      <h3 className={hud.paperHeading}>{title}</h3>
      {children}
    </section>
  );
}

export function HexInspector({ hexKey }: { hexKey: HexKey }) {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const shown = usePresentation((s) => s.shown);
  const viewer = usePresentation((s) => s.viewer);
  const busy = usePresentation((s) => s.busy);
  const canDecide = useCanDecide();
  const select = useSceneStore((s) => s.select);
  const hex = shown?.hexes[hexKey];
  if (!ctx || !state || !shown || !hex) return null;

  const owner = shown.players.find((p) => p.boardId === hex.boardId);
  const known = viewer !== null && hex.surveyedBy.includes(viewer);
  const subsoil = !known
    ? t('subsoil.unknown')
    : hex.depleted
      ? t('subsoil.depleted')
      : t(`subsoil.${hex.subsoil}`);
  const site0 = ctx.terrain(hex.surface);
  // Marcas do hex: selo, Terraformação e, na Fase 6, estados de hazard/evento, Guardião e Ruína.
  const STATUS = [
    'ashUntil',
    'dryUntil',
    'groundedUntil',
    'closedUntil',
    'amplifiedUntil',
    'sealedUntil',
  ] as const;
  const modifiers = [
    hex.seal ? t('inspector.sealedInfo', { n: hex.seal.clearActions }) : null,
    hex.yieldBonus > 0 ? t('inspector.yieldBonus', { n: hex.yieldBonus }) : null,
    ...STATUS.map((k) => {
      const until = hex.status[k];
      return until !== undefined && until >= shown.round
        ? `${t(`events.status.${k}`)} (${t('inspector.untilRound', { n: until })})`
        : null;
    }),
    hex.status.contaminated ? t('events.contaminated', { n: hex.status.contaminated }) : null,
    hex.guardian !== null ? t('events.guardian', { n: hex.guardian }) : null,
    hex.excavatedBy !== null && site0.kind === 'site' && site0.def.passive
      ? t('events.ruinBonus', { name: playerName(t, hex.excavatedBy) })
      : null,
  ].filter((x): x is string => !!x);
  const used = slotsUsed(ctx, hex);
  const slots = ctx.balance.hex.slots;
  const me = state.activePlayer;
  const mine = canDecide && viewer === state.activePlayer;

  // Ações oferecidas: o motor decide se cada uma é legal (legal.ts).
  const sections: { title: string; options: Option[]; collapse?: Option[] }[] = [];
  if (mine && state.stage === 'setup') {
    sections.push({
      title: t('inspector.setup'),
      options: [
        {
          id: 'village',
          label: t('inspector.foundVillage'),
          action: { type: 'chooseVillage', player: me, hex: hexKey },
          cost: {},
        },
      ],
    });
  } else if (mine && state.stage === 'playing' && state.phase === 'actions' && !state.pendingTrade) {
    const basics: Option[] = [];
    if (!hex.revealed) {
      basics.push({
        id: 'explore',
        label: t('hud.explore'),
        key: 'E',
        action: { type: 'explore', player: me, hex: hexKey },
        cost: {},
      });
    }
    if (!hex.surveyedBy.includes(me)) {
      basics.push({
        id: 'survey',
        label: t('hud.survey'),
        key: 'R',
        action: { type: 'survey', player: me, hex: hexKey },
        cost: {},
      });
    }
    if (basics.length) sections.push({ title: t('inspector.explore'), options: basics });

    if (hex.revealed) {
      const builds = ctx.data.structures
        .filter((d) => d.buildable !== false)
        .map((d): Option => ({
          id: `build-${d.id}`,
          label: t(`structures.${d.id}`),
          action: { type: 'build', player: me, structure: d.id, hex: hexKey },
          cost: buildCostAt(ctx, state, d.id, hexKey),
        }));
      const ok = builds.filter((o) => checkAction(ctx, state, o.action).ok);
      const no = builds.filter((o) => !checkAction(ctx, state, o.action).ok);
      sections.push({ title: t('hud.build'), options: ok, collapse: no });
    }

    const upgrades = hex.structures
      .filter((s) => s.owner === me)
      .map((s): Option => ({
        id: `upgrade-${s.uid}`,
        label: t('inspector.upgradeTo', { structure: t(`structures.${s.type}`), level: s.level + 1 }),
        key: 'U',
        action: { type: 'upgrade', player: me, uid: s.uid },
        cost: upgradeCost(ctx, state, me, s.uid),
      }));
    if (upgrades.length) sections.push({ title: t('hud.upgrade'), options: upgrades });

    // Fase 7: recrutar perto do Quartel, subir tropa e mover (o motor decide se pode).
    if (state.layers.conflict) {
      const military: Option[] = [];
      for (const troop of ['line', 'artillery'] as const) {
        military.push({
          id: `recruit-${troop}`,
          label: t('inspector.recruit', { troop: t(`troops.${troop}`) }),
          action: { type: 'recruit', player: me, hex: hexKey, troop },
          cost: ctx.balance.troops[troop].cost,
        });
      }
      const mine = hex.troops.filter((tr) => tr.owner === me);
      for (const tr of mine) {
        military.push({
          id: `upgrade-troop-${tr.uid}`,
          label: t('inspector.upgradeTroop', { troop: t(`troops.${tr.type}`), level: tr.level + 1 }),
          action: { type: 'upgradeTroop', player: me, uid: tr.uid },
          cost: ctx.balance.troops[tr.type].cost,
        });
      }
      if (mine.length) {
        const template = { type: 'move', from: hexKey } as const;
        const first = actionTargets(ctx, state, me, template)[0];
        const action = (first && actionAt(ctx, state, me, template, first)) || {
          type: 'move' as const,
          player: me,
          from: hexKey,
          to: hexKey,
          uids: mine.map((x) => x.uid),
        };
        military.push({
          id: 'move',
          label: t('inspector.move'),
          action,
          cost: {},
          onClick: () => chooseAction(template),
        });
      }
      const ok = military.filter((o) => checkAction(ctx, state, o.action).ok);
      const no = military.filter((o) => !checkAction(ctx, state, o.action).ok);
      if (military.length) sections.push({ title: t('inspector.military'), options: ok, collapse: no });
    }

    // Fase 6: escavar Templo/Ruína e limpar contaminação (o motor decide se pode).
    const site = ctx.terrain(hex.surface);
    if (hex.revealed && site.kind === 'site' && site.def.action === 'excavate') {
      sections.push({
        title: t('events.excavate'),
        options: [
          {
            id: 'excavate',
            label: t('inspector.excavate', { site: t(`terrain.${hex.surface}`) }),
            action: { type: 'excavate', player: me, hex: hexKey },
            cost: site.def.excavateCost,
          },
        ],
      });
    }
    if (hex.status.contaminated) {
      sections.push({
        title: t('events.clean'),
        options: [
          {
            id: 'clean',
            label: t('inspector.clean', { n: hex.status.contaminated }),
            action: { type: 'cleanHex', player: me, hex: hexKey },
            cost: {},
          },
        ],
      });
    }

    // Colapso de Galeria: o dono do tabuleiro remove o selo gastando ações.
    if (hex.seal && hex.boardId === state.players[me]?.boardId) {
      sections.push({
        title: t('inspector.sealed'),
        options: [
          {
            id: 'clear-seal',
            label: t('inspector.clearSeal'),
            action: { type: 'clearSeal', player: me, hex: hexKey },
            cost: {},
          },
        ],
      });
    }
  }

  return (
    <section className={styles.inspector} aria-label={t('inspector.title')} data-testid="inspector">
      <div className={styles.inspHead}>
        <div>
          <h2 className={styles.inspTitle}>
            {hex.revealed ? t(`terrain.${hex.surface}`) : t('table.hidden')}
          </h2>
          <span className={hud.label}>
            {hexLabel(t, hexKey)}
            {owner && ` · ${t('inspector.boardOf', { name: playerName(t, owner.id) })}`}
          </span>
        </div>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnIcon}`}
          onClick={() => select(null)}
          aria-label={t('common.close')}
        >
          <Icon glyph="close" size={14} />
        </button>
      </div>
      <div className={`${hud.paper} ${styles.inspBody}`}>
        <dl className={styles.facts}>
          <dt>{t('inspector.subsoil')}</dt>
          <dd>{subsoil}</dd>
          <dt>{t('inspector.slots')}</dt>
          <dd className={styles.slotPips} aria-label={t('inspector.slotsUsed', { used, total: slots })}>
            {Array.from({ length: slots }, (_, i) => (
              <span key={i} className={i < used ? styles.pipOn : styles.pip} />
            ))}
            <span className={hud.num}>
              {used}/{slots}
            </span>
          </dd>
          {modifiers.length > 0 && (
            <>
              <dt>{t('inspector.modifiers')}</dt>
              <dd data-testid="inspector-modifiers">{modifiers.join(' · ')}</dd>
            </>
          )}
        </dl>

        {hex.troops.length > 0 && (
          <Section title={t('inspector.troops')}>
            <ul className={styles.structList} data-testid="inspector-troops">
              {hex.troops.map((tr) => (
                <li key={tr.uid}>
                  <strong>
                    {t('inspector.troopLine', {
                      troop: t(`troops.${tr.type}`),
                      level: tr.level,
                      strength: troopStrength(ctx, shown, tr),
                    })}
                  </strong>{' '}
                  · <span className={hud.muted}>{playerName(t, tr.owner)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={t('inspector.structures')}>
          {hex.structures.length === 0 ? (
            <p className={`${hud.muted} ${styles.none}`}>{t('inspector.none')}</p>
          ) : (
            <ul className={styles.structList}>
              {hex.structures.map((s) => (
                <li key={s.uid}>
                  <strong>{t(`structures.${s.type}`)}</strong> · {t('inspector.level', { level: s.level })} ·{' '}
                  <span className={hud.muted}>{playerName(t, s.owner)}</span>
                  {s.tokens !== undefined && (
                    <span className={hud.muted}> · {t('inspector.tokens', { count: s.tokens })}</span>
                  )}
                  {s.idle && <span className={hud.danger}> · {t('inspector.idle')}</span>}
                  {(s.offlineRound === shown.round || s.noProduceRound === shown.round) && (
                    <span className={hud.danger}> · {t('inspector.offline')}</span>
                  )}
                  {s.overloaded && <span className={hud.danger}> · {t('inspector.overloaded')}</span>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {sections.map((sec) => (
          <Section key={sec.title} title={sec.title}>
            <ul className={styles.actList}>
              {sec.options.map((o) => (
                <ActionRow key={o.id} option={o} />
              ))}
            </ul>
            {sec.collapse && sec.collapse.length > 0 && (
              <details className={styles.unavailable}>
                <summary>{t('inspector.unavailable', { n: sec.collapse.length })}</summary>
                <ul className={styles.actList}>
                  {sec.collapse.map((o) => (
                    <ActionRow key={o.id} option={o} />
                  ))}
                </ul>
              </details>
            )}
          </Section>
        ))}
        {!mine && !busy && state.stage !== 'over' && (
          <p className={`${hud.muted} ${styles.none}`}>{t('inspector.notYourTurn')}</p>
        )}
      </div>
    </section>
  );
}
