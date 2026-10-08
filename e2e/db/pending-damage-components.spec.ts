import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.use({serviceWorkers:'block'});
test.describe('Typed pending damage records',()=>{
 gateDbSuite();
 for(const crit of [false,true])test(crit?'fixed critical maximum stays distinct from actual base and rider dice':'attacker bonus query saves both psychic base and fire rider damage',async({page})=>{
 const [user,campaign,char,cb,enc,cp,attack]=Array.from({length:7},()=>randomUUID()),email='typed-'+user+'@dndkeep.local';
 try{
  sql(`begin;
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
    values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Damage Fixture"}',now(),now(),'','','','');
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
   insert into campaigns(id,owner_id,name) values('${campaign}','${user}','Typed damage');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background) values('${char}','${user}','${campaign}','Damage actor','Human','Fighter','Soldier');
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${cb}','${campaign}','${user}','Damage actor','character','${char}',20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${cp}','${enc}','${campaign}','character','${char}','Damage actor',0,'${cb}');
   update combatants set active_buffs='[{"key":"test-fire","name":"Fire rider","source":"test","damageRider":{"dice":"1d4+1","damageType":"fire"}}]' where id='${cb}';
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id)
    values('${attack}','${campaign}','${enc}','${cp}','Damage actor','character','Target','Psychic fixture','attack_roll','melee','${crit?'crit':'hit'}','attack_rolled','1d6+2','psychic','${randomUUID()}');commit;`);
  await page.addInitScript(()=>{Math.random=()=>0.1;});await signInAsSeedDm(page,email);
  await page.evaluate(()=>localStorage.setItem('dndkeep:houseRules','{"critRule":"max_plus_roll"}'));
  const result=await page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts';const module=await import(path);return module.rollDamage(id);},attack);
  expect(result.damage_final).toBe(crit?12:5);
  const record=JSON.parse(sql(`select damage_components from pending_attacks where id='${attack}'`));
  expect(record.components.map((c:{damageType:string})=>c.damageType)).toEqual(['psychic','fire']);
  expect(record.components[0]).toMatchObject({rolls:crit?[1,6]:[1],dieKinds:crit?['rolled','maximum']:['rolled'],modifier:2,rawTotal:crit?9:3});
  expect(record.components[1]).toMatchObject({rolls:crit?[1,1]:[1],modifier:1,rawTotal:crit?3:2});
  const replay=await page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts';return (await import(path)).rollDamage(id);},attack);expect(replay.damage_components).toEqual(record);
 }finally{await page.close();sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id='${user}';`);}
 });
});
