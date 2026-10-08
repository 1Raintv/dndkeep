import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111';
test.describe('Map navigation and monster action layout',()=>{gateDbSuite();test.use({serviceWorkers:'block'});
 test('map navigation remains clickable with the monster action rail open',async({page},info)=>{
  test.setTimeout(60_000);const camp=randomUUID(),scene=randomUUID(),monster=randomUUID(),one=randomUUID(),two=randomUUID(),placement=randomUUID(),enc=randomUUID(),name='Creature conditions '+camp.slice(0,8);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  try{
   sql(`begin;alter table campaigns disable trigger check_campaign_pro_gate;
    insert into campaigns(id,owner_id,name,use_combatants_for_battlemap) values('${camp}','${dm}','${name}',true);alter table campaigns enable trigger check_campaign_pro_gate;
    insert into homebrew_monsters(id,user_id,owner_id,campaign_id,name,hp,max_hp,ac) values('${monster}','${dm}','${dm}','${camp}','Condition Creature',20,20,10);
    insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
     values('${scene}','${camp}','${dm}','Creature Arena','square',70,10,10,'bright',true);
    insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values
     ('${one}','${camp}','${dm}','Condition Creature','homebrew_monster','${monster}',20,20),('${two}','${camp}','${dm}','Sibling','homebrew_monster','${monster}',20,20);
    insert into scene_token_placements(id,scene_id,combatant_id,x,y) values('${placement}','${scene}','${one}',175,175);
    insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
    insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,ac,combatant_id)
     values('${enc}','${camp}','creature','${monster}','Condition Creature',0,10,10,'${one}');commit;`);
   await signInAsSeedDm(page);await page.goto('/campaigns');await page.getByText(name,{exact:true}).locator('visible=true').first().click();await expect(page.locator('canvas').first()).toBeVisible({timeout:30_000});
   const full=page.getByTitle('Fullscreen map',{exact:true});if(await full.isVisible())await full.click();
   const collapse=page.getByTitle('Collapse action rail',{exact:true});await expect(collapse).toBeVisible();
   const nav=page.getByRole('toolbar',{name:'Map navigation'});
   async function inspect(label:string){
    const rail=page.getByRole('region',{name:'Monster actions',exact:true});
    await nav.getByRole('button',{name:'Fit map',exact:true}).click({timeout:2500});
    await expect.poll(()=>page.evaluate(()=>{
     const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins),canvas=document.querySelector('canvas')!.getBoundingClientRect(),dock=document.querySelector('.map-navigation')!.getBoundingClientRect(),rail=document.querySelector('.monster-action-rail'),r=rail?.getBoundingClientRect();
     const a=vp.toGlobal({x:0,y:0}),b=vp.toGlobal({x:700,y:700}),side=rail&&getComputedStyle(rail).getPropertyValue('--map-rail-layout').trim()==='side';
     return a.y+canvas.top>=canvas.top+60&&b.y+canvas.top<=dock.top-10&&a.x+canvas.left>=canvas.left+60&&b.x+canvas.left<=(side?r!.left-10:canvas.right-10);
    })).toBe(true);
    await nav.getByRole('button',{name:'Zoom in',exact:true}).click();await nav.getByRole('button',{name:'Fit map',exact:true}).click();
    if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.map-navigation,.map-navigation *, .monster-action-rail,.monster-action-rail *')"),report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
    await page.screenshot({path:info.outputPath(label+'.png')});
    if(await rail.getByTitle('Collapse action rail',{exact:true}).isVisible()){
     await rail.getByRole('button',{name:'Dash',exact:true}).click({trial:true});
     await rail.getByTitle('Action economy. Resets each turn.',{exact:true}).evaluate(el=>el.scrollIntoView({block:'nearest',behavior:'instant'}));
     await expect(rail.getByTitle('Action economy. Resets each turn.',{exact:true})).toBeVisible();await rail.getByTitle('Collapse action rail',{exact:true}).click({trial:true});
     await page.screenshot({path:info.outputPath(label+'-actions.png')});
    }
   }
   await inspect('rail-open');await collapse.click();await inspect('rail-collapsed');
   await page.getByTitle('Expand action rail',{exact:true}).click();await inspect('rail-reopened');
   // A real saved move exposes undo/redo; no DOM-only history stand-in.
   const point=await page.evaluate(()=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins),t=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId),p=t.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y,step:140*vp.scale.x};});
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+point.step,point.y,{steps:8});await page.mouse.up();
   const history=nav.getByRole('group',{name:'Map history'});await expect(history).toBeVisible();
   await expect.poll(()=>sql(`select x from scene_token_placements where id='${placement}'`)).toBe('315');
   await inspect('rail-history');
   await page.setViewportSize({width:851,height:393});await inspect('rail-landscape');
   await history.getByRole('button',{name:/Undo/}).click();await expect.poll(()=>sql(`select x from scene_token_placements where id='${placement}'`)).toBe('175');
   await history.getByRole('button',{name:/Redo/}).click();await expect.poll(()=>sql(`select x from scene_token_placements where id='${placement}'`)).toBe('315');
   sql(`update combat_encounters set status='ended' where id='${enc}'`);
   await expect(page.getByRole('region',{name:'Monster actions',exact:true})).toHaveCount(0);await inspect('rail-ended');
   expect(errors).toEqual([]);
  }finally{await page.close();sql(`delete from campaigns where id='${camp}';delete from homebrew_monsters where id='${monster}'`);}
 });

});
