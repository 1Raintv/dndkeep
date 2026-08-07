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

test('SRD attribution page visual baseline', async ({ page }) => {
  await page.goto('/srd');
  // Name the heading: a bare h1 locator lands on the hidden zero-size SEO-shell
  // h1 that index.html leaves in the DOM (same trap as smoke.spec.ts).
  await expect(page.getByRole('heading', { name: 'SRD Attribution' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  // The licence URLs are unbreakable tokens the CC-BY terms oblige us to print
  // verbatim; without .srd-page's overflow-wrap they pushed the mobile page to
  // 468px wide. fullPage so a regression shows up as a widened diff.
  await expect(page).toHaveScreenshot('srd.png', { fullPage: true });
});

// Guards the wrap directly, in the units that actually broke — a screenshot
// diff alone can be waved through, a hard number can't.
//
// Measure against visualViewport, NOT innerWidth. Under the mobile project's
// Pixel 5 emulation (isMobile: true), Chromium honours <meta viewport> by
// WIDENING the layout viewport to fit overflowing content — innerWidth grew
// from 393 to 468, exactly matching scrollWidth, so `scrollWidth <= innerWidth`
// was trivially true and the test passed against a page that plainly scrolled
// sideways. Caught by mutation-testing this very spec (2026-08-07).
// visualViewport.width stays at the real screen width (393) and does fail.
test('no page scrolls sideways at the device screen width', async ({ page }) => {
  for (const route of ['/', '/auth', '/srd']) {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const { scrollW, screenW } = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      screenW: Math.round(window.visualViewport?.width ?? window.innerWidth),
    }));
    expect(scrollW, `${route} overflows past the ${screenW}px screen`).toBeLessThanOrEqual(screenW);
  }
});
