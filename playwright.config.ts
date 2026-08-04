// Playwright E2E + visual regression config (v2.638).
//
// OPTIONAL tooling — nothing in the normal dev/deploy workflow requires
// this. `npm run dev` / `deploy.bat` behave exactly as before. Run with:
//   npx playwright test            # all non-DB tests
//   npx playwright test --ui       # interactive runner
//   E2E_DB=1 npx playwright test   # ALSO run tests that write to the DB —
//                                  # ONLY with a local Supabase (.env.local
//                                  # pointing at 127.0.0.1). See e2e/README.md.
//
// Pinned @playwright/test@1.49 — the last line compatible with Node 18,
// which both dev machines currently run. Bump alongside a Node upgrade.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The DB tier renders WebGL dice + the Pixi map under SwiftShader; at
  // full parallelism on one dev server the heavy mobile tests contend on
  // CPU and flake (~1-2 per full run, different each time). Three workers
  // + one retry makes the combined 18-test run deterministic; the db tier
  // alone is stable at full speed.
  workers: 3,
  retries: 1,
  // Visual baselines live next to the specs, named per-platform so a
  // Windows-generated baseline doesn't fight the Linux CI render.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      // Kill CSS animation nondeterminism; small threshold absorbs
      // font-rasterization jitter.
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Pixel 5, not iPhone: iPhone emulation needs the WebKit binary — an
    // extra ~90 MB download on every machine/CI for little gain here.
    // Chromium covers both viewports with one browser install.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npx vite --port 5173',
    url: 'http://localhost:5173',
    // Reuse the dev server if one is already running (the usual case
    // during iteration); CI starts its own.
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
