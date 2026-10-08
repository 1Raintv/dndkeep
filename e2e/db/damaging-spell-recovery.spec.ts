import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';

const docker=process.platform==='win32'?`${process.env.ProgramFiles}/Docker/Docker/resources/bin/docker.exe`:'docker';
const sql=(q:string)=>execFileSync(docker,['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111',player='12121212-1212-1212-1212-121212121212';

test.describe('Saved damaging spells (local stack)',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 for(const spell of [{id:'mind-spike',name:'Mind Spike',level:2,kind:'save',casterClass:'Psion'},{id:'witch-bolt',name:'Witch Bolt',level:1,kind:'attack_roll',casterClass:'Wizard'}])test(`${spell.name} survives paid reload and lost attack delivery`,async({page,browser},info)=>{
  test.setTimeout(90_000);
  const camp=randomUUID(),scene=randomUUID(),enc=randomUUID(),hero=randomUUID(),target=randomUUID(),activation=randomUUID();
  try{
      sql(`begin;
        alter table campaigns disable trigger check_campaign_pro_gate;
        insert into campaigns(id,owner_id,name) values('${camp}','${dm}','Target Loading Fixture');
        alter table campaigns enable trigger check_campaign_pro_gate;
        insert into campaign_members(campaign_id,user_id,role) values('${camp}','${player}','player');
        alter table characters disable trigger check_character_limit;
        insert into characters(id,user_id,campaign_id,name,species,class_name,background,weapons) values
          ('${hero}','${player}','${camp}','Targeting Hero','Human','Fighter','Soldier','[{"id":"sword","name":"Fixture Sword","attackBonus":5,"damageDice":"1d8","damageBonus":3,"damageType":"slashing","range":"Melee","properties":""}]'),
          ('${target}','${dm}','${camp}','Far Target','Human','Fighter','Soldier','[]');
        alter table characters enable trigger check_character_limit;
        insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
          values('${scene}','${camp}','${dm}','Range Arena','square',70,15,12,'bright',true);
        insert into scene_tokens(id,scene_id,character_id,name,size,x,y,visible_to_all) values
          ('${randomUUID()}','${scene}','${hero}','Targeting Hero','medium',35,35,true),
          ('${randomUUID()}','${scene}','${target}','Far Target','medium',105,35,true);
        insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
        insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,ac,combatant_id)
          select '${enc}','${camp}','character',c.definition_id::uuid,c.name,case when c.definition_id='${hero}' then 0 else 1 end,10,10,c.id
          from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}';
        commit;`);



   sql(`update characters set class_name='${spell.casterClass}',level=5,intelligence=18,known_spells=ARRAY['${spell.id}'],prepared_spells=ARRAY['${spell.id}'],
    spell_sources='{"${spell.id}":["class:${spell.casterClass}"]}',spell_preparation_sources='{"${spell.id}":["class:${spell.casterClass}"]}',spell_slots='{"${spell.level}":{"total":1,"used":0}}' where id='${hero}'`);
   if(spell.kind==='save'){
    sql(`update characters set class_resources='{"psionic-energy-dice":6,"psion-disciplines":["sharpened-mind"]}' where id='${hero}'`);
    const asPlayer=(q:string)=>sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${player}","role":"authenticated"}';${q};commit;`);
    const turn=JSON.parse(asPlayer(`select get_psionic_discipline_turn('${hero}')`)).turn;
    const snapshot=JSON.parse(sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${hero}'`));
    asPlayer(`select begin_psionic_discipline('${hero}','${activation}','${JSON.stringify(turn)}','sharpened-mind',array[8],1,4,'${JSON.stringify(snapshot)}')`);
    asPlayer(`select finalize_sharpened_roll('${hero}','${activation}')`);
   }
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await signInAsSeedDm(page,'test-player@dndkeep.local');await page.goto(`/character/${hero}`);
   await page.getByRole('button',{name:'Actions',exact:true}).locator('visible=true').first().click();
   await page.getByTitle(`Cast ${spell.name} at a combat target`,{exact:true}).click();
   await page.getByRole('button',{name:/Far Target/}).click();
   const dialog=page.getByRole('dialog',{name:`Casting ${spell.name}`,exact:true});await expect(dialog).toBeVisible();
   await expect.poll(()=>sql(`select spell_slots->'${spell.level}'->>'used' from characters where id='${hero}'`)).toBe('1');
   const cast=sql(`select id from pending_spell_casts where campaign_id='${camp}'`);
   expect(sql(`select count(*) from pending_attacks where campaign_id='${camp}'`)).toBe('0');
   await page.reload();await expect(dialog).toBeVisible();await expect(dialog).toContainText('Far Target');
   expect(sql(`select count(*) from dndkeep_private.declared_spell_payments where character_id='${hero}'`)).toBe('1');
   sql(`update pending_spell_casts set expires_at=now()-interval '1 second' where id='${cast}'`);
   const deliveries:string[]=[];
   await page.route('**/rest/v1/rpc/queue_declared_spell_attack',async route=>{
    deliveries.push(route.request().postData()??'');if(deliveries.length===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}else await route.continue();
   });
   await expect(dialog.getByRole('button',{name:'Apply spell effects',exact:true})).toBeVisible();
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=\"dialog\"], [role=\"dialog\"] *')");const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
   await page.screenshot({path:info.outputPath('saved-damaging-spell.png')});
   await dialog.getByRole('button',{name:'Apply spell effects',exact:true}).click();await expect(dialog).toBeHidden();
   await expect.poll(()=>sql(`select count(*) from pending_attacks where id='${cast}'`)).toBe('1');
   expect(deliveries).toHaveLength(2);expect(deliveries[0]).toBe(deliveries[1]);
   expect(sql(`select attack_kind from pending_attacks where id='${cast}'`)).toBe(spell.kind);
   expect(sql(`select coalesce(attack_mode,'unknown') from pending_attacks where id='${cast}'`)).toBe(spell.kind==='attack_roll'?'ranged':'unknown');
   expect(sql(`select spell_slots->'${spell.level}'->>'used' from characters where id='${hero}'`)).toBe('1');
   await page.reload();await expect(dialog).toBeHidden();expect(sql(`select count(*) from pending_attacks where id='${cast}'`)).toBe('1');expect(errors).toEqual([]);
   if(spell.kind==='save'){
    const packet={version:1,components:[{key:'base',source:'base',label:'Mind Spike',expression:'3d8',damageType:'psychic',rolls:[1,5,3],dieKinds:['rolled','rolled','rolled'],modifier:0,rawTotal:9}]};
    sql(`update characters set current_hp=20,max_hp=20,damage_resistances=array['psychic'] where id='${target}';update combatants set current_hp=20,max_hp=20,temp_hp=0 where definition_id='${target}';
     update pending_attacks set state='damage_rolled',save_result='passed',damage_rolls=array[1,5,3],damage_raw=9,damage_final=4,damage_components='${JSON.stringify(packet)}' where id='${cast}'`);
    const dmContext=await browser.newContext({viewport:page.viewportSize()!,serviceWorkers:'block'});
    try{
     const dmPage=await dmContext.newPage();dmPage.on('pageerror',e=>errors.push(e.message));await signInAsSeedDm(dmPage);await dmPage.goto(`/campaigns/${camp}`);
     const panel=dmPage.getByRole('region',{name:'Resolve attack'});await expect(panel).toContainText('Final Psychic damage: 4');await expect(panel).toContainText('Successful save: half damage');
     await panel.getByRole('combobox',{name:'Sharpened Mind replacement'}).selectOption(activation);await expect(panel).toContainText('Final Psychic damage: 8');
     if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Resolve attack\"], [aria-label=\"Resolve attack\"] *')");const report=await dmPage.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
     await panel.getByRole('button',{name:/Apply Damage/}).scrollIntoViewIfNeeded();await panel.screenshot({path:info.outputPath('psychic-save-resolution.png')});
     let attempts=0;await dmPage.route('**/rest/v1/rpc/apply_psionic_damage_resolution',async route=>{attempts++;if(attempts===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}else await route.continue();});
     await panel.getByRole('button',{name:/Apply Damage/}).click();await expect.poll(()=>sql(`select state from pending_attacks where id='${cast}'`)).toBe('applied');
     await expect.poll(()=>attempts).toBe(2);expect(sql(`select current_hp from characters where id='${target}'`)).toBe('12');
     expect(sql(`select count(*) from dndkeep_private.sharpened_damage_uses where character_id='${hero}'`)).toBe('1');expect(errors).toEqual([]);
    }finally{await dmContext.close();}
   }
  }finally{
   if(!page.isClosed())await page.unroute('**/rest/v1/rpc/queue_declared_spell_attack');
   sql(`delete from pending_spell_casts where campaign_id='${camp}';delete from pending_attacks where campaign_id='${camp}';delete from combat_participants where encounter_id='${enc}';delete from combat_encounters where id='${enc}';
    delete from scenes where id='${scene}';delete from combatants where campaign_id='${camp}';delete from characters where id in('${hero}','${target}');delete from campaign_members where campaign_id='${camp}';delete from campaigns where id='${camp}';`);
  }
 });
});
