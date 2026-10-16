/** Faces de todas as cartas dos dados (cards.json + modelos de tratado), por id. */
import { loadGameData } from '../../data';
import { type CardFace, faceOfCard, faceOfTreaty, versionTag } from './model';

let byId: Map<string, CardFace> | null = null;

function index(): Map<string, CardFace> {
  if (byId) return byId;
  const data = loadGameData();
  byId = new Map<string, CardFace>();
  for (const def of data.cards) byId.set(def.id, faceOfCard(def));
  for (const tpl of data.treaties.templates) byId.set(tpl.id, faceOfTreaty(tpl, data));
  return byId;
}

export function cardFace(id: string): CardFace {
  const face = index().get(id);
  if (!face) throw new Error(`carta desconhecida: ${id}`);
  return face;
}

export function allCardFaces(): CardFace[] {
  return [...index().values()];
}

/** Etiqueta de versão das cartas, da versão das regras (balance.json). */
export function cardVersion(): string {
  return versionTag(loadGameData().balance._meta.rulesVersion);
}
