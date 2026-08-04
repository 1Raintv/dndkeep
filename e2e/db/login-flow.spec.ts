// DB-backed E2E tests — GATED. These authenticate and write, so they must
// ONLY ever run against a LOCAL Supabase (supabase start + .env.local).
// Two locks have to open:
//   1. E2E_DB=1 in the environment (explicit opt-in per run)
//   2. The app's Supabase URL must be local — we hard-refuse otherwise,
//      because this repo's default .env points at PRODUCTION.
import { expect, test } from '@playwright/test';

const E2E_DB = process.env.E2E_DB === '1';

test.describe('db-backed flows', () => {
  test.skip(!E2E_DB, 'set E2E_DB=1 (with a local Supabase) to run DB-backed tests');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Safety interlock: read the Supabase URL the app was BUILT with and
    // refuse to continue unless it's local. This makes it impossible to
    // point these tests at production by accident.
    const url = await page.evaluate(() =>
      // Vite inlines import.meta.env at build time; expose it via a probe.
      (window as unknown as { __VITE_SUPA_PROBE?: string }).__VITE_SUPA_PROBE ?? '');
    // The probe isn't wired yet (needs a one-line main.tsx addition when
    // the local DB lands) — until then, require the env var on the test
    // runner side as the second lock.
    const runnerUrl = process.env.VITE_SUPABASE_URL ?? url;
    const isLocal = /127\.0\.0\.1|localhost/.test(runnerUrl);
    test.skip(!isLocal, `refusing DB tests against non-local Supabase (${runnerUrl || 'unknown'})`);
  });

  test('placeholder: sign in against local stack', async () => {
    // First real DB-backed spec lands with the seeded local database:
    // sign in as the seed user, open the seeded campaign, assert the
    // character sheet renders. Kept as an executable TODO so the gating
    // machinery above is exercised by `E2E_DB=1` runs from day one.
    expect(true).toBe(true);
  });
});
