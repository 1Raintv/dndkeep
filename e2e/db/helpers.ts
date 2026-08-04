// Shared helpers for the DB-backed (local-stack-only) specs.
import { expect, type Page, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SEED_EMAIL = 'test-dm@dndkeep.local';
export const SEED_PASSWORD = 'dndkeep-local-test';

/** The Supabase URL the dev server under test is actually using (Vite
 *  loads .env.local over .env). Null when no override exists. */
export function localSupabaseUrl(): string | null {
  const p = join(process.cwd(), '.env.local'); // playwright runs from the repo root
  if (!existsSync(p)) return null;
  const m = readFileSync(p, 'utf-8').match(/^VITE_SUPABASE_URL=(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Standard double-lock gate for every DB-backed describe block. */
export function gateDbSuite(): void {
  test.skip(process.env.E2E_DB !== '1', 'set E2E_DB=1 (with a local Supabase) to run DB-backed tests');
  test.beforeEach(() => {
    const url = localSupabaseUrl();
    test.skip(!url || !/127\.0\.0\.1|localhost/.test(url), `refusing DB tests: non-local Supabase (${url ?? 'absent'})`);
  });
}

/** Sign in as the seeded DM and wait for the app shell.
 *
 *  OBSERVED (2026-08-03): filling immediately after navigation can race
 *  React hydration — the first controlled render blanks a too-early
 *  fill (failure shot: password populated, email empty, native
 *  "Please fill out this field" bubble). Fill-and-verify with retries. */
export async function signInAsSeedDm(page: Page): Promise<void> {
  await page.goto('/auth');
  const email = page.getByPlaceholder(/your@email.com/i);
  const password = page.getByPlaceholder(/your password/i);
  await email.waitFor({ timeout: 15_000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await email.fill(SEED_EMAIL);
    await password.fill(SEED_PASSWORD);
    if ((await email.inputValue()) === SEED_EMAIL &&
        (await password.inputValue()) === SEED_PASSWORD) break;
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: /enter the keep/i }).click();
  await expect(email).toBeHidden({ timeout: 20_000 });
}
