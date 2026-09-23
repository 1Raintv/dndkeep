import { expect, test, type Page } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
import { SAVE_TIMEOUT_MS } from '../../src/components/Campaign/battlemap/saveTimeout';

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

// v2.746 — helpers shared by the drop-shift specs (pointer release ends
// the gesture, not its save; what the preview shows is what lands).
const ilyana=async(page:Page)=>Object.values((await state(page)).tokens).find((t:any)=>t.name==='Ilyana Vell') as any;
async function tokenPoint(page:Page,id:string) {
  return page.evaluate(id=>{
    const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
    const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
    const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();
    return {x:r.x+p.x,y:r.y+p.y,scale:vp.scale.x as number};
  },id);
}
async function campaignIdOf(page:Page) {
  return page.evaluate(async()=>{
    const s='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ s);
    const a='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ a);
    const {data}=await supabase.from('scenes').select('campaign_id').eq('id',useBattleMapStore.getState().currentSceneId).single();
    return data.campaign_id as string;
  });
}
async function setTokenPos(page:Page,id:string,x:number,y:number,campaignId:string) {
  await page.evaluate(async({id,x,y,campaignId})=>{const p='/src/lib/api/tokensApiRouter.ts';const api=await import(/* @vite-ignore */ p);await api.updateTokenPos(id,x,y,{campaignId});},{id,x,y,campaignId});
}
async function persistedToken(page:Page,id:string,campaignId:string) {
  return page.evaluate(async({id,campaignId})=>{const p='/src/lib/api/tokensApiRouter.ts';const api=await import(/* @vite-ignore */ p);const s='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ s);return (await api.listTokens(useBattleMapStore.getState().currentSceneId,{campaignId})).find((t:any)=>t.id===id);},{id,campaignId});
}
/** Samples the store every `everyMs` (Pixi load stretches this to ~100 ms; assert invariants, not timestamps). */
async function startSampler(page:Page,id:string,everyMs=20) {
  await page.evaluate(async({id,everyMs})=>{
    const s='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ s);
    const b='/src/components/Campaign/battlemap/useMapMovementBusy.ts';const {isMapMovementBusy}=await import(/* @vite-ignore */ b);
    const samples:any[]=[];(window as any).__samples=samples;
    (window as any).__sampler=setInterval(()=>{const st=useBattleMapStore.getState();const t=st.tokens[id];if(!t)return;samples.push({x:t.x,y:t.y,lock:!!st.remoteDragLocks[id],busy:isMapMovementBusy(),at:performance.now()});},everyMs);
  },{id,everyMs});
}
async function stopSampler(page:Page) {
  return page.evaluate(()=>{clearInterval((window as any).__sampler);return (window as any).__samples as {x:number;y:number;lock:boolean;busy:boolean;at:number}[];});
}
const badgeVisible=(page:Page)=>page.evaluate(()=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);return vp.children.some((c:any)=>c.label==='token-move-saving' && c.visible);});
const pendingOn=(page:Page,id:string)=>page.evaluate(async id=>{const p='/src/components/Campaign/battlemap/pendingTokenMoves.ts';return (await import(/* @vite-ignore */ p)).isTokenMovePending(id) as boolean;},id);
const busyOn=(page:Page)=>page.evaluate(async()=>{const b='/src/components/Campaign/battlemap/useMapMovementBusy.ts';return (await import(/* @vite-ignore */ b)).isMapMovementBusy() as boolean;});

test.describe('token gestures (local stack)', () => {
  // Synthetic portrait responses must not be intercepted by the app's SW.
  test.use({serviceWorkers:'block'});
  gateDbSuite();
  test('a delayed scene refresh cannot rewind a saved token drop',async({page})=>{
    await openMap(page);
    const token=Object.values((await state(page)).tokens).find((t:any)=>t.name==='Ilyana Vell') as any;
    let captured!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>captured=r),held=new Promise<void>(r=>release=r);let first=true;
    await page.route('**/rest/v1/scene_token*',async route=>{
      if(first&&route.request().method()==='GET') {first=false;const response=await route.fetch();captured();await held;await route.fulfill({response});}
      else await route.continue();
    });
    try {
      await page.evaluate(async()=>{const path='/src/components/Campaign/battlemap/refreshSceneTokens.ts';const {refreshSceneTokens}=await import(/* @vite-ignore */ path);const storePath='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ storePath);const sceneId=useBattleMapStore.getState().currentSceneId;const apiPath='/src/lib/supabase.ts';const {supabase}=await import(/* @vite-ignore */ apiPath);const {data}=await supabase.from('scenes').select('campaign_id').eq('id',sceneId).single();(window as any).__lateRefresh=refreshSceneTokens(sceneId,data.campaign_id);(window as any).__moveCampaignId=data.campaign_id;});
      await ready;
      const point=await page.evaluate(id=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y,scale:vp.scale.x};},token.id);
      await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+70*point.scale,point.y+70*point.scale,{steps:6});await page.mouse.up();
      const destination={x:token.x+70,y:token.y+70};
      await expect.poll(async()=>{const t=(await state(page)).tokens[token.id];return {x:t.x,y:t.y};}).toEqual(destination);
      await expect.poll(()=>page.evaluate(async id=>{const p='/src/components/Campaign/battlemap/pendingTokenMoves.ts';return !(await import(/* @vite-ignore */ p)).isTokenMovePending(id);},token.id)).toBe(true);
      release();await page.evaluate(()=> (window as any).__lateRefresh);
      expect((await state(page)).tokens[token.id]).toMatchObject(destination);
      const persisted=await page.evaluate(async id=>{const p='/src/lib/api/tokensApiRouter.ts';const api=await import(/* @vite-ignore */ p);const s='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ s);return (await api.listTokens(useBattleMapStore.getState().currentSceneId,{campaignId:(window as any).__moveCampaignId})).find((t:any)=>t.id===id);},token.id);
      expect(persisted).toMatchObject(destination);
      const lookup=await page.evaluate(async()=>{
        const p='/src/lib/battleMapGeometry.ts';const {loadActiveBattleMap,findTokenForParticipant}=await import(/* @vite-ignore */ p);
        const map=await loadActiveBattleMap((window as any).__moveCampaignId);
        const repeated=map.tokens.filter((t:any)=>t.creature_id&&map.tokens.filter((other:any)=>other.creature_id===t.creature_id).length>1);
        return {count:repeated.length,mismatches:repeated.filter((t:any)=>findTokenForParticipant({id:'participant-'+t.id,name:t.name,participant_type:'creature',entity_id:t.creature_id,combatant_id:t.combatant_id},[...map.tokens].reverse())?.id!==t.id).length};
      });
      expect(lookup.count).toBeGreaterThan(1);expect(lookup.mismatches).toBe(0);
    } finally {
      release();await page.unroute('**/rest/v1/scene_token*');
      await page.evaluate(async original=>{const p='/src/lib/api/tokensApiRouter.ts';const api=await import(/* @vite-ignore */ p);if((window as any).__moveCampaignId)await api.updateTokenPos(original.id,original.x,original.y,{campaignId:(window as any).__moveCampaignId});},token);
    }
  });
  test('map help uses the roomier side of a raised navigation dock',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const nav=page.locator('.map-navigation'),details=page.locator('.map-help');
    const help=page.getByRole('region',{name:'Map controls help'});
    for(const size of [page.viewportSize()!,{width:851,height:393}]) {
      await page.setViewportSize(size);
      await nav.evaluate(el=>{(el as HTMLElement).style.top='24px';(el as HTMLElement).style.bottom='auto';});
      await page.getByLabel('Map controls',{exact:true}).click();
      await expect(details).toHaveAttribute('data-placement','below');
      const assertBounds=async()=>expect.poll(()=>help.evaluate(el=>{const r=el.getBoundingClientRect(),v=visualViewport!;return r.left>=0&&r.right<=v.width&&r.top>=8&&r.bottom<=v.height-8&&r.height>=120;})).toBe(true);
      await assertBounds();
      await help.getByText('Cancel',{exact:true}).scrollIntoViewIfNeeded();await expect(help.getByText('Cancel',{exact:true})).toBeInViewport();
      await page.screenshot({path:info.outputPath(`help-below-${size.width}.png`)});
      // Reposition an already-open panel, exercising dock-change observation.
      await nav.evaluate(el=>{(el as HTMLElement).style.top='auto';(el as HTMLElement).style.bottom='20px';});
      await expect(details).toHaveAttribute('data-placement','above');await assertBounds();
      await help.getByText('Pan temporarily',{exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:info.outputPath(`help-above-${size.width}.png`)});
      await page.keyboard.press('Escape');await expect(help).toBeHidden();
      await expect(page.getByLabel('Map controls',{exact:true})).toBeFocused();
      await expect(page.locator('.battle-map-fullscreen')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
  test('named color palettes have touch targets and visible saved choices',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const token=Object.values((await state(page)).tokens).find((t:any)=>t.name==='Ilyana Vell') as any;
    // Local display fixture only: opening the palettes must not write to the DB.
    await page.evaluate(async id=>{const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ path);useBattleMapStore.getState().updateTokenFields(id,{color:0xa78bfa,lightRadiusFt:40,lightColor:null});},token.id);
    let writes=0;page.on('request',r=>{if(r.url().includes('/rest/v1/')&&r.method()==='PATCH')writes++;});
    const menu=page.getByRole('region',{name:'Token options',exact:true});
    for(const size of [page.viewportSize()!,{width:851,height:393}]) {
      await page.setViewportSize(size);await page.getByRole('button',{name:'Fit map',exact:true}).click();
      const point=await page.evaluate(id=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};},token.id);
      await page.mouse.click(point.x,point.y,{button:'right'});
      for(const [action,selected] of [['Recolor ▸','Token color Purple'],['☀ Light ▸','Neutral']]) {
        await menu.getByRole('button',{name:action,exact:true}).click();
        const palette=menu.locator('.map-token-palette');await expect(palette.getByRole('button')).toHaveCount(6);
        for(const swatch of await palette.getByRole('button').all()) {
          await swatch.scrollIntoViewIfNeeded();const bounds=(await swatch.boundingBox())!;
          expect(bounds.width).toBeGreaterThanOrEqual(44);expect(bounds.height).toBeGreaterThanOrEqual(44);
          await expect(swatch).toHaveAccessibleName(/.+/);await expect(swatch).toBeInViewport();
        }
        const choice=menu.getByRole('button',{name:selected,exact:true});await choice.focus();
        await expect(choice).toHaveAttribute('aria-pressed','true');await expect(choice.locator('.map-token-swatch-check')).toHaveText('✓');
        await page.screenshot({path:info.outputPath(`palette-${action==='Recolor ▸'?'token':'light'}-${size.width}.png`)});
        await page.keyboard.press('Escape');
      }
      await page.keyboard.press('Escape');
    }
    expect(writes).toBe(0);expect(errors).toEqual([]);
  });
  test('crowded token names yield and return when separated',async({page},info)=>{
    await openMap(page);
    const tokens=Object.values((await state(page)).tokens).filter((t:any)=>['Ilyana Vell','Nyx Quickfingers'].includes(t.name)) as any[];
    await page.evaluate(async ids=>{
      const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ path);
      // Isolate the two names: the fixture's Gargantuan boss would otherwise
      // correctly suppress a name that overlaps its footprint after separation.
      const store=useBattleMapStore.getState();useBattleMapStore.setState({tokens:Object.fromEntries(ids.map(id=>[id,store.tokens[id]]))});
      for(const id of ids)useBattleMapStore.getState().updateTokenPosition(id,1505,945);
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);vp.setZoom(1,true);vp.moveCenter(1505,945);
    },tokens.map(t=>t.id));
    const visible=()=>page.evaluate(ids=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const containers=vp.children.flatMap((c:any)=>c.children??[]).filter((c:any)=>ids.includes(c.__tokenId));
      return containers.flatMap((c:any)=>c.children.filter((n:any)=>['Ilyana Vell','Nyx Quickfingers'].includes(n.text)&&n.visible&&n.renderable)).length;
    },tokens.map(t=>t.id));
    await expect.poll(visible).toBe(1);await page.screenshot({path:info.outputPath('crowded-names.png')});
    await page.evaluate(async id=>{const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ path);useBattleMapStore.getState().updateTokenPosition(id,1715,945);(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins).moveCenter(1610,945);},tokens[1].id);
    await expect.poll(visible).toBe(2);await page.screenshot({path:info.outputPath('separated-names.png')});
  });
  test('pending token saves block another drag and rejected drops restore the origin',async({page},info)=>{
    await openMap(page);
    const token=Object.values((await state(page)).tokens).find((t:any)=>t.name==='Ilyana Vell') as any;
    const point=async()=>page.evaluate(id=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
      const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y,scale:vp.scale.x};
    },token.id);
    let release!:()=>void;const pending=new Promise<void>(r=>release=r);let writes=0;
    await page.route('**/rest/v1/scene*',async route=>{
      if(route.request().method()==='PATCH'){writes++;await pending;await route.fulfill({status:200,contentType:'application/json',body:'[]'});}else await route.continue();
    });
    try {
      const p=await point();await page.mouse.click(p.x,p.y);
      await expect(page.getByRole('button',{name:'Find selection',exact:true})).toBeEnabled();
      await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+70*p.scale,p.y+70*p.scale,{steps:5});await page.mouse.up();
      await expect.poll(()=>writes).toBe(1);
      const saving=()=>page.evaluate(()=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);return vp.children.some((c:any)=>c.label==='token-move-saving' && c.visible);});
      await expect.poll(saving).toBe(true);
      const held=(await state(page)).tokens[token.id];
      await page.keyboard.press('ArrowRight');
      await expect(page.getByText('A selected token is still saving. Please wait.')).toBeVisible();
      expect(writes).toBe(1);expect((await state(page)).tokens[token.id].x).toBe(held.x);
      await page.screenshot({path:info.outputPath('token-saving.png')});
      const moved=await point();await page.mouse.move(moved.x,moved.y);await page.mouse.down();await page.mouse.move(moved.x+20,moved.y+20);await page.mouse.up();
      await expect(page.getByText('Saving this token’s move. Please wait.')).toBeVisible();expect(writes).toBe(1);
      release();await expect.poll(saving).toBe(false);
      await expect.poll(async()=>{const t=(await state(page)).tokens[token.id];return {x:t.x,y:t.y};}).toEqual({x:token.x,y:token.y});
      await expect(page.getByText('Move could not be saved. Your token was returned and no movement was spent.')).toBeVisible();
    }finally{release();}
  });
  test('drag destination and distance stay readable at different zooms',async({page},info)=>{
    await openMap(page);
    const before=(await state(page)).tokens;
    const token=Object.values(before).find((t:any)=>t.name==='Ilyana Vell') as any;
    const errors:string[]=[];const writes:string[]=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('request',r=>{if(r.method()==='PATCH' && /scene_tokens|scene_token_placements/.test(r.url()))writes.push(r.url());});
    for(const zoom of [0.28,1]) {
      const point=await page.evaluate(({id,zoom})=>{
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
        vp.setZoom(zoom,true);vp.moveCenter(t.x,t.y);
        const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
      },{id:token.id,zoom});
      await page.mouse.move(point.x,point.y);await page.mouse.down();
      await page.mouse.move(point.x+70*zoom,point.y+70*zoom,{steps:5});
      const read=()=>page.evaluate(()=>{
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        const label=vp.children.find((c:any)=>c.label==='token-drag-distance');
        const marker=vp.children.find((c:any)=>c.label==='token-drag-preview');
        return {text:label.text,visible:label.visible,scale:label.scale.x*vp.scale.x,marker:marker.visible};
      });
      await expect.poll(read).toMatchObject({text:'5 ft  ·  Grid snap',visible:true,scale:1,marker:true});
      await page.screenshot({path:info.outputPath(`drag-preview-${zoom}.png`)});
      await page.keyboard.press('Escape');await page.mouse.up();
      await expect.poll(read).toMatchObject({visible:false,marker:false});
      await expect.poll(async()=>(await state(page)).tokens[token.id].x).toBe(token.x);
    }
    expect(writes).toEqual([]);expect(errors).toEqual([]);
    expect((await state(page)).tokens).toEqual(before);
  });
  test('a remote drag lock explains why movement is unavailable',async({page})=>{
    await openMap(page);
    const before=(await state(page)).tokens;
    const token=Object.values(before).find((t:any)=>t.name==='Ilyana Vell') as any;
    const point=await page.evaluate(async id=>{
      const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ path);
      useBattleMapStore.setState({remoteDragLocks:{[id]:'another-user'}});
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
      const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
    },token.id);
    await page.mouse.click(point.x,point.y);
    await expect(page.getByText('Another player is moving this token. Wait for them to finish.')).toBeVisible();
    expect((await state(page)).dragging).toBeNull();expect((await state(page)).tokens).toEqual(before);
  });
  test('inline rename keeps typing and cancel inside the map menu',async({page},info)=>{
    await openMap(page);
    const before=(await state(page)).tokens;
    const token=Object.values(before).find((t:any)=>t.name==='Ilyana Vell') as any;
    const point=await page.evaluate(id=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
      const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
    },token.id);
    await page.mouse.click(point.x,point.y,{button:'right'});
    const menu=page.getByRole('region',{name:'Token options',exact:true});
    await menu.getByRole('button',{name:'Rename…',exact:true}).click();
    const input=menu.getByLabel('Token name');await expect(input).toBeFocused();await expect(input).toHaveValue(token.name);
    await input.fill('   ');await expect(menu.getByRole('button',{name:'Save name'})).toBeDisabled();
    await input.fill('New map marker + 0');
    await page.route('**/rest/v1/**',async route=>{
      if(route.request().method()==='PATCH')await route.fulfill({status:200,contentType:'application/json',body:'[]'});
      else await route.continue();
    });
    await input.press('Enter');await expect(menu.getByRole('alert')).toContainText('Save token failed');
    await expect(input).toHaveValue('New map marker + 0');
    await expect.poll(()=>menu.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=7&&r.top>=7&&r.right<=innerWidth-7&&r.bottom<=innerHeight-7;})).toBe(true);
    await page.screenshot({path:info.outputPath('token-rename.png')});
    await menu.getByRole('button',{name:'Cancel',exact:true}).click();
    await menu.getByRole('button',{name:'Rename…',exact:true}).click();await expect(input).toHaveValue(token.name);
    await input.press('Escape');await expect(menu.getByRole('button',{name:'Rename…',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(page.locator('.battle-map-fullscreen')).toBeVisible();
    expect((await state(page)).tokens).toEqual(before);
  });
  test('failed token edits stay visible and can be retried',async({page},info)=>{
    await openMap(page);
    const token=Object.values((await state(page)).tokens).find((t:any)=>t.name==='Ilyana Vell') as any;
    const old=token.rotation??0,next=old===90?270:90,label=next===90?'East':'West';
    const p=await page.evaluate(id=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
      const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
    },token.id);
    const menu=page.getByRole('region',{name:'Token options',exact:true});
    await page.mouse.click(p.x,p.y,{button:'right'});
    await menu.getByRole('button',{name:'Facing ▸',exact:true}).click();
    const pattern='**/rest/v1/scene*';let writes=0;
    await page.route(pattern,async route=>{
      if(route.request().method()==='PATCH'){writes++;await route.fulfill({status:200,contentType:'application/json',body:'[]'});}else await route.continue();
    });
    await menu.getByRole('button',{name:new RegExp(`^[←→] ${label}`)}).click();
    await expect(menu.getByRole('alert')).toContainText('Save token failed');
    expect(writes).toBe(1);expect((await state(page)).tokens[token.id].rotation??0).toBe(old);
    await page.screenshot({path:info.outputPath('token-save-failed.png')});
    await page.unroute(pattern);
    try {
      await menu.getByRole('button',{name:new RegExp(`^[←→] ${label}`)}).click();
      await expect(menu).toBeHidden();await expect.poll(async()=>(await state(page)).tokens[token.id].rotation).toBe(next);
    }finally {
      const restored=await page.evaluate(async({id,rotation})=>{
        const apiPath='/src/lib/api/tokensApiRouter.ts',storePath='/src/lib/stores/battleMapStore.ts';
        const api=await import(/* @vite-ignore */ apiPath),{useBattleMapStore}=await import(/* @vite-ignore */ storePath);
        const ok=await api.updateToken(id,{rotation},{campaignId:'22222222-2222-2222-2222-222222222222'});
        if(ok)useBattleMapStore.getState().updateTokenFields(id,{rotation});return ok;
      },{id:token.id,rotation:old});expect(restored).toBe(true);
    }
  });
  test('token options and submenus stay inside the screen',async({page},info)=>{
    test.setTimeout(60_000); // Four submenu loops plus a viewport resize exercise the real WebGL map.
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const before=(await state(page)).tokens;
    const token=Object.values(before).find((t:any)=>t.name==='Ilyana Vell') as any;
    const menu=page.getByRole('region',{name:'Token options',exact:true});
    const assertBounds=async()=>{
      await expect(menu).toBeVisible();
      await expect.poll(()=>menu.evaluate(el=>{
        const r=el.getBoundingClientRect();return r.left>=7 && r.top>=7 && r.right<=window.innerWidth-7 && r.bottom<=window.innerHeight-7;
      })).toBe(true);
    };
    for(const size of [page.viewportSize()!,{width:851,height:393}]) {
      await page.setViewportSize(size);
      await expect.poll(()=>page.evaluate(()=>Math.abs((window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins).screenHeight-document.querySelector('canvas')!.getBoundingClientRect().height)<1)).toBe(true);
      await page.getByRole('button',{name:'Fit map',exact:true}).click();
      const point=await page.evaluate(id=>{
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
        const p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
      },token.id);
      await page.mouse.click(point.x,point.y,{button:'right'});await assertBounds();
      const actions=menu.getByRole('button');
      await expect(actions.first()).toBeFocused();
      await page.keyboard.press('ArrowDown');await expect(actions.nth(1)).toBeFocused();
      await page.keyboard.press('End');await expect(actions.last()).toBeFocused();
      await page.keyboard.press('ArrowDown');await expect(actions.first()).toBeFocused();
      await page.keyboard.press('ArrowUp');await expect(actions.last()).toBeFocused();
      await page.keyboard.press('Home');await expect(actions.first()).toBeFocused();
      expect((await state(page)).tokens[token.id]).toMatchObject({x:token.x,y:token.y});
      await page.keyboard.press('Tab');await expect(actions.nth(1)).toBeFocused();
      for(const action of await actions.all()) await expect(action).toHaveAccessibleName(/.+/);
      await menu.getByRole('button',{name:'Resize ▸',exact:true}).focus();await page.keyboard.press('Space');
      await expect(menu.getByRole('button',{name:'Back to token options'})).toBeFocused();
      await page.keyboard.press('ArrowDown');await expect(menu.getByRole('button').nth(1)).toBeFocused();
      await page.screenshot({path:info.outputPath(`token-keyboard-${size.width}.png`)});
      await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');
      await expect(menu.getByRole('button',{name:'Resize ▸',exact:true})).toBeFocused();
      await page.setViewportSize({...size,height:size.height-40});await assertBounds();
      await page.setViewportSize(size);await assertBounds();
      await menu.getByText('Delete',{exact:true}).scrollIntoViewIfNeeded();
      await expect(menu.getByText('Delete',{exact:true})).toBeInViewport();
      await page.screenshot({path:info.outputPath(`token-options-${size.width}.png`)});
      await menu.getByText('☀ Light ▸',{exact:true}).click();await assertBounds();
      const back=menu.getByRole('button',{name:'Back to token options',exact:true});
      await expect(back).toBeFocused();
      await menu.getByText(/^Daylight/).scrollIntoViewIfNeeded();
      await expect(menu.getByText(/^Daylight/)).toBeInViewport();
      await page.screenshot({path:info.outputPath(`token-light-${size.width}.png`)});
      await back.press('Enter');await expect(menu.getByRole('button',{name:'☀ Light ▸',exact:true})).toBeFocused();
      for(const label of ['Resize ▸','Recolor ▸','Facing ▸']) {
        await menu.getByText(label,{exact:true}).click();await assertBounds();
        for(const action of await menu.getByRole('button').all()) await expect(action).toHaveAccessibleName(/.+/);
        await expect(back).toBeFocused();await page.keyboard.press('Escape');
        await expect(menu.getByRole('button',{name:label,exact:true})).toBeFocused();
        await expect(menu.getByRole('button',{name:label,exact:true})).toBeInViewport();
      }
      await menu.getByRole('button',{name:'Rename…',exact:true}).click();
      await menu.getByLabel('Token name').fill('Unsaved name');await page.keyboard.press('Escape');
      await expect(menu.getByRole('button',{name:'Rename…',exact:true})).toBeFocused();
      await page.screenshot({path:info.outputPath(`token-return-${size.width}.png`)});
      await page.keyboard.press('Escape');await expect(menu).toBeHidden();
      await expect(page.locator('.battle-map-fullscreen')).toBeVisible();
      await page.mouse.click(point.x,point.y,{button:'right'});await assertBounds();
      // A touch pointer need not generate a compatibility mousedown.
      await page.locator('.map-navigation').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:91,bubbles:true});
      await expect(menu).toBeHidden();
    }
    expect((await state(page)).tokens).toEqual(before);expect(errors).toEqual([]);
  });
  test('camera keyboard shortcuts stay on the map and out of controls',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const tokens=(await state(page)).tokens;
    const zoom=page.getByRole('combobox',{name:'Map zoom',exact:true});
    await zoom.selectOption('100');await zoom.blur();
    const canvas=page.locator('canvas').first();const box=(await canvas.boundingBox())!;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.keyboard.press('=');await expect(zoom).toHaveValue('120');
    await page.keyboard.press('-');await expect(zoom).toHaveValue('100');
    await page.mouse.down();await page.keyboard.press('=');await expect(zoom).toHaveValue('100');await page.mouse.up();
    await zoom.focus();await page.keyboard.press('=');await expect(zoom).toHaveValue('100');await zoom.blur();
    // v2.741 — simulate the brief focus gap after a dialog opens away from the pointer.
    const camera=()=>page.evaluate(()=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);return {x:vp.center.x,y:vp.center.y,scale:vp.scale.x};});
    await page.evaluate(()=>{const modal=document.createElement('div');modal.id='camera-modal-fixture';modal.setAttribute('aria-modal','true');modal.setAttribute('role','dialog');modal.style.cssText='position:fixed;right:8px;top:8px;width:100px;height:44px;z-index:50000';document.body.append(modal);});
    const beforeModal=await camera();
    for(const key of ['=','-','0','f','r']) {await page.keyboard.press(key);expect(await camera()).toEqual(beforeModal);}
    await page.evaluate(()=>{document.getElementById('camera-modal-fixture')!.style.display='none';});
    await page.keyboard.press('=');await expect(zoom).toHaveValue('120');
    await page.evaluate(()=>document.getElementById('camera-modal-fixture')!.remove());
    await page.keyboard.press('-');await expect(zoom).toHaveValue('100');
    await page.keyboard.press('0');expect(Number(await zoom.inputValue())).toBeLessThan(100);
    await page.getByLabel('Map controls',{exact:true}).click();
    await expect(page.getByRole('region',{name:'Map controls help'})).toContainText('Zoom keys');
    await page.getByText('Zoom keys',{exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('navigation-keys.png')});
    expect((await state(page)).tokens).toEqual(tokens);expect(errors).toEqual([]);
  });
  test('zoom presets preserve the camera center and token positions',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const tokens=(await state(page)).tokens;
    const writes:string[]=[];
    page.on('request',r=>{if(r.url().includes('/rest/v1/scene') && ['POST','PATCH','DELETE'].includes(r.method())) writes.push(r.url());});
    const camera=()=>page.evaluate(()=>{
      const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
      return {x:vp.center.x,y:vp.center.y,scale:vp.scale.x};
    });
    const original=await camera();const zoom=page.getByRole('combobox',{name:'Map zoom',exact:true});
    for(const value of [100,200,400,50,25,100]) {
      await zoom.selectOption(String(value));
      const current=await camera();expect(current.scale).toBeCloseTo(value/100,5);
      expect(current.x).toBeCloseTo(original.x,3);expect(current.y).toBeCloseTo(original.y,3);
      await expect(zoom).toHaveValue(String(value));
    }
    await page.getByRole('button',{name:'Zoom in',exact:true}).click();
    await expect(zoom).toHaveValue('120');
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    await expect(zoom).toHaveValue(String(Math.round((await camera()).scale*100)));
    await zoom.selectOption('100');
    await zoom.focus();await page.keyboard.press('ArrowUp');
    await expect(zoom).toHaveValue('50');expect((await camera()).scale).toBeCloseTo(.5,5);
    await zoom.selectOption('100');await zoom.blur();
    const layout=await zoom.evaluate(el=>{
      const r=el.getBoundingClientRect(),dock=el.closest('.map-navigation')!.getBoundingClientRect();
      const left=el.previousElementSibling!.getBoundingClientRect(),right=el.nextElementSibling!.getBoundingClientRect();
      return {inside:r.left>=dock.left && r.right<=dock.right,overlap:r.left<left.right || r.right>right.left,height:r.height};
    });
    expect(layout.inside).toBe(true);expect(layout.overlap).toBe(false);expect(layout.height).toBeGreaterThanOrEqual(40);
    await page.screenshot({path:info.outputPath('zoom-presets.png')});
    expect((await state(page)).tokens).toEqual(tokens);expect(writes).toEqual([]);expect(errors).toEqual([]);
  });
  test('tool rail uses distinct sharp icons and exposes active tools',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
    await openMap(page);
    const rail=page.locator('.map-tool-palette');
    const buttons=rail.locator('button');expect(await buttons.count()).toBeGreaterThan(10);
    for(const button of await buttons.all()) {
      await expect(button).toHaveAttribute('aria-label',/.+/);await expect(button.locator('svg')).toHaveCount(1);
    }
    const eraser=rail.getByRole('button',{name:'Eraser',exact:true});
    const clear=rail.getByRole('button',{name:'Clear all drawings',exact:true});
    expect(await eraser.locator('path').getAttribute('d')).not.toBe(await clear.locator('path').getAttribute('d'));
    for(const name of ['Ruler','Fog brush','Walls','Text','Pencil','Line','Rectangle','Circle','Eraser','Fire','Lightning','Sparkles','Smoke','Preview player view']) {
      const button=rail.getByRole('button',{name,exact:true});await button.click();
      await expect(button).toHaveAttribute('aria-pressed','true');
      expect(await rail.locator('[aria-pressed=true]').count()).toBe(1);
      await button.click();await expect(button).toHaveAttribute('aria-pressed','false');
    }
    await rail.getByRole('button',{name:'Ruler',exact:true}).scrollIntoViewIfNeeded();
    const railBox=(await rail.boundingBox())!,dock=(await page.locator('.map-navigation').boundingBox())!;
    expect(railBox.y+railBox.height).toBeLessThanOrEqual(dock.y-10);
    await page.screenshot({path:info.outputPath('tool-rail.png')});
    expect(errors).toEqual([]);
  });
  test('group visibility protects characters and reports unsaved changes',async({page},info)=>{
    await openMap(page);
    const all=Object.values((await state(page)).tokens) as any[];
    const pc=all.find(t=>t.name==='Ilyana Vell');const npc=all.find(t=>!t.characterId && t.visibleToAll);
    expect(npc).toBeDefined();
    for(const id of [pc.id,npc.id]) {
      const p=await page.evaluate(id=>{
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        const t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id);
        const p=t.getGlobalPosition();const r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
      },id);
      await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');
    }
    await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
    const bar=page.getByRole('toolbar',{name:'Selected tokens'});
    await expect(bar.getByRole('button',{name:'✕ Delete'})).toBeHidden();
    const compact=await bar.boundingBox();expect(compact!.height).toBeLessThanOrEqual(page.viewportSize()!.width<600?110:60);
    await page.screenshot({path:info.outputPath('selection-compact.png')});
    await page.getByTitle('More selection actions').click();
    await expect(bar.getByRole('button',{name:'✕ Delete'})).toBeVisible();
    await bar.getByRole('button',{name:'✕ Delete'}).focus();await page.keyboard.press('Escape');
    await expect(bar.getByRole('button',{name:'✕ Delete'})).toBeHidden();
    await expect(page.getByText('2 selected',{exact:true})).toBeVisible();
    await page.getByTitle('More selection actions').click();
    const writes:string[]=[];
    const pattern='**/rest/v1/scene*';
    await page.route(pattern,async route=>{
      const r=route.request();if(r.method()==='PATCH' && r.postDataJSON()?.visible_to_all!==undefined) {
        writes.push(r.url());await route.fulfill({status:200,contentType:'application/json',body:'[]'});
      }else await route.continue();
    });
    await page.getByRole('button',{name:'◉ Hide',exact:true}).click();
    await expect(page.getByRole('alert')).toContainText('1 of 1 token updates failed');
    expect(writes).toHaveLength(1);expect(writes[0]).toContain(npc.id);expect(writes[0]).not.toContain(pc.id);
    expect((await state(page)).tokens[npc.id].visibleToAll).toBe(true);
    expect((await state(page)).tokens[pc.id].visibleToAll).toBe(true);
    await page.screenshot({path:info.outputPath('bulk-failure.png')});
    await page.unroute(pattern);
    try {
      await page.getByRole('button',{name:'◉ Hide',exact:true}).click();
      await expect.poll(async()=>(await state(page)).tokens[npc.id].visibleToAll).toBe(false);
      expect((await state(page)).tokens[pc.id].visibleToAll).toBe(true);
    }finally {
      await page.getByRole('button',{name:'◉ Reveal',exact:true}).click();
      await expect.poll(async()=>(await state(page)).tokens[npc.id].visibleToAll).toBe(true);
    }
  });
  test('fit map keeps the whole scene clear of controls',async({page},info)=>{
    await openMap(page);
    const before=(await state(page)).tokens;
    for(const size of [page.viewportSize()!,{width:851,height:393}]) {
      await page.setViewportSize(size);
      await expect.poll(()=>page.evaluate(()=>{
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        return Math.abs(vp.screenHeight-document.querySelector('canvas')!.getBoundingClientRect().height)<1;
      })).toBe(true);
      await page.getByRole('button',{name:'Fit map',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>{
        const canvas=document.querySelector('canvas')!;const rect=canvas.getBoundingClientRect();
        const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
        const rail=document.querySelector('.map-tool-palette')!.getBoundingClientRect();
        const dock=document.querySelector('.map-navigation')!.getBoundingClientRect();
        const a=vp.toScreen(0,0),b=vp.toScreen(vp.worldWidth,vp.worldHeight);
        return a.x+rect.left>=rail.right+12 && a.y+rect.top>=60 && b.x+rect.left<=rect.right-12 && b.y+rect.top<=dock.top-12;
      })).toBe(true);
      await page.screenshot({path:info.outputPath(`fit-${size.width}.png`)});
      const zoom=()=>page.evaluate(()=>(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins).scale.x);
      const fitted=await zoom();
      await page.getByRole('button',{name:'Zoom out',exact:true}).click();
      const zoomedOut=await zoom();expect(zoomedOut).toBeLessThanOrEqual(fitted);
      await page.getByRole('button',{name:'Zoom in',exact:true}).click();
      expect(await zoom()).toBeGreaterThan(fitted);
      await page.getByRole('button',{name:'Zoom out',exact:true}).click();
      expect(await zoom()).toBeCloseTo(zoomedOut,5);
    }
    expect((await state(page)).tokens).toEqual(before);
  });
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
    await page.locator('.map-appearance-section > summary').click();
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
    await page.locator('.map-appearance-section > summary').click();
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
    while(parseInt(await page.getByLabel('Map zoom').inputValue())<90) await page.getByRole('button',{name:'Zoom in',exact:true}).click();
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
    await expect(page.getByLabel('Map zoom')).toHaveValue(`${Math.round(framing.zoom*100)}`);
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
      // Selection opens another toolbar after Fit; bring the group clear of it.
      await page.getByRole('button',{name:'Find selection',exact:true}).click();
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
        await expect.poll(()=>page.evaluate(()=>{
          const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
          const label=vp.children.find((c:any)=>c.label==='group-drag-distance');
          return label?.visible?label.text:'';
        })).toBe('2 tokens · 5 ft · Grid snap');
        await page.screenshot({path:info.outputPath(`group-preview-${cancel}.png`)});
        for(const token of tokens) {
          await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBeCloseTo(token.y+70,2);
          await expect.poll(async()=>{const s=await state(peer);return s.locks;}).toHaveProperty(token.id);
        }
        if(cancel) await page.keyboard.press('Escape');
        await page.mouse.up();
        for(const token of tokens) await expect.poll(async()=>(await state(peer)).locks[token.id]).toBeFalsy();
        if(!cancel) {
          await expect(page.getByRole('button',{name:'↶ Undo move tokens',exact:true})).toBeVisible();
          // v2.728 — Ctrl+Z in a confirmation must not mutate the map behind it.
          await page.getByTitle('More selection actions').click();
          await page.getByTitle('Delete all selected tokens').click();
          const dialog=page.getByRole('dialog',{name:'Delete 2 tokens?'});
          await expect(dialog).toBeVisible();
          const beforeModalUndo=writes.length;
          await dialog.getByRole('button',{name:'Cancel',exact:true}).focus();
          await page.keyboard.press('Control+z');
          for(const token of tokens) {
            expect((await state(page)).tokens[token.id].y).toBe(token.y+70);
            expect((await state(peer)).tokens[token.id].y).toBe(token.y+70);
          }
          expect(writes).toHaveLength(beforeModalUndo);
          await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
          await expect(dialog).toBeHidden();
          await page.getByTitle('More selection actions').click();
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
      // v2.746 — peers only hear cell hops now, so cross a cell boundary
      // (40 screen px ≈ 80 world px at fit zoom) rather than nudging.
      await page.mouse.move(box.x+token.sx+40, box.y+token.sy+15, { steps: 5 });
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
      await page.mouse.move(box.x+token.sx+40, box.y+token.sy+10, { steps: 4 });
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

  // ── v2.746 — drop-shift track ─────────────────────────────────────────
  test('a dragged token lands on the previewed cell and never moves after release',async({page})=>{
    await openMap(page);
    const token=await ilyana(page);const campaignId=await campaignIdOf(page);
    const writes:any[]=[];page.on('request',r=>{if(r.method()==='PATCH' && /scene_tokens|scene_token_placements/.test(r.url())) writes.push(r.postDataJSON());});
    const destination={x:token.x,y:token.y+70};
    try {
      const p=await tokenPoint(page,token.id);
      await page.mouse.move(p.x,p.y);await page.mouse.down();
      // +50 world px is not a cell multiple: the ghost must already sit on
      // the snapped cell (SNAP_GHOST_WHILE_DRAGGING) before the release.
      await page.mouse.move(p.x,p.y+50*p.scale,{steps:8});
      await expect.poll(async()=>{const t=(await state(page)).tokens[token.id];return {x:t.x,y:t.y};}).toEqual(destination);
      await expect.poll(()=>page.evaluate(()=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);return vp.children.find((c:any)=>c.label==='token-drag-preview').visible;})).toBe(true);
      await startSampler(page,token.id);
      await page.mouse.up();
      await page.waitForTimeout(400);
      const samples=await stopSampler(page);
      expect(samples.length).toBeGreaterThan(3);
      for(const s of samples) expect({x:s.x,y:s.y}).toEqual(destination);
      await expect.poll(()=>writes.length).toBe(1);
      expect(writes[0]).toMatchObject(destination);
      await expect.poll(()=>pendingOn(page,token.id)).toBe(false);
      expect(await persistedToken(page,token.id,campaignId)).toMatchObject(destination);
      expect((await state(page)).tokens[token.id]).toMatchObject(destination);
    } finally { await setTokenPos(page,token.id,token.x,token.y,campaignId); }
  });
  test('a pure click never moves an off-grid token and never writes',async({page})=>{
    await openMap(page);
    const token=await ilyana(page);
    let writes=0;page.on('request',r=>{if(r.method()==='PATCH' && r.url().includes('/rest/v1/')) writes++;});
    // Local display fixture only: nudge the token 5 px off its cell centre in the store.
    await page.evaluate(async({id,x,y})=>{const s='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ s);useBattleMapStore.getState().updateTokenPosition(id,x,y);},{id:token.id,x:token.x+5,y:token.y});
    const p=await tokenPoint(page,token.id);
    await page.mouse.click(p.x,p.y);
    await page.waitForTimeout(500);
    expect((await state(page)).tokens[token.id]).toMatchObject({x:token.x+5,y:token.y});
    expect((await state(page)).dragging).toBeNull();
    expect(await pendingOn(page,token.id)).toBe(false);
    expect(writes).toBe(0);
  });
  test('a peer waits for a delayed movement save and only ever sees snapped cells',async({page,browser})=>{
    test.setTimeout(90_000);
    const peerContext=await browser.newContext();const peer=await peerContext.newPage();
    let release!:()=>void;const held=new Promise<void>(r=>release=r);
    await page.route('**/rest/v1/scene_token*',async route=>{if(route.request().method()==='PATCH') await held;await route.continue();});
    let token:any=null,campaignId='';
    try {
      await openMap(page);await openMap(peer,'test-player@dndkeep.local');
      token=await ilyana(page);campaignId=await campaignIdOf(page);
      const destination={x:token.x,y:token.y+70};
      await expect.poll(async()=>(await state(peer)).tokens[token.id]?.y).toBe(token.y);
      await startSampler(peer,token.id,40);
      const p=await tokenPoint(page,token.id);
      await page.mouse.move(p.x,p.y);await page.mouse.down();
      // Raw cursor ends at (+12,+80) world px; the peer must only ever see the snapped cell.
      await page.mouse.move(p.x+12*p.scale,p.y+80*p.scale,{steps:12});
      await expect.poll(async()=>{const t=(await state(peer)).tokens[token.id];return {x:t.x,y:t.y};}).toEqual(destination);
      await expect.poll(async()=>(await state(peer)).locks[token.id]).toBeTruthy();
      await peer.evaluate(()=>{(window as any).__upAt=performance.now();});
      await page.mouse.up();
      await expect.poll(()=>badgeVisible(page)).toBe(true);
      // The lease must outlive its 6 s expiry while the PATCH is held.
      await page.waitForTimeout(6500);
      expect((await state(peer)).locks[token.id]).toBeTruthy();
      expect(await busyOn(peer)).toBe(true);
      // A peer-side refresh racing the held save must not rewind the hop.
      await peer.evaluate(async cid=>{const p='/src/components/Campaign/battlemap/refreshSceneTokens.ts';const {refreshSceneTokens}=await import(/* @vite-ignore */ p);const s='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ s);await refreshSceneTokens(useBattleMapStore.getState().currentSceneId,cid);},campaignId);
      expect((await state(peer)).tokens[token.id]).toMatchObject(destination);
      release();
      await expect.poll(async()=>(await state(peer)).locks[token.id],{timeout:3000}).toBeFalsy();
      await expect.poll(()=>badgeVisible(page)).toBe(false);
      expect(await busyOn(peer)).toBe(false);
      expect((await state(peer)).tokens[token.id]).toMatchObject(destination);
      expect(await persistedToken(page,token.id,campaignId)).toMatchObject(destination);
      const samples=await stopSampler(peer);const upAt=await peer.evaluate(()=>(window as any).__upAt as number);
      expect(samples.length).toBeGreaterThan(30);
      for(const s of samples){expect((s.x-35)%70,'peer saw a raw position').toBe(0);expect((s.y-35)%70,'peer saw a raw position').toBe(0);}
      const start=samples.findIndex(s=>s.y===destination.y && s.lock);expect(start).toBeGreaterThanOrEqual(0);
      for(const s of samples.slice(start)) if(s.at<=upAt+6500){expect(s.lock,'lock lapsed before the save settled').toBe(true);expect(s.busy).toBe(true);}
    } finally {
      release();await page.unroute('**/rest/v1/scene_token*');
      if(token) await setTokenPos(page,token.id,token.x,token.y,campaignId);
      await peerContext.close();
    }
  });
  test('a rejected save returns the peer to the origin and unlocks',async({page,browser})=>{
    test.setTimeout(90_000);
    const peerContext=await browser.newContext();const peer=await peerContext.newPage();
    await page.route('**/rest/v1/scene_token*',async route=>{
      if(route.request().method()!=='PATCH') return route.continue();
      await new Promise(r=>setTimeout(r,2000));
      await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'permission denied for table scene_token_placements'})});
    });
    let token:any=null,campaignId='';
    try {
      await openMap(page);await openMap(peer,'test-player@dndkeep.local');
      token=await ilyana(page);campaignId=await campaignIdOf(page);
      const destination={x:token.x,y:token.y+70};
      await expect.poll(async()=>(await state(peer)).tokens[token.id]?.y).toBe(token.y);
      const p=await tokenPoint(page,token.id);
      await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y+70*p.scale,{steps:6});
      await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBe(destination.y);
      await expect.poll(async()=>(await state(peer)).locks[token.id]).toBeTruthy();
      await page.mouse.up();
      // Still locked while the (slow) rejection is in flight.
      await page.waitForTimeout(1000);expect((await state(peer)).locks[token.id]).toBeTruthy();
      await expect(page.getByText(/Move could not be saved/).first()).toBeVisible({timeout:10_000});
      for(const p2 of [page,peer]) {
        await expect.poll(async()=>{const t=(await state(p2)).tokens[token.id];return {x:t.x,y:t.y};}).toEqual({x:token.x,y:token.y});
        await expect.poll(async()=>(await state(p2)).locks[token.id]).toBeFalsy();
      }
      await expect.poll(()=>pendingOn(page,token.id)).toBe(false);
      expect(await persistedToken(page,token.id,campaignId)).toMatchObject({x:token.x,y:token.y});
    } finally { await page.unroute('**/rest/v1/scene_token*');await peerContext.close(); }
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

  // v2.746 — waits past SAVE_TIMEOUT_MS; kept last so it never gates the rest.
  test('a hung save times out and both clients recover',async({page,browser})=>{
    test.slow();test.setTimeout(120_000);
    const peerContext=await browser.newContext();const peer=await peerContext.newPage();
    let abortHung:()=>void=()=>{};const hung=new Promise<void>(r=>abortHung=r);
    await page.route('**/rest/v1/scene_token*',async route=>{
      if(route.request().method()!=='PATCH') return route.continue();
      await hung;await route.abort();
    });
    let token:any=null,campaignId='';
    try {
      await openMap(page);await openMap(peer,'test-player@dndkeep.local');
      token=await ilyana(page);campaignId=await campaignIdOf(page);
      const destination={x:token.x,y:token.y+70};
      await expect.poll(async()=>(await state(peer)).tokens[token.id]?.y).toBe(token.y);
      const p=await tokenPoint(page,token.id);
      await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y+70*p.scale,{steps:6});
      await expect.poll(async()=>(await state(peer)).tokens[token.id].y).toBe(destination.y);
      await expect.poll(async()=>(await state(peer)).locks[token.id]).toBeTruthy();
      await page.mouse.up();
      await expect.poll(()=>badgeVisible(page)).toBe(true);
      // Past the 6 s lease expiry the peer is still locked — the lease follows the save…
      await page.waitForTimeout(8000);
      expect((await state(peer)).locks[token.id]).toBeTruthy();
      expect((await state(peer)).tokens[token.id]).toMatchObject(destination);
      expect(await pendingOn(page,token.id)).toBe(true);
      // …and past SAVE_TIMEOUT_MS the sender gives up and everyone goes home.
      await expect(page.getByText('Move not confirmed — your token was returned.')).toBeVisible({timeout:SAVE_TIMEOUT_MS});
      for(const p2 of [page,peer]) {
        await expect.poll(async()=>{const t=(await state(p2)).tokens[token.id];return {x:t.x,y:t.y};}).toEqual({x:token.x,y:token.y});
        await expect.poll(async()=>(await state(p2)).locks[token.id]).toBeFalsy();
      }
      await expect.poll(()=>badgeVisible(page)).toBe(false);
      expect(await pendingOn(page,token.id)).toBe(false);
      expect(await busyOn(peer)).toBe(false);
      expect(await persistedToken(page,token.id,campaignId)).toMatchObject({x:token.x,y:token.y});
    } finally { abortHung();await page.unroute('**/rest/v1/scene_token*');await peerContext.close(); }
  });
});
