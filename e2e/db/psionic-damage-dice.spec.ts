import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.use({serviceWorkers:'block'});
test.describe('Preserved Destructive Thoughts dice',()=>{
 gateDbSuite();
 for(const surge of [false,true])test(surge?'Surge-adjusted Psion dice survive the combat queue':'natural Psion dice survive the combat queue',async({page},info)=>{
 const [user,campaign,char,cb,enc,cp,attack]=Array.from({length:7},()=>randomUUID()),email='typed-'+user+'@dndkeep.local';
 try{
  sql(`begin;
    insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
    values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Damage Fixture"}',now(),now(),'','','','');
    insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
   insert into campaigns(id,owner_id,name) values('${campaign}','${user}','Typed damage');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,current_hp,max_hp) values('${char}','${user}','${campaign}','Damage actor','Human','Fighter','Soldier',20,20);
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${cb}','${campaign}','${user}','Damage actor','character','${char}',20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${cp}','${enc}','${campaign}','character','${char}','Damage actor',0,'${cb}');
   update combatants set active_buffs='[{"key":"test-fire","name":"Fire rider","source":"test","singleUse":true,"damageRider":{"dice":"1d4+1","damageType":"fire"}}]' where id='${cb}';
   commit;`);
  await signInAsSeedDm(page,email);
  const dice={version:1,sides:8,originalRolls:[1,5,3],rolls:surge?[4,5,4]:[1,5,3],modifier:4},total=surge?17:13;
  await page.evaluate(async input=>{
   const path='/src/lib/api/psionicDamage.ts';const api=await import(path);
   const context=await api.loadPsionicDamageContext(input.campaign,input.char);
   await api.queuePsionicDamage({requestId:input.attack,context,target:context.self,characterId:input.char,characterName:'Damage actor',amount:input.total,psionicDamageDice:input.dice});
  },{campaign,char,attack,total,dice});
  const result=await page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts';return (await import(path)).rollDamage(id);},attack);
  expect(result.damage_final).toBe(total);expect(result.damage_rolls).toEqual(dice.rolls);
  expect(result.damage_components.components).toEqual([{key:'base',source:'base',label:'Destructive Thoughts',expression:'3d8+4',damageType:'psychic',rolls:dice.rolls,dieKinds:surge?['adjusted','rolled','adjusted']:['rolled','rolled','rolled'],modifier:4,rawTotal:total}]);
  const replay=await page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts';return (await import(path)).rollDamage(id);},attack);expect(replay.damage_components).toEqual(result.damage_components);
  expect(JSON.parse(sql(`select psionic_damage_dice from pending_attacks where id='${attack}'`))).toEqual(dice);
  // Auto-hit discipline damage neither consumes nor adds unrelated attack riders.
  expect(JSON.parse(sql(`select active_buffs from combatants where id='${cb}'`))).toHaveLength(1);
  await page.goto('/campaigns/'+campaign);const panel=page.getByRole('region',{name:'Resolve attack'});
  await expect(panel).toContainText('3d8+4');await expect(panel.getByRole('spinbutton')).toHaveValue(String(total));
  await panel.getByRole('button',{name:/Apply Damage/}).click({trial:true});await panel.screenshot({path:info.outputPath('psionic-damage-dice.png')});
  if(surge)await expect(panel).toContainText('Surge adjusted low dice to 4.');
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Resolve attack\"], [aria-label=\"Resolve attack\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);}
  // Lose the first committed write response: recovery must retain attack identity.
  let writes=0;
  if(surge)await page.route('**/rest/v1/rpc/apply_psionic_pending_damage',async route=>{
   if(!route.request().postDataJSON()?.p_expected){await route.continue();return;}
   writes++;
   if(writes===1){const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');}
   else await route.continue();
  });
  // Apply through the real API, then request the committed result again.
  await panel.getByRole('button',{name:/Apply Damage/}).click();
  await expect.poll(()=>sql(`select state from pending_attacks where id='${attack}'`)).toBe('applied');
  if(surge)await expect.poll(()=>writes).toBe(2);
  const applied=await page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts';return (await import(path)).applyDamage(id);},attack);
  expect(applied.state).toBe('applied');expect(applied.damage_final).toBe(total);
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe(String(20-total));
  expect(sql(`select current_hp from characters where id='${char}'`)).toBe(String(20-total));
  expect(sql(`select count(*) from combat_events where campaign_id='${campaign}' and event_type='damage_applied'`)).toBe('1');
  expect(JSON.parse(sql(`select active_buffs from combatants where id='${cb}'`))).toHaveLength(1);

 }finally{await page.close();sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id='${user}';`);}
 });
});
