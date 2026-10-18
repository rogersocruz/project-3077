/** Legendas dos sons (UX_SPEC 3.5): fila curta lida pela faixa de legendas da interface. */
import { create } from 'zustand';
import type { SoundId } from './sounds';

export interface Caption {
  readonly id: number;
  readonly sound: SoundId;
}

interface CaptionStore {
  items: readonly Caption[];
  push(sound: SoundId): void;
  drop(id: number): void;
}

let next = 1;

export const useCaptions = create<CaptionStore>()((set) => ({
  items: [],
  push: (sound) => set((s) => ({ items: [...s.items.slice(-3), { id: next++, sound }] })),
  drop: (id) => set((s) => ({ items: s.items.filter((c) => c.id !== id) })),
}));
