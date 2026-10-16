import { expect, type Page, test } from '@playwright/test';

/**
 * Fase 2 — mesa 3D. Capturas conferidas contra ART_DIRECTION 5, 6 e 8:
 * visão geral, close de um tabuleiro, close de um hex com estrutura.
 */
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

async function open(page: Page, query: string, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  await page.goto(`/?view=table&adaptive=0&${query}`);
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
  // Alguns quadros a mais: sombras, ambiente e fontes assentarem.
  await page.waitForTimeout(1500);
}

const shots: [string, string][] = [
  ['phase2-overview-4p', 'players=4&seed=1&cam=overview&ui=0'],
  ['phase2-overview-6p', 'players=6&seed=1&cam=overview&ui=0'],
  ['phase2-board-close', 'players=4&seed=1&cam=board:0&ui=0'],
  ['phase2-hex-close', 'players=4&seed=1&cam=hex:0:0,0&ui=0'],
  ['phase2-overview-ui', 'players=4&seed=1&cam=overview'],
];

for (const [name, query] of shots) {
  test(`captura ${name}`, async ({ page }) => {
    const errors: string[] = [];
    await open(page, query, errors);
    await page.screenshot({ path: `screenshots/${name}.png` });
    expect(errors).toEqual([]);
  });
}

test('hover destaca e clique seleciona um hex', async ({ page }) => {
  const errors: string[] = [];
  await open(page, 'players=4&seed=1&cam=board:0', errors);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas ausente');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.move(x + 2, y + 2);
  const hovered = page.getByText(/Tabuleiro \d · \(/).first();
  await expect(hovered).toBeVisible({ timeout: 15_000 });
  await page.mouse.click(x + 2, y + 2);
  // Linha "Selecionado" mostra um hex.
  await expect(page.getByText(/Tabuleiro \d · \(/)).toHaveCount(2, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('tiles continuam no lugar depois de mudar configurações (re-render da cena)', async ({ page }) => {
  // Regressão: re-render recriava os InstancedMesh e todos os tiles caíam na origem
  // (com 6 jogadores, o centro vazio da roseta).
  const errors: string[] = [];
  await open(page, 'players=6&seed=1&cam=board:0', errors);
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas ausente');
  const mouseRow = page.locator('aside div', { hasText: 'Mouse' });
  const hoverCenter = async () => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 2);
  };

  await hoverCenter();
  await expect(mouseRow).toContainText(/Tabuleiro 1 · \(/, { timeout: 15_000 });

  await page.getByLabel('Sombras').uncheck();
  await page.getByLabel('Desfoque de borda').uncheck();
  await page.getByLabel('Objetos de mesa').uncheck();
  await page.waitForTimeout(800);
  await hoverCenter();
  await expect(mouseRow).toContainText(/Tabuleiro 1 · \(/, { timeout: 15_000 });
  await page.screenshot({ path: 'screenshots/phase2-after-toggle.png' });
  expect(errors).toEqual([]);
});

test('FPS com 6 jogadores (aresta 4), qualidade alta + adaptativa', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?view=table&players=6&seed=1&cam=overview&quality=high&adaptive=1');
  await page.waitForSelector('body[data-scene-ready="1"]', { state: 'attached', timeout: 120_000 });
  // Tempo para a qualidade adaptativa assentar.
  await page.waitForTimeout(9000);
  // Intervalos entre quadros direto do requestAnimationFrame, durante 5 s.
  const gaps = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        const t0 = last;
        const tick = (now: number) => {
          out.push(now - last);
          last = now;
          if (now - t0 < 5000) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
  );
  const avg = 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length);
  const p95 = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length * 0.95)] ?? 0;
  const tier = await page.evaluate(
    () => /\d+/.exec(document.body.innerText.split('\n').find((l) => /degrau/.test(l)) ?? '')?.[0],
  );
  console.log(`FPS 6 jogadores: média ${avg.toFixed(1)}, p95 ${p95.toFixed(1)} ms, degrau ${tier}`);
  test.info().annotations.push({
    type: 'fps',
    description: `${avg.toFixed(1)} (p95 ${p95.toFixed(1)} ms, degrau ${tier})`,
  });
  // Sanidade; a meta de 60 é medida e registrada no CLAUDE.md para o notebook de referência.
  expect(avg).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});
