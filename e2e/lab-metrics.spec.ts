/**
 * Laboratório: seleção de condições de vitória e métricas detalhadas (ritmo, curvas por
 * rodada, ações, construção, conflito, matrizes). Capturas screenshots/lab-metrics-*.
 */
import { expect, test } from '@playwright/test';
import { settledShot, watchErrors } from './helpers';

test('desligar condições de vitória e ver as métricas detalhadas', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.goto('/?view=lab');
  await page.getByTestId('lab-restore').click();
  await page.getByTestId('lab-layer-conflict').check();
  for (const w of ['food', 'stone', 'iron']) await page.getByTestId(`lab-win-${w}`).uncheck();
  await page.getByTestId('lab-games').fill('16');
  await page.getByTestId('lab-run').click();
  await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByTestId('lab-progress')).toContainText('16/16');
  // Condições desligadas não vencem.
  for (const w of ['Comida', 'Pedregulho', 'Ferro'])
    await expect(page.getByTestId('chart-tracks').locator('li', { hasText: w })).toContainText('0');
  await expect(page.getByTestId('lab-metrics')).toBeVisible();
  await expect(page.getByTestId('lab-pace')).toBeVisible();
  await expect(page.getByTestId('lab-actions').locator('li').first()).toBeVisible();
  await expect(page.getByTestId('lab-builds')).toContainText('Parque');
  await page.getByTestId('lab-metrics').scrollIntoViewIfNeeded();
  await settledShot(page, 'screenshots/lab-metrics.png');
  await page.getByTestId('lab-builds').scrollIntoViewIfNeeded();
  await settledShot(page, 'screenshots/lab-metrics-2.png');
  expect(errors).toEqual([]);
});
