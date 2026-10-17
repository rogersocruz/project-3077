/**
 * Navegação mínima por query string (`?view=…`) até existirem os menus da Fase 10.
 * Trocar de tela não recarrega a página; voltar/avançar do navegador funcionam.
 */
import { create } from 'zustand';

export type View = 'home' | 'table' | 'newGame' | 'game' | 'cards' | 'lab' | 'credits';

const VIEWS: readonly View[] = ['home', 'table', 'newGame', 'game', 'cards', 'lab', 'credits'];

function viewOf(search: string): View {
  const v = new URLSearchParams(search).get('view');
  return (VIEWS as readonly string[]).includes(v ?? '') ? (v as View) : 'home';
}

interface NavStore {
  view: View;
  search: string;
  go(view: View, params?: Record<string, string | number | boolean>): void;
}

export const useNav = create<NavStore>()((set) => ({
  view: viewOf(window.location.search),
  search: window.location.search,
  go: (view, params = {}) => {
    const q = new URLSearchParams();
    if (view !== 'home') q.set('view', view);
    for (const [k, v] of Object.entries(params))
      q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    const search = q.size ? `?${q.toString()}` : '';
    window.history.pushState(null, '', `${window.location.pathname}${search}`);
    set({ view, search });
  },
}));

window.addEventListener('popstate', () =>
  useNav.setState({ view: viewOf(window.location.search), search: window.location.search }),
);
