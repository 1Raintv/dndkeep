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
  // Synthetic portrait responses must not be intercepted by the app's SW.
  test.use({serviceWorkers:'block'});
  gateDbSuite();
  test('live grid controls restyle in place and survive reload',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const before=(await state(page)).tokens;
    const writes:string[]=[];page.on('request',r=>{if(r.method()==='PATCH' && /rest\/v1\/(scenes|scene_tokens|scene_token_placements)/.test(r.url()))writes.push(r.url());});
    const grid=()=>page.evaluate(()=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const g=vp.children.find((c:any)=>c.label==='map-grid');
      return {id:g.uid,index:vp.getChildIndex(g),alpha:g.alpha,
        colors:g.context.instructions.filter((i:any)=>i.action==='stroke').map((i:any)=>i.data.style.color)};
    });
    const original=await grid();expect(original.id).toBeDefined();
    await page.getByLabel('Map controls',{exact:true}).click();
    await page.getByLabel('Grid color',{exact:true}).selectOption('light');
    await page.getByLabel('Grid opacity',{exact:true}).fill('30');
    await expect.poll(async()=>(await grid()).alpha).toBe(.3);
    expect((await grid()).colors).toContain(0xe2e8f0);
    await page.getByLabel('Stronger lines every 5 cells').uncheck();
    await expect.poll(async()=>(await grid()).colors.length).toBe(2);
    expect((await grid()).id).toBe(original.id);expect((await grid()).index).toBe(original.index);
    const panel=await page.getByRole('region',{name:'Map controls help'}).evaluate(el=>{
      const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:visualViewport!.width,overflow:el.scrollWidth>el.clientWidth};
    });
    expect(panel.left).toBeGreaterThanOrEqual(0);expect(panel.right).toBeLessThanOrEqual(panel.width);
    expect(panel.top).toBeGreaterThanOrEqual(8);expect(panel.overflow).toBe(false);
    await page.screenshot({path:info.outputPath('grid-controls.png')});
    await page.getByLabel('Grid opacity',{exact:true}).fill('0');await expect.poll(async()=>(await grid()).alpha).toBe(0);
    await page.getByLabel('Grid opacity',{exact:true}).fill('30');
    await page.keyboard.press('Escape');await page.screenshot({path:info.outputPath('grid-light.png')});
    expect((await state(page)).tokens).toEqual(before);expect(writes).toEqual([]);
    await page.reload();await page.getByText('Local Test Campaign',{exact:true}).locator('visible=true').first().click();
    await page.locator('select').filter({has:page.locator('option',{hasText:'Ruined Keep (fixture)'})}).selectOption({label:'Ruined Keep (fixture)'});
    // Fullscreen is itself saved, so reload restores it along with grid preferences.
    await expect(page.locator('.battle-map-fullscreen')).toBeVisible();
    await page.getByLabel('Map controls',{exact:true}).click();
    await expect(page.getByLabel('Grid color',{exact:true})).toHaveValue('light');await expect(page.getByLabel('Grid opacity',{exact:true})).toHaveValue('30');
    await expect.poll(async()=>(await grid()).alpha).toBe(.3);expect((await grid()).colors).toHaveLength(2);
    await page.getByLabel('Grid color',{exact:true}).selectOption('dark');await expect.poll(async()=>(await grid()).colors[1]).toBe(0x111827);
    await page.getByRole('button',{name:'Reset grid appearance'}).click();
    await expect.poll(async()=>(await grid()).alpha).toBe(1);expect((await grid()).colors).toHaveLength(3);
    expect(errors).toEqual([]);
  });
  test('token portraits keep their rim and overview labels follow selection',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const id=Object.values((await state(page)).tokens).find((t:any)=>t.name==='Ilyana Vell')!.id;
    // Use Pixi's supported main-thread loader for deterministic fixture routing;
    // this synthetic-image test does not certify production worker fetching.
    await page.evaluate(async()=>{
      const url=performance.getEntriesByType('resource').find(r=>r.name.includes('/pixi__js.js'))!.name;
      const {Assets}=await import(/* @vite-ignore */ url);Assets.setPreferences({preferWorkers:false});
    });
    const png=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=160;c.height=80;
      const ctx=c.getContext('2d')!;ctx.fillStyle='#bcd4e6';ctx.fillRect(0,0,160,80);
      ctx.fillStyle='#304760';ctx.fillRect(60,0,40,80);return c.toDataURL().split(',')[1];
    });
    // Pixi fetches images in a worker; intercept at context scope, including CORS.
    await page.context().route('**/polish-fixture.png',route=>route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:Buffer.from(png,'base64')}));
    await page.evaluate(async id=>{
      const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ path);
      useBattleMapStore.getState().updateTokenFields(id,{imageStoragePath:'polish-fixture.png'});
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
      vp.setZoom(.4,true);vp.moveCenter(t.x,t.y);
    },id);
    const detail=()=>page.evaluate(id=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const tokens=vp.children.flatMap((c:any)=>c.children??[]).filter((c:any)=>c.__tokenId);
      const t=tokens.find((c:any)=>c.__tokenId===id);
      const sprite=t.children.find((c:any)=>c.texture && c.mask);
      return {shown:t.children.find((c:any)=>c.text==='Ilyana Vell')?.renderable,
        nameScale:t.children.find((c:any)=>c.text==='Ilyana Vell')?.scale.x,
        others:tokens.filter((c:any)=>c!==t).flatMap((c:any)=>c.children).filter((c:any)=>c.text==='Nyx Quickfingers').map((c:any)=>c.renderable),
        rimAbove:!!sprite && t.getChildIndex(t.children.find((c:any)=>c.label==='token-rim'))>t.getChildIndex(sprite),
        aspect:sprite ? sprite.width/sprite.height : 0};
    },id);
    await expect.poll(async()=>(await detail()).rimAbove).toBe(true);
    expect((await detail()).aspect).toBeCloseTo(2);
    await expect.poll(async()=>(await detail()).shown).toBe(false);
    const box=(await page.locator('canvas').first().boundingBox())!;
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await expect.poll(async()=>(await detail()).shown).toBe(true);
    expect((await detail()).nameScale).toBe(2);
    expect((await detail()).others).toEqual([false]);
    await page.screenshot({path:info.outputPath('token-overview.png')});
    await page.evaluate(()=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);vp.setZoom(1,true);});
    await expect.poll(async()=>(await detail()).others).toEqual([true]);
    await page.screenshot({path:info.outputPath('token-portrait.png')});
    expect(errors).toEqual([]);
  });
  test('sharp canvas and compact controls remain reachable',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
    await openMap(page);
    const density=await page.locator('canvas').first().evaluate(canvas=>{
      const c=canvas as HTMLCanvasElement;return {ratio:c.width/c.getBoundingClientRect().width,dpr:devicePixelRatio};
    });
    expect(density.ratio).toBeCloseTo(Math.min(2,density.dpr),1);
    await expect(page.getByText('Drag tokens · right-click for options · right/middle drag pans · wheel zooms',{exact:true})).toBeHidden();
    await page.getByLabel('Map controls',{exact:true}).click();
    await expect(page.getByRole('region',{name:'Map controls help'})).toBeVisible();
    await page.screenshot({path:info.outputPath('map-help.png')});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region',{name:'Map controls help'})).toBeHidden();
    const blocked=await page.locator('.map-navigation').evaluate(nav=>{
      const width=visualViewport!.width;
      return [...nav.querySelectorAll('button,summary')].filter(el=>{
        const r=el.getBoundingClientRect();
        if(!r.width || !r.height)return false;
        return r.left<0 || r.right>width+1 || !el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      }).map(el=>el.textContent);
    });
    expect(blocked).toEqual([]);
    // Zoom near a real token to inspect glyphs at playing scale, not only fit.
    const point=await page.evaluate(()=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId);
      const p=t.getGlobalPosition();return {x:p.x,y:p.y};
    });
    const box=(await page.locator('canvas').first().boundingBox())!;
    await page.mouse.click(box.x+point.x,box.y+point.y);
    await page.getByRole('button',{name:'Find selection',exact:true}).click();
    while(parseInt(await page.getByLabel('Map zoom').innerText())<90) await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    const names=await page.evaluate(()=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      return vp.children.flatMap((c:any)=>c.children??[]).filter((c:any)=>c.__tokenId)
        .flatMap((c:any)=>c.children).filter((c:any)=>['Nyx Quickfingers','Ilyana Vell'].includes(c.text))
        .map((c:any)=>({width:c.width,resolution:c.resolution}));
    });
    expect(names).toHaveLength(2);
    for(const name of names) {expect(name.width).toBeLessThanOrEqual(70);expect(name.resolution).toBe(2);}
    await page.screenshot({path:info.outputPath('map-detail.png')});
    expect(errors).toEqual([]);
  });
  test('find selection frames distant full footprints without moving tokens',async({page},info)=>{
    await openMap(page);
    const ids=Object.values((await state(page)).tokens).filter((t:any)=>['Ilyana Vell','Nyx Quickfingers'].includes(t.name)).map((t:any)=>t.id);
    expect(ids).toHaveLength(2);
    const box=(await page.locator('canvas').first().boundingBox())!;
    for(const id of ids) {
      const p=await page.evaluate(id=>{
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        return vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id).getGlobalPosition();
      },id);
      await page.keyboard.down('Shift');await page.mouse.click(box.x+p.x,box.y+p.y);await page.keyboard.up('Shift');
    }
    await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
    // Local-only display fixture: spread the selection and include an even footprint.
    // Navigation must never persist these positions or change shared tokens.
    await page.evaluate(async ids=>{
      const path='/src/lib/stores/battleMapStore.ts';
      const {useBattleMapStore}=await import(/* @vite-ignore */ path);
      useBattleMapStore.getState().updateTokenFields(ids[0],{x:140,y:140,size:'gargantuan'});
      useBattleMapStore.getState().updateTokenFields(ids[1],{x:1750,y:1050,size:'medium'});
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);vp.setZoom(4,true);
    },ids);
    const before=(await state(page)).tokens;
    const writes:string[]=[];page.on('request',r=>{if(r.method()==='PATCH' && /scene_tokens|scene_token_placements/.test(r.url())) writes.push(r.url());});
    await page.getByRole('button',{name:'Find selection',exact:true}).click();
    const framing=await page.evaluate(()=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const a=vp.toScreen(140,140),b=vp.toScreen(1785,1085);
      return {left:a.x,top:a.y,right:b.x,bottom:b.y,zoom:vp.scale.x};
    });
    const rail=(await page.locator('.map-tool-palette').boundingBox())!;
    const actions=(await page.getByRole('toolbar',{name:'Selected tokens'}).boundingBox())!;
    const dock=(await page.getByRole('toolbar',{name:'Map navigation'}).boundingBox())!;
    expect(framing.left+box.x).toBeGreaterThan(rail.x+rail.width);
    expect(framing.top+box.y).toBeGreaterThan(actions.y+actions.height);
    expect(framing.right).toBeLessThan(box.width-12);
    expect(framing.bottom+box.y).toBeLessThan(dock.y);
    await expect(page.getByLabel('Map zoom')).toHaveText(`${Math.round(framing.zoom*100)}%`);
    expect((await state(page)).tokens).toEqual(before);expect(writes).toEqual([]);
    await page.screenshot({path:info.outputPath('selection-framed.png')});
  });
  test('group drag cancels and undoes, and move controls reach a reconnecting player', async ({ page, browser }, info) => {
    test.setTimeout(90_000);
    const peerContext=await browser.newContext();
    const peer=await peerContext.newPage();
    const writes:string[]=[];
    const errors:string[]=[];
    page.on('request',r=>{if(r.method()==='PATCH' && /scene_tokens|scene_token_placements/.test(r.url())) writes.push(r.url());});
    page.on('pageerror',e=>errors.push(String(e)));
    try {
      await openMap(page);
      await openMap(peer,'test-player@dndkeep.local');
      const tokens=Object.values((await state(page)).tokens).filter((t:any)=>['Ilyana Vell','Nyx Quickfingers'].includes(t.name)) as any[];
      expect(tokens).toHaveLength(2);
      const box=(await page.locator('canvas').first().boundingBox())!;
      for (const token of tokens) {
        const point=await page.evaluate(id=>{
          const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
          const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
          const p=t.getGlobalPosition(); return {x:p.x,y:p.y};
        },token.id);
        await page.keyboard.down('Shift');
        await page.mouse.click(box.x+point.x,box.y+point.y);
        await page.keyboard.up('Shift');
      }
      await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
      const actions=await page.getByRole('toolbar',{name:'Selected tokens'}).boundingBox();
      if (page.viewportSize()!.width < 600) {
        expect(actions!.y).toBeGreaterThanOrEqual(132);
        expect(actions!.x).toBeGreaterThanOrEqual(76);
        expect(actions!.x+actions!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      }
      await expect.poll(async()=>Object.keys((await state(page)).locks).length).toBe(0);
      const point=await page.evaluate(id=>{
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
        const p=t.getGlobalPosition();return {x:p.x,y:p.y,scale:vp.scale.x};
      },tokens[0].id);
      for(const cancel of [true,false]) {
        await expect.poll(async()=>Object.keys((await state(page)).locks).length).toBe(0);
        await page.mouse.move(box.x+point.x,box.y+point.y);
        await page.mouse.down();
        await page.mouse.move(box.x+point.x,box.y+point.y+70*point.scale,{steps:6});
        for(const token of tokens) {
          await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBeCloseTo(token.y+70,2);
          await expect.poll(async()=>{const s=await state(peer);return s.locks;}).toHaveProperty(token.id);
        }
        if(cancel) await page.keyboard.press('Escape');
        await page.mouse.up();
        for(const token of tokens) await expect.poll(async()=>(await state(peer)).locks[token.id]).toBeFalsy();
        if(!cancel) {
          await expect(page.getByRole('button',{name:'↶ Undo move tokens',exact:true})).toBeVisible();
          await page.keyboard.press('Control+z');
        }
        for(const token of tokens) await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBe(token.y);
        if(cancel) expect(writes,'group cancellation never saves a drop').toHaveLength(0);
        await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
      }
      await peer.evaluate(async()=>{const path='/src/lib/supabase.ts'; const {supabase}=await import(/* @vite-ignore */ path); supabase.realtime.disconnect();});
      await peerContext.setOffline(true);
      await page.getByRole('button',{name:'Move selection down',exact:true}).click();
      for(const token of tokens) await expect.poll(async()=>(await state(page)).tokens[token.id].y).toBe(token.y+70);
      await expect(page.getByRole('button',{name:'↶ Undo move tokens',exact:true})).toBeVisible();
      await peerContext.setOffline(false);
      await peer.evaluate(async()=>{const path='/src/lib/supabase.ts'; const {supabase}=await import(/* @vite-ignore */ path); supabase.realtime.connect();});
      for(const token of tokens) await expect.poll(async()=>(await state(peer)).tokens[token.id].y,{timeout:20_000}).toBe(token.y+70);
      await page.getByRole('button',{name:'↶ Undo move tokens',exact:true}).click();
      for(const token of tokens) await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBe(token.y);
      await expect(page.getByRole('button',{name:'↷ Redo move tokens',exact:true})).toBeEnabled();
      await page.screenshot({path:info.outputPath('redo-ready.png')});
      await page.getByRole('button',{name:'↷ Redo move tokens',exact:true}).click();
      for(const token of tokens) await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBe(token.y+70);
      await page.getByRole('button',{name:'↶ Undo move tokens',exact:true}).click();
      for(const token of tokens) await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBe(token.y);
      await page.getByRole('button',{name:'Pan',exact:true}).click();
      await page.mouse.move(box.x+point.x,box.y+point.y);
      await page.mouse.down();
      await page.mouse.move(box.x+point.x+40,box.y+point.y+40,{steps:4});
      await page.mouse.up();
      for(const token of tokens) expect((await state(page)).tokens[token.id].y).toBe(token.y);
      await page.getByRole('button',{name:'Select',exact:true}).click();
      await page.getByRole('button',{name:'Fit map',exact:true}).click();
      expect(errors).toEqual([]);
      await page.screenshot({path:info.outputPath('group-undo.png')});
    } finally { await peerContext.setOffline(false); await peerContext.close(); }
  });

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

  test('interrupted pan releases the camera and a fresh gesture still works',async({page,context})=>{
    test.setTimeout(60_000);
    await page.addInitScript(()=>window.addEventListener('pointerdown',event=>{
      if(event.target instanceof HTMLCanvasElement) (window as any).__panPointer=event.pointerId;
    },true));
    await openMap(page);
    await page.getByRole('button',{name:'Pan',exact:true}).click();
    const camera=()=>page.evaluate(()=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      return {x:vp.center.x,y:vp.center.y};
    });
    const box=(await page.locator('canvas').first().boundingBox())!;
    const x=box.x+box.width/2,y=box.y+box.height/2;
    const before=(await state(page)).tokens;
    const cdp=await context.newCDPSession(page);
    // Optional responsiveness stress; Chromium CPU slowdown is not a phone FPS claim.
    if(process.env.E2E_SLOW_CPU==='1') await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    for(const kind of ['mouse','touch']) {
      const start=async()=>{
        if(kind==='mouse') {await page.mouse.move(x,y);await page.mouse.down();}
        else await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
      };
      const move=async(offset:number)=>{
        if(kind==='mouse') await page.mouse.move(x+offset,y+offset);
        else await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+offset,y:y+offset}]});
      };
      const end=async()=>{
        if(kind==='mouse') await page.mouse.up();
        else await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      };
      for(const interruption of ['capture','escape','hidden']) {
        await start();await move(20);
        if(interruption==='capture') await page.locator('canvas').first().evaluate(canvas=>canvas.releasePointerCapture((window as any).__panPointer));
        if(interruption==='escape') await page.keyboard.press('Escape');
        if(interruption==='hidden') await page.evaluate(()=>{
          Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
          document.dispatchEvent(new Event('visibilitychange'));
          delete (document as any).visibilityState;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await move(21); // flush pending lostpointercapture delivery
        const stopped=await camera();
        await move(70);await end();
        expect(await camera(),`${kind}/${interruption}`).toEqual(stopped);
        await start();await move(30);await end();
        expect(await camera(),`${kind}/${interruption} recovery`).not.toEqual(stopped);
      }
    }
    const after=(await state(page)).tokens;
    for(const id of Object.keys(before)) expect([after[id].x,after[id].y]).toEqual([before[id].x,before[id].y]);
    await cdp.detach();
  });
});
