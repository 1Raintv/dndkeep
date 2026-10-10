import { execFileSync } from 'node:child_process';
import {readFileSync} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Campaign sheet damage recovery (local stack)', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  let campaignId:string;let dmId:string;
  let errors:string[];
  test.beforeEach(({page})=>{errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});});
  test.afterEach(()=>expect(errors).toEqual([]));
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID();campaignId=randomUUID();dmId=randomUUID();
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
      insert into auth.users(id,email,raw_user_meta_data) values('${dmId}','${dmId}@dm.local','{}');
      insert into campaigns(id,owner_id,name,automation_defaults) values('${campaignId}','${dmId}','Sheet damage fixture','{"concentration_on_damage":"off"}');
      insert into campaign_members(campaign_id,user_id,role) values('${campaignId}','${userId}','player');
      update characters set campaign_id='${campaignId}',current_hp=40,max_hp=50,temp_hp=6,constitution=14,concentration_spell='detect-magic',saving_throw_proficiencies=array['constitution'],nat_1_20_saves=false where id='${charId}';
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from campaigns where id='${campaignId}';delete from auth.users where id='${dmId}';delete from action_logs where character_id='${charId}'; delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });


 test('lost reply reloads the saved hit, blocks HP edits, and confirms without damage twice',async({page},info)=>{
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);let requests=0;
  await page.route('**/rest/v1/rpc/apply_party_damage',async route=>{await route.fetch();requests++;await route.abort('failed');});
  const damage=page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first();await damage.click();
  await expect.poll(()=>requests).toBe(2);
  const recovery=page.getByRole('region',{name:'Saved campaign damage'});
  await expect(recovery.getByRole('alert')).toBeVisible();await expect(damage).toBeDisabled();
  expect(sql(`select current_hp||':'||temp_hp from characters where id='${charId}'`)).toBe('40:1');
  await page.unroute('**/rest/v1/rpc/apply_party_damage');await page.reload();
  await expect(recovery.getByRole('button',{name:'Confirm campaign damage',exact:true})).toBeEnabled();
  await recovery.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await recovery.screenshot({path:info.outputPath('campaign-damage-recovery.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Saved campaign damage\"], [aria-label=\"Saved campaign damage\"] *')");
   const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
  }
  await recovery.getByRole('button',{name:'Confirm campaign damage',exact:true}).click();await expect(damage).toBeEnabled();
  expect(sql(`select current_hp||':'||temp_hp from characters where id='${charId}'`)).toBe('40:1');
  expect(sql(`select count(*) from dndkeep_private.party_damage_events where character_id='${charId}'`)).toBe('1');
 });
 test('an unsent saved hit can be canceled after reload without changing HP',async({page})=>{
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  await page.route('**/rest/v1/rpc/apply_party_damage',route=>route.abort('failed'));
  await page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first().click();
  const recovery=page.getByRole('region',{name:'Saved campaign damage'});await expect(recovery.getByRole('alert')).toBeVisible();
  await page.unroute('**/rest/v1/rpc/apply_party_damage');await page.reload();
  await recovery.getByRole('button',{name:'Cancel unconfirmed campaign damage',exact:true}).click();
  await expect(page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first()).toBeEnabled();
  expect(sql(`select current_hp||':'||temp_hp from characters where id='${charId}'`)).toBe('40:6');
 });
 test('sheet damage creates one save with captured buffs, proficiency and exhaustion',async({page})=>{
  sql(`update campaigns set automation_defaults='{"concentration_on_damage":"prompt"}' where id='${campaignId}';update characters set exhaustion_level=2,active_buffs='[{"name":"Bless","saveBonus":0}]' where id='${charId}'`);
  await page.addInitScript(()=>{Math.random=()=>.25;});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  await page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select count(*) from pending_concentration_saves where character_id='${charId}'`)).toBe('1');
  expect(sql(`select damage||':'||dc||':'||con_bonus from pending_concentration_saves where character_id='${charId}'`)).toBe('5:10:3');
  expect(sql(`select temp_hp from characters where id='${charId}'`)).toBe('1');
 });

 test('automatic sheet saves settle once and clear a failed casting',async({page})=>{
  sql(`update campaigns set automation_defaults='{"concentration_on_damage":"auto"}' where id='${campaignId}';update characters set constitution=10,saving_throw_proficiencies=array[]::text[] where id='${charId}'`);
  await page.addInitScript(()=>{Math.random=()=>.25;});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const damage=page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first();await damage.click();
  await expect.poll(()=>sql(`select concentration_spell from characters where id='${charId}'`)).toBe('');
  await expect(damage).toBeEnabled();
  expect(sql(`select count(*) from pending_concentration_saves where character_id='${charId}' and state='resolved'`)).toBe('1');
  expect(sql(`select temp_hp from characters where id='${charId}'`)).toBe('1');
  await expect(page.getByRole('region',{name:'Saved campaign damage'})).toContainText('Damage confirmed.');
 });
 test('zero HP ends concentration without creating a saving throw',async({page})=>{
  sql(`update characters set current_hp=5,temp_hp=0 where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const damage=page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first();await damage.click();
  await expect.poll(()=>sql(`select current_hp||':'||concentration_spell from characters where id='${charId}'`)).toBe('0:');
  await expect(damage).toBeEnabled();
  expect(sql(`select count(*) from pending_concentration_saves where character_id='${charId}'`)).toBe('0');
  await expect(page.getByRole('region',{name:'Saved campaign damage'})).toContainText('Damage confirmed.');
 });
});
