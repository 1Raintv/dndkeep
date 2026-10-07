import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion spell stat display', () => {
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

  test('spell attack and DC follow Psion level and Intelligence',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const failed:string[]=[];page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    sql(`update characters set level=5,intelligence=18,spell_slots='{"1":{"total":4,"used":0},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const attack=page.getByText('Spell Attack',{exact:true}).locator('visible=true').first().locator('..');
    const dc=page.getByText('Spell DC',{exact:true}).locator('visible=true').first().locator('..');
    await expect(attack).toHaveText('+7Spell Attack');await expect(dc).toHaveText('15Spell DC');
    await attack.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('psion-stats.png')});
    sql(`update characters set level=17,intelligence=20 where id='${charId}'`);
    await page.reload();await expect(attack).toHaveText('+11Spell Attack');await expect(dc).toHaveText('19Spell DC');
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const stats=page.getByRole('region',{name:'Spellcasting statistics'});
    await expect(stats).toContainText('+5MODIFIER');await expect(stats).toContainText('+11SPELL ATTACK');await expect(stats).toContainText('19SAVE DC');
    // The header must use effective Intelligence, including an attuned item.
    sql(`update characters set level=5,intelligence=10,inventory='[{"id":"header-headband","magic_item_id":"headband-of-intellect","name":"Headband of Intellect","quantity":1,"equipped":true,"attuned":true}]' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(stats).toContainText('+4MODIFIER');await expect(stats).toContainText('+7SPELL ATTACK');await expect(stats).toContainText('15SAVE DC');
    await stats.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await page.screenshot({path:info.outputPath('psion-spell-header.png')});
    sql(`update characters set inventory='[]' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(stats).toContainText('+0MODIFIER');await expect(stats).toContainText('+3SPELL ATTACK');await expect(stats).toContainText('11SAVE DC');
    expect(errors).toEqual([]);expect(failed).toEqual([]);
  });
  test('multiclass Psion casting uses total proficiency and effective Intelligence',async({page})=>{
    sql(`update characters set level=3,secondary_class='Fighter',secondary_level=2,intelligence=10,known_spells='{"charm-person"}',prepared_spells='{"charm-person"}',spell_slots='{"1":{"total":4,"used":0},"2":{"total":2,"used":0}}',inventory='[{"id":"casting-headband","magic_item_id":"headband-of-intellect","name":"Headband of Intellect","quantity":1,"equipped":true,"attuned":true}]' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const stats=page.getByRole('region',{name:'Spellcasting statistics'});
    await expect(stats).toContainText('+7SPELL ATTACK');await expect(stats).toContainText('15SAVE DC');
    const row=page.locator('.srow-grid').filter({has:page.getByText('Charm Person',{exact:true})}).first();
    await row.getByRole('button',{name:'Cast',exact:true}).click();
    await expect(page.getByText('WIS Save — DC 15',{exact:true})).toBeVisible();
    sql(`update characters set inventory='[]' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(stats).toContainText('+3SPELL ATTACK');await expect(stats).toContainText('11SAVE DC');
    await row.getByRole('button',{name:'Cast',exact:true}).click();
    await expect(page.getByText('WIS Save — DC 11',{exact:true})).toBeVisible();
  });

});
