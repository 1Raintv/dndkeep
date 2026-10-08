import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

for(const secondary of [false,true])test.describe(`Casting sources (${secondary?'secondary':'primary'} Psion)`, () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID();
    email = 'psion-' + userId + '@dndkeep.local';
    // v2.747: own disposable account, so shared seed users' slot limits and
    // parallel suites cannot affect this fixture. Never alter their characters.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Psion Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
      update profiles set show_ua_content=true where id='${userId}';
      insert into characters (id,user_id,name,species,class_name,background,subclass,level,secondary_class,secondary_level,secondary_subclass,intelligence,wisdom,known_spells,prepared_spells,spell_sources,spell_preparation_sources,spell_slots)
      values ('${charId}','${userId}','Casting Source Fixture','Human','${secondary?'Cleric':'Psion'}','Sage','${secondary?'Life Domain':'Telepath'}',${secondary?10:6},'${secondary?'Psion':'Cleric'}',${secondary?6:10},'${secondary?'Telepath':'Life Domain'}',18,12,ARRAY['hold-person'],ARRAY['hold-person'],'{"hold-person":["class:Psion","class:Cleric"]}','{"hold-person":["class:Psion","class:Cleric"]}','{"2":{"total":3,"used":0}}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });



 for(const lostResponse of [false,true])test(`source choice survives tab changes; concentration survives reload${lostResponse?' and lost responses':''}`,async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  let calls=0;
  if(lostResponse)await page.route('**/rest/v1/rpc/record_concentration_cast',async route=>{
   if(calls++<2){await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  await page.locator('button.tab').filter({hasText:/^Spells/}).click();
  const selection=page.getByRole('combobox',{name:'Cast Hold Person through'}).first();
  await selection.selectOption('Psion');
  const spellRow=page.locator('.srow-grid').filter({has:page.getByText('Hold Person',{exact:true})}).first();
  await expect(spellRow).toContainText('WIS 17');
  await page.locator('button.tab').filter({hasText:/^\s*Actions/}).click();
  const actionRow=page.locator('.arow-grid').filter({has:page.getByText('Hold Person',{exact:true})}).first();
  await expect(actionRow).toContainText('WIS 17');
  await actionRow.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('psion-casting-source.png')});
  await actionRow.getByRole('button',{name:'Cast',exact:true}).click();
  const saved=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${charId}'`));
  await expect.poll(()=>saved().concentration_casting_context?.ability).toBe('intelligence');
  expect(saved().concentration_revision).toBe(1);expect(saved().spell_slots['2'].used).toBe(1);
  if(lostResponse){
   await expect(page.getByRole('button',{name:'Retry concentration recording'})).toBeVisible();
   sql(`update characters set concentration_rounds_remaining=9 where id='${charId}'`);
   await page.reload();
   await page.getByRole('button',{name:'Retry concentration recording'}).click();
   await expect(page.getByRole('status',{name:'Concentration recording'})).toBeHidden();
   expect(saved().concentration_rounds_remaining).toBe(9);
  }
  await expect(page.getByLabel('Concentration casting ability')).toHaveText('INT · DC 17');
  await page.getByRole('combobox',{name:'Cast Hold Person through'}).first().selectOption('Cleric');
  await expect(actionRow).toContainText('WIS 14');
  await expect(page.getByLabel('Concentration casting ability')).toHaveText('INT · DC 17');
  await page.reload();await expect(page.getByLabel('Concentration casting ability')).toHaveText('INT · DC 17');
  expect(saved().concentration_revision).toBe(1);expect(saved().spell_slots['2'].used).toBe(1);
  await page.getByLabel('Concentration casting ability').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('recorded-concentration-source.png')});
  expect(errors).toEqual([]);
 });
});
