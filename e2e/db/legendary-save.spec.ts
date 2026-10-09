import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Creature Legendary Resistance',()=>{
 gateDbSuite();let charId:string,userId:string,email:string,campaignId:string;
 test.beforeEach(()=>{
  campaignId=randomUUID();charId=randomUUID();userId=randomUUID();email='propel-'+userId+'@dndkeep.local';
  sql(`begin;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Propel Fixture"}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
   update profiles set show_ua_content=true where id='${userId}';
   insert into characters(id,user_id,name,species,class_name,background,subclass,level,class_resources)
   values('${charId}','${userId}','Propel Fixture','Human','Psion','Sage','Psi Warper',5,'{"psionic-energy-dice":2}');commit;`);
 });
 test.afterEach(()=>{if(userId)sql(`delete from campaigns where id='${campaignId}';delete from action_logs where character_id='${charId}';delete from characters where user_id='${userId}';delete from auth.users where id='${userId}'`);});

 test('a current creature receives the DM resistance choice before damage',async({page},info)=>{
  const enc=randomUUID(),self=randomUUID(),creature=randomUUID(),attack=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Legendary Save Fixture');
   update characters set campaign_id='${campaignId}' where id='${charId}';
   insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${campaignId}','active',0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,legendary_resistance,legendary_resistance_used) values
    ('${self}','${enc}','${campaignId}','character','${charId}','Psion',0,0,0),
    ('${creature}','${enc}','${campaignId}','creature','${randomUUID()}','Legendary Target',1,3,0);
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,save_dc,save_ability,save_success_effect,damage_dice,damage_type,state,chain_id)
   values('${attack}','${campaignId}','${enc}','${self}','Psion','character','${creature}','Legendary Target','creature','spell','Mind Sliver','save',20,'INT','none','2d6','Psychic','declared','${randomUUID()}');`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/campaigns/${campaignId}`);
  await expect(page.getByText('Legendary Save Fixture',{exact:true}).locator('visible=true').first()).toBeVisible();
  const rolled=await page.evaluate(async id=>{
   Math.random=()=>0.01;
   const module=await import('/src/lib/pendingAttack.ts');
   const result=await module.rollSave(id,0);await module.rollDamage(id);return result;
  },attack);
  expect(rolled).toMatchObject({save_result:'failed',pending_lr_decision:true});
  expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('declared');
  await expect(page.getByRole('button',{name:'Use Legendary Resistance',exact:true})).toBeEnabled();
  await page.screenshot({path:info.outputPath('legendary-resistance.png')});
  let failOnce=true;
  await page.route('**/rest/v1/rpc/decide_legendary_resistance',async route=>{
   if(failOnce){failOnce=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Decision not confirmed. Retry the same choice.'})});}
   else await route.continue();
  });
  await page.getByRole('button',{name:'Use Legendary Resistance',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Retry the same choice');
  await expect(page.getByRole('button',{name:'Use Legendary Resistance',exact:true})).toBeEnabled();
  await page.screenshot({path:info.outputPath('legendary-resistance-retry.png')});
  await page.getByRole('button',{name:'Use Legendary Resistance',exact:true}).click();
  await expect.poll(()=>sql(`select save_result||':'||pending_lr_decision::text from pending_attacks where id='${attack}'`)).toBe('passed:false');
  expect(sql(`select legendary_resistance_used from combat_participants where id='${creature}'`)).toBe('1');
  expect(errors).toEqual([]);
 });
});

