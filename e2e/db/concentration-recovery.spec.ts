import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Campaign concentration recovery (local stack)', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  let campaign:string,encounter:string,participant:string,pending:string,chain:string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID();
    email = 'psion-' + userId + '@dndkeep.local';
    // v2.747: own disposable account, so shared seed users' slot limits and
    // parallel suites cannot affect this fixture. Never alter their characters.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Psion Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
      update profiles set show_ua_content=true where id='${userId}';
      insert into characters (id,user_id,name,species,class_name,background,subclass,level,class_resources)
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Telepath',5,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from campaigns where id='${campaign}';delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  test.beforeEach(()=>{
    [campaign,encounter,participant,pending,chain]=Array.from({length:5},()=>randomUUID());
    sql(`begin;insert into campaigns(id,owner_id,name) values('${campaign}','${userId}','Save recovery');
      update characters set campaign_id='${campaign}',concentration_spell='detect-magic',concentration_rounds_remaining=100,constitution=10,saving_throw_proficiencies='{}',nat_1_20_saves=false where id='${charId}';
      insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
      insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${charId}','Save fixture',0);
      insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision)
       select '${pending}','${campaign}','${encounter}','${chain}','${participant}',id,concentration_spell,5,10,0,false,now()+interval '2 minutes',concentration_revision from characters where id='${charId}';commit;`);
  });
  const spell=()=>sql(`select concentration_spell from characters where id='${charId}'`);
  for(const outside of [false,true])test(`prompt settles the save and displays its recorded result (outside encounter: ${outside})`,async({page},info)=>{
    if(outside)sql(`update pending_concentration_saves set participant_id=null,encounter_id=null where id='${pending}';delete from combat_encounters where id='${encounter}'`);
    await page.addInitScript(()=>{Math.random=()=>0.001;});await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const dialog=page.getByRole('dialog',{name:'Concentration save',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Hold focus on Detect Magic?');
    await page.screenshot({path:info.outputPath('concentration-prompt.png')});await dialog.getByRole('button',{name:'Roll Save'}).click();
    await expect(page.getByRole('status',{name:'Concentration recovery'})).toContainText('Concentration broken: saved roll 1, total 1');
    await expect.poll(spell).toBe('');expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
  });
  test('War Caster preserves two dice across a lost response and reload',async({page},info)=>{
    sql(`update characters set gained_feats=array['War Caster'] where id='${charId}';
      delete from pending_concentration_saves where id='${pending}';
      insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision)
       select '${pending}','${campaign}','${encounter}','${chain}','${participant}',id,concentration_spell,5,10,0,false,now()+interval '2 minutes',concentration_revision from characters where id='${charId}'`);
    await page.addInitScript(()=>{Math.random=()=>0.8;});await signInAsSeedDm(page,email);
    // Upgrade an old saved first die rather than silently rerolling it.
    await page.evaluate(({charId,pending})=>localStorage.setItem(`dndkeep:concentration-roll:${charId}:${pending}`,JSON.stringify({characterId:charId,pendingId:pending,d20:3,source:'player'})),{charId,pending});
    const requests:unknown[]=[];const endpoint='**/rest/v1/rpc/settle_pending_concentration_save';
    await page.route(endpoint,async route=>{requests.push(route.request().postDataJSON());const result=await route.fetch();expect(result.ok()).toBe(true);await route.abort();});
    await page.goto(`/character/${charId}`);const dialog=page.getByRole('dialog',{name:'Concentration save',exact:true});
    await expect(dialog).toContainText('2d20, keep the higher');await page.screenshot({path:info.outputPath('war-caster-prompt.png')});
    await dialog.getByRole('button',{name:'Confirm saved save'}).click();
    const recovery=page.getByRole('status',{name:'Concentration recovery'});
    await expect(recovery).toContainText('Saved concentration dice: 3 and 17');await expect.poll(()=>requests.length).toBe(2);
    expect(requests[0]).toEqual(requests[1]);expect(requests[0]).toMatchObject({p_d20:3,p_second_d20:17});
    await page.unroute(endpoint);sql(`update characters set gained_feats=array[]::text[] where id='${charId}'`);await page.reload();
    await expect(recovery).toContainText('3 and 17');await recovery.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('war-caster-recovery.png')});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await recovery.getByRole('button',{name:'Confirm saved save'}).click();await expect(recovery).toContainText('Earlier save confirmed: passed (roll 17');
    expect(spell()).toBe('detect-magic');expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
  });
  test('lost response survives reload and confirmation preserves a later casting',async({page},info)=>{
    await page.addInitScript(()=>{Math.random=()=>0.001;});let calls=0;
    const endpoint='**/rest/v1/rpc/settle_pending_concentration_save';await page.route(endpoint,async route=>{calls++;const result=await route.fetch();expect(result.ok()).toBe(true);await route.abort();});
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await page.getByRole('button',{name:'Roll Save'}).click();
    await expect.poll(()=>calls).toBe(2);await expect.poll(spell).toBe('');
    const recovery=page.getByRole('status',{name:'Concentration recovery'});await expect(recovery).toContainText('awaiting confirmation');
    await page.unroute(endpoint);sql(`update characters set concentration_spell='invisibility' where id='${charId}'`);await page.reload();
    await expect(recovery).toContainText('Saved concentration roll: 1');await recovery.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('concentration-recovery.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await recovery.getByRole('button',{name:'Confirm saved save'}).click();await expect(recovery).toContainText('Earlier save confirmed: failed (roll 1');
    expect(spell()).toBe('invisibility');expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
  });
  test('failed timeout is retained instead of sending on every countdown tick',async({page})=>{
    sql(`update pending_concentration_saves set expires_at=now()-interval '1 second' where id='${pending}'`);
    let calls=0;const endpoint='**/rest/v1/rpc/settle_pending_concentration_save';await page.route(endpoint,async route=>{calls++;await route.abort();});
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await expect.poll(()=>calls).toBe(2);
    await expect(page.getByRole('status',{name:'Concentration recovery'})).toContainText('awaiting confirmation');
    await page.waitForTimeout(1200);expect(calls).toBe(2);await page.reload();
    await expect(page.getByRole('button',{name:'Confirm saved save',exact:true})).toBeVisible();await page.waitForTimeout(600);expect(calls).toBe(2);
    await page.unroute(endpoint);await page.getByRole('button',{name:'Confirm saved save',exact:true}).click();
    await expect.poll(()=>sql(`select state from pending_concentration_saves where id='${pending}'`)).toBe('expired');
  });
  test('one campaign damage event produces one concentration save on the open sheet',async({page})=>{
    const attack=randomUUID();sql(`delete from pending_concentration_saves where id='${pending}';
      update characters set current_hp=10,max_hp=10,temp_hp=0 where id='${charId}';
      update combatants set definition_type='character',definition_id='${charId}',current_hp=10,max_hp=10,temp_hp=0
       where id=(select combatant_id from combat_participants where id='${participant}');
      insert into pending_attacks(id,campaign_id,encounter_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,damage_dice,damage_type,damage_raw,damage_final,state,chain_id)
       values('${attack}','${campaign}','${encounter}','Fixture hit','system','${participant}','Save fixture','character','Fixture damage','auto_hit','1','Force',1,1,'damage_rolled','${chain}');`);
    await page.addInitScript(()=>{Math.random=()=>0.99;});await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await expect(page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first()).toBeVisible();
    // Invoke the same damage pipeline used by the map; the live sheet and its
    // realtime listeners stay mounted while the real database change arrives.
    await page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts';const module=await import(path);await module.applyDamage(id);},attack);
    expect(sql(`select current_hp from combatants where id=(select combatant_id from combat_participants where id='${participant}')`)).toBe('9');
    expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('applied');
    const dialog=page.getByRole('dialog',{name:'Concentration save',exact:true});await expect(dialog).toBeVisible();
    expect(sql(`select count(*) from pending_concentration_saves where chain_id='${chain}'`)).toBe('1');
    await dialog.getByRole('button',{name:'Roll Save'}).click();
    await expect(page.getByRole('status',{name:'Concentration recovery'})).toContainText('Concentration maintained');
    await expect(page.getByText('Concentration Check Required',{exact:true})).toHaveCount(0);
    expect(spell()).toBe('detect-magic');expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
    await page.evaluate(async id=>{const path='/src/lib/combatEncounter.ts';const module=await import(path);const result=await module.endEncounter(id);if(!result.ok)throw new Error(result.reason);},encounter);
    await expect.poll(()=>sql(`select current_hp from characters where id='${charId}'`)).toBe('9');
    await expect(page.getByText('9',{exact:true}).locator('visible=true').first()).toBeVisible();
    await expect(page.getByText('Concentration Check Required',{exact:true})).toHaveCount(0);
    // The carry-over marker persists: a subsequent real HP change must still prompt.
    sql(`update characters set current_hp=8 where id='${charId}'`);
    await expect(page.getByText('Concentration Check Required',{exact:true})).toBeVisible();
  });
  for(const outside of [false,true])test(`atomic party damage creates one sheet prompt (outside encounter: ${outside})`,async({page})=>{
    const request=randomUUID(),save=randomUUID();sql(`delete from pending_concentration_saves where id='${pending}';update characters set current_hp=50,max_hp=50,temp_hp=8,constitution=14 where id='${charId}';
     update combatants set current_hp=50,max_hp=50,temp_hp=8 where id=(select combatant_id from combat_participants where id='${participant}')`);
    if(outside)sql(`delete from combat_encounters where id='${encounter}'`);
    await page.addInitScript(()=>{Math.random=()=>0.99;});await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await expect(page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first()).toBeVisible();
    await page.evaluate(async({campaign,charId,request,save})=>{
      const path='/src/lib/supabase.ts';const {supabase}=await import(path);
      const context=await supabase.rpc('get_party_damage_context',{p_campaign_id:campaign,p_character_id:charId});if(context.error)throw context.error;
      const result=await supabase.rpc('apply_party_damage',{p_campaign_id:campaign,p_character_id:charId,p_request_id:request,p_save_id:save,p_damage:10,p_damage_type:'psychic',p_modifier:2,p_expected:context.data});if(result.error)throw result.error;
    },{campaign,charId,request,save});
    const dialog=page.getByRole('dialog',{name:'Concentration save',exact:true});await expect(dialog).toBeVisible();
    expect(sql(`select current_hp||':'||temp_hp from characters where id='${charId}'`)).toBe('48:0');
    await expect(page.getByText('Concentration Check Required',{exact:true})).toHaveCount(0);
    await dialog.getByRole('button',{name:'Roll Save'}).click();await expect(page.getByRole('status',{name:'Concentration recovery'})).toContainText('Concentration maintained');
    expect(sql(`select count(*) from combat_events where chain_id='${request}' and event_type='save_rolled'`)).toBe('1');
    sql(`update characters set current_hp=47 where id='${charId}'`);await expect(page.getByText('Concentration Check Required',{exact:true})).toBeVisible();
  });

  test('Mind Sliver penalty changes the visible concentration result once',async({page},info)=>{
    const effect=randomUUID();
    sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status)
     select '${effect}',id,'${participant}','${participant}',psionic_turn_id,1,'active' from combat_encounters where id='${encounter}'`);
    await page.addInitScript(()=>{Math.random=()=>0.55;});await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const dialog=page.getByRole('dialog',{name:'Concentration save',exact:true});await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Roll Save'}).click();
    const result=page.getByRole('status',{name:'Concentration recovery'});
    await expect(result).toContainText('Concentration broken: saved roll 12, total 9 (Mind Sliver -3)');
    expect(spell()).toBe('');expect(sql(`select consumed_by from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe(pending);
    await expect(page.getByText('Lost concentration on Detect Magic',{exact:true})).toBeVisible();
    await result.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('mind-sliver-concentration.png')});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
});
