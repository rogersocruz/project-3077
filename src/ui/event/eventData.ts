/** Dados do evento global para a interface (events.json + cor da categoria). */
import { loadGameData } from '../../data';
import { palette } from '../theme/tokens';

type Category = keyof typeof palette.event;

export function eventDef(id: string) {
  return loadGameData().events.find((e) => e.id === id) ?? null;
}

/** Cor da categoria de evento (ART_DIRECTION 2.3). */
export function eventColor(category: string): string {
  return palette.event[category as Category]?.color ?? palette.accent.orange;
}
