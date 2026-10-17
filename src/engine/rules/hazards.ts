/**
 * Hexes especiais e desastres (GDD 4.3, 4.4): consultas de hazard, marcas com prazo,
 * desastre, perda de vida da Vila e eliminação (GDD 13.2, D11 "sai da partida").
 *
 * Interpretação AL (decisão do usuário): o bônus de um hazard vale para quem tem
 * estrutura NELE (Geiser: Minas adjacentes de qualquer dono). Anomalia protege qualquer um.
 */
import type { EngineContext, HazardDef } from '../context';
import type { GameEvent } from '../events';
import type { BoardHex } from '../hex';
import { getPlayer, hexKeyOf } from '../queries';
import type { GameState, HexKey, HexState, HexStatus, PlayerId } from '../state';
import { destroyStructure, downgradeStructure, isIndestructible } from './damage';
import { hasPermanent } from './permanents';

/** Definição do hazard no hex (null se não for hazard). */
export function hazardAt(ctx: EngineContext, hex: HexState | undefined): HazardDef | null {
  if (!hex) return null;
  const t = ctx.terrain(hex.surface);
  return t.kind === 'hazard' ? t.def : null;
}

/** "Vale até a rodada N": ativo enquanto a rodada corrente ≤ N. */
export const until = (state: GameState, round: number | undefined): boolean =>
  round !== undefined && state.round <= round;

/** Bônus do hazard ligado agora (sem seca, porto fechado, contaminação, inversão). */
export function hazardBonusActive(state: GameState, hex: HexState): boolean {
  const s = hex.status;
  return (
    !until(state, s.dryUntil) &&
    !until(state, s.closedUntil) &&
    !until(state, s.amplifiedUntil) &&
    !until(state, s.sealedUntil) &&
    !s.contaminated
  );
}

/** Hexes do planeta com o hazard cujo bônus tem `effectId` e está ligado. */
export function activeHazardHexes(
  ctx: EngineContext,
  state: GameState,
  bonusEffectId: string,
): { key: HexKey; hex: HexState; def: HazardDef }[] {
  const out: { key: HexKey; hex: HexState; def: HazardDef }[] = [];
  for (const [key, hex] of Object.entries(state.hexes)) {
    const def = hazardAt(ctx, hex);
    if (def && def.bonus.effectId === bonusEffectId && hazardBonusActive(state, hex))
      out.push({ key, hex, def });
  }
  return out;
}

/** O jogador tem estrutura no hex (é "dono" do bônus — interpretação AL). */
export const hasStructureOn = (hex: HexState, player: PlayerId): boolean =>
  hex.structures.some((s) => s.owner === player);

/** Hexes a até `radius` do centro (inclusive), atravessando tabuleiros. */
export function hexesAround(
  ctx: EngineContext,
  state: GameState,
  center: HexState,
  radius: number,
): HexKey[] {
  const c: BoardHex = { boardId: center.boardId, q: center.q, r: center.r };
  return ctx.planet.hexes
    .filter((h) => ctx.planet.distance(c, h) <= radius)
    .map(hexKeyOf)
    .filter((k) => !!state.hexes[k]);
}

/** Marca com prazo (idempotente: fica o prazo maior). */
export function markUntil(
  state: GameState,
  key: HexKey,
  field: Exclude<keyof HexStatus, 'contaminated'>,
  rounds: number,
  events: GameEvent[],
): void {
  const hex = state.hexes[key];
  if (!hex) return;
  const last = state.round + rounds - 1;
  hex.status[field] = Math.max(hex.status[field] ?? 0, last);
  events.push({ type: 'hexStatus', hex: key, status: field, until: hex.status[field] ?? last });
}

// ── Desastre (GDD 4.4) ───────────────────────────────────────────────────────

/**
 * Desastre no hex + raio (tiles.json → disaster.radius). Cada estrutura cai 1 nível;
 * nível 1 é destruída (Blindagem Sísmica: só downgrade, interpretação AM). A Vila não é
 * destruída: perde vidas. Permanentes não são afetados.
 */
export function disaster(
  ctx: EngineContext,
  state: GameState,
  center: HexKey,
  events: GameEvent[],
  radius: number = ctx.data.tiles.disaster.radius,
): void {
  const hex = state.hexes[center];
  if (!hex) return;
  const rule = ctx.data.tiles.disaster;
  events.push({ type: 'disaster', hex: center, radius });
  for (const key of hexesAround(ctx, state, hex, radius)) {
    const h = state.hexes[key];
    if (!h) continue;
    for (const s of [...h.structures]) {
      if (s.type === 'village' || (rule.villageImmune && isIndestructible(ctx, s.type))) {
        if (s.type === 'village') loseVillageLives(state, s.owner, rule.villageLoseLives, events);
        continue;
      }
      const shielded = hasPermanent(ctx, state, s.owner, 'disasterResist');
      for (let i = 0; i < rule.downgradeLevels; i++) {
        const cur = h.structures.find((x) => x.uid === s.uid);
        if (!cur) break;
        if (cur.level > 1) downgradeStructure(state, cur.uid, events);
        else if (rule.destroyLevel1 && !shielded) destroyStructure(state, cur.uid, events);
      }
    }
  }
}

/** GDD 13.2: a Vila perde vidas; com 0, o jogador sai da partida (D11). */
export function loseVillageLives(
  state: GameState,
  player: PlayerId,
  n: number,
  events: GameEvent[],
  by: readonly PlayerId[] = [],
): void {
  const p = getPlayer(state, player);
  if (p.eliminated || n <= 0) return;
  p.villageLives = Math.max(0, p.villageLives - n);
  // GDD 13.1 Alvo de tribo: "por mão própria" = quem deu o último dano (vazio = desastre).
  p.lastHitBy = [...by];
  events.push({ type: 'villageDamaged', player, lives: p.villageLives });
  if (p.villageLives === 0) eliminate(state, player, events);
}

export function eliminate(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = getPlayer(state, player);
  if (p.eliminated) return;
  p.eliminated = true;
  // D11 (opção do setup): "facção neutra" segue jogando pela IA, sem poder vencer.
  if (state.eliminatedRule === 'neutral') p.neutral = true;
  // Propostas e entregas pendentes com ele deixam de valer.
  if (state.pendingTrade && (state.pendingTrade.from === player || state.pendingTrade.to === player)) {
    state.pendingTrade = null;
  }
  events.push({ type: 'playerEliminated', player });
}

/** Jogadores ainda na partida. */
export const alivePlayers = (state: GameState): PlayerId[] =>
  state.players.filter((p) => !p.eliminated).map((p) => p.id);

// ── Defesa contra ataque de horda (simplificação até a Fase 7 — interpretação AK) ──

/** Muro no hex + Postos adjacentes com defesa (structures.json → defense / defenseAdjacent). */
export function hexDefense(ctx: EngineContext, state: GameState, key: HexKey): number {
  const hex = state.hexes[key];
  if (!hex) return 0;
  let total = 0;
  for (const s of hex.structures) total += ctx.structure(s.type).levels[s.level - 1]?.defense ?? 0;
  for (const n of hexesAround(ctx, state, hex, 1)) {
    if (n === key) continue;
    for (const s of state.hexes[n]?.structures ?? []) {
      total += ctx.structure(s.type).levels[s.level - 1]?.defenseAdjacent ?? 0;
    }
  }
  return total;
}
