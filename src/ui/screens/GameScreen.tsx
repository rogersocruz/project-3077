/**
 * Tela de partida (Fase 3): mesa 3D no centro, HUD em volta (UX_SPEC 2.5), inspetor de
 * hex, modais e sobreposições. A cena desenha o estado MOSTRADO (presentation), que o
 * diretor de animação troca ao fim de cada lote; regras sempre pela sessão/motor.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { director, usePresentation } from '../../anim';
import {
  type Action,
  actionTargets,
  cardDefOf,
  cardTargets,
  decider,
  effectOf,
  type GameState,
  legalActions,
} from '../../engine';
import { sceneHexes, scenePiles, scenePlayers } from '../../render3d/model';
import { onHexSelect, useSceneStore } from '../../render3d/sceneStore';
import { TableScene } from '../../render3d/TableScene';
import { useSettings } from '../../settings';
import { cardCategory } from '../card/model';
import { flowTargets, targetHexes } from '../game/cardFlow';
import { actOnHex, cancel } from '../game/commands';
import { perform } from '../game/hooks';
import { CasualtyChoice, CombatPanel, MovePreview } from '../combat/CombatModals';
import { EventReveal } from '../event/EventReveal';
import { EventZoom } from '../event/EventZoom';
import { CardDialog } from '../hand/CardDialog';
import { CardCaption, CardFlights } from '../hand/CardFlights';
import { CardZoom } from '../hand/CardZoom';
import { CompensationChoice, DiscardModal, DrawChoice, TutorChoice } from '../hand/Choices';
import { Hand } from '../hand/Hand';
import { IntelReport } from '../hand/Intel';
import { palette } from '../theme/tokens';
import { useAiDriver } from '../game/aiDriver';
import { parseGameParams, sameSetup } from '../game/params';
import { useSession } from '../game/session';
import { useGameShortcuts } from '../game/shortcuts';
import { NOT_ARMED, useUi } from '../game/uiStore';
import { BankModal } from '../hud/BankModal';
import { BottomBar } from '../hud/BottomBar';
import styles from '../hud/Game.module.css';
import { HexInspector } from '../hud/HexInspector';
import { LogPanel } from '../hud/LogPanel';
import { PauseMenu, PrivacyScreen, QuickRules, RoundBanner, Toast } from '../hud/Overlays';
import { EndScreen } from '../end/EndScreen';
import { PlayersPanel } from '../hud/PlayersPanel';
import { TopBar } from '../hud/TopBar';
import { TradeModal, TradeReply } from '../hud/Trade';
import { TreatyModal } from '../treaty/TreatyModal';
import { BreakPactConfirm, TreatyFx, TreatyReply } from '../treaty/TreatyParts';
import { useNav } from '../nav';

/** Arrasto maior que isso com o botão direito é órbita, não "cancelar". */
const CLICK_SLOP = 6;

function Stage() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const shown = usePresentation((s) => s.shown);
  const viewer = usePresentation((s) => s.viewer);
  const counters = usePresentation((s) => s.counters);
  const hexes = useMemo(() => (ctx && shown ? sceneHexes(ctx, shown, viewer) : []), [ctx, shown, viewer]);
  // Bandejas acompanham os contadores animados: a pilha cresce quando o token pousa.
  const players = useMemo(
    () => (ctx && shown ? scenePlayers(ctx, shown, counters) : []),
    [ctx, shown, counters],
  );
  const piles = useMemo(() => (ctx && shown ? scenePiles(ctx, shown) : undefined), [ctx, shown]);
  const model = useMemo(() => ({ hexes, players, ...(piles ? { piles } : {}) }), [hexes, players, piles]);
  const down = useRef<{ x: number; y: number } | null>(null);
  if (!ctx) return null;
  return (
    <div
      className={styles.stage}
      role="img"
      aria-label={t('table.canvasLabel')}
      onPointerDown={(e) => {
        if (e.button === 2) down.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (e.button === 2 && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < CLICK_SLOP) cancel();
      }}
    >
      <TableScene planet={ctx.planet} model={model} />
    </div>
  );
}

/**
 * Alvos destacados: Vila no setup; a ação escolhida (modo) na fase de Ações; os alvos da
 * carta em uso; e o alcance da carta em zoom (UX_SPEC 2.7: "alcance desenhado no mapa").
 */
function useTargets() {
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const busy = usePresentation((s) => s.busy);
  const viewer = usePresentation((s) => s.viewer);
  const mode = useUi((s) => s.mode);
  const flow = useUi((s) => s.flow);
  const zoom = useUi((s) => s.zoom);
  const setTargets = useSceneStore((s) => s.setTargets);
  useEffect(() => {
    const decides = !!ctx && !!state && !busy && viewer !== null && decider(state) === viewer;
    const setZoomTargets = useUi.getState().setZoomTargets;
    if (
      ctx &&
      state &&
      viewer !== null &&
      zoom &&
      'card' in zoom &&
      state.cards.defs[zoom.card] !== undefined
    ) {
      const def = cardDefOf(ctx, state, zoom.card);
      if (effectOf(def).target === 'none') {
        setZoomTargets(null);
        setTargets(null);
        return;
      }
      const recipients =
        def.timing === 'delivered' ? state.players.filter((p) => p.id !== viewer).map((p) => p.id) : [null];
      const all = recipients.flatMap((r) => cardTargets(ctx, state, viewer, zoom.card, r));
      setZoomTargets(all.length);
      const keys = targetHexes(state, all);
      setTargets(
        keys.length
          ? { kind: 'card', keys: new Set(keys), color: palette.card[cardCategory(def)].headerFrom }
          : null,
      );
      return;
    }
    setZoomTargets(null);
    if (decides && ctx && state && flow) {
      const keys = targetHexes(state, flowTargets(ctx, state, state.activePlayer, flow));
      const def = cardDefOf(ctx, state, flow.card);
      setTargets(
        keys.length
          ? { kind: 'card', keys: new Set(keys), color: palette.card[cardCategory(def)].headerFrom }
          : null,
      );
      return;
    }
    const template = state?.stage === 'setup' ? ({ type: 'chooseVillage' } as const) : mode;
    if (!decides || !ctx || !state || !template || state.pendingTrade || state.treaties.pending) {
      setTargets(null);
      return;
    }
    const keys = actionTargets(ctx, state, decider(state), template);
    setTargets({ kind: template.type, keys: new Set(keys) });
  }, [ctx, state, busy, viewer, mode, flow, zoom, setTargets]);
  useEffect(() => () => setTargets(null), [setTargets]);
}

export function GameScreen() {
  const search = useNav((s) => s.search);
  const params = useMemo(() => parseGameParams(search), [search]);
  const start = useSession((s) => s.start);
  const ctx = useSession((s) => s.ctx);
  const shown = usePresentation((s) => s.shown);
  const busy = usePresentation((s) => s.busy);
  const gate = usePresentation((s) => s.gate);
  const pending = useSession((s) => s.state?.pendingTrade ?? null);
  const modal = useUi((s) => s.modal);
  const logOpen = useUi((s) => s.logOpen);
  const selected = useSceneStore((s) => s.selected);

  // Parâmetros da URL: apresentação vai para as configurações; a partida começa se mudou.
  useEffect(() => {
    const st = useSettings.getState();
    if (params.speed !== null) st.setGameplay({ animationSpeed: params.speed });
    if (params.privacy !== null) st.setGameplay({ privacyScreen: params.privacy });
    if (params.quality) st.setRender({ quality: params.quality });
    if (params.adaptive !== null) st.setRender({ adaptiveQuality: params.adaptive });
    if (params.post !== null) {
      const v = params.post;
      st.setPost({ bloom: v, vignette: v, smaa: v, tiltShift: v });
    }
    if (!sameSetup(useSession.getState().setup, params.setup) || !useSession.getState().state)
      start(params.setup);
  }, [params, start]);

  useGameShortcuts();
  useTargets();
  useAiDriver();

  // Clique num hex destacado executa a ação escolhida.
  useEffect(() => onHexSelect((key) => key !== null && actOnHex(key)), []);

  // Dispositivo mudou de mão: nada de seleção ou modo do jogador anterior. Síncrono (na
  // própria troca), não num efeito: um efeito rodaria depois e apagaria uma escolha nova.
  useEffect(
    () =>
      usePresentation.subscribe((s, prev) => {
        if (s.viewer === prev.viewer) return;
        useSceneStore.getState().select(null);
        const ui = useUi.getState();
        ui.setMode(null);
        ui.setFlow(null);
        ui.setArmed(NOT_ARMED);
        ui.setZoom(null);
        ui.open(null);
      }),
    [],
  );

  // Gancho de teste (só desenvolvimento): estado e ações legais de quem decide.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__p3077 = {
      ...window.__p3077,
      state: () => useSession.getState().state,
      legal: () => {
        const s = useSession.getState();
        return s.ctx && s.state ? legalActions(s.ctx, s.state, decider(s.state)) : [];
      },
      targets: () => [...(useSceneStore.getState().targets?.keys ?? [])],
      busy: () => usePresentation.getState().busy,
      // Mesmo caminho dos botões (sessão → motor → diretor): para o e2e jogar partidas longas.
      perform: (action: Action) => perform(action),
      // Monta um cenário (como `edit` nos testes do motor): mostra o estado sem animar.
      load: (next: GameState) => {
        const c = useSession.getState().ctx;
        if (!c) return;
        useSession.setState({ state: next });
        director.reset(c, next, { keepViewer: true });
      },
    };
  }, []);

  if (!ctx || !shown) return null;
  const right = selected ? 'inspector' : logOpen ? 'log' : null;
  const cards = shown.layers.cards;

  return (
    <main
      className={`${styles.screen} ${right ? '' : styles.noRight}`}
      style={cards ? { ['--hint-gap' as string]: '182px' } : undefined}
      data-testid="game"
    >
      <TopBar />
      <PlayersPanel />
      <Stage />
      {cards && <Hand />}
      {cards && <CardDialog />}
      {right && (
        <aside className={`${styles.right} ${styles.plateCol}`}>
          {selected ? <HexInspector key={selected} hexKey={selected} /> : <LogPanel />}
        </aside>
      )}
      <BottomBar />

      <RoundBanner />
      <EventReveal />
      <EventZoom />
      <MovePreview />
      <CombatPanel />
      {!busy && !gate && <CasualtyChoice />}
      <Toast />
      {modal?.kind === 'bank' && <BankModal />}
      {modal?.kind === 'trade' && <TradeModal counter={modal.counter} />}
      {pending && !busy && !gate && modal?.kind !== 'trade' && <TradeReply />}
      {modal?.kind === 'treaty' && <TreatyModal />}
      {!busy && !gate && <TreatyReply />}
      <BreakPactConfirm />
      <TreatyFx />
      {modal?.kind === 'rules' && <QuickRules />}
      {modal?.kind === 'discard' && <DiscardModal />}
      {cards && !busy && !gate && <DrawChoice />}
      {!busy && !gate && <CompensationChoice />}
      {cards && !busy && !gate && <TutorChoice />}
      {cards && <CardZoom />}
      {cards && <CardFlights />}
      {cards && <CardCaption />}
      {cards && <IntelReport />}
      {modal?.kind === 'pause' && <PauseMenu />}
      {!busy && <EndScreen />}
      <PrivacyScreen />
    </main>
  );
}
