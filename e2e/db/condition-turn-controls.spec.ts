import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
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
  await page.getByRole('button',{name:'Review Poisoned save'}).click();
  const recovered=page.getByRole('dialog',{name:'Review condition save'});
  await expect(recovered.getByText(/Save failed/)).toBeVisible();
  await expect(recovered.getByRole('button',{name:'Confirm saved roll'})).toHaveCount(0);
  await recovered.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select round_number from combat_encounters where id='${encounter}'`)).toBe('2');
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type='condition_resave'`)).toBe('1');
  expect(JSON.parse(sql(`select result from dndkeep_private.condition_turn_saves where participant_id='${part}'`))).toEqual(result);expect(calls).toBe(2);
 });
 test('changed equipment can be reviewed without rerolling the saved condition dice',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${id}`);
  await page.route('**/rest/v1/rpc/settle_condition_turn_save',async route=>{
   await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Changed save settings'})});
  });
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  const review=page.getByRole('button',{name:'Review Poisoned save'});await expect(review).toBeVisible();
  const before=await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.startsWith('dndkeep:condition-save:'))![1]));
  sql(`update characters set intelligence=20 where id='${id}'`);
  await page.unroute('**/rest/v1/rpc/settle_condition_turn_save');await page.reload();await review.click();
  const dialog=page.getByRole('dialog',{name:'Review condition save'});await expect(dialog.getByText(/Saved dice:/)).toBeVisible();
  await dialog.getByLabel('Base saving throw bonus').fill('6');
  await expect(dialog.getByRole('button',{name:'Confirm saved roll'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Refresh settings, keep dice'}).click();
  await expect(dialog.getByRole('button',{name:'Confirm saved roll'})).toBeEnabled();
  const after=await page.evaluate(()=>JSON.parse(Object.entries(localStorage).find(([k])=>k.startsWith('dndkeep:condition-save:'))![1]));
  expect(after.dice).toEqual(before.dice);expect(after.buffPool).toEqual(before.buffPool);expect(after.penaltyPool).toBe(before.penaltyPool);expect(after.requestId).toBe(before.requestId);expect(after.baseBonus).toBe(6);
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Review condition save\"], [aria-label=\"Review condition save\"] *')").replace(/const skip = \(el, cs\) =>[\s\S]*?;\n\n {4}const clipped/,"const skip = (_el, cs) => cs.filter !== 'none';\n\n    const clipped");
   const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
  }
  await dialog.getByRole('button',{name:'Close — keep saved roll'}).focus();await page.keyboard.press('Tab');await expect(dialog.getByLabel('Base saving throw bonus')).toBeFocused();
  await page.screenshot({path:info.outputPath('condition-save-review.png')});
  await dialog.getByRole('button',{name:'Confirm saved roll'}).click();await expect(dialog.getByText('Save failed.',{exact:false})).toBeVisible();
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select round_number from combat_encounters where id='${encounter}'`)).toBe('2');
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type='condition_resave'`)).toBe('1');expect(errors).toEqual([]);
 });

});
