import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Standalone concentration client (local stack)', () => {
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
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Telepath',5,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from action_logs where character_id='${charId}';delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  test('creation and both dice survive lost responses and browser reloads',async({page})=>{
    sql(`update characters set constitution=14,saving_throw_proficiencies='{constitution}',gained_feats=array['War Caster'],
      concentration_spell='detect-magic',concentration_rounds_remaining=100,nat_1_20_saves=false where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    let creations=0;const createEndpoint='**/rest/v1/rpc/queue_standalone_concentration_save';
    await page.route(createEndpoint,async route=>{creations++;const result=await route.fetch();expect(result.ok()).toBe(true);await route.abort();});
    const first=await page.evaluate(async({charId,userId})=>{
      const path='/src/lib/api/standaloneConcentration.ts',dbPath='/src/lib/supabase.ts';const api=await import(path),{supabase}=await import(dbPath);
      const {data,error}=await supabase.from('characters').select('*').eq('id',charId).single();if(error)throw error;
      const request=api.createStandaloneSaveRequest(data,userId,5,2);
      try{await api.queueStandaloneSave(request);return {id:request.requestId,error:''};}catch(error){return {id:request.requestId,error:String(error)};}
    },{charId,userId});
    expect(first.error).not.toBe('');expect(creations).toBe(2);await page.unroute(createEndpoint);await page.reload();
    const row=await page.evaluate(async({charId,userId})=>{
      const path='/src/lib/api/standaloneConcentration.ts',api=await import(path);const saved=api.savedStandaloneCreations(userId,charId);
      if(saved.length!==1)throw new Error('Creation recovery missing');return api.queueStandaloneSave(saved[0]);
    },{charId,userId});
    expect(row).toMatchObject({request_id:first.id,save_bonus:5,has_advantage:true});
    let rolls=0;const rollEndpoint='**/rest/v1/rpc/settle_standalone_concentration_save';
    await page.route(rollEndpoint,async route=>{rolls++;const result=await route.fetch();expect(result.ok()).toBe(true);await route.abort();});
    await page.evaluate(async({userId,row})=>{
      const path='/src/lib/api/standaloneConcentration.ts',api=await import(path);let n=0;Math.random=()=>n++===0?.125:.825;
      try{await api.rollStandaloneSave(userId,row);}catch{/* expected lost reply, disk retains the pair */}
    },{userId,row});
    expect(rolls).toBe(2);await page.unroute(rollEndpoint);await page.reload();
    const recovered=await page.evaluate(async({charId,userId})=>{
      const path='/src/lib/api/standaloneConcentration.ts',api=await import(path),saved=api.savedStandaloneRolls(userId,charId);
      if(saved.length!==1||saved[0].rolls.join(',')!=='3,17')throw new Error('Original dice missing');
      const receipt=await api.confirmStandaloneRoll(saved[0]);return {receipt,left:api.savedStandaloneRolls(userId,charId).length,pending:(await api.loadStandaloneSaves(charId)).pending.length};
    },{charId,userId});
    expect(recovered).toMatchObject({receipt:{outcome:'passed',rolls:[3,17],total:22,replayed:true},left:0,pending:0});
    expect(sql(`select count(*) from action_logs where id='${first.id}'`)).toBe('1');expect(sql(`select concentration_spell from characters where id='${charId}'`)).toBe('detect-magic');
    sql(`delete from action_logs where id='${first.id}'`);
  });
});
