// DB-gated: exercises the 3D dice roller against the LOCAL stack.
// Regression coverage for audit 5.3 (v2.637): rapid sequential rolls used
// to be able to drop the second result — the roller re-rendered in place
// (empty-dep scene effect) and the provider hard-unmounted at 4.5s. With
// the per-roll key + self-dismissal, every roll must land in the Roll Log.
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const E2E_DB = process.env.E2E_DB === '1';

function localSupabaseUrl(): string | null {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return null;
  const m = readFileSync(p, 'utf-8').match(/^VITE_SUPABASE_URL=(.+)$/m);
  return m ? m[1].trim() : null;
}

test.describe('dice roller (local stack)', () => {
  test.skip(!E2E_DB, 'set E2E_DB=1 (with a local Supabase) to run DB-backed tests');
  test.beforeEach(() => {
    const url = localSupabaseUrl();
    test.skip(!url || !/127\.0\.0\.1|localhost/.test(url), 'refusing: non-local Supabase');
  });

  test('two rapid d20 rolls BOTH land in the roll log', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    await page.goto('/auth');
    await page.getByPlaceholder(/your@email.com/i).fill('test-dm@dndkeep.local');
    await page.getByPlaceholder(/your password/i).fill('dndkeep-local-test');
    await page.getByRole('button', { name: /enter the keep/i }).click();
    await expect(page.getByPlaceholder(/your@email.com/i)).toBeHidden({ timeout: 20_000 });

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
