// DB-gated: the decomposed BattleMapV2 (v2.636 steps 1-4) renders a real
// scene end to end — scene creation writes to the LOCAL db, the Pixi
// canvas mounts, and no page errors fire. This is the "did the 11k-line
// decomposition actually keep the map alive" smoke.
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';



test.describe('battle map (local stack)', () => {
  gateDbSuite();

  test('create a scene and render the Pixi canvas', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    // Diagnostics: surface FAILED scenes REST writes in the failure output
    // (2xx writes are healthy — don't pollute the clean-errors assertion).
    page.on('response', async r => {
      if (r.url().includes('/rest/v1/scenes') && r.request().method() !== 'GET' && r.status() >= 400) {
        const body = (await r.text().catch(() => '?')).slice(0, 200);
        errors.push(`[diag] ${r.request().method()} scenes -> ${r.status()} :: ${body}`);
      }
    });

    await signInAsSeedDm(page);

    await page.goto('/campaigns');
    await page.locator('text=Local Test Campaign').locator('visible=true').first().click();

    // Campaign opens on the Battle Map tab. Create the first scene if this
    // is a fresh db reset; reuse it on subsequent runs (both paths valid).
    //
    // OBSERVED (2026-08-03): when the desktop and mobile projects hit a
    // fresh db in parallel, two DM sessions race the first-scene create
    // and BOTH UIs can stay stuck on the empty state even though the
    // insert 201s. A reload resyncs. The retry below makes the spec
    // deterministic; the underlying multi-client refresh gap is worth an
    // app-side look someday (real DMs rarely dual-create, so low priority).
    // NOTE the isVisible() trap: it reports INSTANT state (its timeout
    // option is ignored) — probing with it here skipped scene creation
    // whenever the empty-state hadn't rendered yet. Wait with waitFor/
    // expect(...or...) instead.
    const canvasLoc = page.locator('canvas').first();
    const createScene = page.getByRole('button', { name: /create first scene/i });
    for (let attempt = 0; attempt < 3; attempt++) {
      // Whichever the campaign shows first: an existing scene's canvas,
      // or the fresh-db empty state.
      await expect(canvasLoc.or(createScene).first()).toBeVisible({ timeout: 20_000 });
      if (await canvasLoc.isVisible()) break;
      await createScene.click();
      const modal = page.getByText('New scene');
      await modal.waitFor({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await modal.waitFor({ state: 'hidden', timeout: 10_000 });
      try {
        await canvasLoc.waitFor({ timeout: 8_000 });
        break;
      } catch {
        // OBSERVED: concurrent DM sessions racing the first-scene create
        // can leave a stale empty state despite a 201 — reload resyncs.
        // Reload may land on the campaign LIST (dashboard is state-driven),
        // so re-enter the campaign if the card is showing.
        await page.reload();
        const card = page.locator('text=Local Test Campaign').locator('visible=true').first();
        try { await card.waitFor({ timeout: 4_000 }); await card.click(); } catch { /* already on dashboard */ }
      }
    }

    // The decomposition's proof-of-life: a canvas element mounts (Pixi
    // Application) and survives long enough to be screenshotted.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500); // let ViewportHost + layers settle
    expect(errors, 'no page errors while mounting the map').toEqual([]);

    // Artifact for human eyes — the rendered map goes into the report.
    await page.screenshot({ path: 'test-results/battle-map-rendered.png' });
  });
});
