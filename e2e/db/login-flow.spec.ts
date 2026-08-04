// DB-backed E2E tests — GATED. These authenticate and write, so they must
// ONLY ever run against a LOCAL Supabase (supabase start + .env.local).
// Two locks have to open:
//   1. E2E_DB=1 in the environment (explicit opt-in per run)
//   2. .env.local must exist AND point VITE_SUPABASE_URL at localhost —
//      we hard-refuse otherwise, because this repo's default .env points
//      at PRODUCTION. (Vite loads .env.local over .env, so this file is
//      exactly what the dev server under test is using.)
//
// Credentials below are the supabase/seed.sql fixtures — local-only fake
// data recreated by every `supabase db reset`.
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const E2E_DB = process.env.E2E_DB === '1';

function localSupabaseUrl(): string | null {
  const p = join(process.cwd(), '.env.local'); // playwright runs from the repo root
  if (!existsSync(p)) return null;
  const m = readFileSync(p, 'utf-8').match(/^VITE_SUPABASE_URL=(.+)$/m);
  return m ? m[1].trim() : null;
}

const SEED_EMAIL = 'test-dm@dndkeep.local';
const SEED_PASSWORD = 'dndkeep-local-test';

test.describe('db-backed flows (local stack only)', () => {
  test.skip(!E2E_DB, 'set E2E_DB=1 (with a local Supabase) to run DB-backed tests');
  test.beforeEach(() => {
    const url = localSupabaseUrl();
    const isLocal = !!url && /127\.0\.0\.1|localhost/.test(url);
    test.skip(!isLocal, `refusing DB tests: .env.local missing or non-local (${url ?? 'absent'})`);
  });

  test('seeded DM signs in and sees the seeded campaign', async ({ page }) => {
    await page.goto('/auth');
    await page.getByPlaceholder(/your@email.com/i).fill(SEED_EMAIL);
    await page.getByPlaceholder(/your password/i).fill(SEED_PASSWORD);
    await page.getByRole('button', { name: /enter the keep/i }).click();

    // Successful auth navigates away from /auth into the app shell.
    await expect(page.getByPlaceholder(/your@email.com/i)).toBeHidden({ timeout: 20_000 });

    // The seeded campaign proves the whole vertical: local auth, profile
    // trigger, Pro entitlement (campaigns list is Pro-gated), campaign +
    // auto-membership rows, and RLS letting the owner read them.
    await page.goto('/campaigns');
    // The name renders in both the sidebar nav and the campaign card, and
    // on mobile the sidebar copy exists but is HIDDEN (collapsed nav) —
    // filter to whichever instance is actually visible.
    await expect(
      page.locator('text=Local Test Campaign').locator('visible=true').first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
