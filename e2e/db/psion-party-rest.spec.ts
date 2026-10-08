import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('DM Psion rest recovery', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  let campaignId:string,playerId:string,fighterId:string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID();campaignId=randomUUID();playerId=randomUUID();fighterId=randomUUID();
    email = 'psion-' + userId + '@dndkeep.local';
    // v2.747: own disposable account, so shared seed users' slot limits and
    // parallel suites cannot affect this fixture. Never alter their characters.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Psion Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
      update profiles set show_ua_content=true where id='${userId}';
      insert into auth.users(id,email,raw_user_meta_data) values('${playerId}','${playerId}@rest.local','{}');
      insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Party Rest Fixture');
      insert into campaign_members(campaign_id,user_id,role) values('${campaignId}','${playerId}','player');
      insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,hit_dice_spent,current_hp,max_hp,exhaustion_level,class_resources,feature_uses) values
       ('${charId}','${playerId}','${campaignId}','Party Psion','Human','Psion','Sage',7,5,2,40,3,'{"psionic-energy-dice":2,"psionic-restoration":0}','{"Psionic Restoration":1}'),
       ('${fighterId}','${playerId}','${campaignId}','Party Fighter','Human','Fighter','Soldier',7,5,2,40,3,'{}','{}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from campaigns where id='${campaignId}';delete from characters where user_id='${playerId}';delete from auth.users where id in('${userId}','${playerId}');`);
  });




 for(const secondary of [false,true])for(const lost of [false,true])test(`DM party rest (${secondary?'secondary':'primary'} Psion) ${lost?'recovers a partial unknown result':'confirms the whole party'}`,async({page},info)=>{
  if(secondary)sql(`update characters set class_name='Fighter',level=11,secondary_class='Psion',secondary_level=7,class_resources=class_resources||'{"second-wind":0,"other":3}'::jsonb where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/campaigns/${campaignId}`);await page.getByRole('button',{name:'Party',exact:true}).click();
  const rest=page.getByRole('button',{name:'Long Rest',exact:true}).locator('visible=true').first();await expect(rest).toBeVisible();
  let calls=0;const endpoint='**/rest/v1/rpc/complete_psionic_rest';
  if(lost)await page.route(endpoint,async route=>{calls++;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort();});
  await rest.click();
  const state=(id:string)=>JSON.parse(sql(`select json_build_object('spent',hit_dice_spent,'hp',current_hp,'exhaustion',exhaustion_level) from characters where id='${id}'`));
  await expect.poll(()=>state(charId)).toEqual({spent:0,hp:40,exhaustion:2});expect(state(fighterId)).toEqual({spent:0,hp:40,exhaustion:2});
  const status=page.getByRole('status',{name:'Party rest status'});
  await expect(status).toContainText(lost?'1 of 2 rests confirmed':'Party Long Rest confirmed');
  if(lost){
   expect(calls).toBe(2);await page.unroute(endpoint);await page.reload();
   const recovery=page.getByRole('status',{name:'Psion roll recovery'});await expect(recovery).toContainText('Party Psion: saved rest');
   await page.getByRole('button',{name:'Long Rest',exact:true}).locator('visible=true').first().click();await expect(page.getByRole('status',{name:'Party rest status'})).toContainText('Confirm the saved rests');
   expect(state(fighterId).exhaustion).toBe(2);
   sql(`update characters set class_resources=jsonb_set(class_resources,'{psionic-energy-dice}','1') where id='${charId}'`);
   await recovery.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('dm-rest-recovery.png')});
   await recovery.getByRole('button',{name:'Confirm rest'}).click();await expect(recovery).toContainText('Long Rest confirmed');
   expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
   expect(state(charId).exhaustion).toBe(2);expect(state(fighterId).exhaustion).toBe(2);
   expect(sql(`select count(*) from campaign_chat where campaign_id='${campaignId}' and message_type='long_rest_completed'`)).toBe('0');
  }else{
   expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('6');
   expect(sql(`select message from campaign_chat where campaign_id='${campaignId}' and message_type='long_rest_completed'`)).toContain('all spent Hit Point Dice');
  }
  expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Long Rest'`)).toBe('1');
  if(secondary)expect(JSON.parse(sql(`select class_resources from characters where id='${charId}'`))).toMatchObject({'second-wind':4,other:3});
 });
 test('a rejected Psion rest retries only that character after the fighter already rested',async({page})=>{
  await signInAsSeedDm(page,email);await page.goto(`/campaigns/${campaignId}`);await page.getByRole('button',{name:'Party',exact:true}).click();
  const endpoint='**/rest/v1/rpc/complete_psionic_rest';
  await page.route(endpoint,route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Simulated stale snapshot'})}));
  await page.getByRole('button',{name:'Long Rest',exact:true}).locator('visible=true').first().click();
  await expect(page.getByRole('status',{name:'Party rest status'})).toContainText('1 of 2 rests confirmed');
  expect(sql(`select exhaustion_level from characters where id='${fighterId}'`)).toBe('2');
  expect(sql(`select exhaustion_level from characters where id='${charId}'`)).toBe('3');
  await page.unroute(endpoint);await page.getByRole('button',{name:'Retry unconfirmed rests',exact:true}).click();
  await expect(page.getByRole('status',{name:'Party rest status'})).toContainText('Selected rest recovery confirmed');
  expect(sql(`select exhaustion_level from characters where id='${fighterId}'`)).toBe('2');expect(sql(`select exhaustion_level from characters where id='${charId}'`)).toBe('2');
  await expect(page.getByRole('button',{name:'Retry unconfirmed rests',exact:true})).toHaveCount(0);
 });

});
