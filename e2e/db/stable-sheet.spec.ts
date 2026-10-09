import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Stable character sheet',()=>{
 gateDbSuite();let id:string,user:string,email:string;
 test.beforeEach(()=>{
  id=randomUUID();user=randomUUID();email=`stable-${user}@dndkeep.local`;
  sql(`begin;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${user}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),'${user}','${user}','{"sub":"${user}","email":"${email}"}','email',now(),now(),now());
   insert into characters(id,user_id,name,species,class_name,background,level,current_hp,max_hp,death_saves_successes)
   values('${id}','${user}','Stable Fixture','Human','Fighter','Sage',1,0,10,3);commit;`);
 });
 test.afterEach(()=>sql(`delete from characters where id='${id}';delete from auth.users where id='${user}';`));
 test('stable survives reload and healing removes the panel',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${id}`);
  const recover=page.getByRole('button',{name:'Regain 1 HP',exact:true});
  await expect(recover).toBeVisible();await recover.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('stable-sheet.png')});
  await page.reload();await expect(recover).toBeVisible();await recover.click();
  await expect(recover).toHaveCount(0);
  await expect.poll(()=>sql(`select current_hp::text||':'||is_stable::text||':'||death_saves_successes||':'||death_saves_failures from characters where id='${id}'`)).toBe('1:false:0:0');
  expect(errors).toEqual([]);
 });
});
