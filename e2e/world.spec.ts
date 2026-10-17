/**
 * Fase 6 — o planeta reage. Cinemática do evento da rodada (UX_SPEC 2.14), carta no topo
 * do HUD com zoom, Escavar pelo inspetor, contra-ação, desastre animado e partida só de
 * IA com todas as camadas até o fim. Capturas em screenshots/phase6-*.
 */
import { expect, type Page, test } from '@playwright/test';
import {
  clickHex,
  game,
  type HookWindow,
  loadState,
  openGame,
  settle,
  settledShot,
  watchErrors,
} from './helpers';

type Hex = { surface: string; revealed: boolean; status: Record<string, number>; guardian: number | null };
type WorldState = {
  world: { deck: string[]; current: string | null; braced: number[] };
  hexes: Record<string, Hex & { structures: { uid: number; type: string; level: number; owner: number }[] }>;
  players: { resources: Record<string, number>; compensation: string; villageHex: string | null }[];
  nextUid: number;
  stage: string;
  round: number;
  activePlayer: number;
  phase: string;
};

const hook = (page: Page) => page.evaluate(() => (window as unknown as HookWindow).__p3077.state());

/** Setup pelo mesmo caminho da interface: compensação (se pedir) e Vila no centro. */
async function setupAll(page: Page, players: number) {
  for (let i = 0; i < players * 2 + 2; i++) {
    const s = (await hook(page)) as unknown as WorldState;
    if (s.stage !== 'setup') break;
    if (await page.getByTestId('compensation-choice').isVisible()) {
      await page.getByTestId('comp-gold').click();
    } else {
      await page.evaluate(() => {
        const h = (window as unknown as HookWindow).__p3077;
        const st = h.state() as unknown as WorldState;
        const p = st.activePlayer;
        const v = h.legal().find((a) => a.type === 'chooseVillage' && a['hex'] === `${p}:0,0`);
        h.perform(v ?? h.legal().find((a) => a.type === 'chooseVillage'));
      });
    }
    await settle(page);
  }
}

test('cinemática do evento, carta no topo, zoom e contra-ação', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=21&events=1&special=1&privacy=0&speed=1');
  // Início da rodada 1: a carta do evento vem ao centro na cor da categoria. A espera é
  // registrada antes: o setup só volta quando a fila de animação (com a cinemática) acaba.
  const seen = page.waitForSelector('[data-testid=event-reveal]', { timeout: 60_000 }).then(async () => {
    await page.waitForTimeout(450);
    await page.screenshot({ path: 'screenshots/phase6-event-reveal.png' });
  });
  await setupAll(page, 3);
  await seen;
  await expect(page.getByTestId('event-reveal')).toBeHidden({ timeout: 10_000 });
  await settle(page);
  await expect(page.getByTestId('event-chip')).toBeVisible();
  await expect(page.getByTestId('log')).toContainText('Evento da rodada');
  await page.getByTestId('event-chip').click();
  await expect(page.getByTestId('event-card')).toBeVisible();
  await settledShot(page, 'screenshots/phase6-event-zoom.png');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('event-card')).toBeHidden();

  // Praga como evento da rodada: o botão de contra-ação aparece e protege.
  await loadState(page, (s) => {
    (s as unknown as WorldState).world.current = 'ev_plague';
    (s as unknown as WorldState).world.braced = [];
  });
  await expect(page.getByTestId('brace')).toBeEnabled();
  await page.getByTestId('brace').click();
  await settle(page);
  expect(((await hook(page)) as unknown as WorldState).world.braced).toContain(0);
  await expect(page.getByTestId('log')).toContainText('se protegeu');
  await settledShot(page, 'screenshots/phase6-hud-1920.png');
  expect(errors).toEqual([]);
});

test('Escavar Templo pelo inspetor: tesouro na mão e o Templo vira Vazio', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=21&events=1&special=1&privacy=0&speed=instant');
  await setupAll(page, 3);
  await settle(page);
  const target = '0:1,0';
  await loadState(page, (st) => {
    const s = st as unknown as WorldState & {
      cards: { treasure: number[]; defs: string[] };
    };
    const h = s.hexes[target];
    if (h) {
      h.surface = 'temple';
      h.revealed = true;
      h.guardian = null;
      h.structures = [];
    }
    s.players[0]!.resources['stone'] = 5;
    // Sem Guardião no topo (o teste é da escavação; o Guardião tem teste no motor).
    s.cards.treasure = s.cards.treasure.filter((c) => s.cards.defs[c] !== 'guardian_awakened');
  });
  const hand = ((await game(page)).players[0]?.hand.length ?? 0) as number;
  await clickHex(page, target);
  await expect(page.getByTestId('inspector')).toContainText('Escavar');
  await settledShot(page, 'screenshots/phase6-inspector-temple.png');
  await page
    .getByTestId('inspector')
    .getByRole('button', { name: /Escavar/ })
    .click();
  await settle(page);
  const after = (await hook(page)) as unknown as WorldState;
  expect(after.hexes[target]?.surface).toBe('empty');
  expect((await game(page)).players[0]?.hand.length).toBe(hand + 2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('log')).toContainText('escavou');
  expect(errors).toEqual([]);
});

test('desastre animado: Tremor de Terra derruba a Pedreira na Montanha (0,5×)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=21&events=1&special=1&privacy=0&speed=0.5');
  await setupAll(page, 3);
  await settle(page);
  await loadState(page, (st) => {
    const s = st as unknown as WorldState;
    const h = s.hexes['0:1,0'];
    if (h) {
      h.surface = 'mountain';
      h.revealed = true;
      h.structures = [{ uid: s.nextUid++, type: 'quarry', level: 1, owner: 0 }];
    }
    s.world.deck = ['ev_quake', ...s.world.deck];
  });
  // Passa os 3 turnos: a próxima rodada revela o Tremor (espera registrada antes).
  const seen = page.waitForSelector('[data-testid=event-reveal]', { timeout: 120_000 }).then(async () => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'screenshots/phase6-quake.png' });
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const h = (window as unknown as HookWindow).__p3077;
      for (let k = 0; k < 6; k++) {
        const a = h.legal().find((x) => x.type === 'chooseDraw' || x.type === 'endPhase');
        if (a) h.perform(a);
      }
    });
    await settle(page);
  }
  await seen;
  await expect
    .poll(async () => ((await hook(page)) as unknown as WorldState).hexes['0:1,0']?.structures.length, {
      timeout: 60_000,
    })
    .toBe(0);
  await settle(page);
  await expect(page.getByTestId('log')).toContainText('Desastre');
  expect(errors).toEqual([]);
});

test('partida só de IA com eventos e hexes especiais até a tela de fim', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=4&seed=7&ai=all&events=1&special=1&speed=instant');
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 280_000 });
  const s = (await hook(page)) as unknown as WorldState;
  expect(s.stage).toBe('over');
  await settledShot(page, 'screenshots/phase6-spectator-end.png');
  expect(errors).toEqual([]);
});

test('Nova partida oferece Eventos e Hexes especiais (ligados)', async ({ page }) => {
  await page.goto('/?view=newGame');
  await expect(page.getByTestId('layer-events')).toBeChecked();
  await expect(page.getByTestId('layer-special')).toBeChecked();
});
