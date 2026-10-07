import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psionic Reserves recovery', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  let campaignId:string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID(); campaignId=randomUUID();
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
    if (userId) sql(`delete from campaigns where id='${campaignId}'; delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  test('solo initiative restores to four and preserves other resources',async({page},info)=>{
    sql(`update characters set level=18 where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByText('Initiative',{exact:true}).locator('visible=true').first().click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('4');
    expect(sql(`select class_resources->'psion-disciplines' from characters where id='${charId}'`)).toBe('["Biofeedback", "Psionic Guards", "Inerrant Aim"]');
    await expect(page.getByRole('status').filter({hasText:'Psionic Reserves: +2 dice (4 remaining)'})).toBeAttached();
    await page.getByText('Click anywhere to dismiss',{exact:true}).locator('..').click({position:{x:20,y:20}});
    await page.getByRole('status').filter({hasText:'Psionic Reserves: +2 dice (4 remaining)'}).scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('reserves-notice.png')});
  });
  test('campaign initiative applies the same recovery through real combat orchestration',async({page})=>{
    test.setTimeout(60000);
    sql(`insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Reserves Fixture'); update characters set level=18,campaign_id='${campaignId}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await expect(page.getByText('Initiative',{exact:true}).locator('visible=true').first()).toBeVisible();
    const result=await page.evaluate(async({campaignId,charId})=>{
      const path='/src/lib/combatEncounter.ts';const api=await import(path);
      const seed={type:'character',entityId:charId,name:'Psion',ac:10,hp:10,maxHp:10,dexMod:0,initiativeBonus:0};
      const started=await api.startEncounter({campaignId,initiativeMode:'player_agency',seeds:[seed]});
      return {participantId:started.participants[0].id,encounterId:started.encounter.id};
    },{campaignId,charId});
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
    await page.evaluate(async(id)=>{const path='/src/lib/combatEncounter.ts';await (await import(path)).rollInitiativeForParticipant(id,0);},result.participantId);
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('4');
    expect(sql(`select count(*) from combat_events where encounter_id='${result.encounterId}' and payload->>'field'='Psionic Reserves'`)).toBe('1');
  });
  test('database enforces level, depleted pools and owner permissions',async()=>{
    const recover=(id=charId,caller=userId)=>sql(`begin; set local role authenticated; select set_config('request.jwt.claims','{"sub":"${caller}","role":"authenticated"}',true); select public.recover_psionic_reserves('${id}'); commit;`).split('\n').filter(s=>/^\d+$/.test(s)).at(-1);
    for(const [level,pool,want] of [[17,0,0],[18,0,4],[18,1,3],[18,2,2],[18,3,1],[18,4,0],[20,12,0]]) {
      sql(`update characters set level=${level},class_resources=jsonb_set(class_resources,'{psionic-energy-dice}','${pool}') where id='${charId}'`);
      expect(recover()).toBe(String(want));
      expect(recover()).toBe('0');
    }
    sql(`update characters set class_name='Wizard',level=2,secondary_class='Psion',secondary_level=18,class_resources='{"psionic-energy-dice":1,"other":9}' where id='${charId}'`);
    expect(recover()).toBe('3');
    expect(sql(`select class_resources->>'other' from characters where id='${charId}'`)).toBe('9');
    sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${charId}'`);
    expect(recover(charId,randomUUID())).toBe('0');
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('0');
    for(const malformed of ['{}','{"psionic-energy-dice":"0"}','{"psionic-energy-dice":-1}','{"psionic-energy-dice":1.5}']) {
      sql(`update characters set class_resources='${malformed}' where id='${charId}'`);
      expect(recover()).toBe('0');
    }
    expect(sql(`select has_function_privilege('anon','public.recover_psionic_reserves(uuid)','EXECUTE')`)).toBe('f');
  });
});
