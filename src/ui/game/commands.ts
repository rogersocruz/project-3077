/**
 * Comandos do jogador, compartilhados por botões e atalhos (UX_SPEC 5). Leem os stores
 * na hora (getState), então funcionam fora de componentes. Toda regra vem do motor:
 * alvos por actionTargets/cardTargets, legalidade por checkAction.
 */
import { usePresentation } from '../../anim';
import {
  actionAt,
  type ActionTemplate,
  actionTargets,
  type CardTarget,
  type CardUid,
  canUndo,
  cardDefOf,
  checkAction,
  decider,
  effectOf,
  handLimit,
} from '../../engine';
import { useSceneStore } from '../../render3d/sceneStore';
import { useSettings } from '../../settings';
import { type CardFlow, flowAction, flowCheck, flowTargets, flowUse, startFlow, targetsAt } from './cardFlow';
import { perform } from './hooks';
import { isHuman, useSession } from './session';
import { NOT_ARMED, useUi } from './uiStore';

/** Pode agir agora: nada tocando, partida em curso e quem olha é quem decide (e é pessoa). */
export function canDecideNow(): boolean {
  const { busy, viewer, shown } = usePresentation.getState();
  const state = useSession.getState().state;
  return (
    !busy &&
    !!state &&
    !!shown &&
    shown.stage !== 'over' &&
    viewer !== null &&
    isHuman(viewer) &&
    decider(state) === viewer
  );
}

/** Só o jogador ativo, na fase de Ações e sem troca pendente, usa as ações do turno. */
function inActions(): boolean {
  const state = useSession.getState().state;
  return (
    !!state && state.stage === 'playing' && state.phase === 'actions' && !state.pendingTrade && !state.pending
  );
}

/** Drone/Contrato armados entram em Sondar e Construir (GDD 6.5). */
export function withArmed(template: ActionTemplate, armed = useUi.getState().armed): ActionTemplate {
  const { drone, halfCost } = armed;
  if (template.type === 'survey' && drone) return { ...template, drone };
  if (template.type === 'build') {
    return { ...template, ...(drone ? { drone } : {}), ...(halfCost ? { halfCost } : {}) };
  }
  return template;
}

/** Executa e, se a ação levou modificadores, desarma. */
function performTemplate(template: ActionTemplate, hex: string): boolean {
  const { ctx, state } = useSession.getState();
  if (!ctx || !state) return false;
  const action = actionAt(ctx, state, state.activePlayer, template, hex);
  if (!action) return false;
  const ok = perform(action);
  if (ok && (action.type === 'survey' || action.type === 'build') && (action.drone || 'halfCost' in action)) {
    useUi.getState().setArmed(NOT_ARMED);
  }
  return ok;
}

/**
 * E/R/B/U ou botão: com um hex selecionado onde a ação vale, executa nele; senão
 * entra no modo de alvo (hexes válidos destacados).
 */
export function chooseAction(base: ActionTemplate): void {
  const { ctx, state } = useSession.getState();
  const ui = useUi.getState();
  if (!ctx || !state || !canDecideNow() || !inActions()) return;
  const template = withArmed(base);
  const player = state.activePlayer;
  const selected = useSceneStore.getState().selected;
  ui.setFlow(null);
  if (selected) {
    const action = actionAt(ctx, state, player, template, selected);
    if (action && checkAction(ctx, state, action).ok) {
      ui.setMode(null);
      performTemplate(template, selected);
      return;
    }
  }
  if (actionTargets(ctx, state, player, template).length === 0) {
    ui.say(`noTargets.${template.type}`, undefined, 'warn');
    ui.setMode(null);
    return;
  }
  ui.open(null);
  ui.setMode(template);
}

/** Clique num hex: alvo da carta em uso, ou da ação escolhida. Devolve true se agiu. */
export function actOnHex(key: string): boolean {
  const { ctx, state } = useSession.getState();
  const ui = useUi.getState();
  if (ui.flow) return chooseCardHex(key);
  const mode = ui.mode;
  if (!ctx || !state || !mode || !canDecideNow()) return false;
  const action = actionAt(ctx, state, state.activePlayer, mode, key);
  if (!action || !checkAction(ctx, state, action).ok) {
    ui.setMode(null);
    return false;
  }
  ui.setMode(null);
  // Fase 7: destino com inimigo → previsão de combate antes de confirmar.
  if (action.type === 'move') {
    const dest = state.hexes[action.to];
    if (dest && (dest.guardian !== null || dest.troops.some((t) => t.owner !== action.player))) {
      ui.open({ kind: 'movePreview', action });
      return true;
    }
  }
  return performTemplate(mode, key);
}

export function openBuildPicker(): void {
  if (!canDecideNow() || !inActions()) return;
  useUi.getState().setMode(null);
  useUi.getState().setFlow(null);
  useUi.getState().open({ kind: 'buildPicker' });
}

export function openBank(): void {
  if (!canDecideNow() || !inActions()) return;
  useUi.getState().setMode(null);
  useUi.getState().open({ kind: 'bank' });
}

export function openTrade(): void {
  if (!canDecideNow() || !inActions()) return;
  useUi.getState().setMode(null);
  useUi.getState().open({ kind: 'trade', counter: false });
}

/** Tratados são da Fase 8: o atalho existe e explica por que não abre. */
export function openTreaty(): void {
  useUi.getState().refuse({ key: 'layerDisabled', params: { layer: 'treaties' } });
}

export function endPhase(): void {
  const { ctx, state } = useSession.getState();
  if (!ctx || !state || !canDecideNow() || state.stage !== 'playing' || state.pendingTrade || state.pending)
    return;
  const ui = useUi.getState();
  ui.setMode(null);
  ui.setFlow(null);
  ui.open(null);
  // GDD 6.2 fase 7: acima do limite de mão, primeiro descarta.
  const player = state.activePlayer;
  if (
    state.phase === 'delivery' &&
    (state.players[player]?.hand.length ?? 0) > handLimit(ctx, state, player)
  ) {
    ui.open({ kind: 'discard' });
    return;
  }
  if (perform({ type: 'endPhase', player })) ui.setArmed(NOT_ARMED);
}

export function undoLast(): void {
  const state = useSession.getState().state;
  if (!state || !useSettings.getState().gameplay.undo || !canDecideNow() || !canUndo(state)) return;
  if (useSession.getState().undo()) useUi.getState().say('hud.undone');
}

// ── Cartas ───────────────────────────────────────────────────────────────────

/** Clique numa carta da mão: começa o uso dela (ou explica por que não agora). */
export function selectCard(card: CardUid): void {
  const { ctx, state } = useSession.getState();
  const ui = useUi.getState();
  if (!ctx || !state || !canDecideNow() || state.pendingTrade || state.pending) return;
  if (ui.flow?.card === card) {
    ui.setFlow(null);
    return;
  }
  const flow = startFlow(ctx, state, card);
  if (!flow) {
    ui.say(state.phase === 'delivery' ? 'cards.notNowDelivery' : 'cards.notNowActions', undefined, 'warn');
    return;
  }
  ui.setMode(null);
  ui.open(null);
  ui.setFlow(flow);
}

export function updateFlow(patch: Partial<CardFlow>): void {
  const ui = useUi.getState();
  if (ui.flow) ui.setFlow({ ...ui.flow, ...patch });
}

/** Destinatário escolhido: o alvo antigo deixa de valer e a câmera vai ao tabuleiro dele. */
export function chooseRecipient(to: number): void {
  const { state } = useSession.getState();
  const ui = useUi.getState();
  if (!ui.flow || !state) return;
  // O alvo escolhido para outro destinatário deixa de valer.
  ui.setFlow({ ...ui.flow, to, target: undefined });
  const board = state.players[to]?.boardId;
  if (board !== undefined) useSceneStore.getState().requestFocus({ kind: 'board', boardId: board });
}

export function chooseCardTarget(target: CardTarget): void {
  updateFlow({ target });
}

/** Clique no mapa durante o uso de uma carta com alvo de hex/estrutura. */
function chooseCardHex(key: string): boolean {
  const { ctx, state } = useSession.getState();
  const ui = useUi.getState();
  const flow = ui.flow;
  if (!ctx || !state || !flow || !canDecideNow()) return false;
  const at = targetsAt(state, flowTargets(ctx, state, state.activePlayer, flow), key);
  const first = at[0];
  if (!first) {
    ui.refuse({ key: 'invalidTarget' });
    return false;
  }
  // O clique escolhe o alvo da carta; o inspetor do hex não abre (o registro segue à vista).
  useSceneStore.getState().select(null);
  // Mesmo alvo de novo: confirma (clique duplo no mapa).
  if (flow.target && JSON.stringify(flow.target) === JSON.stringify(first)) return confirmFlow();
  ui.setFlow({ ...flow, target: first });
  return true;
}

/** Joga/instala/entrega a carta em uso. */
export function confirmFlow(): boolean {
  const { ctx, state } = useSession.getState();
  const ui = useUi.getState();
  const flow = ui.flow;
  if (!ctx || !state || !flow || !canDecideNow()) return false;
  const action = flowAction(flow, state.activePlayer);
  if (!action) return false;
  const ok = perform(action);
  if (ok) ui.setFlow(null);
  return ok;
}

/** Drone/Contrato: arma a carta (com o pagamento escolhido) e segue para Sondar ou Construir. */
export function armFlow(next: 'survey' | 'build'): void {
  const { ctx, state } = useSession.getState();
  const ui = useUi.getState();
  const flow = ui.flow;
  if (!ctx || !state || !flow || flow.mode !== 'modifier') return;
  const check = flowCheck(ctx, state, state.activePlayer, flow);
  if (!check.ok) {
    ui.refuse(check.reason);
    return;
  }
  const kind = effectOf(cardDefOf(ctx, state, flow.card)).modifier;
  if (!kind) return;
  ui.setArmed({ ...ui.armed, [kind]: flowUse(flow) });
  ui.setFlow(null);
  if (next === 'survey') chooseAction({ type: 'survey' });
  else openBuildPicker();
}

export function disarm(): void {
  useUi.getState().setArmed(NOT_ARMED);
}

/** Esc / botão direito: fecha o que estiver aberto, um nível por vez. */
export function cancel(): boolean {
  const ui = useUi.getState();
  if (ui.zoom) {
    ui.setZoom(null);
    return true;
  }
  if (ui.modal) {
    ui.open(null);
    return true;
  }
  if (ui.flow) {
    ui.setFlow(null);
    return true;
  }
  if (ui.mode) {
    ui.setMode(null);
    return true;
  }
  if (ui.armed.drone || ui.armed.halfCost) {
    ui.setArmed(NOT_ARMED);
    return true;
  }
  if (useSceneStore.getState().selected) {
    useSceneStore.getState().select(null);
    return true;
  }
  return false;
}
