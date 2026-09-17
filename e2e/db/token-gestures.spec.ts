import { expect, test, type Page } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

async function openMap(page: Page, email?: string) {
  await signInAsSeedDm(page, email);
  await page.goto('/campaigns');
  await page.getByText('Local Test Campaign', { exact: true }).locator('visible=true').first().click();
  if (email) await page.getByRole('button', { name: 'Battle Map', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  if (!email) await page.locator('select').filter({ has: page.locator('option', { hasText: 'Ruined Keep (fixture)' }) }).selectOption({ label: 'Ruined Keep (fixture)' });
  await page.getByTitle('Fullscreen map', { exact: true }).click();
  await page.getByRole('button', { name: 'Fit map', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!(window as any).__PIXI_APP__?.stage.children.some((c: any) => c.plugins))).toBe(true);
  await expect.poll(async () => Object.values((await state(page)).tokens).map((t:any)=>t.name)).toContain('Ilyana Vell');
  await expect.poll(() => page.evaluate(() => {
    const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
    return vp.children.flatMap((c:any)=>c.children??[]).filter((c:any)=>c.__tokenId).length;
  })).toBeGreaterThan(0);
}

async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/lib/stores/battleMapStore.ts';
    const { useBattleMapStore } = await import(/* @vite-ignore */ path);
    const s = useBattleMapStore.getState();
    return { tokens: s.tokens, locks: s.remoteDragLocks, dragging: s.dragging };
  });
}

test.describe('token gestures (local stack)', () => {
  gateDbSuite();
  test('cancelled drag restores both accounts and ignores other pointers', async ({ page, browser }, info) => {
    test.setTimeout(60_000);
    const peerContext = await browser.newContext();
    const peer = await peerContext.newPage();
    const errors: string[] = [];
    const writes: string[] = [];
    page.on('request', r => { if (r.method()==='PATCH' && /scene_tokens|scene_token_placements/.test(r.url())) writes.push(r.url()); });
    page.on('pageerror', e => errors.push(String(e)));
    peer.on('pageerror', e => errors.push(String(e)));
    try {
      await openMap(page);
      await openMap(peer, 'test-player@dndkeep.local');
      const peerTokens = (await state(peer)).tokens;
      const token = await page.evaluate(ids => {
        const vp = (window as any).__PIXI_APP__.stage.children.find((c: any) => c.plugins);
        const t = vp.children.flatMap((c: any) => c.children ?? []).find((c: any) => c.__tokenId && ids.includes(c.__tokenId) && c.visible);
        if (!t) throw new Error('Requires a token shared by the seeded DM and player');
        const p = t.getGlobalPosition();
        return { id: t.__tokenId, sx: p.x, sy: p.y };
      }, Object.values(peerTokens).filter((t: any) => t.name === 'Ilyana Vell').map((t:any) => t.id));
      const origin = (await state(page)).tokens[token.id];
      const box = (await page.locator('canvas').first().boundingBox())!;
      await page.mouse.move(box.x+token.sx, box.y+token.sy);
      await page.mouse.down();
      await page.mouse.move(box.x+token.sx+30, box.y+token.sy+15, { steps: 5 });
      await expect.poll(async () => (await state(peer)).tokens[token.id].x).not.toBe(origin.x);
      await expect.poll(async () => (await state(peer)).locks[token.id]).toBeTruthy();
      const held = (await state(page)).tokens[token.id];
      await page.evaluate(() => {
        window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 99, clientX: 5, clientY: 5 }));
        window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 99, clientX: 5, clientY: 5 }));
      });
      expect((await state(page)).tokens[token.id].x).toBe(held.x);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      for (const p of [page, peer]) {
        await expect.poll(async () => { const t=(await state(p)).tokens[token.id]; return [t.x,t.y]; }).toEqual([origin.x,origin.y]);
        await expect.poll(async () => (await state(p)).locks[token.id]).toBeFalsy();
      }
      // Cancellation also releases the token for the very next gesture.
      await page.mouse.move(box.x+token.sx, box.y+token.sy);
      await page.mouse.down();
      await page.mouse.move(box.x+token.sx+20, box.y+token.sy+10, { steps: 4 });
      await expect.poll(async () => (await state(peer)).locks[token.id]).toBeTruthy();
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
      await page.mouse.up();
      await expect.poll(async () => (await state(peer)).tokens[token.id].x).toBe(origin.x);
      await expect.poll(async () => (await state(peer)).locks[token.id]).toBeFalsy();
      expect(writes, 'cancelled gestures never persist a drop').toHaveLength(0);
      // A real drop snaps, persists, and reaches the other account. Move one
      // unobstructed cell inside the fixture guard room, then restore it.
      const scale = await page.evaluate(() => (window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins).scale.x);
      for (const direction of [1,-1]) {
        const startY=box.y+token.sy+(direction===-1 ? 70*scale : 0);
        await page.mouse.move(box.x+token.sx,startY);
        await page.mouse.down();
        await page.mouse.move(box.x+token.sx,startY+direction*70*scale,{steps:6});
        const saved=page.waitForResponse(r => r.request().method()==='PATCH' && /scene_tokens|scene_token_placements/.test(r.url()));
        await page.mouse.up();
        const response=await saved;
        expect(response.ok()).toBe(true);
        const targetY=origin.y+(direction===1?70:0);
        expect(response.url()).toContain(token.id);
        expect(response.request().postDataJSON().y).toBe(targetY);
        await expect.poll(async () => (await state(page)).tokens[token.id].y).toBe(targetY);
        await expect.poll(async () => (await state(peer)).tokens[token.id].y).toBe(targetY);
        await expect.poll(async () => (await state(peer)).locks[token.id]).toBeFalsy();
      }
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath('token-cancelled.png') });
    } finally { await peerContext.close(); }
  });

  test('touch pan pinches without moving tokens and continues with one finger', async ({ page, context }, info) => {
    await openMap(page);
    const before = (await state(page)).tokens;
    await page.getByRole('button', { name: 'Pan', exact: true }).click();
    const camera = () => page.evaluate(() => {
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      return { x:vp.center.x,y:vp.center.y,scale:vp.scale.x };
    });
    const initial = await camera();
    const box = (await page.locator('canvas').first().boundingBox())!;
    const x=box.x+box.width/2, y=box.y+box.height/2;
    const cdp=await context.newCDPSession(page);
    const touch = (type: string, points: {id:number;x:number;y:number}[]) => cdp.send('Input.dispatchTouchEvent', {type,touchPoints:points});
    await touch('touchStart',[{id:1,x:x-30,y},{id:2,x:x+30,y}]);
    await touch('touchMove',[{id:1,x:x-60,y},{id:2,x:x+60,y}]);
    await expect.poll(async () => (await camera()).scale).toBeGreaterThan(initial.scale*1.5);
    await touch('touchMove',[{id:1,x:x-60,y}]);
    const pinched=await camera();
    await touch('touchMove',[{id:1,x:x-40,y:y+20}]);
    await touch('touchEnd',[]);
    expect(Math.abs((await camera()).x-pinched.x)).toBeGreaterThan(1);
    const after=(await state(page)).tokens;
    for(const id of Object.keys(before)) expect([after[id].x,after[id].y]).toEqual([before[id].x,before[id].y]);
    await page.screenshot({ path: info.outputPath('touch-pan.png') });
    await cdp.detach();
  });
});
