import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111';
test.describe('Map condition lifecycle (local stack)',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 for(const lostReply of [false,true])test(`Unconscious synchronizes map and sheet, then waking leaves Prone${lostReply?' after lost replies and reload':''}`,async({page},info)=>{
  test.setTimeout(90_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(lostReply&&m.text().includes('net::ERR_FAILED')))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});const camp=randomUUID(),scene=randomUUID(),hero=randomUUID(),enc=randomUUID(),name='Conditions '+camp.slice(0,8);
  try{
   sql(`begin;alter table campaigns disable trigger check_campaign_pro_gate;
    insert into campaigns(id,owner_id,name) values('${camp}','${dm}','${name}');alter table campaigns enable trigger check_campaign_pro_gate;
    alter table characters disable trigger check_character_limit;
    insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp,concentration_spell)
     values('${hero}','${dm}','${camp}','Condition Hero','Human','Psion','Sage',5,30,30,'detect-magic');
    alter table characters enable trigger check_character_limit;
    insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
     values('${scene}','${camp}','${dm}','Condition Arena','square',70,10,10,'bright',true);
    insert into scene_tokens(id,scene_id,character_id,name,size,x,y,visible_to_all)
     values('${randomUUID()}','${scene}','${hero}','Condition Hero','medium',175,175,true);
    insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
    insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,ac,combatant_id)
     select '${enc}','${camp}','character','${hero}','Condition Hero',0,10,10,c.id from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}';commit;`);
   await signInAsSeedDm(page);await page.goto('/campaigns');await page.getByText(name,{exact:true}).locator('visible=true').first().click();
   await expect(page.locator('canvas').first()).toBeVisible({timeout:30_000});
   async function openPanel(){
   const full=page.getByTitle('Fullscreen map',{exact:true});if(await full.isVisible())await full.click();const rail=page.getByTitle('Collapse action rail',{exact:true});if(await rail.isVisible())await rail.click();await page.getByRole('button',{name:'Fit map',exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>!!(window as any).__PIXI_APP__?.stage.children.find((c:any)=>c.plugins)?.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId))).toBe(true);
   const point=await page.evaluate(async()=>{
    const path='/src/lib/stores/battleMapStore.ts';const {useBattleMapStore}=await import(path);const t=Object.values(useBattleMapStore.getState().tokens).find((t:any)=>t.name==='Condition Hero') as any;
    const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins),item=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===t.id),p=item.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
   });
   await page.mouse.click(point.x,point.y,{button:'right'});await page.getByText('Open Quick Panel',{exact:true}).click();
   const panel=page.getByRole('dialog',{name:'Character token: Condition Hero'});await expect(panel).toBeVisible();return panel;
   }
   async function inspect(label:string){
    if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
     const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
     const scoped=body.replace("document.querySelectorAll('*')","document.querySelector('[aria-label=\"Character token: Condition Hero\"]')?.querySelectorAll('*') ?? []");
     const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
    }
    await page.screenshot({path:info.outputPath(label+'.png')});
   }
   let intercepted=0;
   if(lostReply)await page.route('**/rest/v1/rpc/change_map_condition_atomic',async route=>{
    intercepted++;if(intercepted<=2){await route.fetch();await route.abort('failed');}else await route.continue();
   });
   let panel=await openPanel();await panel.getByTitle('Apply Unconscious',{exact:true}).click();
   if(lostReply){
    await expect(panel.getByRole('button',{name:'Retry saved condition'})).toBeEnabled();
    await expect(panel.getByRole('alert')).toBeVisible();await inspect('pending-recovery');
    await page.reload();await expect(page.locator('canvas').first()).toBeVisible();panel=await openPanel();
    await expect(panel.getByRole('button',{name:'Retry saved condition'})).toBeEnabled();
    await panel.getByRole('button',{name:'Retry saved condition'}).click();await expect(panel.getByText('Saved condition change confirmed.')).toBeVisible();
    expect(sql(`select count(*) from combat_events where campaign_id='${camp}' and event_type='condition_applied'`)).toBe('1');
   }
   await expect.poll(()=>sql(`select coalesce(array_to_string(active_conditions,','),'') from combatants where campaign_id='${camp}' and definition_id='${hero}'`)).toContain('Unconscious');
   for(const table of ['characters','combatants']){
    const row=JSON.parse(sql(`select to_json(active_conditions) from ${table} where ${table==='characters'?`id='${hero}'`:`campaign_id='${camp}' and definition_id='${hero}'`}`));
    expect(row).toEqual(expect.arrayContaining(['Unconscious','Prone','Incapacitated']));
   }
   expect(sql(`select coalesce(concentration_spell,'') from characters where id='${hero}'`)).toBe('');
   await expect(panel.getByTitle('Remove Unconscious',{exact:true})).toBeVisible();
   await panel.getByTitle('Remove Unconscious',{exact:true}).click();
   await expect.poll(()=>sql(`select array_to_string(active_conditions,',') from combatants where campaign_id='${camp}' and definition_id='${hero}'`)).toBe('Prone');
   expect(sql(`select array_to_string(active_conditions,',') from characters where id='${hero}'`)).toBe('Prone');
   await expect(panel.getByTitle('Remove Prone',{exact:true})).toBeVisible();await inspect('condition-panel');expect(errors).toEqual([]);
  }finally{sql(`delete from combat_participants where encounter_id='${enc}';delete from combat_encounters where id='${enc}';delete from scenes where id='${scene}';delete from combatants where campaign_id='${camp}';delete from characters where id='${hero}';delete from campaigns where id='${camp}'`);}
 });
 test('modern creature placements update one instance and keep controls accessible',async({page},info)=>{
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
   const full=page.getByTitle('Fullscreen map',{exact:true});if(await full.isVisible())await full.click();const rail=page.getByTitle('Collapse action rail',{exact:true});if(await rail.isVisible())await rail.click();await page.getByRole('button',{name:'Fit map',exact:true}).click();
   await expect.poll(()=>page.evaluate(()=>!!(window as any).__PIXI_APP__?.stage.children.find((c:any)=>c.plugins)?.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId))).toBe(true);
   const point=await page.evaluate(id=>{const vp=(window as any).__PIXI_APP__.stage.children.find((c:any)=>c.plugins),item=vp.children.flatMap((c:any)=>c.children??[]).find((c:any)=>c.__tokenId===id),p=item.getGlobalPosition(),r=document.querySelector('canvas')!.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};},placement);
   await page.mouse.click(point.x,point.y,{button:'right'});await page.getByText('Open Quick Panel',{exact:true}).click();const panel=page.getByRole('dialog',{name:'Creature token: Condition Creature'});await expect(panel).toBeVisible();
   await panel.getByRole('button',{name:'+ apply',exact:true}).click();await panel.getByRole('button',{name:'+ Unconscious',exact:true}).click();
   await expect.poll(()=>sql(`select array_to_string(active_conditions,',') from combatants where id='${one}'`)).toBe('Unconscious,Prone,Incapacitated');
   await panel.getByTitle('Remove Unconscious',{exact:true}).click();await expect.poll(()=>sql(`select array_to_string(active_conditions,',') from combatants where id='${one}'`)).toBe('Prone');
   expect(sql(`select cardinality(active_conditions) from combatants where id='${two}'`)).toBe('0');
   await expect(panel.getByTitle('Remove Prone',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('creature-panel.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=\"dialog\"], [role=\"dialog\"] *')"),report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
   expect(errors).toEqual([]);
  }finally{await page.close();sql(`delete from campaigns where id='${camp}';delete from homebrew_monsters where id='${monster}'`);}
 });

});
