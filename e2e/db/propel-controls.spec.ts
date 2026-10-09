import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Saved Propel controls',()=>{
 gateDbSuite();let charId:string,userId:string,email:string;
 test.beforeEach(()=>{
  charId=randomUUID();userId=randomUUID();email='propel-'+userId+'@dndkeep.local';
  sql(`begin;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Propel Fixture"}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
   update profiles set show_ua_content=true where id='${userId}';
   insert into characters(id,user_id,name,species,class_name,background,subclass,level,class_resources)
   values('${charId}','${userId}','Propel Fixture','Human','Psion','Sage','Psi Warper',5,'{"psionic-energy-dice":2}');commit;`);
 });
 test.afterEach(()=>{if(userId)sql(`delete from action_logs where character_id='${charId}';delete from characters where user_id='${userId}';delete from auth.users where id='${userId}'`);});
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
  await page.screenshot({path:info.outputPath('propel-finished.png')});expect(errors).toEqual([]);
 });
});
