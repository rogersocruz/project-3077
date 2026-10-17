/**
 * Fase 9 — facções, trilhas e fim de partida pela interface: escolha de facção na Nova
 * partida, habilidade e trilha de tribo no painel, tela de fim com classificação, gráficos,
 * linha do tempo e exportação. Capturas em screenshots/phase9-*.
 */
import { expect, test } from '@playwright/test';
import { type HookWindow, openGame, settledShot, watchErrors } from './helpers';

test('Nova partida: facção por assento e regra do eliminado; a facção vale na partida', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto('/?view=newGame');
  await expect(page.getByTestId('layer-factions')).toBeChecked();
  await page.getByTestId('faction-0').selectOption('pirates');
  await page.getByTestId('faction-1').selectOption('natives');
  // Facção já escolhida por outro assento fica indisponível.
  await expect(page.getByTestId('faction-1').locator('option[value=pirates]')).toBeDisabled();
  await page.getByTestId('eliminated-rule').selectOption('neutral');
  await settledShot(page, 'screenshots/phase9-newgame.png');
  await page.getByTestId('start').click();
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
  const s = (await page.evaluate(() => (window as unknown as HookWindow).__p3077.state())) as unknown as {
    players: { faction: string }[];
    eliminatedRule: string;
  };
  expect(s.players[0]?.faction).toBe('pirates');
  expect(s.players[1]?.faction).toBe('natives');
  expect(s.eliminatedRule).toBe('neutral');
  await expect(page.getByTestId('player-0')).toContainText('Piratas');
  expect(errors).toEqual([]);
});

test('painel: habilidade da facção e trilha de tribo', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=4&seed=6&conflict=1&factions=1&cards=0&privacy=0&speed=instant&ai=all');
  await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('player-0').locator('[title^="Tribo"]')).toHaveCount(1);
  await settledShot(page, 'screenshots/phase9-panel.png');
  expect(errors).toEqual([]);
});

test('fim de partida: classificação, gráficos, linha do tempo e exportar', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await openGame(
    page,
    'players=4&seed=3&ai=all&events=1&special=1&conflict=1&treaties=1&factions=1&speed=instant',
  );
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 280_000 });
  await expect(page.getByTestId('end-condition')).not.toBeEmpty();
  await page.waitForTimeout(1500);
  await settledShot(page, 'screenshots/phase9-end-standings.png');
  await page.getByTestId('end-tab-charts').click();
  await expect(page.getByTestId('end-charts').locator('figure')).toHaveCount(4);
  await settledShot(page, 'screenshots/phase9-end-charts.png');
  await page.getByTestId('end-tab-timeline').click();
  await expect(page.getByTestId('end-timeline').locator('li').first()).toBeVisible();
  await settledShot(page, 'screenshots/phase9-end-timeline.png');
  await page.getByTestId('end-tab-export').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('end-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^projeto-3077-seed-3\.json$/);
  expect(errors).toEqual([]);
});
