// DB-gated: the decomposed BattleMapV2 (v2.636 steps 1-4) renders a real
// scene end to end — scene creation writes to the LOCAL db, the Pixi
// canvas mounts, and no page errors fire. This is the "did the 11k-line
// decomposition actually keep the map alive" smoke.
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';



test.describe('battle map (local stack)', () => {
  gateDbSuite();

  test('create a scene and render the Pixi canvas', async ({ page }, testInfo) => {
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

    // v2.697 — exercise the actual Pixi camera, not just button text.
    await page.getByTitle('Fullscreen map', { exact: true }).click();
    const navigation = page.getByRole('toolbar', { name: 'Map navigation' });
    await expect(navigation).toBeVisible();
    await navigation.getByRole('button', { name: 'Fit map', exact: true }).click();
    const readCamera = () => page.evaluate(() => {
      const vp = (window as any).__PIXI_APP__.stage.children.find((c: any) => c.plugins);
      return { x: vp.center.x, y: vp.center.y, scale: vp.scale.x };
    });
    const initial = await readCamera();
    await navigation.getByRole('button',{name:'Zoom in',exact:true}).click();
    const beforeFit=await readCamera();
    await navigation.getByRole('button',{name:'Fit map',exact:true}).click();
    await navigation.getByRole('button',{name:'Fit map',exact:true}).click();
    await navigation.getByRole('button',{name:'Previous view',exact:true}).click();
    expect(await readCamera()).toEqual(beforeFit);
    await expect(navigation.getByRole('button',{name:'Previous view',exact:true})).toBeDisabled();
    await navigation.getByRole('button',{name:'Fit map',exact:true}).click();
    await navigation.getByRole('button', { name: 'Zoom in', exact: true }).click();
    expect((await readCamera()).scale).toBeGreaterThan(initial.scale);
    await navigation.getByRole('button', { name: 'Fit map', exact: true }).click();
    expect((await readCamera()).scale).toBeCloseTo(initial.scale, 3);

    const token = await page.evaluate(() => {
      const vp = (window as any).__PIXI_APP__.stage.children.find((c: any) => c.plugins);
      const token = vp.children.flatMap((c: any) => c.children ?? []).find((c: any) => c.__tokenId && c.visible);
      if (!token) throw new Error('Map regression requires a seeded token');
      const point = token.getGlobalPosition();
      (window as any).__NAV_TEST_VP = vp;
      return { id: token.__tokenId, x: token.x, y: token.y, screenX: point.x, screenY: point.y };
    });
    const bounds = (await canvas.boundingBox())!;
    await navigation.getByRole('button', { name: 'Pan', exact: true }).click();
    await page.mouse.move(bounds.x + token.screenX, bounds.y + token.screenY);
    await page.mouse.down();
    await page.mouse.move(bounds.x + token.screenX + 45, bounds.y + token.screenY + 25, { steps: 6 });
    await page.mouse.up();
    expect(Math.abs((await readCamera()).x - initial.x)).toBeGreaterThan(10);
    const unchanged = await page.evaluate(id => {
      const vp = (window as any).__NAV_TEST_VP;
      const token = vp.children.flatMap((c: any) => c.children ?? []).find((c: any) => c.__tokenId === id);
      return { x: token.x, y: token.y };
    }, token.id);
    expect(unchanged).toEqual({ x: token.x, y: token.y });
    await expect(navigation.getByRole('button', { name: 'Find selection' })).toBeDisabled();

    const beforeResize = await readCamera();
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.width - 20, height: size.height - 20 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as any).__PIXI_APP__.stage.children.includes((window as any).__NAV_TEST_VP))).toBe(true);
    const afterResize = await readCamera();
    expect(afterResize.x).toBeCloseTo(beforeResize.x, 2);
    expect(afterResize.y).toBeCloseTo(beforeResize.y, 2);
    expect(afterResize.scale).toBeCloseTo(beforeResize.scale, 3);
    await page.setViewportSize(size);
    await navigation.getByRole('button', { name: 'Select', exact: true }).click();
    await navigation.getByRole('button', { name: 'Fit map', exact: true }).click();
    const layout = await navigation.boundingBox();
    expect(layout!.x).toBeGreaterThanOrEqual(0);
    expect(layout!.x + layout!.width).toBeLessThanOrEqual(size.width);
    expect(await navigation.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

    // Space temporarily pans over a token and releases back to selection.
    const screenToken = await page.evaluate(id => {
      const vp = (window as any).__NAV_TEST_VP;
      const token = vp.children.flatMap((c: any) => c.children ?? []).find((c: any) => c.__tokenId === id);
      const point = token.getGlobalPosition();
      return { x: point.x, y: point.y };
    }, token.id);
    const currentBounds = (await canvas.boundingBox())!;
    // v2.725 — Space activates a focused toolbar button. Release that focus
    // before testing the separate hovered-canvas temporary-pan gesture.
    await page.evaluate(()=>(document.activeElement as HTMLElement)?.blur());
    const beforeSpace=await readCamera();
    await page.mouse.move(currentBounds.x + screenToken.x, currentBounds.y + screenToken.y);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(currentBounds.x + screenToken.x + 30, currentBounds.y + screenToken.y + 10, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    expect(Math.abs((await readCamera()).x-beforeSpace.x)).toBeGreaterThan(10);
    expect(await page.evaluate(id=>{
      const t=(window as any).__NAV_TEST_VP.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
      return {x:t.x,y:t.y};
    },token.id)).toEqual({x:token.x,y:token.y});
    await expect(navigation.getByRole('button', { name: 'Find selection' })).toBeDisabled();
    await page.waitForTimeout(180); // let suppression of the pan's synthetic click expire
    await page.mouse.click(currentBounds.x + screenToken.x + 30, currentBounds.y + screenToken.y + 10);
    await expect(navigation.getByRole('button', { name: 'Find selection' })).toBeEnabled();
    await navigation.getByRole('button', { name: 'Find selection' }).click();
    // v2.724 — keyboard framing matches the button after moving the camera away.
    const selectionCamera=await readCamera();
    await page.evaluate(()=>{const vp=(window as any).__NAV_TEST_VP;vp.moveCenter(vp.center.x+300,vp.center.y+200);});
    await page.mouse.move(currentBounds.x+currentBounds.width/2,currentBounds.y+currentBounds.height/2);
    await page.keyboard.press('f');
    const focusedCamera=await readCamera();
    expect(focusedCamera.x).toBeCloseTo(selectionCamera.x,2);
    expect(focusedCamera.y).toBeCloseTo(selectionCamera.y,2);
    expect(focusedCamera.scale).toBeCloseTo(selectionCamera.scale,3);
    await page.keyboard.press('f');
    await navigation.getByRole('button',{name:'Find selection',exact:true}).click();
    await navigation.getByRole('button',{name:'Previous view',exact:true}).click();
    const returnedCamera=await readCamera();
    expect(returnedCamera.x).toBeCloseTo(selectionCamera.x+300,2);
    expect(returnedCamera.y).toBeCloseTo(selectionCamera.y+200,2);
    expect(returnedCamera.scale).toBeCloseTo(selectionCamera.scale,3);
    await navigation.getByRole('button',{name:'Find selection',exact:true}).click();
    // v2.705 frames in unobstructed space, deliberately offset from canvas centre.
    const found=await page.evaluate(id=>{
      const vp=(window as any).__NAV_TEST_VP;
      const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
      return t.getGlobalPosition();
    },token.id);
    const rail=(await page.locator('.map-tool-palette').boundingBox())!;
    const dock=(await navigation.boundingBox())!;
    expect(found.x+currentBounds.x).toBeGreaterThan(rail.x+rail.width);
    expect(found.x).toBeLessThan(currentBounds.width-12);
    expect(found.y).toBeGreaterThan(60);
    expect(found.y+currentBounds.y).toBeLessThan(dock.y);
    await navigation.getByRole('button', { name: 'Fit map', exact: true }).click();
    expect(errors, 'navigation creates no browser exceptions').toEqual([]);

    // Artifact for human eyes — the rendered map goes into the report.
    // testInfo.outputPath: parallel projects (desktop/mobile) must not
    // overwrite each other's artifact.
    await page.screenshot({ path: testInfo.outputPath('battle-map-rendered.png') });
    await page.getByLabel('Map controls',{exact:true}).click();
    await expect(page.getByLabel('Grid color',{exact:true})).toBeHidden();
    // Shortcuts appear immediately, before any scrolling through settings.
    const help=page.getByRole('region',{name:'Map controls help'});
    const firstShortcut=help.getByText('Pan temporarily',{exact:true});
    const panelBox=(await help.boundingBox())!,shortcutBox=(await firstShortcut.boundingBox())!;
    expect(shortcutBox.y).toBeGreaterThanOrEqual(panelBox.y);
    expect(shortcutBox.y+shortcutBox.height).toBeLessThanOrEqual(panelBox.y+panelBox.height);
    await expect(page.getByRole('region',{name:'Map controls help'}).getByText('Find selection',{exact:true})).toBeVisible();
    await page.getByRole('region',{name:'Map controls help'}).getByText('Find selection',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath('map-focus-help.png')});
    const appearance=page.locator('.map-appearance-section > summary');
    await appearance.focus();await page.keyboard.press('Enter');
    await expect(page.getByLabel('Grid color',{exact:true})).toBeVisible();
    await page.getByLabel('Grid color',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath('map-appearance-expanded.png')});
    await appearance.focus();await page.keyboard.press('Space');
    await expect(page.getByLabel('Grid color',{exact:true})).toBeHidden();
    await expect(help).toBeVisible();
  });
});
