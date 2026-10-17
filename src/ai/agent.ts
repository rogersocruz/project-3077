/**
 * Agente heurístico (PROMPTS Fase 5). Só escolhe entre as ações de legal.ts: nunca
 * reimplementa regra (CLAUDE.md, regra de arquitetura 5). Três níveis:
 * - Fácil: sorteio ponderado pelo ganho de 1 passo (temperatura alta);
 * - Normal: guloso de 1 passo;
 * - Difícil: busca rasa de 2 ações dentro do turno.
 * Explorar, Sondar e Comprar são avaliados pelo valor esperado (tabela de tiles.json /
 * nível da carta), sem olhar o resultado escondido. Toda aleatoriedade vem de Rng.
 */
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import type { Action, CardUse } from '../engine/actions';
import type { EngineContext } from '../engine/context';
import { checkAction, decider, legalActions } from '../engine/legal';
import { applyAction } from '../engine/reducer';
import { getPlayer, hexKeyOf, maxLevelOf, ownedStructures } from '../engine/queries';
import { buildCost, inRange, ownBoardHexes, rarityUnlocked, upgradeCost } from '../engine/rules/build';
import { cardResourceCost } from '../engine/rules/cards';
import { drawRows, handLimit } from '../engine/rules/decks';
import { bankQuote, minBankAmount } from '../engine/rules/economy';
import { cardDefOf } from '../engine/rules/permanents';
import { eventParams, hasRuinBonus } from '../engine/rules/world';
import { previewCombat } from '../engine/rules/combat';
import { progress } from '../engine/rules/victory';
import { Rng, type Seed } from '../engine/rng';
import type { CardTarget, CardUid, GameState, PlayerId, Resources } from '../engine/state';
import {
  diminishing,
  evaluate,
  mineSiteWorth,
  projectedFocus,
  resourceDelta,
  type OpenSites,
  openSites,
  productionsLeft,
  resourcesWorth,
  siteWorth,
  tierValue,
  yieldWorth,
} from './evaluate';
import { expectations } from './expect';
import { respondTreaty, treatyProposal } from './treaties';
import { type AiFocus, type AiLevel, MINE_FOCI } from './types';
import { type AiWeights, DEFAULT_WEIGHTS } from './weights';

export interface Agent {
  readonly level: AiLevel;
  /** Rota de vitória perseguida (null = equilibrado). */
  readonly focus: AiFocus | null;
  readonly weights: AiWeights;
  readonly rng: Rng;
  /** Decisões já tomadas no turno corrente (teto de ações grátis) e proposta já feita. */
  memo: { turn: string; decisions: number; proposed: boolean; focus: AiFocus | null };
}

export function createAgent(
  level: AiLevel,
  seed: Seed,
  weights: AiWeights = DEFAULT_WEIGHTS,
  focus: AiFocus | null = null,
): Agent {
  return {
    level,
    focus,
    weights,
    rng: Rng.fromSeed(seed),
    memo: { turn: '', decisions: 0, proposed: false, focus: null },
  };
}

/** Rota que o agente persegue agora: a fixa ou, no Difícil, a escolhida neste turno. */
function focusOf(agent: Agent): AiFocus | null {
  return agent.focus ?? agent.memo.focus;
}

/** Avaliação do ponto de vista do próprio agente (com o foco dele). */
function value(ctx: EngineContext, state: GameState, player: PlayerId, agent: Agent): number {
  const investing = agent.level === 'investor' && state.round <= agent.weights.investorMineRound;
  return (
    evaluate(ctx, state, player, agent.weights, { focus: focusOf(agent), mineRoute: investing }) +
    investorBonus(state, player, agent)
  );
}

/**
 * Bot investor (experimento): até a rodada N, cada nível de Universidade (até 2) vale
 * `investorUni`; até a rodada M, ter Mina vale `investorMine`. Depois some (ele segue Normal).
 */
function investorBonus(state: GameState, player: PlayerId, agent: Agent): number {
  if (agent.level !== 'investor') return 0;
  const w = agent.weights;
  let bonus = 0;
  if (state.round <= w.investorUniRound)
    bonus += Math.min(2, maxLevelOf(state, player, 'university')) * w.investorUni;
  if (state.round <= w.investorMineRound && maxLevelOf(state, player, 'mine') > 0) bonus += w.investorMine;
  return bonus;
}

/** Avaliação com outro estoque, a partir da avaliação atual `now` (só estoque e trilhas mudam). */
function withStock(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  agent: Agent,
  now: number,
  resources: Resources,
): number {
  return now + resourceDelta(ctx, state, player, agent.weights, resources, focusOf(agent));
}

interface Scored {
  readonly action: Action;
  readonly value: number;
  /** Estado depois da ação, quando foi simulada (Difícil aprofunda a partir dele). */
  readonly after?: GameState;
}

/** Escolhe a ação de quem decide agora (`decider`). */
export function chooseAction(ctx: EngineContext, state: GameState, agent: Agent): Action {
  const player = decider(state);
  const legal = legalActions(ctx, state, player);
  const first = legal[0];
  if (!first) throw new Error(`IA: nenhuma ação legal para o jogador ${player}`);
  if (legal.length === 1) return first;

  if (state.stage === 'setup') return chooseSetup(ctx, state, player, legal, agent);
  if (state.pending?.kind === 'casualties') return legal.find((a) => a.type === 'chooseCasualties') ?? first;
  if (state.pending) return chooseTutor(ctx, state, legal);
  if (state.treaties.pending) return respondTreaty(ctx, state, player, legal, agent.weights);
  if (state.pendingTrade) return respondTrade(ctx, state, player, legal, agent);
  if (state.phase === 'draw') return chooseDraw(ctx, state, player, legal, agent);
  if (state.phase === 'delivery') return chooseDelivery(ctx, state, player, legal, agent);
  if (state.phase === 'actions') return chooseInActions(ctx, state, player, legal, agent);
  return legal.find((a) => a.type === 'endPhase') ?? first;
}

// ── Fase de Ações ────────────────────────────────────────────────────────────

const RICH: Resources = { food: 999, stone: 999, iron: 999, coal: 999, oil: 999, gold: 999 };
/** Não simulados: propostas (fluxo próprio) e tarifa (não muda a avaliação; a IA mantém a padrão). */
const TRADE_ONLY = new Set<Action['type']>([
  'proposeTrade',
  'counterTrade',
  'cancelTrade',
  'setTariff',
  // Tratados têm fluxo próprio (ai/treaties.ts); romper só acontece se a ação valer a quebra.
  'proposeTreaty',
  'breakTreaty',
  'useTreaty',
]);

function chooseInActions(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: Action[],
  agent: Agent,
): Action {
  const w = agent.weights;
  const end: Action = legal.find((a) => a.type === 'endPhase') ?? { type: 'endPhase', player };
  const memo = turnMemo(ctx, state, player, agent);
  memo.decisions++;
  if (memo.decisions > ctx.balance.turn.actionsPerTurn + w.freeActionsPerTurn) return end;

  const now = value(ctx, state, player, agent);
  const scored = scoreCandidates(ctx, state, player, legal, agent, now);

  // Proposta de troca: no máximo uma por turno, só se o outro lado provavelmente aceita.
  if (!memo.proposed && agent.level !== 'easy') {
    const proposal = bestProposal(ctx, state, player, legal, agent, now);
    if (proposal) {
      memo.proposed = true;
      return proposal.action;
    }
  }

  // Tratado: no máximo um por turno (o motor também limita), só modelos prontos.
  if (agent.level !== 'easy') {
    const treaty = treatyProposal(ctx, state, player, w);
    if (treaty) return treaty;
  }

  if (agent.level === 'easy') return sampleEasy(scored, now, end, agent);

  let best: Scored | null;
  if (agent.level === 'hard') {
    const deep = scored
      .slice(0, w.hardBranching)
      .map((s) => ({ ...s, value: deepen(ctx, s, player, agent) }));
    best = [...deep, ...scored.slice(w.hardBranching)].reduce<Scored | null>(
      (b, s) => (!b || s.value > b.value ? s : b),
      null,
    );
  } else best = scored[0] ?? null;

  return best && best.value > now + w.margin ? best.action : end;
}

/** Valor de 1 passo de cada candidato, do melhor para o pior. */
function scoreCandidates(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: readonly Action[],
  agent: Agent,
  now: number,
  buildLimit = agent.weights.buildCandidates,
): Scored[] {
  const w = agent.weights;
  const out: Scored[] = [];
  const builds: Action[] = [];
  let sites: OpenSites | null = null;
  const open = () => (sites ??= openSites(ctx, state, player));
  for (const a of legal) {
    if (a.type === 'endPhase' || TRADE_ONLY.has(a.type)) continue;
    switch (a.type) {
      case 'bankTrade': {
        const q = bankQuote(ctx, state, player, a.give, a.amount, a.receive);
        if (q.received <= 0) break;
        const res = { ...getPlayer(state, player).resources };
        res[a.give] -= a.amount;
        res[a.receive] += q.received;
        out.push({ action: a, value: withStock(ctx, state, player, agent, now, res) });
        break;
      }
      case 'explore':
        out.push({ action: a, value: now + exploreGain(ctx, state, player, a.hex, w, open()) });
        break;
      case 'survey':
        out.push({
          action: a,
          value:
            now +
            surveyGain(ctx, state, player, a.hex, agent, open()) -
            cardUseCost(ctx, state, player, a.drone, w),
        });
        break;
      case 'build':
        builds.push(a);
        break;
      case 'excavate':
        out.push({ action: a, value: now + excavateGain(ctx, state, player, a.hex, w) });
        break;
      default: {
        const after = simulate(ctx, state, a);
        if (!after) break;
        let v = value(ctx, after, player, agent);
        if (a.type === 'playCard' && cardDefOf(ctx, state, a.card).valence === 'information') v += w.infoPlay;
        // Praga: a perda vem no fim da rodada, a avaliação de agora não a vê.
        if (a.type === 'brace') v += plagueLoss(ctx, state, player);
        // Fase 7: o combate é na fase 6; a previsão diz o que o movimento vai causar.
        if (a.type === 'move') v += combatOutcome(ctx, after, player, a.to, w);
        out.push({ action: a, value: v, after });
      }
    }
  }
  // Construir: estimativa rápida para escolher quais simular.
  const quick = builds
    .map((a) => ({ a, q: a.type === 'build' ? quickBuild(ctx, state, player, a, w) : 0 }))
    .sort((x, y) => y.q - x.q)
    .slice(0, buildLimit);
  for (const { a } of quick) {
    const after = simulate(ctx, state, a);
    if (after) out.push({ action: a, value: value(ctx, after, player, agent), after });
  }
  out.push(...buyAndBuild(ctx, state, player, agent));
  return out.sort((x, y) => y.value - x.value);
}

/** Difícil: melhor valor alcançável com mais uma ação do mesmo turno. */
function deepen(ctx: EngineContext, s: Scored, player: PlayerId, agent: Agent): number {
  const after = s.after;
  // Sem estado simulado (Explorar/Sondar/Banca usam estimativa) não aprofunda: o estado
  // simulado de Explorar/Sondar revelaria o que o jogador ainda não sabe.
  if (!after || after.stage !== 'playing' || after.phase !== 'actions' || decider(after) !== player)
    return s.value;
  const legal = legalActions(ctx, after, player);
  const base = value(ctx, after, player, agent);
  const next = scoreCandidates(
    ctx,
    after,
    player,
    legal,
    agent,
    base,
    Math.ceil(agent.weights.buildCandidates / 2),
  );
  return Math.max(s.value, next[0]?.value ?? s.value);
}

function sampleEasy(scored: readonly Scored[], now: number, end: Action, agent: Agent): Action {
  const options: Scored[] = [{ action: end, value: now }, ...scored.filter((s) => s.value > now - 10)];
  const top = Math.max(...options.map((o) => o.value));
  const t = agent.weights.easyTemperature;
  return agent.rng.weightedPick(options, (o) => Math.exp((o.value - top) / t)).action;
}

/**
 * Aplica a ação numa cópia. O log não entra nas regras (só no salvamento e no desfazer),
 * então a simulação o deixa de fora: copiar o histórico inteiro a cada tentativa dominava o tempo.
 */
function simulate(ctx: EngineContext, state: GameState, action: Action): GameState | null {
  try {
    return applyAction(ctx, state.log.length ? { ...state, log: [] } : state, action).state;
  } catch {
    return null;
  }
}

function turnMemo(ctx: EngineContext, state: GameState, player: PlayerId, agent: Agent): Agent['memo'] {
  const turn = `${state.round}:${player}`;
  if (agent.memo.turn !== turn) {
    // Difícil sem foco fixo escolhe a rota mais promissora no começo de cada turno.
    const focus =
      agent.level === 'hard' && agent.focus === null
        ? projectedFocus(ctx, state, player, agent.weights.horizon)
        : null;
    agent.memo = { turn, decisions: 0, proposed: false, focus };
  }
  return agent.memo;
}

/** Ganho marginal de mais um sítio de valor `v` sobre os já abertos (pesos decrescentes). */
function marginal(open: readonly number[], v: number, slots: readonly number[]): number {
  const withNew = [...open, v].sort((x, y) => y - x);
  return diminishing(withNew, slots) - diminishing(open, slots);
}

/** Ganho esperado de revelar um hex: terreno médio do baralho de tiles. */
function exploreGain(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  hex: string,
  w: AiWeights,
  open: OpenSites,
): number {
  const h = state.hexes[hex];
  if (!h) return 0;
  const scale = productionsLeft(ctx, state, player, w.horizon) / w.horizon;
  const e = expectations(ctx);
  const near = inRange(ctx, state, player, h)
    ? e.siteChance * marginal(open.surface, e.siteIfAny, w.siteSlots) * w.site
    : 0;
  return (near + w.exploreFar) * scale;
}

/** Ganho esperado de sondar: subsolo médio, só onde ainda cabe uma Mina. */
function surveyGain(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  hex: string,
  agent: Agent,
  open: OpenSites,
): number {
  const w = agent.weights;
  const h = state.hexes[hex];
  if (!h || h.boardId !== getPlayer(state, player).boardId) return 0;
  if (h.structures.length >= ctx.balance.hex.slots || h.depleted) return 0;
  const scale = productionsLeft(ctx, state, player, w.horizon) / w.horizon;
  const unlocked = rarityUnlocked(state, player, ctx.structure('mine').rarity);
  const focus = focusOf(agent);
  const investing = agent.level === 'investor' && state.round <= w.investorMineRound;
  const route = (focus && MINE_FOCI.includes(focus)) || investing ? w.mineRouteBoost : 1;
  const e = expectations(ctx);
  return (
    e.mineChance *
    marginal(open.mine, e.mineIfAny, w.siteSlots) *
    (unlocked ? w.mineSite : w.mineSiteLocked) *
    route *
    scale
  );
}

/**
 * Escavar pelo valor esperado (Fase 6): cartas de Tesouro que não são o Guardião (a
 * proporção do baralho é pública), bônus da Ruína, menos o custo. Simular espiaria o topo.
 */
function excavateGain(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  hex: string,
  w: AiWeights,
): number {
  const h = state.hexes[hex];
  const t = h ? ctx.terrain(h.surface) : null;
  if (!h || t?.kind !== 'site') return 0;
  const pile = [...state.cards.treasure, ...state.cards.treasureDiscard];
  const guardians = pile.filter((c) => cardDefOf(ctx, state, c).effectId === 'spawnGuardian').length;
  const safe = pile.length ? 1 - guardians / pile.length : 1;
  const scale = productionsLeft(ctx, state, player, w.horizon) / w.horizon;
  const ruin = t.def.passive && !hasRuinBonus(ctx, state, player) ? w.ruinBonus * scale : 0;
  return t.def.reward.treasureDraw * safe * w.treasureCard + ruin - resourcesWorth(ctx, t.def.excavateCost);
}

/** Valor esperado do combate que o movimento provoca (previsão do motor). */
function combatOutcome(
  ctx: EngineContext,
  after: GameState,
  player: PlayerId,
  to: string,
  w: AiWeights,
): number {
  const pv = previewCombat(ctx, after, to);
  if (!pv) return 0;
  const me = pv.sides.find((s) => s.owner === player);
  if (!me) return 0;
  const enemies = pv.sides.filter((s) => s.owner !== player);
  const enemyTroops = enemies.reduce((a, s) => a + s.troops, 0);
  if (pv.winner === player) {
    // Baixas do perdedor ≈ diferença; o resto recua. Guardião derrotado libera o Templo.
    const killed = Math.min(
      enemyTroops,
      enemies.reduce((a, s) => a + (me.total - s.total), 0),
    );
    return killed * w.kill;
  }
  if (pv.winner === null) return -w.troopLoss * Math.min(...me.fighters.map((f) => f.strength));
  // Derrota: perde ao menos a diferença.
  const best = Math.max(...enemies.map((s) => s.total));
  return -Math.min(me.troops, best - me.total) * w.troopLoss;
}

/** Comida que a Praga tiraria do jogador no fim da rodada (o que a contra-ação evita). */
function plagueLoss(ctx: EngineContext, state: GameState, player: PlayerId): number {
  const p = eventParams<{ amount: number }>(ctx, state, 'loseFoodWithCounter');
  if (!p) return 0;
  return Math.min(p.amount, getPlayer(state, player).resources.food) * ctx.resourceValue('food') + 1;
}

/** Estimativa barata de Construir: renda nova − custo (para podar antes de simular). */
function quickBuild(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  a: Extract<Action, { type: 'build' }>,
  w: AiWeights,
): number {
  const h = state.hexes[a.hex];
  const def = ctx.structure(a.structure);
  const cost = resourcesWorth(ctx, def.levels[0]?.cost ?? {});
  if (!h) return -cost;
  const left = productionsLeft(ctx, state, player, w.horizon);
  let gain: number;
  if (a.structure === 'mine') gain = mineSiteWorth(ctx, h) * Math.min(left, def.tokens ?? 4);
  else if (def.subtype === 'extraction') gain = siteWorth(ctx, h) * left;
  else gain = 12; // capacidades: a avaliação completa decide
  return gain - cost - cardUseCost(ctx, state, player, a.drone ?? a.halfCost, w);
}

/** Custo de usar uma carta junto com outra ação: a carta e o pagamento dela. */
function cardUseCost(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  use: CardUse | undefined,
  w: AiWeights,
): number {
  if (!use) return 0;
  const def = cardDefOf(ctx, state, use.card);
  const pay = cardResourceCost(ctx, state, player, def, use.payment) ?? {};
  const discards = (use.discard ?? []).reduce(
    (sum, c) => sum + tierValue(w.cardTier, cardDefOf(ctx, state, c).tier),
    0,
  );
  return tierValue(w.cardTier, def.tier) + resourcesWorth(ctx, pay) + discards;
}

// ── Banca + Construir ────────────────────────────────────────────────────────

/**
 * Construção que só falta recurso: compra o que falta na banca com o que sobra (fora o
 * custo e, se possível, fora o recurso do foco). Devolve o primeiro passo (a troca) com
 * o valor do estado depois da construção. A legalidade vem de checkAction num estado
 * hipotético com estoque cheio (a IA não reimplementa regra).
 */
function buyAndBuild(ctx: EngineContext, state: GameState, player: PlayerId, agent: Agent): Scored[] {
  const w = agent.weights;
  const me = getPlayer(state, player);
  const rich: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, resources: RICH } : p)),
  };
  const plans: { build: Action; trades: Action[]; resources: Resources; q: number }[] = [];
  const hexes = ownBoardHexes(ctx, state, player).filter((k) => state.hexes[k]?.revealed);
  for (const def of ctx.data.structures) {
    if (def.buildable === false) continue;
    // O plano de banca depende só do custo: sem plano, nenhum hex serve.
    const plan = bankPlan(ctx, state, player, me.resources, buildCost(ctx, def.id), agent);
    if (!plan) continue;
    const options = hexes
      .map((hex) => {
        const build: Extract<Action, { type: 'build' }> = { type: 'build', player, structure: def.id, hex };
        return { build, q: quickBuild(ctx, state, player, build, w) - plan.loss };
      })
      .sort((a, b) => b.q - a.q);
    // O melhor hex legal com estoque cheio (e que ainda não é legal de verdade).
    for (const o of options) {
      if (!checkAction(ctx, rich, o.build).ok) continue;
      if (!checkAction(ctx, state, o.build).ok)
        plans.push({ build: o.build, trades: plan.trades, resources: plan.resources, q: o.q });
      break;
    }
  }
  // Melhorias que só esbarram no custo (ex.: Universidade 2 sem o Ouro): mesmo plano de banca.
  for (const { structure } of ownedStructures(state, player)) {
    const up: Action = { type: 'upgrade', player, uid: structure.uid };
    if (!checkAction(ctx, rich, up).ok || checkAction(ctx, state, up).ok) continue;
    const plan = bankPlan(
      ctx,
      state,
      player,
      me.resources,
      upgradeCost(ctx, state, player, structure.uid),
      agent,
    );
    if (plan) plans.push({ build: up, trades: plan.trades, resources: plan.resources, q: 10 - plan.loss });
  }
  const out: Scored[] = [];
  for (const p of plans.sort((a, b) => b.q - a.q).slice(0, w.buyBuildCandidates)) {
    const first = p.trades[0];
    if (!first || !checkAction(ctx, state, first).ok) continue;
    const hypo: GameState = {
      ...state,
      players: state.players.map((x) => (x.id === player ? { ...x, resources: p.resources } : x)),
    };
    const after = simulate(ctx, hypo, p.build);
    if (after) out.push({ action: first, value: value(ctx, after, player, agent) });
  }
  return out;
}

/** Trocas na banca que cobrem o custo; null se não houver sobra que pague. */
function bankPlan(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  have: Resources,
  cost: Partial<Resources>,
  agent: Agent,
): { trades: Action[]; resources: Resources; loss: number } | null {
  const res = { ...have };
  const trades: Action[] = [];
  let loss = 0;
  for (const need of RESOURCE_IDS) {
    const deficit = (cost[need] ?? 0) - res[need];
    if (deficit <= 0) continue;
    let best: { give: ResourceId; amount: number; got: number; penalty: number } | null = null;
    for (const give of RESOURCE_IDS) {
      if (give === need) continue;
      const spare = res[give] - (cost[give] ?? 0);
      const per = minBankAmount(ctx, state, player, give, need);
      if (per === null || spare <= 0) continue;
      // Menor quantidade que compra o déficit inteiro.
      let amount = Math.ceil(deficit * per);
      while (amount > 1 && bankQuote(ctx, state, player, give, amount - 1, need).received >= deficit)
        amount--;
      if (amount > spare) continue;
      const got = bankQuote(ctx, state, player, give, amount, need).received;
      if (got < deficit) continue;
      const penalty = amount * ctx.resourceValue(give) * (give === focusOf(agent) ? 3 : 1);
      if (!best || penalty < best.penalty) best = { give, amount, got, penalty };
    }
    if (!best) return null;
    res[best.give] -= best.amount;
    res[need] += best.got;
    loss += best.amount * ctx.resourceValue(best.give) - best.got * ctx.resourceValue(need);
    trades.push({ type: 'bankTrade', player, give: best.give, amount: best.amount, receive: need });
  }
  return trades.length ? { trades, resources: res, loss } : null;
}

// ── Comércio entre jogadores ─────────────────────────────────────────────────

function applyTradeTo(res: Resources, minus: Partial<Resources>, plus: Partial<Resources>): Resources {
  const out = { ...res };
  for (const id of RESOURCE_IDS) out[id] += (plus[id] ?? 0) - (minus[id] ?? 0);
  return out;
}

/** Proposta 1:1 que melhora o proponente e que o destinatário provavelmente aceita. */
function bestProposal(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: readonly Action[],
  agent: Agent,
  now: number,
): Scored | null {
  const w = agent.weights;
  let best: Scored | null = null;
  const mine = getPlayer(state, player).resources;
  for (const a of legal) {
    if (a.type !== 'proposeTrade') continue;
    const v = withStock(ctx, state, player, agent, now, applyTradeTo(mine, a.give, a.receive));
    if (v - now <= w.tradeMargin || (best && v <= best.value)) continue;
    if (!wouldAccept(ctx, state, a.to, a.receive, a.give, w)) continue;
    best = { action: a, value: v };
  }
  return best;
}

/** O destinatário ganha valor e não entrega uma condição de vitória ao proponente? */
function wouldAccept(
  ctx: EngineContext,
  state: GameState,
  who: PlayerId,
  gives: Partial<Resources>,
  gets: Partial<Resources>,
  w: AiWeights,
): boolean {
  const res = getPlayer(state, who).resources;
  return resourceDelta(ctx, state, who, w, applyTradeTo(res, gives, gets)) > w.tradeMargin;
}

function respondTrade(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: readonly Action[],
  agent: Agent,
): Action {
  const t = state.pendingTrade;
  const reject = legal.find((a) => a.type === 'rejectTrade') ?? { type: 'rejectTrade', player };
  if (!t || t.to !== player) return legal.find((a) => a.type === 'cancelTrade') ?? reject;
  const accept = legal.find((a) => a.type === 'acceptTrade');
  if (!accept) return reject;
  // O destinatário dá `receive` e ganha `give`.
  const res = getPlayer(state, player).resources;
  const gain = resourceDelta(
    ctx,
    state,
    player,
    agent.weights,
    applyTradeTo(res, t.receive, t.give),
    focusOf(agent),
  );
  if (gain <= agent.weights.tradeMargin) return reject;
  // Não entrega a vitória: o proponente não pode cumprir condição com a troca.
  const proposer = getPlayer(state, t.from);
  const theirs = applyTradeTo(proposer.resources, t.give, t.receive);
  const fake = {
    ...state,
    players: state.players.map((p) => (p.id === t.from ? { ...p, resources: theirs } : p)),
  };
  if (progress(ctx, fake, t.from).met.length > 0) return reject;
  return accept;
}

// ── Compra, Entrega, escolhas pontuais e setup ───────────────────────────────

function chooseDraw(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: readonly Action[],
  agent: Agent,
): Action {
  const rows = drawRows(ctx, state, player);
  const room = Math.max(0, handLimit(ctx, state, player) - getPlayer(state, player).hand.length);
  const tierOf = (deck: string) => (deck === 'n3' ? 3 : deck === 'n2' ? 2 : 1);
  const valueOf = (row: number) => {
    const cards = (rows[row] ?? []).flatMap((d) =>
      Array.from({ length: d.count }, () => tierValue(agent.weights.cardTier, tierOf(d.deck))),
    );
    // Cartas além do limite de mão serão descartadas: valem um pouco (escolha no descarte).
    return cards.sort((a, b) => b - a).reduce((sum, v, i) => sum + (i < Math.max(room, 1) ? v : v * 0.3), 0);
  };
  const options = legal.filter((a): a is Extract<Action, { type: 'chooseDraw' }> => a.type === 'chooseDraw');
  const first = options[0];
  if (!first) return legal[0] ?? { type: 'endPhase', player };
  if (agent.level === 'easy') return agent.rng.pick(options);
  return options.reduce((b, a) => (valueOf(a.row) > valueOf(b.row) ? a : b), first);
}

function chooseDelivery(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: readonly Action[],
  agent: Agent,
): Action {
  const w = agent.weights;
  const end = legal.find((a) => a.type === 'endPhase');
  const p = getPlayer(state, player);
  const excess = p.hand.length - handLimit(ctx, state, player);

  // Entrega: Sabotagem no adversário mais adiantado, no alvo que mais dói.
  let best: { action: Action; value: number } | null = null;
  for (const a of legal) {
    if (a.type !== 'deliverCard') continue;
    const def = cardDefOf(ctx, state, a.card);
    if (def.valence !== 'sabotage') continue;
    const lead = 1 + 2 * Math.max(...Object.values(progress(ctx, state, a.to).tracks));
    const pay = resourcesWorth(ctx, cardResourceCost(ctx, state, player, def, a.payment) ?? {});
    const discards = (a.discard ?? []).reduce(
      (s, c) => s + tierValue(w.cardTier, cardDefOf(ctx, state, c).tier),
      0,
    );
    const value =
      harm(ctx, state, a.to, def.effectId, a.target, w) * w.sabotage * lead -
      tierValue(w.cardTier, def.tier) -
      pay -
      discards;
    if (!best || value > best.value) best = { action: a, value };
  }
  if (best && best.value > 0 && (agent.level !== 'easy' || agent.rng.next() < 0.7)) return best.action;

  if (excess > 0) {
    // Descarta as de menor valor (nível; informação primeiro).
    const ranked = [...p.hand].sort((a, b) => keepValue(ctx, state, a, w) - keepValue(ctx, state, b, w));
    const action: Action = { type: 'discardCards', player, cards: ranked.slice(0, excess) };
    if (checkAction(ctx, state, action).ok) return action;
    const fallback = legal.find((a) => a.type === 'discardCards');
    if (fallback) return fallback;
  }
  return end ?? legal[0] ?? { type: 'endPhase', player };
}

function keepValue(ctx: EngineContext, state: GameState, card: CardUid, w: AiWeights): number {
  const def = cardDefOf(ctx, state, card);
  return tierValue(w.cardTier, def.tier) - (def.valence === 'information' ? 1 : 0);
}

/** Dano estimado de uma Sabotagem entregue, em pontos de valor. */
function harm(
  ctx: EngineContext,
  state: GameState,
  to: PlayerId,
  effectId: string,
  target: CardTarget | undefined,
  w: AiWeights,
): number {
  const left = Math.max(1, productionsLeft(ctx, state, to, w.horizon));
  switch (target?.kind) {
    case 'structure': {
      for (const hex of Object.values(state.hexes)) {
        const s = hex.structures.find((x) => x.uid === target.uid);
        if (!s) continue;
        const perTurn = Math.max(0, yieldWorth(ctx, hex, s));
        const build = resourcesWorth(ctx, ctx.structure(s.type).levels[0]?.cost ?? {});
        return effectId === 'destroyStructure' ? perTurn * left * w.income + build * s.level : perTurn;
      }
      return 0;
    }
    case 'hex': {
      const h = state.hexes[target.hex];
      if (!h) return 0;
      const around = [h, ...ctx.planet.neighbors(h).map((n) => state.hexes[hexKeyOf(n)])];
      let sum = 0;
      for (const x of around) {
        for (const s of x?.structures ?? []) {
          if (s.owner === to && x) sum += Math.max(0, yieldWorth(ctx, x, s));
        }
      }
      return sum + (h.structures.some((s) => s.type === 'mine') ? 6 : 0);
    }
    case 'permanent':
      return tierValue(w.permanentTier, cardDefOf(ctx, state, target.card).tier);
    case 'resource': {
      const have = getPlayer(state, to).resources[target.resource];
      return Math.min(2, have) * ctx.resourceValue(target.resource);
    }
    case 'player':
      return 8;
    default:
      return 4;
  }
}

function chooseTutor(ctx: EngineContext, state: GameState, legal: readonly Action[]): Action {
  const options = legal.filter(
    (a): a is Extract<Action, { type: 'resolveChoice' }> => a.type === 'resolveChoice',
  );
  const value = (c: CardUid) => {
    const def = cardDefOf(ctx, state, c);
    return (def.tier ?? 2) * 10 - (def.valence === 'information' ? 5 : 0);
  };
  const first = options[0];
  if (!first) throw new Error('IA: escolha pendente sem opções');
  return options.reduce((b, a) => (value(a.card) > value(b.card) ? a : b), first);
}

function chooseSetup(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
  legal: readonly Action[],
  agent: Agent,
): Action {
  const comps = legal.filter((a) => a.type === 'chooseCompensation');
  if (comps.length > 0) {
    let best: Scored | null = null;
    for (const a of comps) {
      const after = simulate(ctx, state, a);
      if (!after) continue;
      const v = value(ctx, after, player, agent);
      if (!best || v > best.value) best = { action: a, value: v };
    }
    if (best) return best.action;
  }
  // Vila: o hex mais central (mais hexes do próprio tabuleiro a até 2), tudo ainda oculto.
  const villages = legal.filter(
    (a): a is Extract<Action, { type: 'chooseVillage' }> => a.type === 'chooseVillage',
  );
  const board = getPlayer(state, player).boardId;
  const own = Object.values(state.hexes).filter((h) => h.boardId === board);
  const scored = villages.map((a) => {
    const h = state.hexes[a.hex];
    const near = h ? own.filter((o) => ctx.planet.distance(o, h) <= 2).length : 0;
    return { a, near };
  });
  const top = Math.max(...scored.map((s) => s.near));
  const best = scored.filter((s) => s.near === top).map((s) => s.a);
  return agent.rng.pick(best.length ? best : legal);
}

export { DEFAULT_WEIGHTS };
