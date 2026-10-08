import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion spell choice eligibility', () => {
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
      insert into characters (id,user_id,name,species,class_name,background,subclass,level,class_resources)
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Psi Warper',20,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });


  test('source review remains a cancelable draft when Psion slot data is missing',async({page},info)=>{
    sql(`update characters set level=1,subclass=null,known_spells=ARRAY['charm-person'],prepared_spells='{}',spell_slots='{}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await page.getByText('Review spell sources',{exact:true}).click();
    await page.getByLabel('Spell to review',{exact:true}).selectOption('charm-person');
    const review=page.getByRole('form',{name:'Spell source review'});
    await review.getByRole('checkbox',{name:'Learned through Psion',exact:true}).check();
    await review.getByRole('checkbox',{name:'Prepared through Psion',exact:true}).check();
    await review.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('spell-source-review.png')});
    expect(sql(`select (spell_sources ? 'charm-person')::text from characters where id='${charId}'`)).toBe('false');
    await review.getByRole('button',{name:'Cancel review',exact:true}).click();
    await page.getByLabel('Spell to review',{exact:true}).selectOption('charm-person');
    await expect(review.getByRole('checkbox',{name:'Learned through Psion',exact:true})).not.toBeChecked();
    expect(sql(`select spell_slots::text from characters where id='${charId}'`)).toBe('{}');
    expect(sql(`select prepared_spells::text from characters where id='${charId}'`)).toBe('{}');
  });
  test('preparation blocks imported illegal choices and keeps legal choices',async({page})=>{
    sql(`update characters set level=1,subclass=null,known_spells='{"charm-person","telekinesis","fireball"}',prepared_spells='{}',spell_slots='{"1":{"total":2,"used":0},"9":{"total":1,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const row=(name:string)=>page.locator('.srow-grid').filter({has:page.getByText(name,{exact:true})}).first();
    await row('Telekinesis').getByTitle('Not prepared through Psion — click to prepare',{exact:true}).click();
    await expect(page.getByText('Requires a higher Psion level for level 5 spells',{exact:true})).toBeVisible();
    expect(sql(`select prepared_spells::text from characters where id='${charId}'`)).toBe('{}');
    await row('Fireball').getByTitle('Not prepared through Psion — click to prepare',{exact:true}).click();
    await expect(page.getByText('Not on the Psion spell list',{exact:true})).toBeVisible();
    await page.getByText('Review spell sources',{exact:true}).click();
    await page.getByLabel('Spell to review',{exact:true}).selectOption('charm-person');
    const review=page.getByRole('form',{name:'Spell source review'});
    await review.getByRole('checkbox',{name:'Learned through Psion',exact:true}).check();
    await review.getByRole('button',{name:'Save spell sources',exact:true}).click();
    await expect.poll(()=>sql(`select (spell_sources->'charm-person')::text from characters where id='${charId}'`)).toBe('["class:Psion"]');
    await row('Charm Person').getByTitle('Not prepared through Psion — click to prepare',{exact:true}).click();
    await expect.poll(()=>sql(`select prepared_spells::text from characters where id='${charId}'`)).toBe('{charm-person}');
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(row('Charm Person').getByTitle('Prepared through Psion — click to unprepare',{exact:true})).toBeVisible();
  });
  for(const secondary of [false,true])test(`Actions keeps ${secondary?'secondary':'primary'} Psion cantrips when slots are missing`,async({page},info)=>{
    sql(`update characters set class_name='${secondary?'Fighter':'Psion'}',level=1,subclass=null,
      secondary_class=${secondary?"'Psion'":"null"},secondary_level=${secondary?1:0},secondary_subclass=null,
      known_spells=ARRAY['light','charm-person'],prepared_spells=ARRAY['charm-person'],
      spell_sources='{"light":["class:Psion"],"charm-person":["class:Psion"]}',
      spell_preparation_sources='{"charm-person":["class:Psion"]}',spell_slots='{}' where id='${charId}'`);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByRole('button',{name:'Actions',exact:true}).locator('visible=true').first().click();
    const light=page.locator('.arow-grid').filter({has:page.getByText('Light',{exact:true})}).first();
    await expect(light).toBeVisible();await expect(light.getByRole('button',{name:'Cast',exact:true})).toBeEnabled();
    const charm=page.locator('.arow-grid').filter({has:page.getByText('Charm Person',{exact:true})}).first();
    await expect(charm).toContainText('No Slots');
    await light.getByRole('button',{name:'Cast',exact:true}).click();
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Light' and action_type='spell'`)).toBe('1');
    await light.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('slotless-psion-actions.png')});
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(page.getByText('Review spell sources',{exact:true})).toBeVisible();
    expect(sql(`select spell_slots::text from characters where id='${charId}'`)).toBe('{}');
    expect(errors).toEqual([]);
  });

});
