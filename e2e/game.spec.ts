import { expect, type Page, test } from '@playwright/test';

/**
 * Fase 3 — partida jogável em hotseat pela interface (camada de Economia).
 * Os cliques nos hexes são cliques de verdade no canvas: o gancho de desenvolvimento
 * `__p3077.hexToScreen` só diz onde o hex está na tela. `__p3077.legal()` serve para o
 * teste escolher uma construção possível na seed; a ação em si passa pelo inspetor.
 */
test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

type Hook = {
  hexToScreen(key: string): { x: number; y: number } | null;
  targets(): string[];
  busy(): boolean;
  legal(): { type: string; hex?: string; structure?: string }[];
  state(): {
    round: number;
    stage: string;
    activePlayer: number;
    actionsLeft: number;
    players: { resources: Record<string, number> }[];
    hexes: Record<string, { revealed: boolean; structures: { type: string; level: number }[] }>;
  };
};
/** O gancho existe só no servidor de desenvolvimento (render3d/TestHooks + GameScreen). */
type HookWindow = { __p3077: Hook };

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  return errors;
}

async function openGame(page: Page, query: string) {
  await page.goto(`/?view=game&adaptive=0&cards=0&${query}`);
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
}

/** Fila de animação vazia, ou parada na tela de privacidade. */
async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      !(window as unknown as HookWindow).__p3077.busy() || !!document.querySelector('[data-testid=privacy]'),
    null,
    { timeout: 60_000 },
  );
}

async function ready(page: Page) {
  await page.getByTestId('privacy-ready').click();
  await settle(page);
}

/** Painéis e modais entram com animação curta (≤ 220 ms): captura depois dela. */
const settledShot = async (page: Page, path: string) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path });
};

/** Posição do hex na tela depois que a câmera parou. */
async function hexPos(page: Page, key: string) {
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

async function clickHex(page: Page, key: string) {
  const p = await hexPos(page, key);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

const game = (page: Page) => page.evaluate(() => (window as unknown as HookWindow).__p3077.state());

async function foundVillages(page: Page, players: number, privacy: boolean) {
  for (let p = 0; p < players; p++) {
    if (privacy) {
      await expect(page.getByTestId('privacy')).toContainText('Vez de');
      await ready(page);
    }
    await expect
      .poll(() => page.evaluate(() => (window as unknown as HookWindow).__p3077.targets().length))
      .toBeGreaterThan(0);
    await clickHex(page, `${p}:0,0`);
    await page.getByTestId('act-village').click();
    await settle(page);
  }
}

/** Explora o primeiro hex destacado pela tecla E. */
async function explore(page: Page) {
  const before = (await game(page)).actionsLeft;
  await page.keyboard.press('e');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HookWindow).__p3077.targets().length))
    .toBeGreaterThan(0);
  const [target] = await page.evaluate(() => (window as unknown as HookWindow).__p3077.targets());
  await clickHex(page, target ?? '');
  await settle(page);
  expect((await game(page)).hexes[target ?? '']?.revealed).toBe(true);
  expect((await game(page)).actionsLeft).toBe(before - 1);
}

/** Constrói pelo inspetor a primeira estrutura possível (Parque/Pedreira primeiro). */
async function build(page: Page): Promise<boolean> {
  const legal = await page.evaluate(() => (window as unknown as HookWindow).__p3077.legal());
  const pick =
    legal.find((a) => a.type === 'build' && (a.structure === 'park' || a.structure === 'quarry')) ??
    legal.find((a) => a.type === 'build');
  if (!pick?.hex || !pick.structure) return false;
  await clickHex(page, pick.hex);
  await expect(page.getByTestId('inspector')).toBeVisible();
  await page.getByTestId(`act-build-${pick.structure}`).click();
  await settle(page);
  const hex = (await game(page)).hexes[pick.hex];
  expect(hex?.structures.map((s) => s.type)).toContain(pick.structure);
  return true;
}

async function endActions(page: Page) {
  await page.keyboard.press('Enter');
  await settle(page);
}

test('duas rodadas de 3 jogadores pela interface (hotseat com privacidade)', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=7&speed=2&privacy=1');
  await foundVillages(page, 3, true);

  for (let round = 1; round <= 2; round++) {
    for (let p = 0; p < 3; p++) {
      await expect(page.getByTestId('privacy')).toContainText('Vez de');
      await ready(page);
      expect(await game(page)).toMatchObject({ round, activePlayer: p, stage: 'playing' });
      await expect(page.getByTestId('round')).toContainText(String(round));

      await explore(page);
      const built = await build(page);

      if (round === 1 && p === 1 && built) {
        // Desfazer (Ctrl+Z) devolve o custo da construção.
        const before = (await game(page)).players[1]?.resources;
        await page.keyboard.press('Control+z');
        await settle(page);
        await expect(page.getByTestId('toast')).toContainText('desfeita');
        expect((await game(page)).players[1]?.resources).not.toEqual(before);
        expect(await build(page)).toBe(true);
      }

      if (round === 1 && p === 0) {
        // Banca (M): 2 Pedregulho → 1 Comida (vende por 1, compra por 2).
        await page.keyboard.press('m');
        await expect(page.getByTestId('bank')).toBeVisible();
        await page.getByTestId('bank-give-stone').click();
        await page.getByTestId('bank-receive-food').click();
        await page.getByRole('button', { name: 'Mais Quantidade' }).click();
        await expect(page.getByTestId('bank-quote')).toContainText('Você recebe 1 Comida');
        const food = (await game(page)).players[0]?.resources.food ?? 0;
        await page.getByTestId('bank-confirm').click();
        await settle(page);
        expect((await game(page)).players[0]?.resources.food).toBe(food + 1);
        await expect(page.getByTestId('res-food')).toContainText(String(food + 1));
      }

      if (round === 1 && p === 0) {
        // Comércio (T) com o jogador 2: 1 Comida por 1 Ferro, com privacidade nas duas mãos.
        await page.keyboard.press('t');
        await expect(page.getByTestId('trade')).toBeVisible();
        await page.getByTestId('trade-partner-1').click();
        await page.getByRole('button', { name: 'Mais Eu dou · Comida' }).click();
        await page.getByRole('button', { name: 'Mais Eu recebo · Ferro' }).click();
        await page.getByTestId('trade-send').click();
        await settle(page);
        await expect(page.getByTestId('privacy')).toContainText('Passe o dispositivo para');
        await ready(page);
        await expect(page.getByTestId('trade-reply')).toContainText('Proposta de');
        await page.getByTestId('trade-accept').click();
        await settle(page);
        await expect(page.getByTestId('privacy')).toContainText('Vez de');
        await ready(page);
        const s = await game(page);
        expect(s.activePlayer).toBe(0);
        await expect(page.getByTestId('log')).toContainText('aceitou a troca');
      }

      await endActions(page);
    }
  }
  // Duas rodadas completas: a terceira começou.
  await expect(page.getByTestId('privacy')).toContainText('Vez de');
  expect(await game(page)).toMatchObject({ round: 3, activePlayer: 0 });
  await ready(page);
  await expect(page.getByTestId('log')).toContainText('produziu');
  expect(errors).toEqual([]);
});

test('partida inteira até a tela de fim, sem travar', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=11&speed=instant&privacy=0');
  await foundVillages(page, 3, false);
  for (let turn = 0; turn < 200; turn++) {
    if (await page.getByTestId('end').isVisible()) break;
    const s = await game(page);
    if (s.stage === 'over') break;
    // Um pouco de jogo por turno: explorar quando der e construir quando der.
    const targets = await page.evaluate(() => {
      const legal = (window as unknown as HookWindow).__p3077.legal();
      return {
        explore: legal.some((a) => a.type === 'explore'),
        build: legal.some((a) => a.type === 'build'),
      };
    });
    if (targets.explore) await explore(page);
    if (targets.build) await build(page);
    await endActions(page);
  }
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('end')).toContainText('Vitória');
  await settledShot(page, 'screenshots/phase3-end-1920.png');
  // Revanche recomeça a mesma seed no setup.
  await page.getByTestId('rematch').click();
  await expect.poll(async () => (await game(page)).stage).toBe('setup');
  expect(errors).toEqual([]);
});

for (const [w, h] of [
  [1920, 1080],
  [1366, 768],
] as const) {
  test(`capturas do HUD em ${w}×${h}`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: w, height: h });
    await openGame(page, 'players=4&seed=3&speed=instant&privacy=1');
    await settledShot(page, `screenshots/phase3-privacy-${w}.png`);
    await ready(page);
    await settledShot(page, `screenshots/phase3-setup-${w}.png`);
    await page.getByTestId('privacy-ready').waitFor({ state: 'detached' });
    // Funda as 4 Vilas e joga um pouco para o HUD ter conteúdo.
    for (let p = 0; p < 4; p++) {
      if (p > 0) await ready(page);
      await clickHex(page, `${p}:0,0`);
      await page.getByTestId('act-village').click();
      await settle(page);
    }
    await ready(page);
    await explore(page);
    await build(page);
    await settledShot(page, `screenshots/phase3-hud-${w}.png`);

    await page.keyboard.press('Escape');
    await page.keyboard.press('b');
    await settledShot(page, `screenshots/phase3-build-picker-${w}.png`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('e');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/phase3-targets-${w}.png` });
    await page.keyboard.press('Escape');

    const [first] = await page.evaluate(() =>
      (window as unknown as HookWindow).__p3077
        .legal()
        .filter((a) => a.type === 'upgrade' || a.type === 'survey'),
    );
    if (first?.hex) {
      await clickHex(page, first.hex);
      await expect(page.getByTestId('inspector')).toBeVisible();
    } else {
      await clickHex(page, '0:0,0');
    }
    await settledShot(page, `screenshots/phase3-inspector-${w}.png`);
    await page.keyboard.press('Escape');

    await page.keyboard.press('m');
    await settledShot(page, `screenshots/phase3-bank-${w}.png`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('t');
    await page.getByRole('button', { name: 'Mais Eu dou · Comida' }).click();
    await settledShot(page, `screenshots/phase3-trade-${w}.png`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('F1');
    await settledShot(page, `screenshots/phase3-rules-${w}.png`);
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}

test('animações tocam na velocidade 0.5× (capturas no meio do movimento)', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=7&speed=0.5&privacy=0');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HookWindow).__p3077.targets().length))
    .toBeGreaterThan(0);
  await clickHex(page, '0:0,0');
  await page.getByTestId('act-village').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/phase3-anim-reveal.png' });
  await settle(page);
  // Enquanto a fila toca, a interface não aceita ações.
  for (let p = 1; p < 3; p++) {
    await clickHex(page, `${p}:0,0`);
    await page.getByTestId('act-village').click();
    await settle(page);
  }
  await page.keyboard.press('r');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as HookWindow).__p3077.targets().length))
    .toBeGreaterThan(0);
  const [target] = await page.evaluate(() => (window as unknown as HookWindow).__p3077.targets());
  await clickHex(page, target ?? '');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'screenshots/phase3-anim-survey.png' });
  await expect(page.getByTestId('end-phase')).toBeDisabled();
  await settle(page);
  await expect(page.getByTestId('end-phase')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('Melhorar com Oficina: anel de nível e coluna de luz (1×)', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page, 'players=3&seed=7&speed=instant&privacy=0');
  await foundVillages(page, 3, false);
  const pickBuild = async (structure: string) => {
    const legal = await page.evaluate(() => (window as unknown as HookWindow).__p3077.legal());
    return legal.find((a) => a.type === 'build' && a.structure === structure);
  };
  const park = await pickBuild('park');
  if (!park?.hex) throw new Error('seed sem Parque possível');
  await clickHex(page, park.hex);
  await page.getByTestId('act-build-park').click();
  await settle(page);
  const shop = await pickBuild('workshop');
  if (!shop?.hex) throw new Error('seed sem Oficina possível');
  await clickHex(page, shop.hex);
  await page.getByTestId('act-build-workshop').click();
  await settle(page);
  // Melhorar pelo atalho U no hex do Parque, em velocidade normal para ver a animação.
  await page.getByTitle('Velocidade normal').click();
  await clickHex(page, park.hex);
  await page.keyboard.press('u');
  // Tokens do custo voam (~0,5 s) e então o anel novo acende com a coluna de luz.
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'screenshots/phase3-anim-upgrade.png' });
  await settle(page);
  const s = await game(page);
  expect(s.hexes[park.hex]?.structures.find((x) => x.type === 'park')).toMatchObject({ level: 2 });
  await page.keyboard.press('Escape'); // fecha o inspetor: o registro volta à coluna
  await expect(page.getByTestId('log')).toContainText('nível 2');
  expect(errors).toEqual([]);
});
