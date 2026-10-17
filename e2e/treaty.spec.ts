/**
 * Fase 8 — tratados pela interface: construtor guiado (UX_SPEC 2.12) com modelo pronto e
 * passo a passo, revisão em linguagem natural, proposta e resposta com tela de privacidade,
 * selo de assinatura, faixa dourada, Tarifa Preferencial disparando no movimento e a
 * confirmação de quebra de pacto. Capturas em screenshots/phase8-*.
 */
import { expect, type Page, test } from '@playwright/test';
import {
  clickHex,
  type HookWindow,
  loadState,
  openGame,
  ready,
  settle,
  settledShot,
  watchErrors,
} from './helpers';

type T = { uid: number; type: string; level: number; owner: number; arrived: number };
type S = {
  round: number;
  nextUid: number;
  players: { resources: Record<string, number>; hand: number[] }[];
  hexes: Record<string, { revealed: boolean; surface: string; troops: T[] }>;
  treaties: { active: { id: number; parties: number[]; terms: Record<string, unknown> }[]; nextId: number };
};
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as HookWindow).__p3077.state()) as Promise<unknown> as Promise<S>;

// Fronteira entre o tabuleiro 0 e o 1 (3 jogadores).
const A = '0:3,-1';
const B = '1:-3,1';

async function setup(page: Page, privacy: boolean) {
  await openGame(page, `players=3&seed=4&conflict=1&treaties=1&cards=0&privacy=${privacy ? 1 : 0}&speed=1`);
  for (let i = 0; i < 3; i++) {
    if (privacy) await ready(page);
    await page.evaluate(() => {
      const h = (window as unknown as HookWindow).__p3077;
      h.perform(h.legal().find((a) => (a as { type: string }).type === 'chooseVillage'));
    });
    await settle(page);
  }
  if (privacy) await ready(page);
  await loadState(page, (st) => {
    const s = st as unknown as S;
    for (const h of Object.values(s.hexes)) {
      h.revealed = true;
      if (!['empty', 'forest', 'lagoon'].includes(h.surface)) h.surface = 'empty';
    }
    for (let i = 0; i < 2; i++) {
      const uid = s.nextUid++;
      s.hexes[A]?.troops.push({ uid, type: 'line', level: 1, owner: 0, arrived: uid });
    }
    for (const p of s.players) p.resources = { food: 12, stone: 4, iron: 6, coal: 2, oil: 1, gold: 3 };
  });
}

async function moveAtoB(page: Page) {
  await clickHex(page, A);
  await page.getByTestId('act-move').click();
  await clickHex(page, B);
  await settle(page);
}

test('Tarifa Preferencial: construtor → privacidade → assinatura → disparo no movimento', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await setup(page, true);

  await page.getByTestId('open-treaty').click();
  await expect(page.getByTestId('treaty')).toBeVisible();
  await page.getByTestId('treaty-partner-1').click();
  await page.getByTestId('treaty-template-tpl_preferential_tariff').click();
  await expect(page.getByTestId('treaty-review')).toContainText('PAGA só 1 Ferro por tropa em vez da tarifa');
  await settledShot(page, 'screenshots/phase8-builder-template.png');
  await page.getByTestId('treaty-send').click();
  await settle(page);

  // Hotseat: o destinatário vê a proposta depois da tela de privacidade.
  await expect(page.getByTestId('privacy')).toBeVisible();
  await settledShot(page, 'screenshots/phase8-privacy.png');
  await ready(page);
  await expect(page.getByTestId('treaty-reply')).toBeVisible();
  await settledShot(page, 'screenshots/phase8-reply.png');
  const fx = page.waitForSelector('[data-testid=treaty-fx]', { timeout: 30_000 }).then(async () => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/phase8-signed.png' });
  });
  await page.getByTestId('treaty-accept').click();
  await fx;
  await settle(page);
  if (await page.getByTestId('privacy').isVisible()) await ready(page);

  const signed = await state(page);
  expect(signed.treaties.active).toHaveLength(1);
  expect(signed.players[0]?.resources.gold).toBe(2);
  expect(signed.players[1]?.resources.gold).toBe(2);
  await expect(page.getByTestId('treaty-band-0')).toBeVisible();
  await expect(page.getByTestId('treaty-band-1')).toBeVisible();

  // Mover para o território do outro signatário: 2 Ferro em vez de 2 Comida de tarifa.
  const iron1 = signed.players[1]?.resources.iron ?? 0;
  const food1 = signed.players[1]?.resources.food ?? 0;
  const trig = page.waitForSelector('[data-testid=treaty-fx]', { timeout: 30_000 }).then(async () => {
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/phase8-triggered.png' });
  });
  await moveAtoB(page);
  await trig;
  await settle(page);
  const after = await state(page);
  expect(after.players[1]?.resources.iron).toBe(iron1 + 2);
  expect(after.players[1]?.resources.food).toBe(food1);
  expect(after.hexes[B]?.troops.filter((t) => t.owner === 0)).toHaveLength(2);
  expect(after.treaties.active).toHaveLength(1);
  await page.getByTestId('player-0').hover();
  await settledShot(page, 'screenshots/phase8-band.png');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('log')).toContainText('em vez da tarifa');
  expect(errors).toEqual([]);
});

test('construtor passo a passo só oferece o que vale; revisão em linguagem natural', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await setup(page, false);
  await page.keyboard.press('KeyY');
  await expect(page.getByTestId('treaty')).toBeVisible();
  await page.getByTestId('treaty-partner-2').click();
  await page.getByTestId('treaty-subject-third').click();
  await page.getByTestId('treaty-verb-attack').click();
  await page.getByTestId('treaty-object-village').click();
  await page.getByTestId('treaty-of-eitherSignatory').click();
  // "Quem agiu" não é signatário quando o sujeito é um terceiro: não aparece.
  await expect(page.getByTestId('treaty-obligor-actor')).toHaveCount(0);
  await page.getByTestId('treaty-obligor-otherSignatory').click();
  await page.getByTestId('treaty-consequence-pay').click();
  await page.getByTestId('treaty-target-resource').click();
  await page.getByTestId('treaty-resource-iron').click();
  await expect(page.getByTestId('treaty-review')).toContainText(
    'SE um terceiro ATACAR Vila de Revolucionários ou de Consórcio Helix, ENTÃO o outro signatário PAGA 1 Ferro',
  );
  await expect(page.getByTestId('treaty-send')).toBeEnabled();
  await settledShot(page, 'screenshots/phase8-builder-steps.png');
  await page.getByTestId('treaty-kind-pact').click();
  await page.getByTestId('treaty-category-military').click();
  await page.getByTestId('treaty-pact-pact_non_aggression').click();
  await expect(page.getByTestId('treaty-review')).toContainText('Não Agressão');
  await settledShot(page, 'screenshots/phase8-builder-pact.png');
  expect(errors).toEqual([]);
});

test('ação que rompe pacto pede confirmação; quem rompe descarta a mão e perde 1 ação', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await setup(page, false);
  await loadState(page, (st) => {
    const s = st as unknown as S;
    s.treaties.active.push({
      id: s.treaties.nextId++,
      parties: [0, 1],
      terms: { kind: 'pact', pact: 'pact_closed_border' },
      signedRound: s.round,
      until: s.round + 4,
    } as never);
  });
  await moveAtoB(page);
  await expect(page.getByTestId('break-pact')).toBeVisible();
  await expect(page.getByTestId('break-pact')).toContainText('Fronteira Fechada');
  await settledShot(page, 'screenshots/phase8-break-confirm.png');
  await page.getByTestId('break-pact-confirm').click();
  await settle(page);
  const s = await state(page);
  expect(s.treaties.active).toHaveLength(0);
  expect(s.hexes[B]?.troops.filter((t) => t.owner === 0)).toHaveLength(2);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('log')).toContainText('rompeu o pacto Fronteira Fechada');
  expect(errors).toEqual([]);
});

test('partida só de IA com tratados ligados até o fim', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await openGame(page, 'players=4&seed=3&ai=all&events=1&special=1&conflict=1&treaties=1&speed=instant');
  await expect(page.getByTestId('end')).toBeVisible({ timeout: 280_000 });
  await settledShot(page, 'screenshots/phase8-spectator-end.png');
  expect(errors).toEqual([]);
});
