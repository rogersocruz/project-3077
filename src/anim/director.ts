/**
 * Diretor de animação (CLAUDE.md regra 2: o motor nunca espera animação). Recebe cada
 * ação aplicada (estado antes/depois + eventos), toca as pistas em fila com GSAP e só
 * então troca o estado mostrado. Enquanto há fila, `busy` bloqueia a entrada.
 *
 * Também é quem passa o dispositivo em hotseat: quando muda quem decide, a fila espera
 * a tela de privacidade (UX_SPEC 2.15) — no início do turno, antes da produção, para o
 * próximo jogador ver a própria cascata.
 */
import gsap from 'gsap';
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import type { EngineContext } from '../engine/context';
import { decider } from '../engine/legal';
import { amountTotal, findStructure, type ResourceAmounts } from '../engine/queries';
import type { CardTarget, GameState, PlayerId, Resources } from '../engine/state';
import { type FxAnchor, useFxStore } from '../render3d/fxStore';
import { useSceneStore } from '../render3d/sceneStore';
import { palette } from '../ui/theme/tokens';
import type { AnimationSpeed } from '../settings';
import { type CardFlight, type FlightPoint, useCardFlights } from './cardFlights';
import { type Batch, buildCues, type CardRef, type Cue } from './cues';
import { countersOf, type GateReason, type LogEntry, turnViewOf, usePresentation } from './presentation';
import { EASE, T } from './timing';

export interface DirectorDeps {
  speed(): AnimationSpeed;
  /** Hotseat: mostrar a tela de privacidade quando muda quem decide. */
  privacy(): boolean;
  reducedMotion(): boolean;
  focusBoard(boardId: number): void;
  /** Quem está diante da tela (Espaço = "meu tabuleiro"). */
  setLocalPlayer(player: PlayerId): void;
}

type Job =
  { readonly kind: 'batch'; readonly batch: Batch } | { readonly kind: 'settle'; readonly state: GameState };

const nextFrame = () =>
  new Promise<void>((r) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0),
  );

export class Director {
  private ctx: EngineContext | null = null;
  private queue: Job[] = [];
  private running = false;
  /** Muda a cada reset: tudo que estava tocando para no próximo ponto de espera. */
  private epoch = 0;
  private releaseGate: (() => void) | null = null;
  private releaseIntel: (() => void) | null = null;
  private readonly active = new Map<gsap.core.Timeline, () => void>();
  private logId = 1;
  /** Assentos de pessoas (Fase 5); null = todos humanos (hotseat). */
  private humans: readonly boolean[] | null = null;

  constructor(private readonly deps: DirectorDeps) {}

  /** Quem é pessoa e quem é IA: só pessoas recebem a tela de privacidade e relatórios. */
  setHumans(humans: readonly boolean[] | null): void {
    this.humans = humans;
  }

  private isHuman(player: PlayerId): boolean {
    return !this.humans || this.humans[player] !== false;
  }

  private get spectator(): boolean {
    return !!this.humans && this.humans.every((h) => !h);
  }

  /** Nova partida, revanche ou desfazer: mostra `state` sem animar e acerta quem olha. */
  reset(
    ctx: EngineContext,
    state: GameState,
    opts: { keepViewer?: boolean; log?: readonly LogEntry[] } = {},
  ) {
    this.epoch++;
    this.ctx = ctx;
    this.queue = [];
    this.running = false;
    for (const [tl, done] of this.active) {
      tl.kill();
      done();
    }
    this.active.clear();
    this.releaseGate?.();
    this.releaseGate = null;
    this.releaseIntel?.();
    this.releaseIntel = null;
    useFxStore.getState().clear();
    useCardFlights.getState().clear();
    const viewer = opts.keepViewer ? usePresentation.getState().viewer : null;
    usePresentation.setState({
      shown: state,
      counters: countersOf(state),
      turn: turnViewOf(state),
      viewer,
      gate: null,
      banner: null,
      intel: null,
      log: opts.log ?? [],
    });
    this.queue.push({ kind: 'settle', state });
    void this.pump();
  }

  enqueue(batch: Batch): void {
    this.queue.push({ kind: 'batch', batch });
    this.syncBusy();
    void this.pump();
  }

  /** "Estou pronto" na tela de privacidade. */
  release(): void {
    this.releaseGate?.();
  }

  /** "Entendi" no relatório de carta de informação. */
  dismissIntel(): void {
    this.releaseIntel?.();
  }

  private syncBusy() {
    const busy = this.running || this.queue.length > 0 || usePresentation.getState().gate !== null;
    if (usePresentation.getState().busy !== busy) usePresentation.setState({ busy });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const epoch = this.epoch;
    this.syncBusy();
    try {
      while (this.queue.length > 0 && epoch === this.epoch) {
        const job = this.queue.shift();
        if (!job) break;
        if (job.kind === 'batch') await this.playBatch(job.batch, epoch);
        else await this.settle(job.state, epoch);
      }
    } finally {
      if (epoch === this.epoch) {
        this.running = false;
        this.syncBusy();
      }
    }
  }

  // ── Lotes ──────────────────────────────────────────────────────────────────

  private appendLog(b: Batch) {
    const actionIndex = b.after.log.length;
    const round = b.after.round;
    const entries = b.events.map((event) => ({ id: this.logId++, actionIndex, round, event }));
    if (entries.length) usePresentation.setState((s) => ({ log: [...s.log, ...entries] }));
  }

  private async playBatch(b: Batch, epoch: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.appendLog(b);
    for (const cue of buildCues(ctx, b)) {
      if (epoch !== this.epoch) return;
      await this.playCue(cue, b, epoch);
    }
    if (epoch !== this.epoch) return;
    usePresentation.setState({ shown: b.after, counters: countersOf(b.after), turn: turnViewOf(b.after) });
    // As cópias animadas saem um pouco depois da troca: a cena 3D é outra raiz React e
    // pode desenhar o estado novo um quadro mais tarde.
    if (
      useFxStore.getState().items.length ||
      useFxStore.getState().hiddenHexes.size ||
      useCardFlights.getState().items.length
    ) {
      await nextFrame();
      await nextFrame();
      if (epoch !== this.epoch) return;
      useFxStore.getState().clear();
      useCardFlights.getState().clear();
    }
    await this.settle(b.after, epoch);
  }

  /** Depois de cada lote: se quem decide mudou, passa o dispositivo. */
  private async settle(state: GameState, epoch: number) {
    if (state.stage === 'over') {
      const winner = state.winners[0];
      if (winner !== undefined) this.deps.focusBoard(state.players[winner]?.boardId ?? winner);
      return;
    }
    const who = decider(state);
    const reason: GateReason = state.pendingTrade ? 'trade' : state.stage === 'setup' ? 'setup' : 'turn';
    const changed = await this.ensureViewer(who, reason, epoch);
    if (changed && reason !== 'trade') this.deps.focusBoard(state.players[who]?.boardId ?? who);
  }

  private async ensureViewer(player: PlayerId, reason: GateReason, epoch: number): Promise<boolean> {
    if (usePresentation.getState().viewer === player) return false;
    if (!this.isHuman(player)) {
      // IA decide: com alguém jogando, a tela continua com a última pessoa (nada privado
      // da IA aparece). Só IA (espectador): a tela acompanha quem decide, sem privacidade.
      if (!this.spectator) return false;
      usePresentation.setState({ viewer: player });
      this.deps.setLocalPlayer(player);
      return true;
    }
    // Uma pessoa só contra IA: não há com quem esconder a tela depois da primeira vez.
    const humans = this.humans?.filter(Boolean).length ?? Infinity;
    const seen = usePresentation.getState().viewer !== null;
    if (this.deps.privacy() && !(humans === 1 && seen)) {
      usePresentation.setState({ gate: { player, reason } });
      this.syncBusy();
      await new Promise<void>((resolve) => (this.releaseGate = resolve));
      this.releaseGate = null;
      if (epoch !== this.epoch) return false;
      usePresentation.setState({ gate: null });
      this.syncBusy();
    }
    usePresentation.setState({ viewer: player });
    this.deps.setLocalPlayer(player);
    return true;
  }

  // ── Tempo ──────────────────────────────────────────────────────────────────

  private get instant(): boolean {
    return this.deps.speed() === 'instant';
  }

  private play(tl: gsap.core.Timeline): Promise<void> {
    const speed = this.deps.speed();
    if (speed === 'instant' || tl.duration() === 0) {
      tl.progress(1).kill();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const done = () => {
        this.active.delete(tl);
        resolve();
      };
      this.active.set(tl, done);
      tl.eventCallback('onComplete', done);
      tl.timeScale(speed).play();
    });
  }

  private wait(seconds: number): Promise<void> {
    if (this.instant) return Promise.resolve();
    const tl = gsap.timeline({ paused: true });
    tl.to({}, { duration: seconds });
    return this.play(tl);
  }

  // ── Contadores do HUD ──────────────────────────────────────────────────────

  private bump(player: PlayerId, delta: ResourceAmounts, sign: 1 | -1) {
    usePresentation.setState((s) => ({
      counters: s.counters.map((c, i) => {
        if (i !== player) return c;
        const next: Resources = { ...c };
        for (const id of RESOURCE_IDS) next[id] = Math.max(0, next[id] + sign * (delta[id] ?? 0));
        return next;
      }),
    }));
  }

  /**
   * Tokens voando de `from` para `to` (no máximo T.maxTokens por recurso), a partir de
   * `at` na timeline. Devolve o instante em que o último pousa.
   */
  private flyTokens(
    tl: gsap.core.Timeline,
    amounts: ResourceAmounts,
    from: (r: ResourceId) => FxAnchor,
    to: (r: ResourceId) => FxAnchor,
    at: number,
  ): number {
    if (this.deps.reducedMotion()) return at;
    const fx = useFxStore.getState();
    let k = 0;
    for (const id of RESOURCE_IDS) {
      const n = Math.min(amounts[id] ?? 0, T.maxTokens);
      for (let i = 0; i < n; i++) {
        const item = fx.add({ kind: 'token', resource: id, from: from(id), to: to(id), p: { t: 0 } });
        tl.to(item.p, { t: 1, duration: T.token, ease: EASE.flight }, at + k * T.tokenStagger);
        k++;
      }
    }
    return k === 0 ? at : at + (k - 1) * T.tokenStagger + T.token;
  }

  // ── Pistas ─────────────────────────────────────────────────────────────────

  private async playCue(cue: Cue, b: Batch, epoch: number): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    switch (cue.kind) {
      case 'worldEvent': {
        // UX_SPEC 2.14: a mesa escurece, a carta vem ao centro com a cor da categoria e
        // os hexes atingidos pulsam; depois a carta encolhe para o topo do HUD.
        const color =
          palette.event[cue.category as keyof typeof palette.event]?.color ?? palette.accent.orange;
        useSceneStore.getState().setPulse(cue.hexes.length ? { keys: new Set(cue.hexes), color } : null);
        if (this.instant) {
          useSceneStore.getState().setPulse(null);
          return;
        }
        usePresentation.setState({ eventReveal: { event: cue.event, category: cue.category } });
        await this.wait(this.deps.reducedMotion() ? T.eventRevealReduced : T.eventReveal);
        if (epoch !== this.epoch) return;
        usePresentation.setState({ eventReveal: null });
        // O pulso fica um pouco mais, enquanto o dano anima.
        const pulseOff = () => useSceneStore.getState().setPulse(null);
        setTimeout(pulseOff, (T.eventPulse * 1000) / Math.max(0.5, Number(this.deps.speed()) || 1));
        return;
      }

      case 'round':
        if (this.instant) return;
        usePresentation.setState({ banner: { round: cue.round } });
        await this.wait(T.roundBanner);
        if (epoch === this.epoch) usePresentation.setState({ banner: null });
        return;

      case 'turn': {
        const same = b.after.activePlayer === cue.player && b.after.round === cue.round;
        usePresentation.setState({
          turn: {
            stage: 'playing',
            round: cue.round,
            activePlayer: cue.player,
            phase: 'reveal',
            actionsLeft: same ? b.after.actionsLeft : ctx.balance.turn.actionsPerTurn,
          },
        });
        await this.ensureViewer(cue.player, 'turn', epoch);
        if (epoch !== this.epoch) return;
        this.deps.focusBoard(b.after.players[cue.player]?.boardId ?? cue.player);
        await this.wait(T.turnBeat);
        return;
      }

      case 'phase':
        usePresentation.setState((s) => (s.turn ? { turn: { ...s.turn, phase: cue.phase } } : {}));
        if (cue.phase !== 'actions') await this.wait(T.phaseStep);
        return;

      case 'actions':
        usePresentation.setState((s) =>
          s.turn ? { turn: { ...s.turn, actionsLeft: cue.actionsLeft } } : {},
        );
        return;

      case 'intel': {
        // Relatório privado: só quem jogou vê, e a fila espera o "Entendi" (mesmo em
        // velocidade instantânea — é informação, não enfeite).
        if (usePresentation.getState().viewer !== cue.player || !this.isHuman(cue.player)) return;
        usePresentation.setState({ intel: { player: cue.player, card: cue.card.id, report: cue.report } });
        await new Promise<void>((resolve) => (this.releaseIntel = resolve));
        this.releaseIntel = null;
        if (epoch === this.epoch) usePresentation.setState({ intel: null });
        return;
      }

      default:
        if (this.instant) return;
        await this.play(this.choreograph(cue, b));
    }
  }

  // ── Cartas ─────────────────────────────────────────────────────────────────

  private flight(
    card: CardRef,
    from: FlightPoint,
    to: FlightPoint,
    p: Partial<CardFlight['p']> = {},
    face = true,
  ) {
    return useCardFlights.getState().add({
      face: face ? card.id : null,
      back: card.deck,
      category: card.category,
      from,
      to,
      p: { t: 0, flip: face ? 1 : 0, scale: 1, fade: 1, glow: 0, burst: 0, ...p },
    });
  }

  /** Para onde a carta jogada voa: o alvo no mapa, o retrato, o contador ou o centro. */
  private targetPoint(target: CardTarget | null, state: GameState): FlightPoint {
    if (!target) return { kind: 'center' };
    switch (target.kind) {
      case 'hex':
        return { kind: 'world', anchor: { kind: 'hex', key: target.hex } };
      case 'structure': {
        const where = findStructure(state, target.uid);
        return where ? { kind: 'world', anchor: { kind: 'hex', key: where.key } } : { kind: 'center' };
      }
      case 'player':
        return { kind: 'dom', selector: `[data-player="${target.player}"]` };
      case 'resource':
        return { kind: 'dom', selector: `[data-testid="res-${target.resource}"]` };
      case 'permanent': {
        const slot = state.players[target.player]?.permanents.indexOf(target.card) ?? 0;
        return { kind: 'world', anchor: { kind: 'slot', player: target.player, slot: Math.max(0, slot) } };
      }
      case 'deck':
        return { kind: 'world', anchor: { kind: 'pile', deck: target.deck, pile: 'draw' } };
    }
  }

  private handCard(card: CardRef): FlightPoint {
    return { kind: 'dom', selector: `[data-testid="hand-card-${card.uid}"]` };
  }

  /** Custo da carta: contador desce e tokens vão da bandeja ao cofre. Devolve quando pousam. */
  private payCost(tl: gsap.core.Timeline, player: PlayerId, cost: ResourceAmounts): number {
    if (amountTotal(cost) === 0) return 0;
    this.bump(player, cost, -1);
    return this.flyTokens(
      tl,
      cost,
      (r) => ({ kind: 'tray', player, resource: r }),
      () => ({ kind: 'vault' }),
      0,
    );
  }

  /** Monta a timeline (pausada) de uma pista visual. */
  private choreograph(cue: Cue, b: Batch): gsap.core.Timeline {
    const tl = gsap.timeline({ paused: true });
    const fx = useFxStore.getState();
    const reduced = this.deps.reducedMotion();
    const tray =
      (player: PlayerId) =>
      (r: ResourceId): FxAnchor => ({ kind: 'tray', player, resource: r });
    const at = (key: string) => (): FxAnchor => ({ kind: 'hex', key });

    switch (cue.kind) {
      case 'reveal': {
        fx.hide(
          cue.items.map((i) => i.hex),
          [],
        );
        cue.items.forEach((it, i) => {
          const t0 = i * T.revealStagger;
          const item = fx.add({
            kind: 'tileFlip',
            hex: it.hex,
            terrain: it.terrain,
            hazard: it.hazard,
            p: { lift: 0, flip: 0, fade: 0 },
          });
          if (reduced) {
            tl.to(item.p, { fade: 1, duration: T.fade, ease: 'none' }, t0);
            return;
          }
          const flipAt = t0 + T.tileLift * 0.6;
          const landAt = flipAt + T.tileFlip;
          tl.to(item.p, { lift: 0.55, duration: T.tileLift, ease: EASE.out }, t0)
            .to(item.p, { flip: 1, duration: T.tileFlip, ease: EASE.inOut }, flipAt)
            .to(item.p, { lift: 0, duration: T.tileSettle, ease: 'bounce.out' }, landAt);
          const dust = fx.add({ kind: 'dust', hex: it.hex, p: { t: 0 } });
          tl.fromTo(
            dust.p,
            { t: 0.001 },
            { t: 1, duration: T.dust, ease: EASE.out, immediateRender: false },
            landAt + T.tileSettle * 0.35,
          );
        });
        return tl;
      }

      case 'village':
      case 'build':
      case 'upgrade': {
        const target = cue.target;
        const player = cue.player;
        let t = 0;
        if (cue.kind !== 'village') {
          this.bump(player, cue.cost, -1);
          t = this.flyTokens(tl, cue.cost, tray(player), at(target.hex), 0);
        }
        if (cue.kind === 'upgrade') {
          const up = fx.add({
            kind: 'levelUp',
            hex: target.hex,
            slot: target.slot,
            type: target.structure,
            level: target.level,
            p: { t: 0 },
          });
          tl.fromTo(
            up.p,
            { t: 0.001 },
            { t: 1, duration: T.levelUp, ease: EASE.out, immediateRender: false },
            t,
          );
          return tl;
        }
        const s = fx.add({
          kind: 'structure',
          hex: target.hex,
          slot: target.slot,
          type: target.structure,
          owner: target.owner,
          level: target.level,
          p: { rise: 0, fade: 0 },
        });
        if (reduced) {
          tl.to(s.p, { fade: 1, duration: T.fade, ease: 'none' }, t);
          return tl;
        }
        tl.to(s.p, { rise: 1, duration: T.rise, ease: EASE.settle }, t);
        const sp = fx.add({ kind: 'sparks', hex: target.hex, slot: target.slot, p: { t: 0 } });
        tl.fromTo(
          sp.p,
          { t: 0.001 },
          { t: 1, duration: T.sparks, ease: 'none', immediateRender: false },
          t + 0.08,
        );
        return tl;
      }

      case 'survey': {
        const before = b.before.hexes[cue.hex];
        let t = 0;
        if (cue.origin) {
          const scan = fx.add({ kind: 'scan', from: cue.origin, to: cue.hex, p: { t: 0 } });
          tl.to(scan.p, { t: 1, duration: T.scan, ease: EASE.out }, 0);
          t = T.scan * 0.7;
        }
        if (before && !reduced) {
          fx.hide([cue.hex], []);
          const tilt = fx.add({
            kind: 'tileTilt',
            hex: cue.hex,
            terrain: before.revealed ? before.surface : null,
            hazard: this.ctx?.terrain(before.surface).kind === 'hazard',
            p: { tilt: 0 },
          });
          tl.to(tilt.p, { tilt: 1, duration: T.tilt / 2, ease: EASE.out, yoyo: true, repeat: 1 }, t);
        }
        return tl;
      }

      case 'production': {
        cue.items.forEach((item, i) => {
          const t0 = i * T.productionStagger;
          if (item.kind === 'produce') {
            const amounts = { [item.resource]: item.amount };
            const land = this.flyTokens(tl, amounts, at(item.hex), tray(cue.player), t0);
            tl.call(() => this.bump(cue.player, amounts, 1), [], land);
            return;
          }
          if (item.kind === 'idle') {
            const p = fx.add({ kind: 'idle', hex: item.hex, slot: item.slot, p: { t: 0 } });
            tl.to(p.p, { t: 1, duration: T.idle, ease: 'none' }, t0);
            return;
          }
          fx.hide([], [item.uid]);
          const s = fx.add({
            kind: 'structure',
            hex: item.hex,
            slot: item.slot,
            type: item.structure,
            owner: item.owner,
            level: item.level,
            p: { rise: 1, fade: 1 },
          });
          tl.to(
            s.p,
            reduced ? { fade: 0, duration: T.fade } : { rise: 0, duration: T.rise, ease: 'power2.in' },
            t0 + T.token,
          );
        });
        return tl;
      }

      case 'upkeep': {
        cue.items.forEach((item, i) => {
          const t0 = i * T.productionStagger;
          if (item.paid) {
            tl.call(() => this.bump(cue.player, item.cost, -1), [], t0);
            this.flyTokens(tl, item.cost, tray(cue.player), at(item.target.hex), t0);
            return;
          }
          const p = fx.add({ kind: 'idle', hex: item.target.hex, slot: item.target.slot, p: { t: 0 } });
          tl.to(p.p, { t: 1, duration: T.idle, ease: 'none' }, t0);
        });
        return tl;
      }

      case 'bank': {
        const vault = fx.add({ kind: 'vault', p: { t: 0, spin: 0 } });
        const give = { [cue.give]: cue.amount };
        const got = { [cue.receive]: cue.received };
        this.bump(cue.player, give, -1);
        const arrive = this.flyTokens(tl, give, tray(cue.player), () => ({ kind: 'vault' }), 0);
        const land = this.flyTokens(
          tl,
          got,
          () => ({ kind: 'vault' }),
          tray(cue.player),
          arrive + T.vaultHold,
        );
        tl.call(() => this.bump(cue.player, got, 1), [], land);
        const total = Math.max(land, 0.6);
        tl.to(vault.p, { t: 1, spin: Math.PI * 2, duration: total + 0.15, ease: 'none' }, 0);
        return tl;
      }

      case 'trade': {
        this.bump(cue.from, cue.give, -1);
        this.bump(cue.to, cue.receive, -1);
        const a = this.flyTokens(tl, cue.give, tray(cue.from), tray(cue.to), 0);
        const c = this.flyTokens(tl, cue.receive, tray(cue.to), tray(cue.from), 0.1);
        tl.call(() => this.bump(cue.to, cue.give, 1), [], a);
        tl.call(() => this.bump(cue.from, cue.receive, 1), [], c);
        return tl;
      }

      // ── Cartas (UX_SPEC 6) ──
      case 'draw': {
        // Sai do baralho em arco e vira no ar para quem comprou; os outros veem o verso
        // indo até o retrato do jogador.
        if (reduced) return tl;
        const mine = usePresentation.getState().viewer === cue.player;
        cue.cards.forEach((card, i) => {
          const from: FlightPoint =
            card.deck === 'treasure'
              ? { kind: 'center' }
              : { kind: 'world', anchor: { kind: 'pile', deck: card.deck, pile: 'draw' } };
          const to: FlightPoint = mine
            ? { kind: 'dom', selector: '[data-testid=hand]' }
            : { kind: 'dom', selector: `[data-player="${cue.player}"]` };
          const f = this.flight(card, from, to, { scale: 0.5, flip: 0 }, mine);
          const t0 = i * T.cardStagger;
          tl.to(f.p, { t: 1, scale: mine ? 0.85 : 0.3, duration: T.cardFly * 1.4, ease: EASE.flight }, t0);
          if (mine)
            tl.to(f.p, { flip: 1, duration: T.cardFly * 0.6, ease: EASE.inOut }, t0 + T.cardFly * 0.35);
          tl.to(f.p, { fade: 0, duration: 0.1 }, t0 + T.cardFly * 1.4);
        });
        return tl;
      }

      case 'cardPlay': {
        // Voa até o alvo e se desfaz em partículas da cor da categoria.
        const t = this.payCost(tl, cue.player, cue.cost);
        if (reduced) return tl;
        const f = this.flight(cue.card, this.handCard(cue.card), this.targetPoint(cue.target, b.before), {
          scale: 0.85,
        });
        const fly = T.cardFly * 1.3;
        tl.to(f.p, { t: 1, scale: 0.4, duration: fly, ease: EASE.out }, t * 0.3)
          .to(f.p, { burst: 1, duration: T.burst, ease: 'power1.out' }, t * 0.3 + fly)
          .to(f.p, { fade: 0, duration: T.burst * 0.6 }, t * 0.3 + fly);
        return tl;
      }

      case 'install': {
        // Voa até o slot e encaixa (a carta 3D aparece na bandeja ao fim do lote).
        this.payCost(tl, cue.player, cue.cost);
        if (reduced) return tl;
        const mine = usePresentation.getState().viewer === cue.player;
        const to: FlightPoint = mine
          ? { kind: 'dom', selector: `[data-slot="${cue.slot}"]` }
          : { kind: 'world', anchor: { kind: 'slot', player: cue.player, slot: cue.slot } };
        const f = this.flight(cue.card, this.handCard(cue.card), to, { scale: 0.85 });
        tl.to(f.p, { t: 1, scale: 0.26, duration: T.cardFly * 1.2, ease: EASE.settle }, 0)
          .to(f.p, { glow: 1, duration: 0.12 }, T.cardFly * 1.1)
          .to(f.p, { fade: 0, duration: 0.15 }, T.cardFly * 1.25);
        return tl;
      }

      case 'discard': {
        if (reduced || usePresentation.getState().viewer !== cue.player) return tl;
        cue.cards.forEach((card, i) => {
          const to: FlightPoint =
            card.deck === 'treasure'
              ? { kind: 'center' }
              : { kind: 'world', anchor: { kind: 'pile', deck: card.deck, pile: 'discard' } };
          const f = this.flight(card, this.handCard(card), to, { scale: 0.8 });
          const t0 = i * T.cardStagger * 0.6;
          tl.to(f.p, { t: 1, scale: 0.35, duration: T.cardFly, ease: EASE.out }, t0).to(
            f.p,
            { fade: 0, duration: 0.1 },
            t0 + T.cardFly,
          );
        });
        return tl;
      }

      case 'deliver': {
        // A carta dobra em envelope lacrado e um mini drone leva até a bandeja do alvo.
        this.payCost(tl, cue.from, cue.cost);
        let t = 0;
        if (!reduced) {
          const f = this.flight(
            cue.card,
            this.handCard(cue.card),
            {
              kind: 'world',
              anchor: { kind: 'trayCenter', player: cue.from },
            },
            { scale: 0.85 },
          );
          tl.to(f.p, { t: 1, scale: 0.25, flip: 0, duration: T.cardFly, ease: EASE.inOut }, 0).to(
            f.p,
            { fade: 0, duration: 0.1 },
            T.cardFly,
          );
          t = T.cardFly * 0.8;
        }
        const env = fx.add({
          kind: 'envelope',
          from: { kind: 'slot', player: cue.from, slot: 2 },
          to: { kind: 'envelope', player: cue.to, index: cue.index },
          p: { t: 0, open: 0 },
        });
        tl.to(env.p, { t: 1, duration: reduced ? T.fade : T.envelope, ease: EASE.inOut }, t);
        return tl;
      }

      case 'cardReveal': {
        // Envelope vai ao centro e abre; a carta vira 180° com o brilho da categoria.
        const flights = useCardFlights.getState();
        const env = fx.add({
          kind: 'envelope',
          from: { kind: 'envelope', player: cue.to, index: cue.index },
          to: { kind: 'center' },
          p: { t: 0, open: 0 },
        });
        tl.to(env.p, { t: 1, duration: T.envelope * 0.7, ease: EASE.inOut }, 0).to(
          env.p,
          { open: 1, duration: 0.2, ease: 'power1.in' },
          T.envelope * 0.7,
        );
        const at = T.envelope * 0.7;
        const f = this.flight(
          cue.card,
          { kind: 'world', anchor: { kind: 'center' } },
          { kind: 'center' },
          {
            scale: 0.4,
            flip: 0,
          },
        );
        tl.to(f.p, { t: 1, scale: 1.6, duration: T.revealFlip, ease: EASE.out }, at)
          .to(f.p, { flip: 1, duration: T.revealFlip, ease: EASE.inOut }, at + T.revealFlip * 0.3)
          .to(f.p, { glow: 1, duration: T.revealFlip * 0.5, yoyo: true, repeat: 1 }, at + T.revealFlip * 0.6)
          .call(
            () =>
              flights.setCaption({
                kind: 'reveal',
                id: cue.card.id,
                from: cue.from,
                to: cue.to,
                fizzled: cue.fizzled,
              }),
            [],
            at + T.revealFlip,
          )
          .to(f.p, { fade: 0, scale: 1.2, duration: 0.25 }, at + T.revealFlip * 1.3 + T.revealHold)
          .call(() => flights.setCaption(null), [], at + T.revealFlip * 1.3 + T.revealHold + 0.25);
        return tl;
      }

      case 'taken': {
        // Requisição Prioritária: a carta escolhida é revelada a todos.
        const flights = useCardFlights.getState();
        const f = this.flight(
          cue.card,
          { kind: 'world', anchor: { kind: 'pile', deck: cue.deck, pile: 'draw' } },
          { kind: 'center' },
          { scale: 0.5, flip: 0 },
        );
        tl.to(f.p, { t: 1, scale: 1.5, duration: T.revealFlip, ease: EASE.out }, 0)
          .to(f.p, { flip: 1, duration: T.revealFlip, ease: EASE.inOut }, T.revealFlip * 0.2)
          .call(
            () => flights.setCaption({ kind: 'taken', id: cue.card.id, player: cue.player, deck: cue.deck }),
            [],
            T.revealFlip,
          )
          .to(f.p, { fade: 0, duration: 0.2 }, T.revealFlip * 1.2 + T.revealHold)
          .call(() => flights.setCaption(null), [], T.revealFlip * 1.2 + T.revealHold + 0.2);
        return tl;
      }

      case 'permanentGone': {
        // Sai do jogo (GDD 7.4): a carta deixa o slot e some no centro.
        const fly = fx.add({
          kind: 'cardFly',
          card: cue.card.id,
          category: cue.card.category,
          from: { kind: 'slot', player: cue.player, slot: cue.slot },
          to: { kind: 'center' },
          p: { t: 0 },
        });
        tl.to(fly.p, { t: 1, duration: reduced ? T.fade : T.steal, ease: EASE.inOut }, 0);
        return tl;
      }

      case 'steal': {
        const fly = fx.add({
          kind: 'cardFly',
          card: cue.card.id,
          category: cue.card.category,
          from: { kind: 'slot', player: cue.from, slot: cue.fromSlot },
          to: { kind: 'slot', player: cue.to, slot: cue.toSlot },
          p: { t: 0 },
        });
        tl.to(fly.p, { t: 1, duration: reduced ? T.fade : T.steal, ease: EASE.inOut }, 0);
        return tl;
      }

      case 'destroy': {
        // A estrutura racha e desce para dentro do tile (UX_SPEC 6: destruição).
        const target = cue.target;
        fx.hide([], [target.uid]);
        const s = fx.add({
          kind: 'structure',
          hex: target.hex,
          slot: target.slot,
          type: target.structure,
          owner: target.owner,
          level: target.level,
          p: { rise: 1, fade: 1 },
        });
        tl.to(
          s.p,
          reduced ? { fade: 0, duration: T.fade } : { rise: 0, duration: T.sink, ease: 'power2.in' },
          0,
        );
        if (!reduced) {
          const dust = fx.add({ kind: 'dust', hex: target.hex, p: { t: 0 } });
          tl.fromTo(
            dust.p,
            { t: 0.001 },
            { t: 1, duration: T.dust, ease: EASE.out, immediateRender: false },
            T.sink * 0.6,
          );
        }
        return tl;
      }

      case 'downgrade':
      case 'disabled': {
        const p = fx.add({ kind: 'idle', hex: cue.target.hex, slot: cue.target.slot, p: { t: 0 } });
        tl.to(p.p, { t: 1, duration: T.idle, ease: 'none' }, 0);
        return tl;
      }

      case 'resources': {
        const vault = (): FxAnchor => ({ kind: 'vault' });
        if (cue.sign > 0) {
          const land = this.flyTokens(tl, cue.amounts, vault, tray(cue.player), 0);
          tl.call(() => this.bump(cue.player, cue.amounts, 1), [], land);
        } else {
          this.bump(cue.player, cue.amounts, -1);
          this.flyTokens(tl, cue.amounts, tray(cue.player), vault, 0);
        }
        return tl;
      }

      default:
        return tl;
    }
  }
}
