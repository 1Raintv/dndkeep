import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Saved death-save dialog',()=>{
 gateDbSuite();let id:string,user:string,email:string,campaign:string,encounter:string,part:string,pending:string;
 test.beforeEach(()=>{
  [id,user,campaign,encounter,part,pending]=Array.from({length:6},()=>randomUUID());email=`death-${user}@dndkeep.local`;
  sql(`begin;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
   insert into campaigns(id,owner_id,name) values('${campaign}','${user}','Death fixture');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp)
   values('${id}','${user}','${campaign}','Death Fixture','Human','Fighter','Sage',1,0,10);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${part}','${encounter}','${campaign}','character','${id}','Death Fixture',0);
   insert into pending_death_saves(id,campaign_id,encounter_id,participant_id,character_id) values('${pending}','${campaign}','${encounter}','${part}','${id}');commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${id}';delete from auth.users where id='${user}';`));
 test('saved dice survive reload and a lost committed response',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${id}`);
  const dialog=page.getByRole('dialog',{name:'Death saving throw'});
  await expect(dialog).toBeVisible();await dialog.getByLabel('I reviewed the applicable save effects.').check();
  await dialog.getByRole('button',{name:'Roll death save',exact:true}).click();
  const saved=await dialog.getByText(/Saved dice:/).textContent();
  await page.reload();await expect(dialog.getByText(/Saved dice:/)).toHaveText(saved!);
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
    const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
    const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Death saving throw\"], [aria-label=\"Death saving throw\"] *')").replace(/const skip = \(el, cs\) =>[\s\S]*?;\n\n {4}const clipped/,"const skip = (_el, cs) => cs.filter !== 'none';\n\n    const clipped");
    const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
   }
  await page.screenshot({path:info.outputPath('death-save-ready.png')});
  let requests=0;await page.route('**/rest/v1/rpc/settle_pending_death_save',async route=>{
   requests++;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lost response fixture'})});
  });
  await dialog.getByRole('button',{name:'Confirm saved roll'}).click();await expect(dialog.getByRole('alert')).toBeVisible();
  expect(sql(`select state from pending_death_saves where id='${pending}'`)).toBe('rolled');
  await page.unroute('**/rest/v1/rpc/settle_pending_death_save');await page.reload();
  await expect(dialog.getByText(/Saved dice:/)).toHaveText(saved!);
  await dialog.getByRole('button',{name:'Confirm saved roll'}).click();await expect(dialog.getByRole('status')).toBeVisible();
  await page.screenshot({path:info.outputPath('death-save-result.png')});
  expect(sql(`select count(*) from combat_events where chain_id='${pending}'`)).toBe('1');expect(requests).toBe(1);
  await dialog.getByRole('button',{name:'Done',exact:true}).click();await expect(dialog).toHaveCount(0);expect(errors).toEqual([]);
 });
 test('End Turn automatically settles incoming death save with Bless and equipped protection',async({page})=>{
  const outgoing=randomUUID(),outgoingCharacter=randomUUID();sql(`delete from pending_death_saves where id='${pending}';
   update campaigns set automation_defaults='{"death_save_on_turn_start":"auto"}' where id='${campaign}';
   update characters set inventory='[{"name":"Ring of Protection","magical":true,"equipped":true,"attuned":true,"magic_item_id":"ring-protection","saveBonus":1}]' where id='${id}';
   update combat_participants set turn_order=1 where id='${part}';
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${outgoingCharacter}','${user}','${campaign}','Outgoing','Human','Fighter','Sage',1,10,10);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${outgoing}','${encounter}','${campaign}','character','${outgoingCharacter}','Outgoing',0);
   update combatants set current_hp=10,max_hp=10 where id=(select combatant_id from combat_participants where id='${outgoing}');
   update combatants set exhaustion_level=1,active_buffs='[{"key":"bless","name":"Bless","source":"Spell","saveBonus":"1d4"}]' where id=(select combatant_id from combat_participants where id='${part}');`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${outgoingCharacter}`);
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select state from pending_death_saves where character_id='${id}'`)).toBe('rolled');
  const r=JSON.parse(sql(`select result from dndkeep_private.death_save_receipts where pending_id=(select id from pending_death_saves where character_id='${id}')`));
  expect(r.bonus).toBeGreaterThanOrEqual(2);expect(r.bonus).toBeLessThanOrEqual(5);expect(r.total).toBe(r.d20+r.bonus-2);expect(r.exhaustion).toBe(1);
  expect(sql(`select count(*) from combat_events where event_type='death_save_rolled' and encounter_id='${encounter}'`)).toBe('1');
  await expect(page.getByRole('dialog',{name:'Death saving throw'})).toHaveCount(0);expect(errors).toEqual([]);
 });

 test('abandoned automatic offer appears after reload without a local draft',async({page})=>{
  sql(`update pending_death_saves set resolution_mode='auto',created_at=now()-interval '2 minutes' where id='${pending}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${id}`);
  const dialog=page.getByRole('dialog',{name:'Death saving throw'});
  await expect(dialog).toContainText('automatic save was interrupted');
  await page.reload();await expect(dialog).toBeVisible();
  await dialog.getByLabel('I reviewed the applicable save effects.').check();
  await dialog.getByRole('button',{name:'Roll death save',exact:true}).click();
  await expect(dialog.getByText(/Saved dice:/)).toBeVisible();
  expect(sql(`select resolution_mode from pending_death_saves where id='${pending}'`)).toBe('prompt');
  await dialog.getByRole('button',{name:'Confirm saved roll'}).click();
  await expect(dialog.getByRole('status')).toBeVisible();
  expect(sql(`select count(*) from combat_events where chain_id='${pending}'`)).toBe('1');
 });

 test('an automatic result arriving during manual recovery closes without another roll',async({page})=>{
  sql(`update pending_death_saves set resolution_mode='auto',created_at=now()-interval '2 minutes' where id='${pending}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${id}`);
  const dialog=page.getByRole('dialog',{name:'Death saving throw'});
  await expect(dialog).toContainText('automatic save was interrupted');
  sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';
   select settle_pending_death_save('${pending}',get_death_save_context('${pending}'),array[10],0,false,false,3);commit;`);
  await dialog.getByLabel('I reviewed the applicable save effects.').check();
  await dialog.getByRole('button',{name:'Roll death save',exact:true}).click();
  await expect(dialog.getByRole('status')).toHaveText('This save is already resolved. No new roll is needed.');
  expect(sql(`select count(*) from combat_events where chain_id='${pending}'`)).toBe('1');
  await dialog.getByRole('button',{name:'Done',exact:true}).click();await expect(dialog).toHaveCount(0);
 });

});
