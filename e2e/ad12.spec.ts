import { test, expect, type Page } from '@playwright/test';

/**
 * AD-12 §4 — screenshot/regression coverage for the 12 static representative states, rendered
 * by src/ad12/gallery/main.tsx at /design/ad12/ (a dev-only gallery, never a product route).
 *
 * Pass 2 update: a few states now play a real Web Animations API entrance on mount (SlipCascade's
 * stagger, RootPlane's settle) — `document.getAnimations()` isn't empty (WAAPI animations skip
 * the CSS-only `animations: 'disabled'` trick `toHaveScreenshot` uses by default), so every
 * navigation here waits for those to actually finish before asserting a screenshot. Baselines
 * are still the RESTING shape only; nothing about Pass 1's own resting states changed, only how
 * they arrive.
 */
async function gotoAndSettle(page: Page) {
  await page.goto('/design/ad12/');
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
}

const STATE_TITLES: Record<number, string> = {
  1: 'answer-at-rest',
  2: 'slip-cascade-settled',
  3: 'move-tray-at-rest',
  4: 'move-card-variants',
  5: 'miss-reply',
  6: 'breakthrough',
  7: 'early-got-it-challenge',
  8: 'root-three-forms',
  9: 'listening-voice-planes',
  10: 'teach-back-m2b',
  11: 'home-and-bank',
  12: 'reduced-motion-variants',
};

test.describe('AD-12 static states gallery', () => {
  for (const [n, slug] of Object.entries(STATE_TITLES)) {
    test(`state ${n} — ${slug}`, async ({ page }) => {
      await gotoAndSettle(page);
      const section = page.locator(`[data-ad12-state="${n}"]`);
      await expect(section).toBeVisible();
      await expect(section).toHaveScreenshot(`state-${n}-${slug}.png`);
    });
  }

  test('states 2 and 6 under prefers-reduced-motion still render (F8)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoAndSettle(page);
    await expect(page.locator('[data-ad12-state="2"]')).toBeVisible();
    await expect(page.locator('[data-ad12-state="6"]')).toBeVisible();
    await expect(page.locator('[data-ad12-state="2"]')).toHaveScreenshot('state-2-reduced-motion.png');
    await expect(page.locator('[data-ad12-state="6"]')).toHaveScreenshot('state-6-reduced-motion.png');
  });

  test('no horizontal scroll at either viewport (tap targets/text fit the screen)', async ({ page }) => {
    await gotoAndSettle(page);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1: sub-pixel rounding only
  });

  test('triggering a breakthrough (state 6) fills the next depth tab and the plane travels there (FLIP)', async ({ page }) => {
    await gotoAndSettle(page);
    const scene = page.locator('[data-ad12-state="6"]');
    const trigger = scene.getByRole('button', { name: /Trigger breakthrough/ });
    const tabs = scene.locator('.ad12-depth-row__tab');
    const filledBefore = await tabs.evaluateAll((els) => els.filter((el) => el.classList.contains('is-filled')).length);
    await trigger.click();
    // Let the FLIP travel (--ad12-t-transition, 700ms) and the tab's own pop settle finish.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    const filledAfter = await tabs.evaluateAll((els) => els.filter((el) => el.classList.contains('is-filled')).length);
    expect(filledAfter).toBe(filledBefore + 1);
    await expect(scene).toHaveScreenshot('state-6-after-breakthrough.png');
  });

  test('unlocking the Bank (state 11) animates the locked lid into the open list', async ({ page }) => {
    await gotoAndSettle(page);
    const section = page.locator('[data-ad12-state="11"]');
    const trigger = section.getByRole('button', { name: /Simulate Story 1-4 complete/ });
    await trigger.click();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
    await expect(trigger).toBeDisabled();
    await expect(section).toHaveScreenshot('state-11-after-bank-unlock.png');
  });
});
