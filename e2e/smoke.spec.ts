// Logged-out smoke tests — safe against ANY backend (they never
// authenticate and never write). These are the always-on tier; tests
// that need a database live under e2e/db/ and are gated on E2E_DB=1.
import { expect, test } from '@playwright/test';

// Fail any test that produced a console error — the app's standing
// invariant is a clean console on public pages.
function collectConsoleErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(String(err)));
  return errors;
}

test('landing page renders with hero CTAs and a clean console', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/DNDKeep/i);
  await expect(page.getByRole('button', { name: /get started free/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('auth page renders its form', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/auth');
  await expect(page.getByPlaceholder(/your@email.com/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /enter the keep/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test('protected routes bounce a logged-out visitor to /auth', async ({ page }) => {
  await page.goto('/dice');
  await expect(page.getByRole('button', { name: /enter the keep/i })).toBeVisible({ timeout: 15_000 });
});

test('SRD attribution page loads (lazy route chunk resolves)', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/srd');
  // The page's own h1 proves the lazy chunk downloaded and mounted.
  // (A generic h1 locator is a trap here: the SEO shell leaves a hidden
  // landing-page h1 in the DOM that .first() can land on.)
  await expect(page.getByRole('heading', { name: 'SRD Attribution' })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});
