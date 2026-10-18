/** Abrir saves a partir de qualquer tela (menu, pausa). */
import { readSave, type SlotId } from '../../save';
import { useNav } from '../nav';

/** Abre a partida salva no espaço (troca para a tela de partida com `load=`). */
export function openSave(slot: SlotId): void {
  useNav.getState().go('game', { load: String(slot) });
}

/** Há save automático? (botão Continuar do menu). */
export const hasAutosave = (): boolean => readSave('auto') !== null;
