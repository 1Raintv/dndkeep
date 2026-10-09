import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Saved Propel controls',()=>{
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
 test('declares once, survives reload and spends a die only on failure',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telekinetic Propel',{exact:true})});
  await ability.getByRole('button',{name:'Use / resume'}).click();
  const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
  await dialog.getByLabel('Target',{exact:true}).fill('Tabletop goblin');
  await dialog.getByRole('checkbox').check();await dialog.getByLabel('Movement',{exact:true}).selectOption('powered');
  await page.screenshot({path:info.outputPath('propel-target.png')});
  await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();await expect(dialog).toContainText('Saved dice total:');
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
  const declaration=sql(`select request_id from dndkeep_private.propel_declarations where character_id='${charId}'`);
  const roll=sql(`select base_roll from dndkeep_private.propel_declarations where request_id='${declaration}'`);
  await page.screenshot({path:info.outputPath('propel-save.png')});
  await page.reload();await ability.getByRole('button',{name:'Use / resume'}).click();
  await dialog.getByRole('button',{name:/Resume Telekinetic Propel/}).click();await expect(dialog).toContainText(`Saved dice total: ${roll}.`);
  await dialog.getByRole('button',{name:'Save failed',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('Saved: failed. 1 Energy Dice spent.');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${charId}'`)).toBe('1');
  await page.screenshot({path:info.outputPath('propel-finished.png')});
  await dialog.getByRole('button',{name:'Close for later'}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled();
  await page.getByRole('group',{name:'Turn economy',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('propel-budget-spent.png')});
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  await expect(page.getByRole('button',{name:'Bonus Action Available',exact:true})).toBeEnabled({timeout:10000});
  expect(errors).toEqual([]);
 });
 test('free Misty Step records the Bonus Action and retains it after reload',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Free Misty Step (Teleportation)',{exact:true})});
  await ability.getByRole('button',{name:'Cast',exact:true}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(sql(`select feature_uses->>'Free Misty Step (Teleportation)' from characters where id='${charId}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
  await page.reload();await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(errors).toEqual([]);
 });
 test('Psi Warper details retain target limits without invented automatic hits',async({page},info)=>{
  sql(`update characters set level=14 where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  for(const [name,detail] of [['Duplicitous Target','not Incapacitated'],['Warp Space','as close to the center as possible'],['Mass Teleportation','Huge or smaller'],['Teleporter Combat','does not spend your Action']]){
   const row=page.locator('.arow-grid').filter({has:page.getByText(name,{exact:true})});await row.click();
   await expect(page.getByText(detail,{exact:false})).toBeVisible();
   await page.getByText(detail,{exact:false}).scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath(name.toLowerCase().replaceAll(' ','-')+'.png')});
  }
 });
 test('combat resolution stays on the declared target and settles its rolled save',async({page},info)=>{
  const encounter=randomUUID(),self=randomUUID(),enemy=randomUUID(),targetCharacter=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Propel Combat');
   update characters set campaign_id='${campaignId}' where id='${charId}';
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level) values('${targetCharacter}','${userId}','${campaignId}','Target Fighter','Human','Fighter','Sage',1);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaignId}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${self}','${encounter}','${campaignId}','character','${charId}','Psion',0),('${enemy}','${encounter}','${campaignId}','character','${targetCharacter}','Target Fighter',1);`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telekinetic Propel',{exact:true})});await ability.getByRole('button',{name:'Use / resume'}).click();
  const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
  await expect(dialog.getByRole('combobox',{name:'Target',exact:true})).toBeEnabled();
  await dialog.getByRole('combobox',{name:'Target',exact:true}).selectOption({value:enemy});await expect(dialog.getByRole('combobox',{name:'Target',exact:true})).toHaveValue(enemy);await dialog.getByRole('checkbox').check();
  await dialog.getByLabel('Movement',{exact:true}).selectOption('powered');await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(sql(`select bonus_used from combat_participants where id='${self}'`)).toBe('t');
  await dialog.getByRole('button',{name:'Resolve combat save'}).click();
  const saves=page.getByRole('dialog',{name:'Telekinetic Propel saving throws'});
  await expect(saves.getByRole('combobox',{name:'Propel target'})).toHaveValue(enemy);await expect(saves.getByRole('combobox',{name:'Propel target'})).toBeDisabled();
  await expect(saves.getByRole('button',{name:'Roll Save'})).toBeEnabled();await page.evaluate(()=>{Math.random=()=>0.01;});
  await saves.getByRole('button',{name:'Roll Save'}).click();await page.screenshot({path:info.outputPath('propel-combat-save.png')});
  await saves.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Saved: failed.');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  expect(sql(`select target->>'participantId' from dndkeep_private.propel_declarations where character_id='${charId}'`)).toBe(enemy);
  expect(JSON.parse(sql(`select save_details from dndkeep_private.propel_declarations where character_id='${charId}'`))).toMatchObject({participantId:enemy,d20:1,rolls:[1],outcome:'failed'});
  expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Telekinetic Propel'`)).toBe('1');
  expect(errors).toEqual([]);
 });

 for(const spellId of ['mage-hand','mind-sliver'])test(`Teleporter picker resumes ${spellId} without spending an Action`,async({page},info)=>{
  const encounter=randomUUID(),self=randomUUID(),enemy=randomUUID(),targetCharacter=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Teleporter Combat');
   update characters set campaign_id='${campaignId}',level=6,current_hp=40,max_hp=40,known_spells=array['mage-hand','mind-sliver','mending','true-strike'],spell_sources='{"mage-hand":["class:Psion"],"mind-sliver":["class:Psion"],"mending":["class:Psion"],"true-strike":["class:Psion"]}' where id='${charId}';
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${targetCharacter}','${userId}','${campaignId}','Target Fighter','Human','Fighter','Sage',1,40,40);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaignId}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${self}','${encounter}','${campaignId}','character','${charId}','Psion',0),('${enemy}','${encounter}','${campaignId}','character','${targetCharacter}','Target Fighter',1);`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  await page.locator('.arow-grid').filter({has:page.getByText('Free Misty Step (Teleportation)',{exact:true})}).getByRole('button',{name:'Cast',exact:true}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled();await page.reload();
  await page.getByRole('button',{name:'Choose cantrip',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Teleporter Combat',exact:true});
  await expect(picker.getByText('Misty Step confirmed',{exact:false})).toBeVisible();
  const select=picker.getByRole('combobox',{name:'Psion cantrip',exact:true});
  await select.selectOption('true-strike');await expect(picker.getByText(/No casting has been spent/)).toBeVisible();
  expect(sql(`select count(*) from dndkeep_private.teleporter_combat_children where character_id='${charId}'`)).toBe('0');
  await select.selectOption(spellId);
  expect(await select.locator('option').allTextContents()).not.toContain('Mending');
  await page.screenshot({path:info.outputPath('teleporter-picker.png')});
  if(spellId==='mage-hand')await picker.getByRole('button',{name:'Cast follow-up',exact:true}).click();
  else {await picker.getByRole('button',{name:'Choose follow-up target',exact:true}).click();await page.getByRole('button').filter({hasText:'Target Fighter'}).last().click();}
  const name=spellId==='mage-hand'?'Mage Hand':'Mind Sliver';
  const castDialog=page.getByRole('dialog',{name:`Casting ${name}`,exact:true});await expect(castDialog).toBeVisible();
  await expect.poll(()=>sql(`select count(*) from dndkeep_private.teleporter_combat_children where character_id='${charId}'`)).toBe('1');
  expect(sql(`select action_used from combat_participants where id='${self}'`)).toBe('f');
  if(spellId==='mind-sliver')expect(sql(`select request->'context'->'combat'->'target'->>'participantId' from dndkeep_private.declared_spell_payments where character_id='${charId}'`)).toBe(enemy);
  await page.reload();await expect(castDialog).toBeVisible();
  expect(sql(`select count(*) from dndkeep_private.teleporter_combat_children where character_id='${charId}'`)).toBe('1');
  await page.screenshot({path:info.outputPath('teleporter-cast-recovered.png')});
  expect(errors).toEqual([]);
 });

});
