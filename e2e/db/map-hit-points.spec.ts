import {execFileSync} from 'node:child_process';
import {expect,test,type Page} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
async function panel(page:Page){
 await expect(page.locator('canvas').first()).toBeVisible({timeout:30_000});
 const scene=page.locator('select').filter({has:page.locator('option',{hasText:'Ruined Keep (fixture)'})});if(await scene.isVisible())await scene.selectOption({label:'Ruined Keep (fixture)'});
 const full=page.getByTitle('Fullscreen map',{exact:true});if(await full.isVisible())await full.click();
 await page.getByRole('button',{name:'Fit map',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>!!(window as any).__PIXI_APP__?.stage.children.find((c:any)=>c.plugins)?.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId))).toBe(true);
 const point=await page.evaluate(async()=>{
  const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(/* @vite-ignore */ path);
  const token=Object.values(useBattleMapStore.getState().tokens).find((t:any)=>t.name==='Ilyana Vell') as any;
  const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);
  const item=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===token.id);
  const p=item.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
 });
 await page.mouse.click(point.x,point.y,{button:'right'});await page.getByText('Open Quick Panel',{exact:true}).click();
 const hp=page.getByRole('region',{name:'Hit points',exact:true});await expect(hp).toBeVisible();await expect(hp.getByText('Refreshing HP…')).toHaveCount(0);return hp;
}
test.describe('Map HP recovery (local stack)',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 test('sets zero, absorbs temporary HP, and recovers the same adjustment after reload',async({page},info)=>{
  test.setTimeout(120_000);const id=sql("select c.id from characters c join campaigns ca on ca.id=c.campaign_id where c.name='Ilyana Vell' and ca.name='Local Test Campaign' limit 1");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);const original=JSON.parse(sql(`select row_to_json(c) from characters c where id='${id}'`));const bodies:Array<Record<string,unknown>>=[];let lose=false,lost=0,stale=false;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   sql(`update characters set current_hp=10,max_hp=20,temp_hp=4 where id='${id}'`);
   await page.route('**/rest/v1/rpc/adjust_character_hit_points_atomic',async route=>{
    bodies.push(JSON.parse(route.request().postData()!));if(stale){stale=false;sql(`update characters set current_hp=5 where id='${id}'`);}if(lose&&lost<2){lost++;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}else await route.continue();
   });
   await signInAsSeedDm(page);await page.goto('/campaigns');await page.getByText('Local Test Campaign',{exact:true}).locator('visible=true').first().click();let hp=await panel(page);
   await expect(hp.getByText('+4 temp',{exact:true})).toBeVisible();await hp.getByRole('button',{name:'Set HP',exact:true}).click();await hp.getByLabel('HP amount').fill('0');await hp.getByRole('button',{name:'Apply',exact:true}).click();
   await expect(hp.getByText('0 / 20',{exact:true})).toBeVisible();await expect(hp.getByText('+4 temp',{exact:true})).toBeVisible();
   await hp.getByRole('button',{name:'Heal',exact:true}).click();await hp.getByLabel('HP amount').fill('10');await hp.getByRole('button',{name:'Apply',exact:true}).click();await expect(hp.getByText('10 / 20',{exact:true})).toBeVisible();
   lose=true;await hp.getByRole('button',{name:'Damage',exact:true}).click();await hp.getByLabel('HP amount').fill('6');
   await expect(hp.getByRole('status',{name:'HP adjustment preview'})).toContainText('After damage: 8 / 20 HP');
   await expect(hp.getByText('4 damage absorbed by temporary HP',{exact:true})).toBeVisible();
   expect(await hp.getByRole('button',{name:'Damage',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
   await hp.screenshot({path:info.outputPath('hp-preview.png')});
   await hp.getByRole('button',{name:'Apply',exact:true}).click();await expect(hp.getByRole('alert')).toBeVisible();
   expect(lost).toBe(2);expect(bodies[3]).toEqual(bodies[2]);expect(sql(`select current_hp||','||temp_hp from characters where id='${id}'`)).toBe('8,0');
   await page.reload();hp=await panel(page);await expect(hp.getByText(/Saved damage adjustment: 6/)).toBeVisible();await page.screenshot({path:info.outputPath('hp-recovery.png')});
   await hp.getByRole('button',{name:'Retry saved adjustment',exact:true}).click();await expect(hp.getByText('Saved HP adjustment confirmed.',{exact:true})).toBeVisible();
   expect(bodies[4]).toEqual(bodies[2]);expect(sql(`select count(*) from character_history where id='${bodies[2].p_request_id}'`)).toBe('1');expect(sql(`select current_hp||','||temp_hp from characters where id='${id}'`)).toBe('8,0');
   await page.screenshot({path:info.outputPath('hp-confirmed.png')});
   stale=true;await hp.getByLabel('HP amount').fill('3');await hp.getByRole('button',{name:'Apply',exact:true}).click();await expect(hp.getByRole('alert')).toContainText('HP changed');
   await hp.getByRole('button',{name:'Cancel unconfirmed adjustment',exact:true}).click();await expect(hp.getByText('Adjustment canceled before it was applied.',{exact:true})).toBeVisible();
   await expect(hp.getByText('5 / 20',{exact:true})).toBeVisible();expect(sql(`select current_hp from characters where id='${id}'`)).toBe('5');
   await page.setViewportSize({width:851,height:393});
   await expect.poll(()=>hp.locator('..').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=7&&r.bottom<=innerHeight-7&&r.left>=7&&r.right<=innerWidth-7;})).toBe(true);
   await page.screenshot({path:info.outputPath('hp-landscape.png')});expect(errors).toEqual([]);
  }finally{
   await page.unroute('**/rest/v1/rpc/adjust_character_hit_points_atomic');
   sql(`update characters set current_hp=${original.current_hp},max_hp=${original.max_hp},temp_hp=${original.temp_hp??0} where id='${id}'`);
   for(const request of new Set(bodies.map(b=>String(b.p_request_id))))if(/^[0-9a-f-]{36}$/.test(request))sql(`delete from dndkeep_private.manual_hit_point_adjustments where request_id='${request}';delete from character_history where id='${request}'`);
  }
 });
});
