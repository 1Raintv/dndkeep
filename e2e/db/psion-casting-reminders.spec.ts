import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion casting reminders', () => {
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

  test('Mage Hand choice and costly material exception stay visible only for Psion casting',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    sql(`update characters set level=3,known_spells='{"mage-hand","identify"}',prepared_spells='{"identify"}',spell_slots='{"1":{"total":4,"used":0},"2":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    // The quick Actions view and the full spellbook share the same reminder.
    await page.getByText('Mage Hand',{exact:true}).locator('visible=true').first().click();
    const note=page.getByRole('complementary',{name:'Psion casting rules'});
    await expect(note).toContainText('choose to make the spectral hand Invisible when you cast it');
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await page.getByText('Mage Hand',{exact:true}).locator('visible=true').first().click();
    await expect(note).toContainText('without Somatic components');
    await expect(page.getByText('Subtle',{exact:true})).toBeVisible();
    await note.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('subtle-hand.png')});
    await page.getByText('Identify',{exact:true}).locator('visible=true').first().click();
    await expect(note).toContainText('Materials that the spell consumes or that have a specified cost are still required');
    await expect(page.getByText(/pearl worth at least 100/).locator('visible=true').first()).toBeVisible();
    await note.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('psion-materials.png')});
    sql(`update characters set class_name='Wizard',subclass=null where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await page.getByText('Mage Hand',{exact:true}).locator('visible=true').first().click();
    await expect(note).toHaveCount(0);await expect(page.getByText('Subtle',{exact:true})).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
