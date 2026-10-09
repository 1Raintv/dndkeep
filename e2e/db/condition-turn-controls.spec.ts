import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Condition turn recovery',()=>{
 gateDbSuite();let id:string,user:string,email:string,campaign:string,encounter:string,part:string;
 test.beforeEach(()=>{
  [id,user,campaign,encounter,part]=Array.from({length:5},()=>randomUUID());email=`death-${user}@dndkeep.local`;
  sql(`begin;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
   insert into campaigns(id,owner_id,name) values('${campaign}','${user}','Death fixture');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp)
   values('${id}','${user}','${campaign}','Death Fixture','Human','Fighter','Sage',1,10,10);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${part}','${encounter}','${campaign}','character','${id}','Death Fixture',0);
   update characters set intelligence=18,nat_1_20_saves=false,inventory='[{"magic_item_id":"ring-protection","name":"Ring of Protection","magical":true,"equipped":true,"attuned":true,"saveBonus":1}]'  where id='${id}';
   update combatants set active_conditions=array['Poisoned'],condition_sources='{"Poisoned":{"source":"fixture","save_to_end":{"ability":"INT","dc":999}}}',exhaustion_level=1,active_buffs='[{"key":"bless","name":"Bless","source":"Spell","saveBonus":"1d4"}]' where id=(select combatant_id from combat_participants where id='${part}');commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${id}';delete from auth.users where id='${user}';`));
 test('End Turn recovers a lost condition result without advancing early or rolling twice',async({page})=>{
  await signInAsSeedDm(page,email);await page.goto(`/character/${id}`);
  let calls=0;await page.route('**/rest/v1/rpc/settle_condition_turn_save',async route=>{calls++;await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lost acknowledgement'})});});
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  await expect(page.getByText(/Turn could not be completed:/)).toBeVisible();
  expect(sql(`select round_number from combat_encounters where id='${encounter}'`)).toBe('1');
  const result=JSON.parse(sql(`select result from dndkeep_private.condition_turn_saves where participant_id='${part}'`));
  expect(result.passed).toBe(false);expect(result.reviewedBonus).toBeGreaterThanOrEqual(6);expect(result.reviewedBonus).toBeLessThanOrEqual(9);expect(result.total).toBe(result.d20+result.reviewedBonus-2);
  await page.unroute('**/rest/v1/rpc/settle_condition_turn_save');await page.reload();
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select round_number from combat_encounters where id='${encounter}'`)).toBe('2');
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type='condition_resave'`)).toBe('1');
  expect(JSON.parse(sql(`select result from dndkeep_private.condition_turn_saves where participant_id='${part}'`))).toEqual(result);expect(calls).toBe(2);
 });
});
