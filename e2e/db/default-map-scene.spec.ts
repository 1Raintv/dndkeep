import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Default battle-map scene', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
  let campaignId:string;
  let targetId:string;
  let firstScene:string;
  let secondScene:string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID(); campaignId=randomUUID(); targetId=randomUUID(); [firstScene,secondScene]=[randomUUID(),randomUUID()].sort();
    email = 'psion-' + userId + '@dndkeep.local';
    // v2.747: own disposable account, so shared seed users' slot limits and
    // parallel suites cannot affect this fixture. Never alter their characters.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Psion Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
      insert into campaigns(id,owner_id,name,use_combatants_for_battlemap) values('${campaignId}','${userId}','Scene Selection Fixture',true);
      insert into characters(id,user_id,campaign_id,name,species,class_name,background) values
        ('${charId}','${userId}','${campaignId}','Scene Hero','Human','Fighter','Soldier'),
        ('${targetId}','${userId}','${campaignId}','Scene Target','Human','Fighter','Soldier');
      insert into scenes(id,campaign_id,owner_id,name,grid_size_px,width_cells,height_cells,is_published,created_at,updated_at) values
        ('${firstScene}','${campaignId}','${userId}','First Scene',70,20,20,true,'2025-01-01','2025-01-01'),
        ('${secondScene}','${campaignId}','${userId}','Recently Edited Scene',70,20,20,true,'2025-01-02','2025-02-01');
      insert into scene_tokens(scene_id,character_id,name,size,x,y,visible_to_all) values
        ('${firstScene}','${charId}','Scene Hero','medium',35,35,true),
        ('${firstScene}','${targetId}','Scene Target','medium',105,35,true),
        ('${secondScene}','${charId}','Scene Hero','medium',35,35,true),
        ('${secondScene}','${targetId}','Scene Target','medium',595,35,true);
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from campaigns where id='${campaignId}'; delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  test('cold geometry matches the map scene list while explicit viewed scenes win',async({page})=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);
    const inspect=()=>page.evaluate(async({campaignId,firstScene,secondScene,charId,targetId})=>{
      const geometryPath='/src/lib/battleMapGeometry.ts',scenesPath='/src/lib/api/scenes.ts';
      const {loadActiveBattleMap,distanceBetweenParticipantsFtUsingMap}=await import(/* @vite-ignore */ geometryPath);
      const {listScenes}=await import(/* @vite-ignore */ scenesPath);
      const cold=await loadActiveBattleMap(campaignId,{viewedSceneId:null});
      const viewed=await loadActiveBattleMap(campaignId,{viewedSceneId:secondScene});
      const stale=await loadActiveBattleMap(campaignId,{viewedSceneId:'00000000-0000-0000-0000-000000000000'});
      const actor={id:'actor',name:'Scene Hero',participant_type:'character',entity_id:charId};
      const target={id:'target',name:'Scene Target',participant_type:'character',entity_id:targetId};
      return {list:(await listScenes(campaignId)).map((s:{id:string})=>s.id),cold:cold?.id,viewed:viewed?.id,stale:stale?.id,
        coldDistance:distanceBetweenParticipantsFtUsingMap(actor,target,cold),viewedDistance:distanceBetweenParticipantsFtUsingMap(actor,target,viewed)};
    },{campaignId,firstScene,secondScene,charId,targetId});
    const expected={list:[firstScene,secondScene],cold:firstScene,viewed:secondScene,stale:firstScene,coldDistance:5,viewedDistance:40};
    expect(await inspect()).toEqual(expected);
    // Batched-created scenes use the same deterministic id tiebreaker in both paths.
    sql(`update scenes set created_at='2025-01-01' where id='${secondScene}'`);
    expect(await inspect()).toEqual(expected);expect(errors).toEqual([]);
  });
});
