/**
 * Coleção (Codex, UX_SPEC 2.17, ampliado a pedido do usuário): História · Facções · Recursos ·
 * Terrenos · Construções (prévia 3D) · Cartas (mesmo componente do jogo, filtros e zoom) ·
 * Eventos · Vitrine 3D. Tudo lido dos dados (data/*.json) e do i18n — nada copiado no código.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadGameData } from '../../data';
import type { ResourceId } from '../../data/schemas';
import { SEAT_FACTIONS } from '../../render3d/model';
import { Card } from '../card/Card';
import { allCardFaces, cardFace, cardVersion } from '../card/faces';
import { FactionBadge, ResourceIcon } from '../components/Bits';
import { amountsText } from '../game/text';
import hud from '../hud/Hud.module.css';
import { useNav } from '../nav';
import { type FactionKey, palette } from '../theme/tokens';
import styles from './Collection.module.css';

const StructurePreview = lazy(() =>
  import('../collection/StructurePreview').then((m) => ({ default: m.StructurePreview })),
);
const Showcase = lazy(() => import('../collection/Showcase').then((m) => ({ default: m.Showcase })));

const TABS = [
  'story',
  'factions',
  'resources',
  'terrain',
  'structures',
  'cards',
  'events',
  'showcase',
] as const;
type Tab = (typeof TABS)[number];

const STORY_LINES = [
  'opening',
  'firstRound',
  'seismic',
  'economic',
  'horde',
  'hoard',
  'expansion',
  'tribe',
  'elimination',
];

function Story() {
  const { t } = useTranslation();
  return (
    <div className={styles.story} data-testid="col-story">
      <section className={`${hud.paper} ${styles.block}`}>
        <h2 className={hud.paperHeading}>{t('collection.story.premiseTitle')}</h2>
        <p className={styles.lead}>{t('collection.story.premise')}</p>
        <h3 className={styles.h3}>{t('collection.story.axesTitle')}</h3>
        <ul className={styles.axes}>
          {['territory', 'reach', 'negotiation', 'cards'].map((k) => (
            <li key={k}>
              <strong>{t(`collection.story.axis.${k}`)}</strong> — {t(`collection.story.axisText.${k}`)}
            </li>
          ))}
        </ul>
      </section>
      <section className={`${hud.paper} ${styles.block}`}>
        <h2 className={hud.paperHeading}>{t('collection.story.narratorTitle')}</h2>
        {STORY_LINES.map((k) => (
          <blockquote key={k} className={styles.quote}>
            <span className={styles.quoteWhen}>{t(`collection.story.when.${k}`)}</span>
            {t(`collection.story.line.${k}`, { faction: t('collection.story.someFaction') })}
          </blockquote>
        ))}
      </section>
    </div>
  );
}

function Factions({ q }: { q: string }) {
  const { t } = useTranslation();
  const list = loadGameData().factions.filter((f) => match(q, f.name, f.ability.name, f.lore));
  return (
    <div className={styles.grid} data-testid="col-factions">
      {list.map((f) => (
        <article
          key={f.id}
          className={`${hud.paper} ${styles.card}`}
          style={{ borderTopColor: palette.faction[f.id as FactionKey]?.color }}
        >
          <header className={styles.cardHead}>
            <FactionBadge faction={f.id as FactionKey} size={40} />
            <div>
              <h3 className={styles.h3}>{f.name}</h3>
              <span className={hud.muted}>{f.alignment}</span>
            </div>
          </header>
          <p>
            <strong>{f.ability.name}:</strong> {f.ability.text}
          </p>
          <p className={styles.lore}>{f.lore}</p>
          <p className={styles.advisor}>
            <span className={hud.label}>{t('collection.advisor')}</span> {f.advisor.name} —{' '}
            <em>{f.advisor.voice}</em>
          </p>
          {t(`collection.advisorLine.${f.id}`, { defaultValue: '' }) && (
            <blockquote className={styles.quote}>{t(`collection.advisorLine.${f.id}`)}</blockquote>
          )}
        </article>
      ))}
    </div>
  );
}

function Resources({ q }: { q: string }) {
  const { t } = useTranslation();
  const data = loadGameData();
  const b = data.balance;
  return (
    <div className={styles.grid} data-testid="col-resources">
      {data.resources
        .filter((r) => match(q, r.name, r.exclusiveUse))
        .map((r) => {
          const id = r.id as ResourceId;
          return (
            <article key={id} className={`${hud.paper} ${styles.card}`}>
              <header className={styles.cardHead}>
                <ResourceIcon id={id} size={40} onPaper />
                <h3 className={styles.h3}>{r.name}</h3>
              </header>
              <dl className={styles.facts}>
                <dt>{t('collection.value')}</dt>
                <dd>{r.value}</dd>
                <dt>{t('collection.bank')}</dt>
                <dd>
                  {t('collection.bankPrices', {
                    sell: Math.max(0, r.value + b.bank.buyOffset),
                    buy: Math.max(1, r.value + b.bank.sellOffset),
                  })}
                </dd>
                <dt>{t('collection.threshold')}</dt>
                <dd>{b.victory.resourceThresholds[id]}</dd>
                <dt>{t('collection.use')}</dt>
                <dd>{r.exclusiveUse}</dd>
              </dl>
            </article>
          );
        })}
    </div>
  );
}

const match = (q: string, ...xs: (string | undefined | null)[]) =>
  !q || xs.some((x) => x?.toLowerCase().includes(q.toLowerCase()));

function Terrain({ q }: { q: string }) {
  const { t } = useTranslation();
  const data = loadGameData();
  const builders = (id: string) =>
    data.structures.filter((s) => s.buildOn?.includes(id)).map((s) => t(`structures.${s.id}`));
  return (
    <div className={styles.sections} data-testid="col-terrain">
      <h2 className={styles.h2}>{t('collection.surfaces')}</h2>
      <div className={styles.grid}>
        {data.tiles.surface
          .filter((s) => match(q, s.name))
          .map((s) => (
            <article key={s.id} className={`${hud.paper} ${styles.card}`}>
              <h3 className={styles.h3}>{s.name}</h3>
              <dl className={styles.facts}>
                <dt>{t('collection.produces')}</dt>
                <dd>
                  {s.produces.length
                    ? s.produces.map((r) => <ResourceIcon key={r} id={r} size={16} onPaper />)
                    : '—'}
                </dd>
                <dt>{t('collection.buildOn')}</dt>
                <dd>{builders(s.id).join(', ') || '—'}</dd>
                <dt>{t('collection.moveCost')}</dt>
                <dd>{t('collection.food', { n: s.moveCostFood })}</dd>
              </dl>
            </article>
          ))}
      </div>
      <h2 className={styles.h2}>{t('collection.subsoil')}</h2>
      <p className={styles.note}>{t('collection.subsoilNote')}</p>
      <div className={styles.row}>
        {data.tiles.subsoil.map((s) => (
          <span key={s.id} className={`${hud.paper} ${styles.chip}`}>
            {s.resource ? <ResourceIcon id={s.resource} size={16} onPaper /> : null} {t(`subsoil.${s.id}`)}
          </span>
        ))}
      </div>
      <h2 className={styles.h2}>{t('collection.sites')}</h2>
      <div className={styles.grid}>
        {data.tiles.sites
          .filter((s) => match(q, s.name))
          .map((s) => (
            <article key={s.id} className={`${hud.paper} ${styles.card}`}>
              <h3 className={styles.h3}>{s.name}</h3>
              <p>{t(`collection.site.${s.id}`)}</p>
              <dl className={styles.facts}>
                <dt>{t('collection.excavateCost')}</dt>
                <dd>{amountsText(t, s.excavateCost)}</dd>
              </dl>
            </article>
          ))}
      </div>
      <h2 className={styles.h2}>{t('collection.hazards')}</h2>
      <div className={styles.grid}>
        {data.tiles.hazards
          .filter((h) => match(q, h.name))
          .map((h) => (
            <article key={h.id} className={`${hud.paper} ${styles.card}`}>
              <h3 className={styles.h3}>{h.name}</h3>
              <dl className={styles.facts}>
                <dt>{t('collection.bonus')}</dt>
                <dd>{t(`collection.hazard.${h.id}.bonus`)}</dd>
                <dt>{t('collection.trigger')}</dt>
                <dd>{t(`events.category.${h.trigger}`)}</dd>
                <dt>{t('collection.damage')}</dt>
                <dd>{t(`collection.hazard.${h.id}.damage`)}</dd>
              </dl>
            </article>
          ))}
      </div>
    </div>
  );
}

function Structures({ q }: { q: string }) {
  const { t } = useTranslation();
  const data = loadGameData();
  const list = data.structures.filter((s) => match(q, s.name, t(`structures.${s.id}`)));
  const [pick, setPick] = useState(list[0]?.id ?? 'village');
  const [faction, setFaction] = useState<FactionKey>('revolutionaries');
  const def = data.structures.find((s) => s.id === pick);
  return (
    <div className={styles.split} data-testid="col-structures">
      <ul className={styles.list}>
        {list.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`${hud.btn} ${pick === s.id ? hud.btnOn : ''}`}
              onClick={() => setPick(s.id)}
              data-testid={`col-structure-${s.id}`}
            >
              {t(`structures.${s.id}`)}
            </button>
          </li>
        ))}
      </ul>
      {def && (
        <article className={`${hud.paper} ${styles.detail}`}>
          <div className={styles.previewBox}>
            <Suspense fallback={<div className={styles.previewFallback} />}>
              <StructurePreview type={def.id} color={palette.faction[faction].color} size={220} />
            </Suspense>
            <div className={styles.row}>
              {SEAT_FACTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`${styles.swatch} ${faction === f ? styles.swatchOn : ''}`}
                  onClick={() => setFaction(f)}
                  aria-label={t(`factions.${f}`)}
                >
                  <FactionBadge faction={f} size={16} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className={styles.h2Dark}>{def.name}</h2>
            <dl className={styles.facts}>
              <dt>{t('collection.rarity')}</dt>
              <dd>{t('collection.rarityN', { n: def.rarity })}</dd>
              <dt>{t('collection.slots')}</dt>
              <dd>{def.slots}</dd>
              <dt>{t('collection.buildOn')}</dt>
              <dd>
                {def.buildOn?.length
                  ? def.buildOn
                      .map((x) => t(`terrain.${x}`, { defaultValue: t(`collection.buildToken.${x}`) }))
                      .join(', ')
                  : t('collection.anyRevealed')}
              </dd>
            </dl>
            <table className={styles.levels}>
              <thead>
                <tr>
                  <th>{t('collection.level')}</th>
                  <th>{t('collection.cost')}</th>
                  <th>{t('collection.effect')}</th>
                </tr>
              </thead>
              <tbody>
                {def.levels.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{amountsText(t, l.cost ?? {})}</td>
                    <td>
                      {Object.entries(l)
                        .filter(([k]) => k !== 'cost')
                        .map(
                          ([k, v]) =>
                            `${t(`collection.attr.${k}`, { defaultValue: k })}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
                        )
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </div>
  );
}

function Cards({ q }: { q: string }) {
  const { t } = useTranslation();
  const data = loadGameData();
  const [deck, setDeck] = useState('all');
  const [valence, setValence] = useState('all');
  const [zoom, setZoom] = useState<string | null>(null);
  const version = cardVersion();
  const defs = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data]);
  const faces = allCardFaces().filter((f) => {
    const c = defs.get(f.id);
    if (!c) return false;
    if (deck !== 'all' && c.deck !== deck) return false;
    if (valence !== 'all' && c.valence !== valence) return false;
    return match(q, c.name, c.effect);
  });
  return (
    <div className={styles.sections} data-testid="col-cards">
      <div className={styles.row}>
        <label>
          <span className={hud.label}>{t('collection.deck')}</span>{' '}
          <select value={deck} onChange={(e) => setDeck(e.target.value)} data-testid="col-deck">
            {['all', 'n1', 'n2', 'n3', 'treasure'].map((d) => (
              <option key={d} value={d}>
                {t(`collection.deckOpt.${d}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={hud.label}>{t('collection.valence')}</span>{' '}
          <select value={valence} onChange={(e) => setValence(e.target.value)}>
            {['all', 'benefit', 'sabotage', 'information', 'logistics'].map((v) => (
              <option key={v} value={v}>
                {t(`collection.valenceOpt.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.note}>{t('collection.count', { n: faces.length })}</span>
      </div>
      <div className={styles.cards}>
        {faces.map((f) => (
          <button
            key={f.id}
            type="button"
            className={styles.cardBtn}
            onClick={() => setZoom(f.id)}
            data-testid={`col-card-${f.id}`}
          >
            <Card face={f} width={180} version={version} />
          </button>
        ))}
      </div>
      {zoom && (
        <div
          className={hud.overlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setZoom(null)}
          data-testid="col-zoom"
        >
          <div className={styles.zoom}>
            <Card face={cardFace(zoom)} width={360} version={version} />
            <p className={styles.zoomText}>
              {defs.get(zoom)?.effect}{' '}
              <span className={styles.note}>
                ({t('collection.copies', { n: defs.get(zoom)?.copies ?? 1 })})
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Events({ q }: { q: string }) {
  const { t } = useTranslation();
  const data = loadGameData();
  return (
    <div className={styles.grid} data-testid="col-events">
      {data.events
        .filter((e) => match(q, e.name, e.effect))
        .map((e) => (
          <article
            key={e.id}
            className={`${hud.paper} ${styles.card}`}
            style={{ borderTopColor: palette.event[e.category as keyof typeof palette.event]?.color }}
          >
            <span className={hud.label}>{t(`events.category.${e.category}`)}</span>
            <h3 className={styles.h3}>{e.name}</h3>
            <p>{e.effect}</p>
            <span className={styles.note}>{t('collection.copies', { n: e.copies })}</span>
          </article>
        ))}
    </div>
  );
}

export function Collection() {
  const { t } = useTranslation();
  const go = useNav((s) => s.go);
  const [tab, setTab] = useState<Tab>(() => {
    const v = new URLSearchParams(window.location.search).get('tab');
    return (TABS as readonly string[]).includes(v ?? '') ? (v as Tab) : 'story';
  });
  const [q, setQ] = useState('');
  return (
    <main className={styles.screen}>
      <header className={styles.top}>
        <h1 className={hud.modalTitle}>{t('collection.title')}</h1>
        <input
          className={styles.search}
          type="search"
          placeholder={t('collection.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="col-search"
        />
        <button type="button" className={hud.btn} onClick={() => go('home')}>
          {t('common.back')}
        </button>
      </header>
      <nav className={styles.tabs} role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`${hud.btn} ${tab === k ? hud.btnOn : ''}`}
            onClick={() => setTab(k)}
            data-testid={`col-tab-${k}`}
          >
            {t(`collection.tab.${k}`)}
          </button>
        ))}
      </nav>
      <section className={styles.body}>
        {tab === 'story' && <Story />}
        {tab === 'factions' && <Factions q={q} />}
        {tab === 'resources' && <Resources q={q} />}
        {tab === 'terrain' && <Terrain q={q} />}
        {tab === 'structures' && <Structures q={q} />}
        {tab === 'cards' && <Cards q={q} />}
        {tab === 'events' && <Events q={q} />}
        {tab === 'showcase' && (
          <Suspense fallback={null}>
            <Showcase />
          </Suspense>
        )}
      </section>
    </main>
  );
}
