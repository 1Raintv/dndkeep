// DB-gated: regression test for audit 5.3 (v2.637) — the dropped-second-
// roll race. Pre-fix, a second triggerRoll while the 3D roller was still
// mounted re-rendered the SAME instance (empty-dep scene effect) and the
// second roll's onResult NEVER fired; the per-roll key now remounts a
// fresh roller per trigger.
//
// Detection signal: SkillsList inserts into roll_logs INSIDE onResult —
// i.e. only when the physics dice settle and report back. Two resolved
// rolls ⇒ two POSTs. The second trigger is dispatched DOM-directly while
// the first roll's overlay is still up (the overlay is a full-screen
// click-anywhere-dismiss layer, so a pointer click can't reach the skill
// row — dispatchEvent bypasses hit-testing, exactly reproducing a
// programmatic attack→damage style double-trigger).
//
// NOTE: /dice (the Dice Roller page) does NOT use the 3D roller — it's a
// flat roller writing straight to the DB. The 3D roller only mounts from
// character-sheet flows, hence the seeded character here.
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const SEED_CHARACTER_ID = '33333333-3333-3333-3333-333333333333';

test.describe('3D dice roller (local stack)', () => {
  gateDbSuite();

  test('rapid double-trigger: BOTH rolls resolve (audit 5.3 race)', async ({ page }) => {
    test.setTimeout(90_000); // first roll pays the ~600 KB dice-engine chunk load under SwiftShader

    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    let rollLogPosts = 0;
    page.on('response', r => {
      if (r.url().includes('/rest/v1/roll_logs') && r.request().method() === 'POST' && r.status() < 400) {
        rollLogPosts++;
      }
    });

    await signInAsSeedDm(page);
    await page.goto(`/character/${SEED_CHARACTER_ID}`);

    // Skills tab hosts the d20 check rows.
    await page.getByText('Skills', { exact: true }).first().click();
    const athletics = page.getByText('Athletics').first();
    await athletics.waitFor({ timeout: 15_000 });

    // Roll 1 — wait for it to RESOLVE (POST #1), not just mount.
    await athletics.click();
    const overlayHint = page.getByText(/click anywhere to dismiss/i);
    await expect(overlayHint).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => rollLogPosts, { timeout: 30_000 }).toBe(1);

    // Roll 2 — triggered while roll 1's overlay is STILL displayed (it
    // lingers ~5.5s after settling). Pre-fix this second trigger was
    // silently swallowed; post-fix the per-roll key remounts the roller.
    await expect(overlayHint).toBeVisible();
    await page.getByText('Acrobatics').first().dispatchEvent('click');
    await expect.poll(() => rollLogPosts, { timeout: 30_000 }).toBe(2);

    expect(errors, 'no page errors across the double-roll').toEqual([]);
  });
});
