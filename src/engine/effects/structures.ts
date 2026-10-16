/**
 * Efeitos em estruturas e hexes: Sobrecarga, Pane Induzida, Bomba de Íons,
 * Terraformação, Colapso de Galeria, Demolição/Ataque Orbital, Pesquisa Avançada.
 */
import { z } from 'zod';
import { amountTotal, findStructure, hexKeyOf } from '../queries';
import { checkUpgrade, raiseLevel } from '../rules/build';
import { destroyStructure, downgradeStructure, isIndestructible } from '../rules/damage';
import { automationBonus, produceOnce, productionBlocked, structureYield } from '../rules/economy';
import {
  checkSubjectHex,
  checkSubjectStructure,
  subjectBoardHexes,
  subjectStructureTargets,
} from './targets';
import { defineEffect, type EffectScope, subjectOf } from './types';

const Count = z.number().int().positive();

const isExtraction = (s: EffectScope, type: string) => s.ctx.structure(type).subtype === 'extraction';

const hexTargets = (s: EffectScope) => subjectBoardHexes(s).map((hex) => ({ kind: 'hex' as const, hex }));

/**
 * Sobrecarga (interpretação Z): jogada depois da Produção, a estrutura de extração produz
 * de novo agora, com as mesmas regras (Mina gasta token), e fica inativa na próxima
 * Produção do dono.
 */
export const overload = defineEffect({
  params: z.strictObject({ extraProductions: Count }),
  target: 'structure',
  candidates: subjectStructureTargets,
  check: (s, _p, t) => {
    const reason = checkSubjectStructure(s, t.uid);
    if (reason) return reason;
    const where = findStructure(s.state, t.uid);
    if (!where || !isExtraction(s, where.structure.type)) return { key: 'notExtraction' };
    if (where.structure.overloaded) return { key: 'alreadyOverloaded' };
    if (productionBlocked(s.state, where.hex, where.structure)) return { key: 'nothingToProduce' };
    return amountTotal(structureYield(s.ctx, where.hex, where.structure)) > 0
      ? null
      : { key: 'nothingToProduce' };
  },
  apply: (s, p, t) => {
    const player = subjectOf(s);
    const automation = automationBonus(s.ctx, s.state, player);
    for (let i = 0; i < p.extraProductions; i++) {
      const where = findStructure(s.state, t.uid);
      if (!where) return; // Mina esgotou
      produceOnce(s.ctx, s.state, player, where, automation, s.events);
    }
    const where = findStructure(s.state, t.uid);
    if (!where) return;
    where.structure.overloaded = true;
    s.events.push({ type: 'structureDisabled', player, hex: where.key, uid: t.uid, until: 'nextProduction' });
  },
});

/** Pane Induzida: a estrutura de extração do destinatário não produz neste turno. */
export const structureNoProduce = defineEffect({
  params: z.strictObject({}),
  target: 'structure',
  candidates: subjectStructureTargets,
  check: (s, _p, t) => {
    const reason = checkSubjectStructure(s, t.uid);
    if (reason) return reason;
    const where = findStructure(s.state, t.uid);
    return where && isExtraction(s, where.structure.type) ? null : { key: 'notExtraction' };
  },
  apply: (s, _p, t) => {
    const where = findStructure(s.state, t.uid);
    if (!where) return;
    where.structure.noProduceRound = s.state.round;
    s.events.push({
      type: 'structureDisabled',
      player: where.structure.owner,
      hex: where.key,
      uid: t.uid,
      until: 'thisTurn',
    });
  },
});

/**
 * Bomba de Íons (interpretação AB): estruturas que consomem Carvão (manutenção em
 * Carvão), de qualquer dono, no hex e vizinhos ficam desligadas até o fim da rodada.
 */
export const ionPulse = defineEffect({
  params: z.strictObject({ radius: z.number().int().nonnegative() }),
  target: 'hex',
  candidates: hexTargets,
  check: (s, _p, t) => checkSubjectHex(s, t.hex),
  apply: (s, p, t) => {
    const center = s.state.hexes[t.hex];
    if (!center) return;
    for (const h of s.ctx.planet.hexes) {
      if (s.ctx.planet.distance(center, h) > p.radius) continue;
      const key = hexKeyOf(h);
      for (const st of s.state.hexes[key]?.structures ?? []) {
        if ((s.ctx.structure(st.type).upkeep?.coal ?? 0) <= 0) continue;
        st.offlineRound = s.state.round;
        s.events.push({
          type: 'structureDisabled',
          player: st.owner,
          hex: key,
          uid: st.uid,
          until: 'thisRound',
        });
      }
    }
  },
});

/** Terraformação (interpretação AC): o hex passa a render +N em cada recurso que produz. */
export const hexYieldBonus = defineEffect({
  params: z.strictObject({ amount: Count }),
  target: 'hex',
  candidates: hexTargets,
  check: (s, _p, t) => {
    const reason = checkSubjectHex(s, t.hex);
    if (reason) return reason;
    const hex = s.state.hexes[t.hex];
    if (!hex?.revealed) return { key: 'hexHidden' };
    const terrain = s.ctx.terrain(hex.surface);
    return terrain.kind === 'surface' && terrain.def.produces.length > 0 ? null : { key: 'noYield' };
  },
  apply: (s, p, t) => {
    const hex = s.state.hexes[t.hex];
    if (!hex) return;
    hex.yieldBonus += p.amount;
    s.events.push({ type: 'hexYieldBoosted', hex: t.hex, player: subjectOf(s), bonus: hex.yieldBonus });
  },
});

/** Colapso de Galeria (interpretação AA): sela o subsolo; o dono limpa gastando ações. */
export const sealSubsoil = defineEffect({
  params: z.strictObject({ clearActions: Count }),
  target: 'hex',
  candidates: hexTargets,
  check: (s, _p, t) =>
    checkSubjectHex(s, t.hex) ?? (s.state.hexes[t.hex]?.seal ? { key: 'alreadySealed' } : null),
  apply: (s, p, t) => {
    const hex = s.state.hexes[t.hex];
    if (!hex) return;
    hex.seal = { clearActions: p.clearActions };
    s.events.push({ type: 'subsoilSealed', hex: t.hex, by: s.player });
  },
});

/**
 * Demolição / Ataque Orbital. Nunca a Vila. Interpretação S: Muro ou Posto no hex do
 * alvo (nessa ordem, `absorbedBy`) absorve o golpe e sofre o downgrade no lugar do alvo;
 * sem absorvedor, o alvo é destruído. Ataque Orbital não tem absorvedores.
 */
export const destroyTargetStructure = defineEffect({
  params: z.strictObject({ absorbedBy: z.array(z.string()) }),
  target: 'structure',
  candidates: subjectStructureTargets,
  check: (s, _p, t) => {
    const reason = checkSubjectStructure(s, t.uid);
    if (reason) return reason;
    const where = findStructure(s.state, t.uid);
    return where && isIndestructible(s.ctx, where.structure.type) ? { key: 'indestructible' } : null;
  },
  apply: (s, p, t) => {
    const where = findStructure(s.state, t.uid);
    if (!where) return;
    for (const type of p.absorbedBy) {
      const absorber = where.hex.structures.find((st) => st.type === type);
      if (absorber) {
        downgradeStructure(s.state, absorber.uid, s.events);
        return;
      }
    }
    destroyStructure(s.state, t.uid, s.events);
  },
});

/** Pesquisa Avançada: sobe níveis sem pagar; a Oficina continua exigida (interpretação AD). */
export const freeUpgrade = defineEffect({
  params: z.strictObject({ levels: Count }),
  target: 'structure',
  candidates: subjectStructureTargets,
  check: (s, _p, t) =>
    checkSubjectStructure(s, t.uid) ?? checkUpgrade(s.ctx, s.state, subjectOf(s), t.uid, true),
  apply: (s, p, t) => {
    for (let i = 0; i < p.levels; i++) {
      if (checkUpgrade(s.ctx, s.state, subjectOf(s), t.uid, true)) return;
      raiseLevel(s.ctx, s.state, t.uid, s.events);
    }
  },
});
