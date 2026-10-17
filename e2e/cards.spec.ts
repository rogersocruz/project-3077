/**
 * Fase 4 — cartas. Galeria: capturas de cada categoria lado a lado (as 4 cartas da
 * v0.3 + Relíquia), versos e estado bloqueado; a textura rasterizada (3D) sai igual.
 * Partida: Economia + Cartas em hotseat pela interface (jogar, zoom, entregar, revelar,
 * instalar, Compra com escolha, Requisição, Drone, descarte até o limite) e uma
 * partida inteira até a tela de fim.
 */
import { expect, test } from '@playwright/test';
import cards from '../data/cards.json' with { type: 'json' };
import treaties from '../data/treaties.json' with { type: 'json' };
import {
  clickHex,
  foundVillages,
  game,
  giveCard,
  handCard,
  type HookWindow,
  loadState,
  openGame,
  ready,
  settle,
  settledShot,
  watchErrors,
} from './helpers';

test.setTimeout(300_000);

test.describe('galeria de cartas', () => {
  test('categorias lado a lado, com a textura 3D rasterizada ao lado do SVG', async ({ page }) => {
    await page.goto('/?view=cards&set=ref&width=340&raster=1');
    await expect(page.getByTestId('card-gallery')).toBeVisible();
    await expect(page.locator('[data-raster=ready]')).toHaveCount(5, { timeout: 30_000 });
    // A textura não está vazia e tem o header colorido + painel creme (variação de cor).
    const spread = await page.evaluate(() => {
      const canvas = document.querySelector('[data-raster=ready] canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return 0;
      const c = canvas.getContext('2d');
      if (!c) return 0;
      const { data } = c.getImageData(0, 0, canvas.width, canvas.height);
      let min = 255;
      let max = 0;
      for (let i = 0; i < data.length; i += 4 * 97) {
        const v = (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
        min = Math.min(min, v / 3);
        max = Math.max(max, v / 3);
      }
      return max - min;
    });
    expect(spread).toBeGreaterThan(150);
    await page.screenshot({ path: 'screenshots/phase4-cards-reference.png', fullPage: true });
  });

  test('todas as cartas dos dados, versos e o estado bloqueado', async ({ page }) => {
    await page.goto('/?view=cards&set=all&width=240');
    await expect(page.locator('[data-card]')).toHaveCount(cards.length + treaties.templates.length);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/phase4-cards-all.png', fullPage: true });
    await page.goto('/?view=cards&set=backs&width=300');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'screenshots/phase4-cards-backs.png', fullPage: true });
    await page.goto('/?view=cards&set=ref&width=300&blocked=1');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'screenshots/phase4-cards-blocked.png', fullPage: true });
  });
});

test.describe('partida com cartas', () => {
  test.describe.configure({ mode: 'serial' });

  test('duas rodadas pela interface: jogar com alvo, zoom, entregar, revelar e instalar', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openGame(page, 'players=3&seed=1&speed=2&privacy=1&cards=1');
    await foundVillages(page, 3, true);

    // ── Revolucionários (P0): Auditoria com alvo na Vila → relatório privado.
    await expect(page.getByTestId('privacy')).toContainText('Vez de');
    await ready(page);
    await expect(page.locator('[data-testid^=hand-card-]').first()).toBeVisible();
    await handCard(page, 'audit').click();
    await expect(page.getByTestId('card-dialog')).toBeVisible();
    // O alvo só aceita clique depois de destacado (sob carga, o destaque chega um pouco depois).
    await expect
      .poll(() => page.evaluate(() => (window as unknown as HookWindow).__p3077.targets()))
      .toContain('0:0,0');
    await clickHex(page, '0:0,0');
    await page.getByTestId('card-confirm').click();
    await expect(page.getByTestId('intel')).toBeVisible();
    await settledShot(page, 'screenshots/phase4-intel-1920.png');
    await page.getByTestId('intel-ok').click();
    await settle(page);
    await expect(page.getByTestId('log')).toContainText('usou Auditoria');

    // Zoom (botão direito): placa, alcance e cópias.
    await handCard(page, 'plunder').click({ button: 'right' });
    await expect(page.getByTestId('card-zoom')).toBeVisible();
    await expect(page.getByTestId('card-zoom')).toContainText('na partida');
    await settledShot(page, 'screenshots/phase4-zoom-1920.png');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('card-zoom')).toBeHidden();

    // Entrega: Pilhagem para o Governo, pedindo Comida.
    await page.keyboard.press('Enter');
    await settle(page);
    expect((await game(page)).phase).toBe('delivery');
    await handCard(page, 'plunder').click();
    await page.getByTestId('recipient-1').click();
    await page.getByTestId('target-resource-food').click();
    await settledShot(page, 'screenshots/phase4-deliver-1920.png');
    await page.getByTestId('card-confirm').click();
    await settle(page);
    expect((await game(page)).players[1]?.incoming).toHaveLength(1);
    const food = (await game(page)).players[1]?.resources['food'] ?? 0;
    await page.keyboard.press('Enter');
    await settle(page);

    // ── Governo (P1): revelação na fase 1, depois da tela de privacidade.
    await expect(page.getByTestId('privacy')).toContainText('Vez de');
    await page.getByTestId('privacy-ready').click();
    await expect(page.getByTestId('card-caption')).toContainText('Pilhagem');
    await page.screenshot({ path: 'screenshots/phase4-reveal-1920.png' });
    await settle(page);
    expect((await game(page)).players[1]?.resources['food']).toBe(food - 2);
    await expect(page.getByTestId('log')).toContainText('revelou Pilhagem');

    // Instalar Silos: ocupa o primeiro slot.
    await handCard(page, 'tech_silos').click();
    await page.getByTestId('card-confirm').click();
    await settle(page);
    await expect(page.getByTestId('slot-0')).toBeVisible();
    expect((await game(page)).players[1]?.permanents[0]).not.toBeNull();

    // Fim do turno de P1 e de P2; a rodada 2 começa com P0 comprando.
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Enter');
      await settle(page);
      await page.keyboard.press('Enter');
      await settle(page);
      await expect(page.getByTestId('privacy')).toContainText('Vez de');
      await ready(page);
    }
    expect(await game(page)).toMatchObject({ round: 2, activePlayer: 0, phase: 'actions' });
    await expect(page.getByTestId('log')).toContainText('comprou');
    expect(errors).toEqual([]);
  });

  test('Compra com escolha, Requisição, Drone armado e descarte até o limite', async ({ page }) => {
    const errors = watchErrors(page);
    await openGame(page, 'players=3&seed=1&speed=instant&privacy=0&cards=1');
    await foundVillages(page, 3, false);
    // Cenário: P0 com Requisição, Drone I, Carvão e mão acima do limite; P1 com Universidade 2.
    await loadState(page, (s) => {
      giveCard(s, 0, 'priority_requisition');
      giveCard(s, 0, 'drone_1');
      for (const id of ['convoy', 'convoy', 'transmutation']) giveCard(s, 0, id);
      const p0 = s.players[0];
      if (p0) p0.resources = { ...p0.resources, coal: 4 };
      s.hexes['1:1,0']?.structures.push({ uid: s.nextUid++, type: 'university', level: 2, owner: 1 });
    });

    // Requisição: escolhe o baralho n1, vê as 6 do topo e pega uma.
    await handCard(page, 'priority_requisition').click();
    await page.getByTestId('target-deck-n1').click();
    await page.locator('[data-testid^=discard-]').first().click();
    await page.getByTestId('card-confirm').click();
    await expect(page.getByTestId('tutor-choice')).toBeVisible();
    await settledShot(page, 'screenshots/phase4-tutor-1920.png');
    const options = page.locator('[data-testid^=tutor-]:not([data-testid=tutor-choice])');
    await expect(options).toHaveCount(6);
    await options.first().click();
    await settle(page);
    expect((await game(page)).pending).toBeNull();

    // Drone I armado: Sondar alcança raio +1 (um hex a 3 da Vila).
    await handCard(page, 'drone_1').click();
    await page.getByTestId('arm-survey').click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as HookWindow).__p3077.targets()))
      .toContain('0:3,0');
    await settledShot(page, 'screenshots/phase4-drone-1920.png');
    await clickHex(page, '0:3,0');
    await settle(page);
    expect((await game(page)).hexes['0:3,0']?.surveyedBy).toContain(0);

    // Entrega com a mão acima do limite: Enter abre o descarte.
    await page.keyboard.press('Enter');
    await settle(page);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('discard-modal')).toBeVisible();
    const s = await game(page);
    const excess = (s.players[0]?.hand.length ?? 0) - 6;
    expect(excess).toBeGreaterThan(0);
    const picks = page.locator('[data-testid^=limit-discard-]');
    for (let i = 0; i < excess; i++) await picks.nth(i).click();
    await settledShot(page, 'screenshots/phase4-discard-1920.png');
    await page.getByTestId('discard-confirm').click();
    await settle(page);

    // P1 (Universidade 2) escolhe a linha de compra: 1 carta n2.
    await expect(page.getByTestId('draw-choice')).toBeVisible();
    await settledShot(page, 'screenshots/phase4-draw-1920.png');
    const before = (await game(page)).players[1]?.hand.length ?? 0;
    await page.getByTestId('draw-row-1').click();
    await settle(page);
    const after = await game(page);
    expect(after.players[1]?.hand.length).toBe(before + 1);
    expect(after.phase).toBe('actions');
    expect(errors).toEqual([]);
  });

  for (const [w, h] of [
    [1920, 1080],
    [1366, 768],
  ] as const) {
    test(`capturas do HUD com cartas em ${w}×${h}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width: w, height: h });
      await openGame(page, 'players=3&seed=2&speed=instant&privacy=0&cards=1');
      await foundVillages(page, 3, false);
      await handCard(page, 'convoy').hover();
      await settledShot(page, `screenshots/phase4-hand-${w}.png`);
      await handCard(page, 'convoy').click();
      await expect(page.getByTestId('card-dialog')).toBeVisible();
      await settledShot(page, `screenshots/phase4-dialog-${w}.png`);
      await page.keyboard.press('Escape');
      await handCard(page, 'tech_orbital_logistics').click({ button: 'right' });
      await expect(page.getByTestId('card-zoom')).toBeVisible();
      await settledShot(page, `screenshots/phase4-zoom-${w}.png`);
      expect(errors).toEqual([]);
    });
  }

  test('animações de carta a 0,5× (capturas no meio do movimento)', async ({ page }) => {
    const errors = watchErrors(page);
    await openGame(page, 'players=3&seed=1&speed=0.5&privacy=0&cards=1');
    await foundVillages(page, 3, false);
    await page.keyboard.press('Enter');
    await settle(page);
    await handCard(page, 'plunder').click();
    await page.getByTestId('recipient-1').click();
    await page.getByTestId('target-resource-food').click();
    await page.getByTestId('card-confirm').click();
    await page.waitForTimeout(1400);
    await page.screenshot({ path: 'screenshots/phase4-anim-envelope.png' });
    await settle(page);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('card-caption')).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: 'screenshots/phase4-anim-reveal.png' });
    await settle(page);
    expect(errors).toEqual([]);
  });

  test('partida inteira com cartas até a tela de fim, sem travar', async ({ page }) => {
    const errors = watchErrors(page);
    await openGame(page, 'players=3&seed=3&speed=instant&privacy=0&cards=1');
    await foundVillages(page, 3, false);
    const seen = new Set<string>();
    for (let step = 0; step < 3000; step++) {
      if (await page.getByTestId('end').isVisible()) break;
      if (await page.getByTestId('intel').isVisible()) {
        await page.getByTestId('intel-ok').click();
        await settle(page);
        continue;
      }
      if (await page.getByTestId('tutor-choice').isVisible()) {
        await page.locator('[data-testid^=tutor-]:not([data-testid=tutor-choice])').first().click();
        await settle(page);
        continue;
      }
      if (await page.getByTestId('draw-choice').isVisible()) {
        await page.getByTestId('draw-row-0').click();
        await settle(page);
        continue;
      }
      if (await page.getByTestId('discard-modal').isVisible()) {
        const st = await game(page);
        const excess = (st.players[st.activePlayer]?.hand.length ?? 0) - 6;
        const picks = page.locator('[data-testid^=limit-discard-]');
        for (let i = 0; i < excess; i++) await picks.nth(i).click();
        await page.getByTestId('discard-confirm').click();
        await settle(page);
        continue;
      }
      const s = await game(page);
      if (s.stage === 'over') break;
      if (s.phase !== 'actions' && s.phase !== 'delivery') {
        await settle(page);
        continue;
      }
      // Um pouco de jogo por turno, pelas ações legais do motor (mesmo caminho dos botões):
      // uma carta e uma construção/exploração nas Ações, uma entrega na Entrega.
      const legal = await page.evaluate(() => (window as unknown as HookWindow).__p3077.legal());
      const turn = `${s.round}:${s.activePlayer}`;
      const once = (tag: string) => !seen.has(`${tag}:${turn}`);
      let pick: (typeof legal)[number] | undefined;
      let tag = '';
      if (s.phase === 'delivery') {
        if (once('deliver')) {
          pick = legal.find((a) => a.type === 'deliverCard');
          tag = 'deliver';
        }
      } else if (once('card')) {
        pick = legal.find((a) => a.type === 'installPermanent') ?? legal.find((a) => a.type === 'playCard');
        tag = 'card';
      } else if (once('map')) {
        pick =
          legal.find((a) => a.type === 'build' && !a['drone'] && !a['halfCost']) ??
          legal.find((a) => a.type === 'explore');
        tag = 'map';
      }
      if (tag) seen.add(`${tag}:${turn}`);
      if (pick) {
        seen.add(pick.type);
        await page.evaluate((a) => (window as unknown as HookWindow).__p3077.perform(a), pick);
        await settle(page);
        continue;
      }
      if (tag) continue;
      await page.keyboard.press('Enter');
      await settle(page);
    }
    await expect(page.getByTestId('end')).toBeVisible({ timeout: 30_000 });
    for (const k of ['playCard', 'installPermanent', 'deliverCard']) expect(seen.has(k), k).toBe(true);
    await settledShot(page, 'screenshots/phase4-end-1920.png');
    expect(errors).toEqual([]);
  });
});
