/**
 * Fase 7 — tropas e combate pela interface: recrutar no inspetor, mover para hex inimigo
 * com previsão de combate, painel de combate passo a passo e escolha de baixas do humano.
 * Capturas em screenshots/phase7-*.
 */
import { expect, type Page, test } from '@playwright/test';
import { clickHex, type HookWindow, loadState, openGame, settle, settledShot, watchErrors } from './helpers';

type T = { uid: number; type: string; level: number; owner: number; arrived: number; crossedRound?: number };
type S = {
  round: number;
  nextUid: number;
  stage: string;
  pending: { kind: string } | null;
  players: { resources: Record<string, number>; villageHex: string | null }[];
  hexes: Record<
    string,
    {
      revealed: boolean;
      surface: string;
      troops: T[];
      structures: { uid: number; type: string; level: number; owner: number }[];
    }
  >;
};
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as HookWindow).__p3077.state()) as Promise<unknown> as Promise<S>;

async function setup(page: Page) {
  await openGame(page, 'players=3&seed=4&conflict=1&cards=0&privacy=0&speed=1');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const h = (window as unknown as HookWindow).__p3077;
      const v = h.legal().find((a) => a.type === 'chooseVillage');
      h.perform(v);
    });
    await settle(page);
  }
}

test('recrutar pelo inspetor (Quartel vizinho)', async ({ page }) => {
  const errors = watchErrors(page);
  await setup(page);
  const v = ((await state(page)).players[0]?.villageHex ?? '0:0,0') as string;
  const [b, q, r] = v.split(/[:,]/).map(Number);
  const barracks = `${b}:${(q ?? 0) + 1},${r}`;
  await loadState(page, (st) => {
    const s = st as unknown as S;
    const h = s.hexes[barracks];
    if (h) {
      h.revealed = true;
      h.surface = 'empty';
      h.structures = [{ uid: s.nextUid++, type: 'barracks', level: 1, owner: 0 }];
    }
    s.players[0]!.resources = { food: 10, stone: 5, iron: 10, coal: 2, oil: 0, gold: 1 };
  });
  await clickHex(page, barracks);
  await expect(page.getByTestId('inspector')).toContainText('Exército');
  await settledShot(page, 'screenshots/phase7-inspector-recruit.png');
  await page.getByTestId('act-recruit-line').click();
  await settle(page);
  expect((await state(page)).hexes[barracks]?.troops).toHaveLength(1);
  await expect(page.getByTestId('inspector-troops')).toContainText('Linha');
  expect(errors).toEqual([]);
});

test('mover para hex inimigo: previsão, painel de combate e escolha de baixas', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await setup(page);
  // O exemplo do GDD 8.4.1 no tabuleiro do Governo; as Linhas atacantes num vizinho.
  const H = '1:1,0';
  const from = '1:2,0';
  await loadState(page, (st) => {
    const s = st as unknown as S;
    for (const h of Object.values(s.hexes)) {
      h.revealed = true;
      if (!['empty', 'forest', 'lagoon', 'vein_iron', 'vein_coal', 'vein_gold'].includes(h.surface))
        h.surface = 'empty';
    }
    const troop = (hex: string, owner: number, type: string, level = 1, extra = {}) => {
      const uid = s.nextUid++;
      s.hexes[hex]?.troops.push({ uid, type, level, owner, arrived: uid, ...extra });
    };
    troop(from, 0, 'line', 3, { crossedRound: s.round });
    troop(from, 0, 'line', 1, { crossedRound: s.round });
    troop('1:3,0', 0, 'artillery');
    troop('1:1,2', 0, 'artillery');
    troop(H, 1, 'line');
    troop(H, 1, 'artillery');
    s.hexes[H]?.structures.push({ uid: s.nextUid++, type: 'wall', level: 1, owner: 1 });
    s.hexes['1:1,-1']?.structures.push({ uid: s.nextUid++, type: 'outpost', level: 1, owner: 1 });
    troop('1:-1,0', 1, 'artillery');
    s.players[0]!.resources = { food: 10, stone: 0, iron: 0, coal: 0, oil: 0, gold: 0 };
  });
  await page.getByTestId('player-1').getByRole('button').first().click();
  await page.waitForTimeout(800);
  await clickHex(page, from);
  await page.getByTestId('act-move').click();
  await clickHex(page, H);
  await expect(page.getByTestId('move-preview')).toBeVisible();
  await expect(page.getByTestId('move-preview')).toContainText('11');
  await settledShot(page, 'screenshots/phase7-move-preview.png');
  await page.getByTestId('move-confirm').click();
  await settle(page);
  // Encerrar as Ações: o combate resolve na fase 6 com o painel.
  const panel = page.waitForSelector('[data-testid=combat-panel]', { timeout: 30_000 }).then(async () => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'screenshots/phase7-combat-panel.png' });
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await panel;
  await expect(page.getByTestId('combat-result')).toContainText('vence');
  // O Governo (humano) escolhe as baixas: a Artilharia basta.
  await expect(page.getByTestId('casualty-choice')).toBeVisible({ timeout: 30_000 });
  await settledShot(page, 'screenshots/phase7-casualties.png');
  const s = await state(page);
  const art = s.hexes[H]?.troops.find((t) => t.owner === 1 && t.type === 'artillery');
  await page.getByTestId(`casualty-${art?.uid}`).check();
  await page.getByTestId('casualty-confirm').click();
  await settle(page);
  const after = await state(page);
  expect(after.pending).toBeNull();
  expect(after.hexes[H]?.troops.every((t) => t.owner === 0)).toBe(true);
  await expect(page.getByTestId('log')).toContainText('Combate em');
  expect(errors).toEqual([]);
});

test('partida só de IA com todas as camadas até o fim', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=9&ai=all&events=1&special=1&conflict=1&speed=instant');
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 280_000 });
  await settledShot(page, 'screenshots/phase7-spectator-end.png');
  expect(errors).toEqual([]);
});
