/**
 * Fase 10 — casca do jogo: splash, menu com a mesa em órbita, setup completo, configurações
 * com efeito verificável, salvar → fechar → carregar reproduz a partida, áudio e legendas.
 * Capturas em screenshots/phase10-*.
 */
import { expect, type Page, test } from '@playwright/test';
import { type HookWindow, openGame, settle, settledShot, watchErrors } from './helpers';

const state = (page: Page) => page.evaluate(() => (window as unknown as HookWindow).__p3077.state());

/** Joga `n` ações legais (a primeira que não encerra fase, senão encerra). */
async function playSome(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const h = (window as unknown as HookWindow).__p3077;
      const legal = h.legal();
      const pick = legal.find((a) => a.type === 'explore' || a.type === 'build') ?? legal[0];
      h.perform(pick);
    });
    await settle(page);
  }
}

test('splash pulável e menu principal com a mesa 3D em órbita', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto('/?splash=1');
  await expect(page.getByTestId('splash')).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'screenshots/phase10-splash.png' });
  await page.keyboard.press('Space');
  await expect(page.getByTestId('splash')).toHaveCount(0);
  await expect(page.getByTestId('menu-backdrop')).toBeVisible();
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 60_000 });
  await settledShot(page, 'screenshots/phase10-menu.png');
  for (const id of ['new-game', 'open-load', 'open-lab', 'open-settings', 'open-credits'])
    await expect(page.getByTestId(id)).toBeVisible();
  expect(errors).toEqual([]);
});

test('setup completo: presets, assento fechado, regras da partida e resumo', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto('/?view=newGame');
  await page.getByTestId('preset-intro').click();
  await expect(page.getByTestId('layer-conflict')).not.toBeChecked();
  await page.getByTestId('preset-full').click();
  await expect(page.getByTestId('layer-treaties')).toBeChecked();
  await page.getByTestId('seat-3').selectOption('normal');
  await expect(page.getByTestId('setup-summary')).toContainText('4 jogadores');
  await expect(page.getByTestId('layout-preview').locator('polygon')).toHaveCount(4);
  await page.getByTestId('faction-0').selectOption('helix');
  await expect(page.getByTestId('faction-card')).toContainText('Eficiência');
  await page.getByTestId('win-gold').uncheck();
  await settledShot(page, 'screenshots/phase10-setup.png');
  await page.getByTestId('start').click();
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
  const url = new URL(page.url());
  expect(url.searchParams.get('players')).toBe('4');
  expect(url.searchParams.get('off')).toBe('gold');
  expect(errors).toEqual([]);
});

test('configurações: cada aba muda algo verificável', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.goto('/?view=settings');
  await expect(page.getByTestId('settings')).toBeVisible();
  await settledShot(page, 'screenshots/phase10-settings-video.png');
  // Vídeo: escala da interface vai para a raiz do documento.
  await page.getByTestId('set-uiScale').fill('1.2');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--ui-scale'))).toBe(
    '1.2',
  );
  await page.getByTestId('set-preset').selectOption('low');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('p3077.settings') ?? '{}').state.render.shadows,
    ),
  ).toBe(false);
  await page.getByTestId('set-uiScale').fill('1');
  // Acessibilidade: daltonismo troca a cor das facções; alto contraste marca a raiz.
  await page.getByTestId('settings-tab-accessibility').click();
  const before = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--faction-government-color'),
  );
  await page.getByTestId('set-colorMode').selectOption('deuteranopia');
  const after = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--faction-government-color'),
  );
  expect(after).not.toBe(before);
  await page.getByTestId('set-highContrast').check();
  expect(await page.evaluate(() => document.documentElement.dataset['contrast'])).toBe('high');
  await settledShot(page, 'screenshots/phase10-settings-a11y.png');
  await page.getByTestId('set-colorMode').selectOption('normal');
  await page.getByTestId('set-highContrast').uncheck();
  // Áudio e controles: telas existem e gravam.
  await page.getByTestId('settings-tab-audio').click();
  await page.getByTestId('set-vol-master').fill('0.3');
  await settledShot(page, 'screenshots/phase10-settings-audio.png');
  await page.getByTestId('settings-tab-controls').click();
  await page.getByTestId('key-bank-0').click();
  await page.keyboard.press('KeyK');
  await expect(page.getByTestId('key-bank-0')).toHaveText('K');
  await settledShot(page, 'screenshots/phase10-settings-controls.png');
  // Jogabilidade: idioma troca a interface.
  await page.getByTestId('settings-tab-gameplay').click();
  await page.getByTestId('set-language').selectOption('en');
  await expect(page.getByTestId('settings-tab-video')).toHaveText('Video');
  await page.getByTestId('set-language').selectOption('pt-BR');
  expect(errors).toEqual([]);
});

test('atalho remapeado vale na partida; pausa entre fases e confirmação de encerrar', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto('/?view=settings');
  await page.getByTestId('settings-tab-controls').click();
  await page.getByTestId('key-bank-0').click();
  await page.keyboard.press('KeyK');
  await page.getByTestId('settings-tab-gameplay').click();
  await page.getByTestId('set-autoAdvance').uncheck();
  await page.getByTestId('set-confirmIrreversible').check();
  await openGame(page, 'players=3&seed=2&cards=0&privacy=0&speed=1');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const h = (window as unknown as HookWindow).__p3077;
      h.perform(h.legal().find((a) => a.type === 'chooseVillage'));
    });
    await settle(page);
    const hold = page.getByTestId('phase-hold');
    while (await hold.isVisible()) {
      await hold.getByRole('button').click();
      await page.waitForTimeout(200);
    }
  }
  // Primeiro turno: a Produção para até "Continuar".
  await page.waitForTimeout(500);
  await settledShot(page, 'screenshots/phase10-phase-hold.png');
  while (await page.getByTestId('phase-hold').isVisible()) {
    await page.getByTestId('phase-hold').getByRole('button').click();
    await page.waitForTimeout(300);
  }
  await settle(page);
  await page.keyboard.press('KeyK');
  await expect(page.getByTestId('bank')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('confirm-end')).toBeVisible();
  await settledShot(page, 'screenshots/phase10-confirm-end.png');
  await page.getByTestId('confirm-end-ok').click();
  expect(errors).toEqual([]);
});

test('salvar, fechar a página e carregar reproduz a partida exatamente', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=12&events=1&conflict=1&privacy=0&speed=instant');
  await playSome(page, 24);
  const saved = await state(page);
  expect(saved.round).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause')).toBeVisible();
  await page.getByTestId('pause-save').click();
  await page.getByTestId('save-1').click();
  await expect(page.getByTestId('saves-msg')).toContainText('Salvo');
  await settledShot(page, 'screenshots/phase10-save.png');

  // "Fechar": nova página do zero, carregar pelo menu.
  await page.goto('/');
  await expect(page.getByTestId('continue')).toBeVisible();
  await page.getByTestId('open-load').click();
  await expect(page.getByTestId('slot-1')).toContainText('rodada');
  await settledShot(page, 'screenshots/phase10-load.png');
  await page.getByTestId('load-1').click();
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
  await settle(page);
  expect(await state(page)).toEqual(saved);
  expect(errors).toEqual([]);
});

test('áudio: volume da configuração vale no som; legendas aparecem', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.goto('/?view=settings');
  await page.getByTestId('settings-tab-audio').click();
  await page.getByTestId('set-vol-master').fill('0.5');
  await page.getByTestId('set-vol-sfx').fill('0.5');
  await page.getByTestId('settings-tab-accessibility').click();
  await page.getByTestId('set-captions').check();
  await openGame(page, 'players=3&seed=2&cards=0&privacy=0&speed=1');
  await page.evaluate(() => {
    const h = (window as unknown as HookWindow).__p3077;
    h.perform(h.legal().find((a) => a.type === 'chooseVillage'));
  });
  await settle(page);
  const probe = await page.evaluate(
    () =>
      (window as unknown as { __p3077audio: { last: { id: string; volume: number }; played: number } })
        .__p3077audio,
  );
  expect(probe.played).toBeGreaterThan(0);
  // Construir (Vila) e revelar tiles: canal de efeitos = 0,5 × 0,5.
  expect(probe.last.volume).toBeCloseTo(0.25, 5);
  await expect(page.getByTestId('captions')).toBeVisible();
  await settledShot(page, 'screenshots/phase10-captions.png');
  expect(errors).toEqual([]);
});

test('carregamento mostra a roseta em espiral antes da mesa', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?view=game&players=4&seed=5&cards=0&privacy=0');
  await expect(page.getByTestId('loading')).toBeVisible();
  await page.screenshot({ path: 'screenshots/phase10-loading.png' });
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
  await expect(page.getByTestId('loading')).toHaveCount(0);
});
