import { expect, test } from '@playwright/test';

test('página inicial mostra PROJETO 3077 com o tema', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));

  await page.goto('/');
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText('3077');
  await expect(page).toHaveTitle('Projeto 3077');

  // Fontes locais carregadas (não caiu no fallback).
  await page.evaluate(() => document.fonts.ready);
  const fontsLoaded = await page.evaluate(() => ({
    display: document.fonts.check('700 32px "Barlow Condensed"'),
    numeric: document.fonts.check('700 32px "Rajdhani"'),
    body: document.fonts.check('500 16px "Barlow"'),
  }));
  expect(fontsLoaded).toEqual({ display: true, numeric: true, body: true });

  // O laranja de destaque vem do token.
  const numberColor = await page
    .getByText('3077', { exact: true })
    .evaluate((el) => getComputedStyle(el).color);
  expect(numberColor).toBe('rgb(255, 122, 26)');

  expect(errors).toEqual([]);

  await page.screenshot({ path: 'screenshots/phase0-home-1920.png', fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: 'screenshots/phase0-home-1366.png', fullPage: true });
});
