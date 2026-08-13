// DB-gated: v2.664 manual fog.
//
// Guards the bug this shipped with. Every other tool's exclusivity list
// clears the fog brush; adding that line to the fog toggle's OWN
// updater made it switch itself off the instant it switched on. The
// button still highlighted for a frame, the console stayed clean, and
// the type-checker had nothing to say — the tool was simply inert.
//
// So this asserts the tool actually STAYS on (its panel is mounted) and
// that a stroke reaches the database, rather than just that a button
// exists.
import { test, expect } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

test.describe('manual fog (local stack)', () => {
  gateDbSuite();

  test('brush stays active and a stroke persists reveals', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    await signInAsSeedDm(page);
    await page.goto('/campaigns');
    await page.locator('text=Local Test Campaign').locator('visible=true').first().click();
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    // Put the scene in manual mode through the UI, so the settings
    // radio is covered too rather than reaching into the DB.
    // Target the SCENE settings by title — a bare /settings/i matches
    // the campaign header button first and opens the wrong dialog.
    await page.locator('button[title^="Scene settings"]').first().click();
    await page.locator('input[name="fog-mode"]').nth(1).check();
    await page.getByRole('button', { name: /^save$/i }).first().click();
    await page.waitForTimeout(1500);

    // The brush only exists in manual mode — that it appeared at all is
    // the first half of the assertion.
    const brush = page.locator('button[title*="Fog brush" i]');
    await expect(brush).toHaveCount(1);
    await brush.first().click();

    // ...and the second half: it is STILL on a beat later. This is the
    // self-cancelling-toggle guard; a render-only check passed while
    // the tool was dead.
    await expect(page.locator('button:has-text("Medium")')).toBeVisible({ timeout: 5_000 });

    // Watch for the commit. The stroke writes once, on pointer-up, as a
    // PATCH to scenes — asserting on the request is direct evidence the
    // reveal left the browser, and unlike an in-page DB read it cannot
    // report "inconclusive" and be mistaken for a pass.
    const commits: number[] = [];
    page.on('response', r => {
      if (r.url().includes('/rest/v1/scenes') && r.request().method() === 'PATCH') {
        commits.push(r.status());
      }
    });

    // Paint a stroke.
    const box = (await canvas.boundingBox())!;
    const y = box.y + box.height * 0.45;
    await page.mouse.move(box.x + box.width * 0.30, y);
    await page.mouse.down();
    for (let i = 3; i <= 6; i++) {
      await page.mouse.move(box.x + box.width * (i / 10), y, { steps: 4 });
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);

    // Exactly one commit for the whole stroke — more than one means the
    // per-move write guard regressed and the brush is hammering the DB
    // once per mouse pixel.
    expect(commits.length).toBe(1);
    expect(commits[0]).toBeLessThan(300);

    expect(errors).toEqual([]);
  });
});
