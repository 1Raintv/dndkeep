import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Psykinetic Mage Hand on the live sheet',()=>{
 gateDbSuite();let owner:string,character:string,email:string;
 test.beforeEach(()=>{
  owner=randomUUID();character=randomUUID();email=owner+'@mage-hand.local';
  sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${owner}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${email}'),'email',now(),now(),now());
   update profiles set show_ua_content=true where id='${owner}';
   insert into characters(id,user_id,name,species,class_name,subclass,level,background,known_spells,spell_sources)
   values('${character}','${owner}','Mage Hand Fixture','Human','Psion','Psykinetic',3,'Sage',array['mage-hand'],'{"mage-hand":["grant:class:Psion"]}');`);
 });
 test.afterEach(()=>sql(`delete from characters where id='${character}';delete from auth.users where id='${owner}'`));
 for(const secondary of [false,true])test(`range and carrying modifier appear on both spell surfaces (secondary=${secondary})`,async({page},info)=>{
  if(secondary)sql(`update characters set class_name='Wizard',subclass=null,level=1,secondary_class='Psion',secondary_subclass='Psykinetic',secondary_level=3 where id='${character}'`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${character}`);
  const action=page.locator('.arow-grid').filter({has:page.getByText('Mage Hand',{exact:true})});
  await expect(action.locator('.arow-range')).toContainText(/60\s*(ft|feet)/);
  await action.click();const note=page.getByRole('complementary',{name:'Psion casting rules'});
  await expect(note).toContainText('The hand can carry up to 20 pounds.');await note.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('mage-hand-actions.png')});
  await page.locator('.tabs').getByRole('button',{name:/^Spells/}).click();
  const row=page.locator('.srow-grid').filter({has:page.getByText('Mage Hand',{exact:true})});
  await expect(row.locator('.srow-range')).toHaveText(/60\s*(ft|feet)/);await row.click();
  await expect(note).toContainText('Its movement per Magic action is unchanged.');await note.scrollIntoViewIfNeeded();
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Psion casting rules\"], [aria-label=\"Psion casting rules\"] *, .srow-range')");
   const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
  }
  await page.screenshot({path:info.outputPath('mage-hand-spells.png')});
  sql(`update characters set ${secondary?'secondary_subclass':'subclass'}='Telepath' where id='${character}'`);
  await page.reload();await page.locator('.tabs').getByRole('button',{name:'Actions',exact:true}).click();
  await expect(action.locator('.arow-range')).toContainText(/30\s*(ft|feet)/);await action.click();
  await expect(note).not.toContainText('Stronger Telekinesis.');expect(errors).toEqual([]);
 });
});
