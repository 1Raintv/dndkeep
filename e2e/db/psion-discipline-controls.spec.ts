import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.use({serviceWorkers:'block'});
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const cases=[['biofeedback','Gain temp HP'],['destructive-thoughts','Roll damage'],['devilish-tongue','Roll bonus'],['expanded-awareness','Roll bonus'],['inerrant-aim','Roll bonus'],['observant-mind','Roll bonus'],['bolstering-precognition','Use discipline'],['id-insinuation','Use discipline'],['psionic-backlash','Use discipline'],['psionic-guards','Activate Guards'],['sharpened-mind','Use discipline']];
test.describe('Psionic Discipline activation controls',()=>{
 gateDbSuite();let charId:string,userId:string,email:string;
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
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Psi Warper',20,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from action_logs where character_id='${charId}'; delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });





 for(const [discipline,label] of cases)test(`${discipline} records its first attempt and rejects a second`,async({page},info)=>{
  test.setTimeout(90000);await page.addInitScript(()=>{Math.random=()=>0.25;});
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["${discipline}"],"psionic-energy-dice":6}' where id='${charId}'`);
  if(discipline==='psionic-guards')sql(`update characters set saving_throw_proficiencies=array['intelligence'] where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const button=page.getByRole('button',{name:label,exact:true}).locator('visible=true').first();
  const activate=async()=>{
   await button.click();
   if(discipline==='destructive-thoughts'){const target=page.getByRole('dialog',{name:'Destructive Thoughts target'});await target.getByRole('textbox').fill('Practice target');await target.getByRole('button',{name:'Choose target'}).click();}
   if(['biofeedback','destructive-thoughts'].includes(discipline))await page.getByRole('dialog').getByRole('button',{name:'Spend and roll'}).click();
  };
  await activate();
  if(label==='Roll bonus')await page.getByRole('dialog').getByRole('button',{name:'Keep die'}).click();
  await expect.poll(()=>sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('1');
  if(label==='Roll bonus')await expect.poll(()=>sql(`select outcome->>'spent' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('false');
  const pool=()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`);
  expect(pool()).toBe(label==='Roll bonus'?'6':'5');
  expect(sql(`select receipt->'rolls' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe(discipline==='psionic-guards'?'[]':'[3]');
  await expect(button).toBeEnabled();await activate();
  await expect(page.getByText('This discipline was already used this turn', {exact:true})).toBeVisible();
  expect(pool()).toBe(label==='Roll bonus'?'6':'5');expect(sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('1');
  if(discipline==='psionic-guards'){
   const protection=page.getByRole('status',{name:'Psionic Guards protection'});await expect(protection).toContainText('Psionic Guards active');
   await page.reload();await expect(protection).toBeVisible();await protection.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('guards-active.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
    const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');
    const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
    const layout=await page.evaluate('('+body+'\n})()');expect(layout.sideways).toBe(false);
    await info.attach('guards-sheet-layout',{body:JSON.stringify(layout),contentType:'application/json'});
    const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Psionic Discipline record\"], [aria-label=\"Psionic Discipline record\"] *')");
    const local=await page.evaluate('('+scoped+'\n})()');expect(local.clipped).toEqual([]);expect(local.pastEdge).toEqual([]);
   }
   await page.getByRole('button',{name:/^intelligence saving throw/}).locator('visible=true').first().click();
   await expect.poll(()=>sql(`select count(*) from roll_logs where character_id='${charId}' and label='Intelligence Save (Advantage · Psionic Guards)'`),{timeout:20000}).toBe('1');
   const guarded=JSON.parse(sql(`select jsonb_build_object('dice',individual_results,'total',total,'modifier',modifier) from roll_logs where character_id='${charId}' and label='Intelligence Save (Advantage · Psionic Guards)'`));
   expect(guarded.dice).toHaveLength(2);expect(guarded.modifier).toBe(7);expect(guarded.total).toBe(Math.max(...guarded.dice)+7);
   await expect(page.getByText('Rolling...', {exact:true})).not.toBeVisible();
   await page.screenshot({path:info.outputPath('guards-save.png')});
   await page.reload();await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();await expect(protection).toHaveCount(0);
   await page.getByRole('button',{name:/^intelligence saving throw/}).locator('visible=true').first().click();
   await expect.poll(()=>sql(`select count(*) from roll_logs where character_id='${charId}' and label='Intelligence Save'`),{timeout:20000}).toBe('1');
   const normal=JSON.parse(sql(`select jsonb_build_object('dice',individual_results,'total',total) from roll_logs where character_id='${charId}' and label='Intelligence Save'`));
   expect(normal.dice).toHaveLength(1);expect(normal.total).toBe(normal.dice[0]+7);
  }
  if(discipline==='psionic-guards'||discipline==='inerrant-aim')await page.screenshot({path:info.outputPath(discipline+'-used.png')});
 });
 test('DM save requests apply Guards and return to normal after expiry',async({page},info)=>{
  test.setTimeout(90000);const campaign=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${userId}','Guards prompt fixture');
   update characters set campaign_id='${campaign}',level=5,intelligence=18,saving_throw_proficiencies=array['intelligence'],class_resources='{"psion-disciplines":["psionic-guards"],"psionic-energy-dice":6}' where id='${charId}'`);
  try{
   await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
   await page.getByRole('button',{name:'Activate Guards',exact:true}).locator('visible=true').first().click();
   await expect(page.getByRole('status',{name:'Psionic Guards protection'})).toBeVisible();
   const send=()=>sql(`insert into campaign_chat(campaign_id,user_id,character_name,message,message_type) values('${campaign}','${userId}','DM','{"ability":"INT","dc":18,"targets":["${charId}"]}','save_prompt')`);
   const banner=page.getByRole('region',{name:'DM saving throw'});
   send();await expect(banner).toBeVisible({timeout:20000});await expect(banner).toContainText('Your modifier: +7 (proficient)');
   await banner.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('dm-guards-save-prompt.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
    const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');
    const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
    const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"DM saving throw\"], [aria-label=\"DM saving throw\"] *')");
    const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);
   }
   await banner.getByRole('button',{name:'Roll Save',exact:true}).click();await expect(banner).toHaveCount(0);
   const history=()=>sql(`select coalesce(jsonb_agg(jsonb_build_object('description',description,'total',new_value)),'[]') from character_history where character_id='${charId}' and event_type='save'`);
   await expect.poll(()=>JSON.parse(history()).length,{timeout:20000}).toBe(1);
   const guarded=JSON.parse(history())[0];const match=guarded.description.match(/: (\d+) or (\d+) \(keep highest; Psionic Guards\) \+7 = (\d+) — (SUCCESS|FAIL)/);
   expect(match).not.toBeNull();const total=Math.max(Number(match[1]),Number(match[2]))+7;expect(Number(match[3])).toBe(total);expect(Number(guarded.total)).toBe(total);expect(match[4]).toBe(total>=18?'SUCCESS':'FAIL');
   await page.reload();await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();await expect(page.getByRole('status',{name:'Psionic Guards protection'})).toHaveCount(0);
   send();await expect(banner).toBeVisible({timeout:20000});await banner.getByRole('button',{name:'Roll Save',exact:true}).click();
   await expect.poll(()=>JSON.parse(history()).length,{timeout:20000}).toBe(2);
   const normal=JSON.parse(history()).find((r:{description:string})=>!r.description.includes('Psionic Guards'));const normalMatch=normal.description.match(/: (\d+) \+7 = (\d+) — (SUCCESS|FAIL)/);
   expect(normalMatch).not.toBeNull();expect(Number(normalMatch[2])).toBe(Number(normalMatch[1])+7);
  }finally{sql(`update characters set campaign_id=null where id='${charId}';delete from campaigns where id='${campaign}'`);}
 });
 test('DM campaign attack saves verify Guards and stop on unreadable protection',async({page})=>{
  test.setTimeout(90000);const campaign=randomUUID(),encounter=randomUUID(),combatant=randomUUID(),participant=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${userId}','Guards combat fixture');
   update characters set campaign_id='${campaign}',level=5,intelligence=18,nat_1_20_saves=false,class_resources='{"psion-disciplines":["psionic-guards"],"psionic-energy-dice":6}' where id='${charId}';
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,is_dead) values('${combatant}','${campaign}','${userId}','Psion','character','${charId}',20,20,false);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${participant}','${encounter}','${campaign}','character','${charId}','Psion',0,'${combatant}')`);
  try{
   await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await page.getByRole('button',{name:'Activate Guards',exact:true}).locator('visible=true').first().click();await expect(page.getByRole('status',{name:'Psionic Guards protection'})).toBeVisible();
   const attack=()=>{const id=randomUUID();sql(`insert into pending_attacks(id,campaign_id,encounter_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,save_ability,save_dc,chain_id) values('${id}','${campaign}','${encounter}','${participant}','Fixture','system','Psion','character','Guards INT save','save','INT',18,gen_random_uuid())`);return id;};
   const roll=(id:string)=>page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts';const module=await import(path);return await module.rollSave(id,7);},id);
   const guardedId=attack();const guarded=await roll(guardedId);expect(guarded.save_total).toBe(guarded.save_d20+7);
   const payload=JSON.parse(sql(`select payload from combat_events where chain_id=(select chain_id from pending_attacks where id='${guardedId}') and event_type='save_rolled'`));expect(payload.advantage).toBe(true);expect(payload.individual_results).toHaveLength(2);expect(guarded.save_d20).toBe(Math.max(...payload.individual_results));
   const blockedId=attack();const endpoint='**/rest/v1/rpc/get_psionic_guards_active';await page.route(endpoint,route=>route.fulfill({status:403,contentType:'application/json',body:'{"message":"Protection unavailable","code":"42501"}'}));
   await expect(roll(blockedId)).rejects.toThrow(/Protection unavailable/);expect(sql(`select coalesce(save_result,'unrolled') from pending_attacks where id='${blockedId}'`)).toBe('unrolled');
   await page.goto(`/campaigns/${campaign}`);const saveButton=page.getByRole('button',{name:'⚄ Roll Save',exact:true});await expect(saveButton).toBeVisible();await saveButton.click();
   await expect(page.getByText('Protection unavailable',{exact:true})).toBeVisible();await expect(saveButton).toBeEnabled();
   await page.unroute(endpoint);await saveButton.click();await expect.poll(()=>sql(`select coalesce(save_result,'unrolled') from pending_attacks where id='${blockedId}'`)).toMatch(/passed|failed/);
   sql(`update combatants set active_conditions=array['Poisoned'],condition_sources='{"Poisoned":{"save_to_end":{"ability":"INT","dc":18}}}' where id='${combatant}'`);
   await page.evaluate(async id=>{const path='/src/lib/combatEncounter.ts';const module=await import(path);const random=Math.random;try{Math.random=()=>.99;await module.advanceTurn(id);}finally{Math.random=random;}},encounter);
   const upkeep=JSON.parse(sql(`select payload from combat_events where encounter_id='${encounter}' and event_type='condition_resave' order by created_at desc limit 1`));
   expect(upkeep.advantage).toBe(true);expect(upkeep.individual_results).toHaveLength(2);expect(upkeep.d20).toBe(Math.max(...upkeep.individual_results));expect(upkeep.total).toBe(upkeep.d20+upkeep.bonus);expect(upkeep.passed).toBe(true);
   expect(sql(`select active_conditions::text from combatants where id='${combatant}'`)).toBe('{}');
   expect(sql(`select round_number from combat_encounters where id='${encounter}'`)).toBe('2');
   const normalId=attack();await roll(normalId);
   const normal=JSON.parse(sql(`select payload from combat_events where chain_id=(select chain_id from pending_attacks where id='${normalId}') and event_type='save_rolled'`));expect(normal.advantage).toBe(false);expect(normal.psionic_guards).toBe(false);expect(normal.individual_results).toBeUndefined();
  }finally{sql(`update characters set campaign_id=null where id='${charId}';delete from campaigns where id='${campaign}'`);}
 });
 test('class save dialog reads another party members Guards without private history',async({page},info)=>{
  test.setTimeout(90000);const dm=randomUUID(),targetOwner=randomUUID(),target=randomUUID(),campaign=randomUUID(),encounter=randomUUID(),casterCombatant=randomUUID(),targetCombatant=randomUUID();
  try{
   sql(`insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@guards.local','{}'),('${targetOwner}','${targetOwner}@guards.local','{}');
    insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Party Guards');
    insert into campaign_members(campaign_id,user_id) values('${campaign}','${userId}'),('${campaign}','${targetOwner}');
    update characters set campaign_id='${campaign}' where id='${charId}';
    insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,intelligence,saving_throw_proficiencies,nat_1_20_saves,class_resources)
    values('${target}','${targetOwner}','${campaign}','Protected Psion','Human','Psion','Sage',5,18,array['intelligence'],false,'{"psion-disciplines":["psionic-guards"],"psionic-energy-dice":6}');
    insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,is_dead) values
    ('${casterCombatant}','${campaign}','${userId}','Caster','character','${charId}',20,20,false),('${targetCombatant}','${campaign}','${targetOwner}','Protected Psion','character','${target}',20,20,false);
    insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,1);
    insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values
    ('${encounter}','${campaign}','character','${charId}','Caster',0,'${casterCombatant}'),('${encounter}','${campaign}','character','${target}','Protected Psion',1,'${targetCombatant}');
    begin;set local role authenticated;set local request.jwt.claims='{"sub":"${targetOwner}","role":"authenticated"}';
    select begin_psionic_discipline('${target}','${randomUUID()}',get_psionic_discipline_turn('${target}')->'turn','psionic-guards',array[]::integer[],1,4,
    (select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${target}'));commit;`);
   await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await expect(page.getByRole('button',{name:/^intelligence saving throw/}).first()).toBeVisible();
   // Mount the real reusable dialog with an INT-save fixture; current built-in
   // class ability metadata has no INT save. All data/auth/RPCs remain real.
   await page.evaluate(async characterId=>{
    const reactPath='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',modalPath='/src/components/Combat/ClassAbilityResolveModal.tsx',dbPath='/src/lib/supabase.ts';
    const [React,dom,modal,db]=await Promise.all([import(reactPath),import(domPath),import(modalPath),import(dbPath)]);
    const {data:character,error}=await db.supabase.from('characters').select('*').eq('id',characterId).single();if(error)throw error;
    const host=document.createElement('div');document.body.appendChild(host);const root=dom.default.createRoot(host);
    root.render(React.default.createElement(modal.default,{open:true,onClose:()=>root.unmount(),character,campaign:null,campaignId:character.campaign_id,saveDC:18,
     ability:{name:'Intelligence save fixture',actionType:'action',minLevel:1,description:'',save:{ability:'INT',dc:'spell',targetMode:'any'}},
     onConfirmed:(outcomes:unknown)=>{document.body.dataset.guardsOutcome=JSON.stringify(outcomes);root.unmount();}}));
   },charId);
   const dialog=page.getByRole('dialog',{name:'Intelligence save fixture saving throws'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Roll Save',exact:true})).toBeEnabled();
   await dialog.getByRole('button',{name:'Roll Save',exact:true}).click();await expect(dialog.getByText(/Psionic Guards:.*keep highest/)).toBeVisible();await page.screenshot({path:info.outputPath('guards-class-save.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);}
   await dialog.getByRole('button',{name:'Confirm',exact:true}).click();const outcomes=await page.evaluate(()=>JSON.parse(document.body.dataset.guardsOutcome!));expect(outcomes).toHaveLength(1);expect(outcomes[0].advantage).toBe(true);expect(outcomes[0].rolls).toHaveLength(2);expect(outcomes[0].d20).toBe(Math.max(...outcomes[0].rolls));expect(outcomes[0].total).toBe(outcomes[0].d20+7);
   const privateRead=await page.evaluate(async id=>{const path='/src/lib/supabase.ts';const {supabase}=await import(path);return (await supabase.rpc('get_psionic_discipline_turn',{p_character_id:id})).error?.message;},target);expect(privateRead).toContain('Character is unavailable');
  }finally{sql(`delete from action_logs where character_id='${target}';delete from characters where id='${target}';update characters set campaign_id=null where id='${charId}';delete from campaigns where id='${campaign}';delete from auth.users where id in('${dm}','${targetOwner}')`);}
 });
 test('secondary Psion uses the original class snapshot instead of the display projection',async({page})=>{
  sql(`update characters set class_name='Fighter',level=3,secondary_class='Psion',secondary_level=5,intelligence=18,class_resources='{"psion-disciplines":["psionic-guards"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await page.getByRole('button',{name:'Activate Guards',exact:true}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('5');
  expect(sql(`select request->'expected'->>'class_name' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('Fighter');
 });
 test('two tabs share one ordinary discipline attempt even when its die is kept',async({page,context})=>{
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["inerrant-aim","biofeedback"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);const second=await context.newPage();
  try{
   await second.goto(`/character/${charId}`);await page.getByRole('button',{name:'Roll bonus',exact:true}).locator('visible=true').first().click();
   await page.getByRole('dialog').getByRole('button',{name:'Keep die'}).click();
   await second.getByRole('button',{name:'Gain temp HP',exact:true}).locator('visible=true').first().click();await second.getByRole('dialog').getByRole('button',{name:'Spend and roll'}).click();
   await expect(second.getByText('A discipline was already used this turn',{exact:true})).toBeVisible();
   expect(sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('1');
   expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('6');
  }finally{await second.close();}
 });
 test('distinct start-of-turn exceptions allow a subsequent ordinary discipline',async({page},info)=>{
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["psionic-guards","sharpened-mind","biofeedback"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  await page.getByRole('button',{name:'Activate Guards',exact:true}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('5');
  await page.getByRole('button',{name:'Use discipline',exact:true}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('4');
  await page.getByRole('button',{name:'Gain temp HP',exact:true}).locator('visible=true').first().click();await page.getByRole('dialog').getByRole('button',{name:'Spend and roll'}).click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('3');
  expect(sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('3');
  await page.getByRole('region',{name:'Psionic Discipline record'}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('discipline-exceptions.png')});
 });

 test('closing the bonus leaves its outcome pending across reload',async({page},info)=>{
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["inerrant-aim"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await page.getByRole('button',{name:'Roll bonus',exact:true}).locator('visible=true').first().click();
  await expect(page.getByRole('dialog',{name:'Inerrant Aim'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(sql(`select outcome is null from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('t');
  await page.reload();const record=page.getByRole('region',{name:'Psionic Discipline record'});await expect(record).toContainText('outcome pending');await record.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('discipline-closed.png')});
  await record.getByRole('button',{name:'No change · keep die'}).click();await expect(record).toContainText('Outcome confirmed');
  expect(sql(`select outcome->>'spent' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('false');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('6');
 });

});
