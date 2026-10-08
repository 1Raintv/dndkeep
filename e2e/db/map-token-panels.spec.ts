import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.describe('Map token panel viewport',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 for(const name of ['Ilyana Vell','Goblin Scout'])test(`${name} panel follows rotation and keyboard bounds`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page);await page.goto('/campaigns');await page.getByText('Local Test Campaign',{exact:true}).locator('visible=true').first().click();
  await expect(page.locator('canvas').first()).toBeVisible({timeout:30_000});
  const scene=page.locator('select').filter({has:page.locator('option',{hasText:'Ruined Keep (fixture)'})});if(await scene.isVisible())await scene.selectOption({label:'Ruined Keep (fixture)'});
  const full=page.getByTitle('Fullscreen map',{exact:true});if(await full.isVisible())await full.click();await page.getByRole('button',{name:'Fit map',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!(window as any).__PIXI_APP__?.stage.children.find((c:any)=>c.plugins)?.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId))).toBe(true);
  const point=await page.evaluate(async name=>{
   const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(path);
   const token=Object.values(useBattleMapStore.getState().tokens).find((t:any)=>t.name===name) as any;
   const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins);const item=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===token.id);
   const p=item.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
  },name);
  await page.mouse.click(point.x,point.y,{button:'right'});await page.getByText('Open Quick Panel',{exact:true}).click();
  const panel=page.getByRole('dialog',{name:`${name==='Ilyana Vell'?'Character':'Creature'} token: ${name}`,exact:true});await expect(panel).toBeVisible();
  if(name==='Ilyana Vell')await expect(panel.getByRole('button',{name:'Damage',exact:true})).toBeEnabled();
  await panel.screenshot({path:info.outputPath('token-panel.png')});
  for(const size of [{width:851,height:393},{width:393,height:300}]){
   await page.setViewportSize(size);
   await expect.poll(()=>panel.evaluate(el=>{const r=el.getBoundingClientRect(),v=visualViewport!;return r.left>=v.offsetLeft+7&&r.right<=v.offsetLeft+v.width-7&&r.top>=v.offsetTop+7&&r.bottom<=v.offsetTop+v.height-7;})).toBe(true);
  }
  // A software keyboard can change only visualViewport while layout stays put.
  await page.evaluate(()=>{const v=visualViewport!;Object.defineProperties(v,{height:{value:180,configurable:true},offsetTop:{value:35,configurable:true}});v.dispatchEvent(new Event('resize'));});
  await expect.poll(()=>panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=42&&r.bottom<=208;})).toBe(true);
  await panel.getByTitle('Close',{exact:true}).click({trial:true});
  await panel.screenshot({path:info.outputPath('token-panel-keyboard.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=\"dialog\"], [role=\"dialog\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);}
  await panel.getByTitle('Close',{exact:true}).click();await expect(panel).toHaveCount(0);expect(errors).toEqual([]);
 });
});
