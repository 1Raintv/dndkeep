import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.use({serviceWorkers:'block'});
test.describe('Combat dialog recovery',()=>{
 gateDbSuite();
 for(const lost of [false,true])test(lost?'lost committed damage refreshes to saved damage without rerolling':'rejected damage restores controls and shows a recoverable error',async({page},info)=>{
 const crit=false;
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
   update combatants set active_buffs='[{"key":"test-fire","name":"Fire rider","source":"test","singleUse":true,"damageRider":{"dice":"1d4+1","damageType":"fire"}}]' where id='${cb}';
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id)
    values('${attack}','${campaign}','${enc}','${cp}','Damage actor','character','Target','Psychic fixture','attack_roll','melee','${crit?'crit':'hit'}','attack_rolled','1d6+2','psychic','${randomUUID()}');commit;`);
  await signInAsSeedDm(page,email);await page.goto('/campaigns/'+campaign);
  const panel=page.getByRole('region',{name:'Resolve attack'});
  await expect(panel.getByRole('button',{name:/Roll Damage/})).toBeVisible();
  expect(sql(`select count(*) from dndkeep_private.attack_reaction_offer_batches where attack_id='${attack}' and trigger_point='post_attack_roll'`)).toBe('1');
  let requests=0;
  await page.route('**/rest/v1/rpc/record_pending_damage',async route=>{
   requests++;
   if(lost){const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');}
   else await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message:'Attacker bonuses changed before damage was recorded'})});
  });
  await panel.getByRole('button',{name:/Roll Damage/}).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  const next=panel.getByRole('button',{name:lost?/Apply Damage/:/Roll Damage/});
  await expect(next).toBeEnabled();await next.click({trial:true});
  expect(requests).toBe(lost?2:1);
  expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe(lost?'damage_rolled':'attack_rolled');
  if(lost)expect(sql(`select count(*) from dndkeep_private.attack_reaction_offer_batches where attack_id='${attack}' and trigger_point='post_damage_roll'`)).toBe('1');
  expect(JSON.parse(sql(`select active_buffs from combatants where id='${cb}'`))).toHaveLength(lost?0:1);
  await panel.screenshot({path:info.outputPath('combat-recovery.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Resolve attack\"], [aria-label=\"Resolve attack\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  if(lost){
   sql(`insert into pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,offered_at,expires_at,state) values('${campaign}','${attack}','${cp}','Damage actor','character','uncanny_dodge','Uncanny Dodge','post_damage_roll',now(),now()+interval '1 minute','offered')`);
   await panel.getByRole('button',{name:'Refresh combat'}).click();
   await expect(panel.getByRole('status')).toContainText('Uncanny Dodge');
   await expect(panel.getByRole('button',{name:/Apply Damage/})).toBeDisabled();
   await panel.screenshot({path:info.outputPath('waiting-reaction.png')});
  }
  await page.unroute('**/rest/v1/rpc/record_pending_damage');
  if(!lost){await next.click();await expect(panel.getByRole('button',{name:/Apply Damage/})).toBeEnabled();expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('damage_rolled');}
 }finally{await page.close();sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id='${user}';`);}
 });
});
