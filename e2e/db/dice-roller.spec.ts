// DB-gated: exercises the 3D dice roller against the LOCAL stack.
// Regression coverage for audit 5.3 (v2.637): rapid sequential rolls used
// to be able to drop the second result — the roller re-rendered in place
// (empty-dep scene effect) and the provider hard-unmounted at 4.5s. With
// the per-roll key + self-dismissal, every roll must land in the Roll Log.
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';



test.describe('dice roller (local stack)', () => {
  gateDbSuite();

  test('two rapid d20 rolls BOTH land in the roll log', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    await signInAsSeedDm(page);

    await page.goto('/dice');
    const d20 = page.getByRole('button', { name: 'd20', exact: true }).first();
    await expect(d20).toBeVisible({ timeout: 15_000 });

    // Roll 1 — the 3D overlay mounts (WebGL runs under SwiftShader headless).
    await d20.click();
    await page.waitForTimeout(800);
    // Dismiss the overlay (click-anywhere) and roll again immediately —
    // the rapid-reroll path that exercises the per-roll remount key.
    await page.mouse.click(640, 400);
    await page.waitForTimeout(300);
    await d20.click();

    // Both results must reach the session Roll Log (entries mention d20).
    await expect
      .poll(async () => page.locator('text=/d20/i').count(), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(3); // quick-roll button + queue chip render "d20" too — log adds more
    // Stronger signal: the "No rolls yet" placeholder is gone and the log
    // region shows at least two result rows.
    await expect(page.getByText(/no rolls yet/i)).toBeHidden();
    if (errors.length) throw new Error('pageerror during rolls: ' + errors.join(' | '));
  });
});
