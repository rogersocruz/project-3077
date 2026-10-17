/**
 * Combate determinístico (GDD 8.4; exemplo trabalhado 8.4.1 é o teste de aceite) e ataque
 * à Vila (GDD 8.5). Um combate por hex disputado na fase 6 do jogador ativo.
 *
 * Interpretações (Fase 7, isoladas aqui):
 * AV) atacante = o jogador ativo, se luta no hex; senão, o lado que chegou por último. Os
 *     outros lados defendem e recebem os modificadores de defesa;
 * AW) apoio: Artilharia do lado a ≤ supportRange, fora do hex, que ainda não apoiou neste
 *     turno, até maxArtillerySupport POR LADO (as mais fortes);
 * AX) "força removida" nas baixas = a força com que a tropa lutou (Artilharia alcançada vale a
 *     metade); a escolha do dono só é pedida quando há escolha real (tropas diferentes e nem
 *     todas saem); empate: cada lado do topo perde a mais fraca, ninguém recua nem ocupa;
 * AY) recuo: todos os sobreviventes para o mesmo vizinho sem inimigo e com espaço, preferindo
 *     o próprio tabuleiro e a menor distância à própria Vila; sem lugar, são perdidos;
 * AZ) Guardião = lado neutro (força fixa) que só defende; Horda = lado neutro atacante no
 *     evento; vencendo (ou sem tropa), a Horda causa desastre no hex (decisão do usuário).
 */
import type { EngineContext } from '../context';
import type { GameEvent } from '../events';
import { getPlayer, hexKeyOf } from '../queries';
import type { CasualtyChoice, GameState, HexKey, HexState, PlayerId, TroopState } from '../state';
import { loseVillageLives } from './hazards';
import { troopStrength } from './troops';

/** Dono dos lados neutros: Guardião (−1) e Horda (−2). */
export const NEUTRAL = -1;
export const HORDE = -2;

export interface Fighter {
  readonly uid: number;
  readonly kind: TroopState['type'] | 'guardian' | 'horde';
  readonly level: number;
  /** Força com que luta (Artilharia alcançada: metade). */
  readonly strength: number;
}

export interface Modifier {
  readonly key: string;
  readonly value: number;
}

export interface CombatSide {
  readonly owner: PlayerId;
  readonly attacker: boolean;
  readonly fighters: Fighter[];
  readonly troops: number;
  readonly support: { readonly uid: number; readonly strength: number }[];
  readonly supportTotal: number;
  /** Modificadores como aparecem (antes do teto) e o total aplicado (com o teto). */
  readonly modifiers: Modifier[];
  readonly modifierTotal: number;
  readonly total: number;
}

export interface CombatPreview {
  readonly hex: HexKey;
  readonly sides: CombatSide[];
  /** null = empate no topo. */
  readonly winner: PlayerId | null;
}

const keyOf = (h: { boardId: number; q: number; r: number }) => hexKeyOf(h);

/** Hexes com tropas de mais de um lado (inclui o Guardião). */
export function contestedHexes(state: GameState): HexKey[] {
  const out: HexKey[] = [];
  for (const [key, hex] of Object.entries(state.hexes)) {
    const owners = new Set(hex.troops.map((t) => t.owner));
    if (owners.size + (hex.guardian !== null && hex.troops.length > 0 ? 1 : 0) >= 2) out.push(key);
  }
  return out.sort();
}

interface Extra {
  readonly owner: PlayerId;
  readonly kind: 'horde';
  readonly strength: number;
  /** A Horda do evento ataca; num hex em disputa ela é só mais um lado. */
  readonly attacks?: boolean;
}

/** Monta os lados do combate no hex sem mudar o estado (previsão e resolução usam o mesmo). */
export function previewCombat(
  ctx: EngineContext,
  state: GameState,
  key: HexKey,
  opts: { readonly supportUsed?: readonly number[]; readonly extra?: Extra } = {},
): CombatPreview | null {
  const hex = state.hexes[key];
  if (!hex) return null;
  const c = ctx.balance.combat;
  const owners = [...new Set(hex.troops.map((t) => t.owner))];
  const hasLine = (owner: PlayerId) => hex.troops.some((t) => t.owner === owner && t.type === 'line');
  const neutral = hex.guardian !== null;
  const sideOwners = [...owners, ...(neutral ? [NEUTRAL] : []), ...(opts.extra ? [opts.extra.owner] : [])];
  if (sideOwners.length < 2) return null;

  // AV: atacante.
  let attacker: PlayerId;
  if (opts.extra?.attacks) attacker = opts.extra.owner;
  else if (owners.includes(state.activePlayer)) attacker = state.activePlayer;
  else {
    const latest = (o: PlayerId) =>
      Math.max(...hex.troops.filter((t) => t.owner === o).map((t) => t.arrived));
    attacker = [...owners].sort((a, b) => latest(b) - latest(a) || a - b)[0] as PlayerId;
  }

  const used = new Set(opts.supportUsed ?? []);
  const sides: CombatSide[] = sideOwners.map((owner) => {
    const isAttacker = owner === attacker;
    if (opts.extra && owner === opts.extra.owner) {
      return side(
        owner,
        isAttacker,
        [{ uid: -2, kind: 'horde', level: 1, strength: opts.extra.strength }],
        [],
        [],
      );
    }
    if (owner === NEUTRAL) {
      const s = hex.guardian ?? 0;
      return side(owner, isAttacker, [{ uid: -1, kind: 'guardian', level: 1, strength: s }], [], []);
    }
    const enemyLine = sideOwners.some((o) => o !== owner && o >= 0 && hasLine(o));
    const fighters: Fighter[] = hex.troops
      .filter((t) => t.owner === owner)
      .map((t) => {
        const base = troopStrength(ctx, state, t);
        return {
          uid: t.uid,
          kind: t.type,
          level: t.level,
          strength: t.type === 'artillery' && enemyLine ? base * c.artilleryInMeleeFactor : base,
        };
      });
    // AW: apoio de Artilharia.
    const support: { uid: number; strength: number }[] = [];
    const range = ctx.balance.troops.artillery.supportRange;
    for (const [k, h] of Object.entries(state.hexes)) {
      if (k === key || ctx.planet.distance(h, hex) > range) continue;
      for (const t of h.troops) {
        if (t.owner === owner && t.type === 'artillery' && !used.has(t.uid))
          support.push({ uid: t.uid, strength: troopStrength(ctx, state, t) });
      }
    }
    support.sort((a, b) => b.strength - a.strength || a.uid - b.uid);
    const chosen = support.slice(0, c.maxArtillerySupport);
    // Modificadores.
    const mods: Modifier[] = [];
    if (!isAttacker) {
      const m = c.modifiers;
      if (hex.boardId === getPlayer(state, owner).boardId)
        mods.push({ key: 'defenderHomeBoard', value: m.defenderHomeBoard });
      const n = fighters.length;
      if (n >= 3) mods.push({ key: 'formation3', value: m.formation3 });
      else if (n === 2) mods.push({ key: 'formation2', value: m.formation2 });
      if (hex.structures.some((s) => s.owner === owner && s.type === 'wall'))
        mods.push({ key: 'wall', value: m.wall });
      const near = [hex, ...ctx.planet.neighbors(hex).map((b) => state.hexes[keyOf(b)])];
      if (near.some((h) => h?.structures.some((s) => s.owner === owner && s.type === 'outpost')))
        mods.push({ key: 'adjacentOutpost', value: m.adjacentOutpost });
    } else if (hex.troops.some((t) => t.owner === owner && t.crossedRound === state.round)) {
      mods.push({ key: 'attackerCrossedBorder', value: c.modifiers.attackerCrossedBorder });
    }
    return side(owner, isAttacker, fighters, chosen, mods);
  });

  const max = Math.max(...sides.map((s) => s.total));
  const top = sides.filter((s) => s.total === max);
  return { hex: key, sides, winner: top.length === 1 ? (top[0]?.owner ?? null) : null };

  function side(
    owner: PlayerId,
    isAttacker: boolean,
    fighters: Fighter[],
    sup: { uid: number; strength: number }[],
    mods: Modifier[],
  ): CombatSide {
    const troops = fighters.reduce((a, f) => a + f.strength, 0);
    const supportTotal = sup.reduce((a, s) => a + s.strength, 0);
    const pos = Math.min(
      c.maxPositiveModifiers,
      mods.filter((m) => m.value > 0).reduce((a, m) => a + m.value, 0),
    );
    const neg = mods.filter((m) => m.value < 0).reduce((a, m) => a + m.value, 0);
    const modifierTotal = pos + neg;
    return {
      owner,
      attacker: isAttacker,
      fighters,
      troops,
      support: sup,
      supportTotal,
      modifiers: mods,
      modifierTotal,
      total: troops + supportTotal + modifierTotal,
    };
  }
}

/** Ordem "mais fraca primeiro" (empate: Artilharia antes, depois a mais antiga). */
export function weakestFirst(fighters: readonly Fighter[]): Fighter[] {
  const art = (f: Fighter) => (f.kind === 'artillery' ? 0 : 1);
  return [...fighters].sort((a, b) => a.strength - b.strength || art(a) - art(b) || a.uid - b.uid);
}

/** Baixas automáticas (IA/auto): as mais fracas primeiro até a força removida ≥ need. */
export function autoCasualties(fighters: readonly Fighter[], need: number): number[] {
  const order = weakestFirst(fighters);
  const out: number[] = [];
  let removed = 0;
  for (const f of order) {
    if (removed >= need) break;
    out.push(f.uid);
    removed += f.strength;
  }
  return out;
}

/** Há escolha real: nem todas saem e há tropas diferentes entre si. */
function realChoice(fighters: readonly Fighter[], auto: readonly number[]): boolean {
  if (auto.length >= fighters.length || auto.length === 0) return false;
  const kinds = new Set(fighters.map((f) => `${f.kind}:${f.strength}`));
  return kinds.size > 1;
}

/** Escolha válida: tropas do perdedor no hex, força ≥ need e mínima (tirar qualquer uma fica < need). */
export function checkCasualtyChoice(pending: CasualtyChoice, uids: readonly number[]): boolean {
  if (new Set(uids).size !== uids.length || uids.length === 0) return false;
  const opt = new Map(pending.options.map((o) => [o.uid, o.strength]));
  if (!uids.every((u) => opt.has(u))) return false;
  const total = uids.reduce((a, u) => a + (opt.get(u) ?? 0), 0);
  const all = pending.options.reduce((a, o) => a + o.strength, 0);
  if (total < Math.min(pending.need, all)) return false;
  return uids.every((u) => total - (opt.get(u) ?? 0) < pending.need);
}

// ── Aplicação ────────────────────────────────────────────────────────────────

function removeTroops(
  state: GameState,
  key: HexKey,
  owner: PlayerId,
  uids: readonly number[],
  events: GameEvent[],
) {
  const hex = state.hexes[key];
  if (!hex || uids.length === 0) return;
  if (owner === NEUTRAL) {
    hex.guardian = null;
    events.push({ type: 'guardianDefeated', hex: key });
    return;
  }
  hex.troops = hex.troops.filter((t) => !(t.owner === owner && uids.includes(t.uid)));
  events.push({ type: 'troopsLost', player: owner, hex: key, uids: [...uids] });
}

/** AY: recuo de todos os sobreviventes do lado para um mesmo vizinho. */
export function retreat(
  ctx: EngineContext,
  state: GameState,
  key: HexKey,
  owner: PlayerId,
  events: GameEvent[],
): void {
  const hex = state.hexes[key];
  if (!hex || owner < 0) return;
  const survivors = hex.troops.filter((t) => t.owner === owner);
  if (survivors.length === 0) return;
  const p = getPlayer(state, owner);
  const village = p.villageHex ? state.hexes[p.villageHex] : undefined;
  const slots = ctx.balance.hex.slots;
  const options = ctx.planet
    .neighbors(hex)
    .map((b) => ({ k: keyOf(b), h: state.hexes[keyOf(b)] as HexState | undefined }))
    .filter(
      ({ h }) =>
        !!h &&
        h.guardian === null &&
        !h.troops.some((t) => t.owner !== owner) &&
        h.structures.reduce((a, s) => a + ctx.structure(s.type).slots, 0) +
          h.troops.filter((t) => t.owner === owner).length +
          survivors.length <=
          slots,
    )
    .sort((a, b) => {
      const own = (x: HexState | undefined) => (x?.boardId === p.boardId ? 0 : 1);
      const dist = (x: HexState | undefined) => (village && x ? ctx.planet.distance(village, x) : 0);
      return own(a.h) - own(b.h) || dist(a.h) - dist(b.h) || a.k.localeCompare(b.k);
    });
  const dest = options[0];
  const uids = survivors.map((t) => t.uid);
  hex.troops = hex.troops.filter((t) => t.owner !== owner);
  if (!dest?.h) {
    events.push({ type: 'troopsLost', player: owner, hex: key, uids });
    return;
  }
  dest.h.troops.push(...survivors);
  events.push({ type: 'troopsRetreated', player: owner, from: key, to: dest.k, uids });
}

/**
 * Resolve o combate no hex. Baixas com escolha real de um jogador viram fila de escolhas
 * (pending); o resto é automático. `auto` (eventos) nunca pede escolha. Devolve o lado
 * vencedor (null = empate) ou 'pending' se alguém precisa escolher.
 */
export function resolveCombat(
  ctx: EngineContext,
  state: GameState,
  key: HexKey,
  events: GameEvent[],
  opts: { readonly extra?: Extra; readonly auto?: boolean } = {},
): PlayerId | null | 'pending' {
  const combat = (state.combat ??= { done: [], supportUsed: [] });
  const pv = previewCombat(ctx, state, key, {
    supportUsed: combat.supportUsed,
    ...(opts.extra ? { extra: opts.extra } : {}),
  });
  if (!pv) return null;
  for (const s of pv.sides) for (const sup of s.support) combat.supportUsed.push(sup.uid);
  events.push({
    type: 'combatResolved',
    hex: key,
    winner: pv.winner,
    sides: pv.sides.map((s) => ({
      owner: s.owner,
      attacker: s.attacker,
      troops: s.troops,
      support: s.supportTotal,
      modifiers: s.modifiers.map((m) => ({ ...m })),
      modifierTotal: s.modifierTotal,
      total: s.total,
    })),
  });
  const max = Math.max(...pv.sides.map((s) => s.total));
  const queue: { player: PlayerId; need: number; options: { uid: number; strength: number }[] }[] = [];
  for (const s of pv.sides) {
    if (s.owner === pv.winner) continue;
    const tiedTop = pv.winner === null && s.total === max;
    if (tiedTop) {
      // Empate: cada lado do topo perde a mais fraca; ninguém recua.
      const lose = weakestFirst(s.fighters)
        .slice(0, ctx.balance.combat.tieLossEachSide)
        .map((f) => f.uid);
      if (s.owner === opts.extra?.owner) continue;
      removeTroops(state, key, s.owner, lose, events);
      continue;
    }
    const need = max - s.total;
    if (s.owner === opts.extra?.owner) continue; // Horda perdeu: some (não fica no mapa).
    const auto = autoCasualties(s.fighters, need);
    if (!opts.auto && s.owner >= 0 && realChoice(s.fighters, auto)) {
      queue.push({
        player: s.owner,
        need,
        options: s.fighters.map((f) => ({ uid: f.uid, strength: f.strength })),
      });
      continue;
    }
    if (s.owner === NEUTRAL) removeTroops(state, key, NEUTRAL, [-1], events);
    else {
      removeTroops(state, key, s.owner, auto, events);
      retreat(ctx, state, key, s.owner, events);
    }
  }
  if (queue.length) {
    combat.queue = queue.map((q) => ({ ...q, hex: key }));
    nextCasualtyChoice(state, events);
    return 'pending';
  }
  return pv.winner;
}

/** Abre a próxima escolha de baixas da fila (ou fecha). */
export function nextCasualtyChoice(state: GameState, events: GameEvent[]): void {
  const next = state.combat?.queue?.[0];
  if (!next) {
    state.pending = null;
    return;
  }
  state.pending = {
    kind: 'casualties',
    player: next.player,
    hex: next.hex,
    need: next.need,
    options: next.options,
  };
  events.push({ type: 'casualtiesPending', player: next.player, hex: next.hex, need: next.need });
}

/** Aplica a escolha de baixas pendente, recua os sobreviventes e passa para a próxima. */
export function applyCasualtyChoice(
  ctx: EngineContext,
  state: GameState,
  uids: readonly number[],
  events: GameEvent[],
): void {
  const pending = state.pending;
  if (!pending || pending.kind !== 'casualties') return;
  removeTroops(state, pending.hex, pending.player, uids, events);
  retreat(ctx, state, pending.hex, pending.player, events);
  state.combat?.queue?.shift();
  nextCasualtyChoice(state, events);
}

/**
 * GDD 6.2 fase 6: resolve todo hex disputado. Para (false) quando alguém precisa escolher
 * baixas; chamar de novo continua de onde parou.
 */
export function runCombatPhase(ctx: EngineContext, state: GameState, events: GameEvent[]): boolean {
  const combat = (state.combat ??= { done: [], supportUsed: [] });
  if (state.pending) return false;
  for (const key of contestedHexes(state)) {
    if (combat.done.includes(key)) continue;
    combat.done.push(key);
    if (resolveCombat(ctx, state, key, events) === 'pending') return false;
  }
  state.combat = null;
  return true;
}

/** GDD 8.5: tropa na Vila inimiga sem defensor vivo no fim da rodada tira vida (1×/rodada). */
export function villageAttacks(ctx: EngineContext, state: GameState, events: GameEvent[]): void {
  if (!state.layers.conflict) return;
  for (const p of state.players) {
    if (p.eliminated || !p.villageHex) continue;
    const hex = state.hexes[p.villageHex];
    if (!hex) continue;
    const attackers = hex.troops.filter((t) => t.owner !== p.id);
    if (attackers.length === 0 || hex.troops.some((t) => t.owner === p.id)) continue;
    events.push({ type: 'villageAttacked', player: p.id, by: [...new Set(attackers.map((t) => t.owner))] });
    loseVillageLives(state, p.id, ctx.balance.combat.villageDamagePerRound, events);
  }
}

/** GDD 8.5: hex ocupado por Linha de outro jogador (sem tropa do dono da estrutura). */
export function occupiedAgainst(hex: HexState, owner: PlayerId): boolean {
  return (
    hex.troops.some((t) => t.owner !== owner && t.type === 'line') &&
    !hex.troops.some((t) => t.owner === owner)
  );
}
