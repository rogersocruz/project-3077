/**
 * Coleção (Codex ampliado): todas as abas abrem, a busca filtra, a construção gira em 3D, a
 * carta abre em zoom e a vitrine mostra a mesa. Capturas em screenshots/collection-*.
 */
import { expect, test } from '@playwright/test';
import { settledShot, watchErrors } from './helpers';

test('coleção: história, facções, recursos, terrenos, construções, cartas, eventos e vitrine', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByTestId('open-collection').click();
  await expect(page.getByTestId('col-story')).toContainText('Ano 3077');
  await settledShot(page, 'screenshots/collection-story.png');

  await page.getByTestId('col-tab-factions').click();
  await expect(page.getByTestId('col-factions').locator('article')).toHaveCount(6);
  await settledShot(page, 'screenshots/collection-factions.png');

  await page.getByTestId('col-tab-resources').click();
  await expect(page.getByTestId('col-resources').locator('article')).toHaveCount(6);

  await page.getByTestId('col-tab-terrain').click();
  await expect(page.getByTestId('col-terrain')).toContainText('Vulcão');
  await settledShot(page, 'screenshots/collection-terrain.png');

  await page.getByTestId('col-tab-structures').click();
  await page.getByTestId('col-structure-mine').click();
  await expect(page.getByTestId('preview-mine').locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
  await settledShot(page, 'screenshots/collection-structures.png');

  await page.getByTestId('col-tab-cards').click();
  const all = await page.getByTestId('col-cards').locator('[data-testid^=col-card-]').count();
  expect(all).toBeGreaterThan(30);
  await page.getByTestId('col-search').fill('Drone');
  const some = await page.getByTestId('col-cards').locator('[data-testid^=col-card-]').count();
  expect(some).toBeGreaterThan(0);
  expect(some).toBeLessThan(all);
  await page.getByTestId('col-search').fill('');
  await page.getByTestId('col-deck').selectOption('n3');
  await settledShot(page, 'screenshots/collection-cards.png');
  await page.getByTestId('col-cards').locator('[data-testid^=col-card-]').first().click();
  await expect(page.getByTestId('col-zoom')).toBeVisible();
  await settledShot(page, 'screenshots/collection-card-zoom.png');
  await page.getByTestId('col-zoom').click();

  await page.getByTestId('col-tab-events').click();
  await expect(page.getByTestId('col-events')).toContainText('Tremor de Terra');

  await page.getByTestId('col-tab-showcase').click();
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 60_000 });
  await settledShot(page, 'screenshots/collection-showcase.png');
  expect(errors).toEqual([]);
});
