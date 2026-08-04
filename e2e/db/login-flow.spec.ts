// DB-backed E2E tests — GATED. These authenticate and write, so they must
// ONLY ever run against a LOCAL Supabase (supabase start + .env.local).
// Two locks (E2E_DB=1 AND a localhost URL) — see helpers.gateDbSuite.
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

test.describe('db-backed flows (local stack only)', () => {
  gateDbSuite();

  test('seeded DM signs in and sees the seeded campaign', async ({ page }) => {
    await signInAsSeedDm(page);
    // The seeded campaign proves the whole vertical: local auth, profile
    // trigger, Pro entitlement, campaign + auto-membership rows, and RLS
    // letting the owner read them. The name renders in both the sidebar
    // nav and the campaign card; on mobile the sidebar copy exists but is
    // HIDDEN (collapsed nav) — filter to the visible instance.
    await page.goto('/campaigns');
    await expect(
      page.locator('text=Local Test Campaign').locator('visible=true').first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
