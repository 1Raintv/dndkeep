import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';

const docker=process.platform==='win32'?`${process.env.ProgramFiles}/Docker/Docker/resources/bin/docker.exe`:'docker';
const sql=(q:string)=>execFileSync(docker,['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const dm='11111111-1111-1111-1111-111111111111',player='12121212-1212-1212-1212-121212121212';

test.describe('Paid casting recovery (local stack)',()=>{
 gateDbSuite();test.use({serviceWorkers:'block'});
 for(const scenario of ['recovered','countered','canceled','limited'])test(scenario==='limited'?'current-turn slot limit survives reload and permits casting next turn':scenario==='countered'?'failed Counterspell returns the caster slot without applying effects':scenario==='canceled'?'cancel rejected casting after a lost cancellation response and start again':'last-slot casting survives a lost response and reload',async({page,browser},info)=>{
  const countered=scenario==='countered';
  test.setTimeout(90_000);
  const camp=randomUUID(),scene=randomUUID(),enc=randomUUID(),hero=randomUUID(),target=randomUUID();
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
          ('${randomUUID()}','${scene}','${target}','Far Target','medium',595,35,true);
        insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
        insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,combatant_id)
          select '${enc}','${camp}','character',c.definition_id::uuid,c.name,case when c.definition_id='${hero}' then 0 else 1 end,10,c.id
          from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}';
        commit;`);


   sql(`update characters set class_name='Psion',level=5,intelligence=18,nat_1_20_saves=false,known_spells=ARRAY['fly'],prepared_spells=ARRAY['fly'],
    spell_sources='{"fly":["class:Psion"]}',spell_preparation_sources='{"fly":["class:Psion"]}',spell_slots='{"3":{"total":1,"used":0}}' where id='${hero}';
    update characters set class_name='Wizard',level=5,intelligence=18,known_spells=ARRAY['counterspell'],prepared_spells=ARRAY['counterspell'],
    spell_sources='{"counterspell":["class:Wizard"]}',spell_preparation_sources='{"counterspell":["class:Wizard"]}',spell_slots='{"3":{"total":1,"used":0}}' where id='${target}'`);
   if(scenario==='limited'){
    sql(`update characters set spell_slots='{"3":{"total":2,"used":0}}' where id='${hero}';
     begin;set local role authenticated;set local request.jwt.claims='{"sub":"${player}","role":"authenticated"}';
     select declare_spell_cast_atomic('${randomUUID()}','${hero}',(select id from combat_participants where encounter_id='${enc}' and entity_id='${hero}'),'fly','Fly',3,'{"total":2,"used":0}','{"source":"class:Psion","spellLevel":3,"isBonusAction":false}');commit;`);
   }
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   const bodies:string[]=[];
   if(scenario==='recovered')await page.route('**/rest/v1/rpc/declare_spell_cast_atomic',async route=>{
    bodies.push(route.request().postData()??'');if(bodies.length===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}else await route.continue();
   });
   const cancellations:string[]=[];
   if(scenario==='canceled'){
    await page.route('**/rest/v1/rpc/declare_spell_cast_atomic',async route=>{
     bodies.push(route.request().postData()??'');
     if(bodies.length===1)sql(`update characters set spell_slots='{"3":{"total":2,"used":0}}' where id='${hero}'`);
     await route.continue();
    });
    await page.route('**/rest/v1/rpc/cancel_unpaid_spell_atomic',async route=>{
     cancellations.push(route.request().postData()??'');
     if(cancellations.length===1){const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');}else await route.continue();
    });
   }
   await signInAsSeedDm(page,'test-player@dndkeep.local');await page.goto(`/character/${hero}`);
   await page.locator('button.tab').filter({hasText:/^Spells/}).click();
   const spellRow=page.locator('.srow-grid').filter({has:page.getByText('Fly',{exact:true})}).first();
   await spellRow.getByRole('button',{name:'Cast',exact:true}).click();
   await page.getByRole('button',{name:'Declare',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Casting Fly',exact:true});await expect(dialog).toBeVisible();
   if(scenario==='limited'){
    await expect(dialog.getByRole('alert')).toContainText('Only one spell slot');
    expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('1');
    await page.reload();await expect(dialog.getByRole('alert')).toContainText('Only one spell slot');
    const probe=process.env.DNDKEEP_UI_OVERFLOW_PROBE;
    if(probe){const source=readFileSync(probe,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelector('[aria-label=\"Casting Fly\"]')?.querySelectorAll('*') ?? []"),report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
    await page.screenshot({path:info.outputPath('slot-limit.png')});
    await dialog.getByRole('button',{name:'Cancel unconfirmed cast',exact:true}).click();await expect(dialog).toBeHidden();
    sql(`update combat_encounters set current_turn_index=1 where id='${enc}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await spellRow.getByRole('button',{name:'Cast',exact:true}).click();await page.getByRole('button',{name:'Declare',exact:true}).click();
    await expect.poll(()=>sql(`select count(*) from dndkeep_private.declared_spell_payments where character_id='${hero}'`)).toBe('2');
    expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('2');
    expect(sql(`select count(distinct turn_id) from dndkeep_private.spell_turn_slot_spends where character_id='${hero}'`)).toBe('2');
    expect(errors).toEqual([]);return;
   }
   if(scenario==='canceled'){
    await expect(dialog.getByRole('alert')).toContainText('Spell slots changed');
    await expect(dialog.getByText('Confirmation needed',{exact:true})).toBeVisible();await expect(dialog.getByText(/seconds left/)).toHaveCount(0);
    await page.screenshot({path:info.outputPath('cancel-unconfirmed.png')});
    const canceledId=JSON.parse(bodies[0]).p_cast_id;
    await dialog.getByRole('button',{name:'Cancel unconfirmed cast',exact:true}).click();await expect(dialog).toBeHidden();
    expect(cancellations).toHaveLength(2);expect(cancellations[1]).toBe(cancellations[0]);
    expect(sql(`select count(*) from dndkeep_private.canceled_spell_requests where cast_id='${canceledId}'`)).toBe('1');
    expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('0');
    await spellRow.getByRole('button',{name:'Cast',exact:true}).click();await page.getByRole('button',{name:'Declare',exact:true}).click();
    await expect.poll(()=>sql(`select count(*) from dndkeep_private.declared_spell_payments where character_id='${hero}'`)).toBe('1');
    expect(sql(`select id from pending_spell_casts where campaign_id='${camp}'`)).not.toBe(canceledId);
    expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('1');expect(errors).toEqual([]);return;
   }
   await expect.poll(()=>sql(`select count(*) from dndkeep_private.declared_spell_payments where character_id='${hero}'`)).toBe('1');
   await expect.poll(()=>sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('1');
   await expect.poll(()=>sql(`select count(*) from pending_reactions where campaign_id='${camp}' and reaction_key='counterspell'`)).toBe('1');
   const cast=sql(`select id from pending_spell_casts where campaign_id='${camp}'`);
   const expires=sql(`select expires_at from pending_spell_casts where id='${cast}'`);
   if(!countered){expect(bodies).toHaveLength(2);expect(bodies[1]).toBe(bodies[0]);}
   if(existsSync('paid-casting-overflow-probe.tmp')){
    const report=await page.evaluate(readFileSync('paid-casting-overflow-probe.tmp','utf8'));
    await info.attach('overflow-probe',{body:JSON.stringify(report),contentType:'application/json'});expect(report.sideways).toBe(false);
   }
   const bounds=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:visualViewport!.width,padding:parseFloat(getComputedStyle(el).paddingLeft)};});
   expect(bounds.left).toBeGreaterThanOrEqual(8);expect(bounds.right).toBeLessThanOrEqual(bounds.width-8);expect(bounds.padding).toBeGreaterThanOrEqual(16);
   await page.screenshot({path:info.outputPath('saved-casting.png')});
   await dialog.getByRole('button',{name:'Close and resume later'}).click();await expect(dialog).toBeHidden();
   await page.getByRole('button',{name:'Resume Fly',exact:true}).click();await expect(dialog).toBeVisible();
   if(countered)sql(`update characters set known_spells='{}',prepared_spells='{}',spell_sources='{}',spell_preparation_sources='{}' where id='${hero}'`);
   await page.reload();await expect(dialog).toBeVisible();
   await expect(dialog.getByText(/seconds left/)).toBeVisible();
   expect(sql(`select count(*) from pending_spell_casts where campaign_id='${camp}'`)).toBe('1');
   expect(sql(`select expires_at from pending_spell_casts where id='${cast}'`)).toBe(expires);
   expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('1');
   if(countered){
    const offer=sql(`select id from pending_reactions where campaign_id='${camp}' and reaction_key='counterspell'`);
    const c=JSON.parse(sql(`select row_to_json(c) from characters c where id='${target}'`));
    const expected={...Object.fromEntries(['class_name','level','subclass','secondary_class','secondary_level','secondary_subclass','intelligence','wisdom','charisma','inventory','spell_sources','spell_preparation_sources','prepared_spells'].map(k=>[k,c[k]])),slot:c.spell_slots['3']};
    const receipt=JSON.parse(sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';select accept_counterspell_atomic('${offer}',3,'class:Wizard','intelligence',4,'${JSON.stringify(expected)}');commit;`));
    const dmContext=await browser.newContext({serviceWorkers:'block'});
    try{
     const dmPage=await dmContext.newPage();await signInAsSeedDm(dmPage);
     // Exercise the real save-recording + settlement client under the DM session.
     await dmPage.evaluate(async id=>{const modulePath='/src/lib/pendingAttack.ts';const api=await import(modulePath);await api.rollSave(id,-100);},receipt.attackId);
    }finally{await dmContext.close();}
    await expect(dialog.getByText(/Your spell slot was returned/)).toBeVisible();
    expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('0');
    expect(sql(`select spell_slots->'3'->>'used' from characters where id='${target}'`)).toBe('1');
    await page.screenshot({path:info.outputPath('countered-casting.png')});
    await dialog.getByRole('button',{name:'Finish',exact:true}).click();
    expect(sql(`select coalesce(concentration_spell,'') from characters where id='${hero}'`)).toBe('');
   }else{
    sql(`update pending_spell_casts set expires_at=now()-interval '1 second' where id='${cast}'`);
    await expect(dialog.getByRole('button',{name:'Apply spell effects',exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:'Apply spell effects',exact:true}).click();
    await expect.poll(()=>sql(`select concentration_spell from characters where id='${hero}'`)).toBe('fly');
    await expect(page.getByLabel('Concentration casting ability')).toHaveText('INT · DC 15');
    expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('1');
   }
   await expect(dialog).toBeHidden();
   await expect.poll(()=>page.evaluate(({player,hero})=>localStorage.getItem(`dndkeep:declared-spell:${player}:${hero}`),{player,hero})).toBeNull();
   expect(sql(`select count(*) from combat_events where campaign_id='${camp}' and event_type='spell_counterspell_resolved'`)).toBe('1');
   expect(errors).toEqual([]);
  }finally{
   sql(`delete from pending_reactions where campaign_id='${camp}';delete from pending_spell_casts where campaign_id='${camp}';delete from pending_attacks where campaign_id='${camp}';`);
      sql(`delete from combat_participants where encounter_id='${enc}';delete from combat_encounters where id='${enc}';
        delete from scenes where id='${scene}';delete from combatants where campaign_id='${camp}';
        delete from characters where id in ('${hero}','${target}');delete from campaign_members where campaign_id='${camp}';delete from campaigns where id='${camp}';`);

  }
 });
});
