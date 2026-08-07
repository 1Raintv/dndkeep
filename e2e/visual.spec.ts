// Visual regression baselines for the public pages.
//
// First run (or intentional redesign): npx playwright test visual --update-snapshots
// Baselines are committed under e2e/__screenshots__/<platform>/ — a diff in
// review IS the visual change. Failures archive actual/expected/diff PNGs in
// playwright-report/.
import { expect, test } from '@playwright/test';

test('landing page visual baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /get started free/i }).first()).toBeVisible();
  // Let the hero settle (fonts, images); animations are disabled globally
  // in playwright.config.ts.
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('landing.png', { fullPage: true });
});

test('auth page visual baseline', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByRole('button', { name: /enter the keep/i })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('auth.png');
});
