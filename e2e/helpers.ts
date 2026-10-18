/**
 * Ajuda dos testes de partida (Fase 4). Cliques nos hexes são cliques de verdade no
 * canvas; o gancho `__p3077` (só no servidor de desenvolvimento) diz onde o hex está,
 * expõe o estado e as ações legais, e permite montar cenários (`load`).
 */
import { expect, type Page } from '@playwright/test';

export interface CardsState {
  round: number;
  stage: string;
  phase: string;
  activePlayer: number;
  actionsLeft: number;
  nextUid: number;
  pending: unknown;
  cards: { defs: string[]; decks: Record<string, number[]>; discards: Record<string, number[]> };
  players: {
    hand: number[];
    permanents: (number | null)[];
    incoming: unknown[];
    resources: Record<string, number>;
  }[];
  hexes: Record<
    string,
    {
      revealed: boolean;
      surveyedBy: number[];
      structures: { uid: number; type: string; level: number; owner: number }[];
    }
  >;
}

export interface Hook {
  hexToScreen(key: string): { x: number; y: number } | null;
  targets(): string[];
  busy(): boolean;
  legal(): ({ type: string } & Record<string, unknown>)[];
  state(): CardsState;
  perform(action: unknown): boolean;
  load(state: CardsState): void;
}
export type HookWindow = { __p3077: Hook };

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  return errors;
}

export async function openGame(page: Page, query: string) {
  await page.goto(`/?view=game&adaptive=0&${query}`);
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
}

/** Fila de animação vazia, ou parada na tela de privacidade / relatório / pausa entre fases. */
export async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      !(window as unknown as HookWindow).__p3077.busy() ||
      !!document.querySelector('[data-testid=privacy]') ||
      !!document.querySelector('[data-testid=phase-hold]') ||
      !!document.querySelector('[data-testid=intel]'),
    null,
    { timeout: 60_000 },
  );
}

export async function ready(page: Page) {
  await page.getByTestId('privacy-ready').click();
  await settle(page);
}

export const game = (page: Page) => page.evaluate(() => (window as unknown as HookWindow).__p3077.state());

export async function settledShot(page: Page, path: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path });
}

/** Posição do hex na tela depois que a câmera parou. */
export async function hexPos(page: Page, key: string) {
  let last: { x: number; y: number } | null = null;
  for (let i = 0; i < 60; i++) {
    const p = await page.evaluate((k) => (window as unknown as HookWindow).__p3077.hexToScreen(k), key);
    if (p && last && Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return p;
    last = p;
    await page.waitForTimeout(100);
  }
  if (!last) throw new Error(`hex ${key} fora da tela`);
  return last;
}

export async function clickHex(page: Page, key: string) {
  const p = await hexPos(page, key);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

export async function foundVillages(page: Page, players: number, privacy: boolean) {
  for (let p = 0; p < players; p++) {
    if (privacy) {
      await expect(page.getByTestId('privacy')).toContainText('Vez de');
      await ready(page);
    }
    await expect
      .poll(() => page.evaluate(() => (window as unknown as HookWindow).__p3077.targets().length))
      .toBeGreaterThan(0);
    // Sob carga a câmera pode ainda estar assentando: confere no inspetor que o hex certo
    // foi selecionado antes de fundar (e clica de novo se não foi).
    for (let attempt = 0; attempt < 4; attempt++) {
      await clickHex(page, `${p}:0,0`);
      const label = page.getByTestId('inspector');
      if ((await label.textContent())?.includes(`T${p + 1} (0, 0)`)) break;
      await page.waitForTimeout(300);
    }
    await expect(page.getByTestId('inspector')).toContainText(`T${p + 1} (0, 0)`);
    await page.getByTestId('act-village').click();
    await settle(page);
  }
}

/** Edita o estado da partida (cenário de teste) e mostra sem animar. */
export async function loadState(page: Page, edit: (s: CardsState) => void) {
  const s = await game(page);
  edit(s);
  await page.evaluate((next) => (window as unknown as HookWindow).__p3077.load(next), s);
  await page.waitForTimeout(150);
}

/** Tira do baralho/descarte uma cópia de `id` e põe na mão do jogador (cenário). */
export function giveCard(s: CardsState, player: number, id: string): number {
  for (const pile of [...Object.values(s.cards.decks), ...Object.values(s.cards.discards)]) {
    const i = pile.findIndex((u) => s.cards.defs[u] === id);
    if (i < 0) continue;
    const [uid] = pile.splice(i, 1);
    if (uid === undefined) break;
    s.players[player]?.hand.push(uid);
    return uid;
  }
  throw new Error(`carta ${id} fora dos baralhos`);
}

/** Carta da mão pelo id (há cópias: a primeira). */
export const handCard = (page: Page, id: string) => page.locator(`[data-card-id="${id}"]`).first();
