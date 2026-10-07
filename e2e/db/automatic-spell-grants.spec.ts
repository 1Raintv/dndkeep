import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Automatic spell source grants', () => {
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


  test('species grant expiry preserves the independent Psion copy and secondary-class grants',async({page})=>{
    sql(`update characters set level=3,subclass=null,secondary_class='Paladin',secondary_level=2,species='Tiefling',species_choices='{"tieflingLegacy":"infernal"}',known_spells=ARRAY['darkness'],prepared_spells='{}',spell_sources='{"darkness":["class:Psion"]}',spell_preparation_sources='{"darkness":[]}',spell_slots='{"1":{"total":4,"used":0},"2":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await expect.poll(()=>sql(`select (spell_sources->'darkness')::text from characters where id='${charId}'`)).toBe('["class:Psion", "grant:species"]');
    expect(JSON.parse(sql(`select spell_sources from characters where id='${charId}'`))).toMatchObject({'mage-hand':['grant:class:Psion'],'divine-smite':['grant:class:Paladin'],'hellish-rebuke':['grant:species']});
    expect(JSON.parse(sql(`select spell_preparation_sources->'darkness' from characters where id='${charId}'`))).toEqual(['grant:species']);
    sql(`update characters set species='Human',species_choices='{}' where id='${charId}'`);
    await page.reload();
    await expect.poll(()=>sql(`select (spell_sources->'darkness')::text from characters where id='${charId}'`)).toBe('["class:Psion"]');
    expect(sql(`select ('darkness'=any(known_spells))::text from characters where id='${charId}'`)).toBe('true');
    expect(sql(`select ('darkness'=any(prepared_spells))::text from characters where id='${charId}'`)).toBe('false');
    expect(sql(`select ('hellish-rebuke'=any(known_spells))::text from characters where id='${charId}'`)).toBe('false');
    expect(sql(`select ('divine-smite'=any(prepared_spells))::text from characters where id='${charId}'`)).toBe('true');
    await page.reload();expect(JSON.parse(sql(`select spell_preparation_sources->'darkness' from characters where id='${charId}'`))).toEqual([]);
  });
});
