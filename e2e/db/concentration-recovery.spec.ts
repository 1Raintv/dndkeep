import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Campaign concentration recovery (local stack)', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  let campaign:string,encounter:string,participant:string,pending:string,chain:string;
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
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Telepath',5,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from campaigns where id='${campaign}';delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  test.beforeEach(()=>{
    [campaign,encounter,participant,pending,chain]=Array.from({length:5},()=>randomUUID());
    sql(`begin;insert into campaigns(id,owner_id,name) values('${campaign}','${userId}','Save recovery');
      update characters set campaign_id='${campaign}',concentration_spell='detect-magic',concentration_rounds_remaining=100,constitution=10,saving_throw_proficiencies='{}',nat_1_20_saves=false where id='${charId}';
      insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
      insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${charId}','Save fixture',0);
      insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision)
       select '${pending}','${campaign}','${encounter}','${chain}','${participant}',id,concentration_spell,5,10,0,false,now()+interval '2 minutes',concentration_revision from characters where id='${charId}';commit;`);
  });
  const spell=()=>sql(`select concentration_spell from characters where id='${charId}'`);
  test('prompt settles the save and displays its recorded result',async({page},info)=>{
    await page.addInitScript(()=>{Math.random=()=>0.001;});await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const dialog=page.getByRole('dialog',{name:'Concentration save',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toContainText('Hold focus on Detect Magic?');
    await page.screenshot({path:info.outputPath('concentration-prompt.png')});await dialog.getByRole('button',{name:'Roll Save'}).click();
    await expect(page.getByRole('status',{name:'Concentration recovery'})).toContainText('Concentration broken: saved roll 1, total 1');
    await expect.poll(spell).toBe('');expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
  });
  test('lost response survives reload and confirmation preserves a later casting',async({page},info)=>{
    await page.addInitScript(()=>{Math.random=()=>0.001;});let calls=0;
    const endpoint='**/rest/v1/rpc/settle_pending_concentration_save';await page.route(endpoint,async route=>{calls++;const result=await route.fetch();expect(result.ok()).toBe(true);await route.abort();});
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await page.getByRole('button',{name:'Roll Save'}).click();
    await expect.poll(()=>calls).toBe(2);await expect.poll(spell).toBe('');
    const recovery=page.getByRole('status',{name:'Concentration recovery'});await expect(recovery).toContainText('awaiting confirmation');
    await page.unroute(endpoint);sql(`update characters set concentration_spell='invisibility' where id='${charId}'`);await page.reload();
    await expect(recovery).toContainText('Saved concentration roll: 1');await recovery.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('concentration-recovery.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await recovery.getByRole('button',{name:'Confirm saved save'}).click();await expect(recovery).toContainText('Earlier save confirmed: failed (roll 1');
    expect(spell()).toBe('invisibility');expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
  });
  test('failed timeout is retained instead of sending on every countdown tick',async({page})=>{
    sql(`update pending_concentration_saves set expires_at=now()-interval '1 second' where id='${pending}'`);
    let calls=0;const endpoint='**/rest/v1/rpc/settle_pending_concentration_save';await page.route(endpoint,async route=>{calls++;await route.abort();});
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await expect.poll(()=>calls).toBe(2);
    await expect(page.getByRole('status',{name:'Concentration recovery'})).toContainText('awaiting confirmation');
    await page.waitForTimeout(1200);expect(calls).toBe(2);await page.reload();
    await expect(page.getByRole('button',{name:'Confirm saved save',exact:true})).toBeVisible();await page.waitForTimeout(600);expect(calls).toBe(2);
    await page.unroute(endpoint);await page.getByRole('button',{name:'Confirm saved save',exact:true}).click();
    await expect.poll(()=>sql(`select state from pending_concentration_saves where id='${pending}'`)).toBe('expired');
  });
});
