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

});
