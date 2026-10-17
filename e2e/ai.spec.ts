/**
 * Fase 5 — IA e Laboratório. Laboratório: edita um número, simula, mostra gráficos.
 * Espectador: partida só de IA até a tela de fim. Pessoa contra IA: a IA joga sozinha
 * e a tela de privacidade só aparece para a pessoa.
 */
import { expect, test } from '@playwright/test';
import { game, type HookWindow, openGame, ready, settle, settledShot, watchErrors } from './helpers';

test.describe('Laboratório', () => {
  for (const [w, h] of [
    [1920, 1080],
    [1366, 768],
  ] as const) {
    test(`edita balance, simula e mostra o relatório em ${w}×${h}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await page.getByTestId('open-lab').click();
      await expect(page.getByTestId('lab')).toBeVisible();
      await page.getByTestId('lab-restore').click();
      await page.getByTestId('bal-turn-actionsPerTurn').fill('4');
      await page.getByTestId('lab-games').fill('16');
      await page.getByTestId('lab-run').click();
      await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId('lab-progress')).toContainText('16/16');
      // 6 recursos + Expansão + Eliminação (Fase 7) + Limite de rodadas.
      await expect(page.getByTestId('chart-tracks').locator('li')).toHaveCount(10);
      // balance inválido trava o botão com o motivo.
      await page.getByTestId('bal-turn-actionsPerTurn').fill('-2');
      await expect(page.getByRole('alert')).toContainText('balance');
      await expect(page.getByTestId('lab-run')).toBeDisabled();
      await page.getByTestId('bal-turn-actionsPerTurn').fill('4');
      await settledShot(page, `screenshots/phase5-lab-${w}.png`);
      await page.getByTestId('lab-restore').click();
      expect(errors).toEqual([]);
    });
  }
});

test('espectador: partida só de IA até a tela de fim', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=4&seed=3&ai=all&speed=instant');
  await expect(page.getByTestId('ai-0')).toBeVisible();
  // Ninguém precisa clicar: sem tela de privacidade, a IA joga sozinha.
  await expect(page.getByTestId('privacy')).toHaveCount(0);
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 280_000 });
  const s = await game(page);
  expect(s.stage).toBe('over');
  await settledShot(page, 'screenshots/phase5-spectator-end.png');
  expect(errors).toEqual([]);
});

test('pessoa contra IA: a IA joga os turnos dela e a privacidade só aparece para a pessoa', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=8&seats=human,normal,hard&speed=1&privacy=1');
  // Uma única tela de privacidade: a da pessoa (assento 0).
  await expect(page.getByTestId('privacy')).toContainText('Revolucionários');
  await ready(page);
  await page.evaluate(() => {
    const h = (window as unknown as HookWindow).__p3077;
    const v = h.legal().find((a) => a.type === 'chooseVillage');
    h.perform(v);
  });
  await settle(page);
  // As IAs fundam as Vilas e a partida chega ao turno da pessoa sem outra tela.
  await expect.poll(async () => (await game(page)).stage, { timeout: 60_000 }).toBe('playing');
  await expect(page.getByTestId('ai-1')).toBeVisible();
  await expect(page.getByTestId('privacy')).toHaveCount(0);
  // Pessoa encerra o turno; a IA joga o dela (o registro mostra ações dos assentos 1 e 2).
  for (let i = 0; i < 2; i++) {
    await expect
      .poll(
        async () =>
          (await game(page)).activePlayer === 0 &&
          !(await page.evaluate(() => (window as unknown as HookWindow).__p3077.busy())),
        { timeout: 90_000 },
      )
      .toBe(true);
    await page.evaluate(() => {
      const h = (window as unknown as HookWindow).__p3077;
      for (const type of ['chooseDraw', 'endPhase'])
        for (let k = 0; k < 4; k++) {
          const a = h.legal().find((x) => x.type === type);
          if (a && h.state().activePlayer === 0) h.perform(a);
        }
    });
    await expect(page.getByText('está pensando')).toBeVisible({ timeout: 30_000 });
    await settledShot(page, 'screenshots/phase5-vs-ai-thinking.png');
    await expect.poll(async () => (await game(page)).round, { timeout: 90_000 }).toBeGreaterThan(i + 1);
  }
  expect(await page.getByTestId('privacy').count()).toBe(0);
  const log = await page.getByTestId('log').textContent();
  expect(log).toContain('Governo');
  expect(errors).toEqual([]);
});
