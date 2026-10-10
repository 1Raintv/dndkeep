import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const parallelSql=(q:string)=>new Promise<string>((resolve,reject)=>{const p=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',reject);p.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));p.stdin.end(q);});
test.describe('durable attack reaction offers',()=>{
 gateDbSuite();let owner:string,camp:string,email:string,character:string,target:string,enc:string,attack:string,revision:string;
 test.beforeEach(()=>{
 owner=randomUUID();camp=randomUUID();email=`offer-${owner}@dndkeep.local`;
  sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${owner}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),'{}',now(),now(),'','','','');`);
  sql(`insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${email}'),'email',now(),now(),now());
   insert into campaigns(id,owner_id,name) values('${camp}','${owner}','Attack outcome fixture');`);

 [character,target,enc,attack]=Array.from({length:4},()=>randomUUID());
 sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,known_spells,spell_slots) values('${character}','${owner}','${camp}','Psion','Human','Psion','Sage',5,array['shield'],'{"1":{"total":2,"used":0}}');
 insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,0);
 insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${target}','${enc}','${camp}','character','${character}','Psion',0);
 insert into pending_attacks(id,campaign_id,encounter_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id,state,attack_d20,attack_total,hit_result,damage_dice,damage_type)
 values('${attack}','${camp}','${enc}','${target}','Attacker','system','Psion','character','Strike','attack_roll',5,15,'${randomUUID()}','attack_rolled',12,17,'hit','1d6','slashing');`);
 revision=sql(`select updated_at from pending_attacks where id='${attack}'`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${camp}';delete from characters where id='${character}';delete from auth.users where id='${owner}'`);});
 const query=(keys:string[]|null=['shield'],user?:string,rev?:string,trigger='post_attack_roll')=>`begin;set local request.jwt.claims='{"sub":"${user??owner}","role":"authenticated"}';set local role authenticated;
 select public.attack_reaction_offers('${attack}','${trigger}','${rev??revision}',${keys===null?'null':`array[${keys.map(k=>`'${k}'`).join(',')}]::text[]`});commit;`;
 const call=(keys:string[]|null=['shield'],user?:string,rev?:string,trigger='post_attack_roll')=>{const r=sql(query(keys,user,rev,trigger));return r?JSON.parse(r):null;};

 const refreshRevision=()=>{revision=sql(`select updated_at from pending_attacks where id='${attack}'`);};
 test('a miss becoming a hit opens a new check and blocks damage until checked',async({page})=>{
  sql(`update pending_attacks set attack_total=12,hit_result='miss' where id='${attack}'`);refreshRevision();call([]);
  const stale=revision;sql(`update pending_attacks set attack_total=17,hit_result='hit' where id='${attack}'`);
  expect(call(null)).toBeNull();expect(()=>call(['shield'],owner,stale)).toThrow(/changed/);
  expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Recover the attack reaction check/);
  await signInAsSeedDm(page,email);
  await page.evaluate(async id=>{const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');await rollAttackRoll(id);},attack);
  expect(call(null).offerCount).toBe(1);expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}' and state='offered' and reaction_key='shield'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.attack_reaction_offer_batches where attack_id='${attack}' and trigger_point='post_attack_roll'`)).toBe('2');
  expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Resolve offered reactions/);
 });
 for(const state of ['accepted','declined','expired'])test(`a changed outcome never reopens an earlier ${state} choice`,()=>{
  call();sql(`update pending_reactions set state='${state}' where pending_attack_id='${attack}'`);
  const before=sql(`select id||'|'||expires_at||'|'||state from pending_reactions where pending_attack_id='${attack}'`);
  sql(`update pending_attacks set hit_result='miss',attack_total=12 where id='${attack}'`);refreshRevision();expect(call(null)).toBeNull();call([]);
  sql(`update pending_attacks set hit_result='hit',attack_total=18 where id='${attack}'`);refreshRevision();expect(call(null)).toBeNull();expect(call().offerCount).toBe(1);
  expect(sql(`select id||'|'||expires_at||'|'||state from pending_reactions where pending_attack_id='${attack}'`)).toBe(before);
  expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}'`)).toBe('1');
  sql(`update pending_attacks set state='damage_rolled',damage_raw=3,damage_final=3 where id='${attack}'`);
 });
 test('unrelated metadata does not reopen a batch but changed AC does',()=>{
  call([]);sql(`update pending_attacks set attacker_name='Renamed' where id='${attack}'`);expect(call(null).offerCount).toBe(0);
  sql(`update pending_attacks set target_ac=16 where id='${attack}'`);expect(call(null)).toBeNull();refreshRevision();expect(call([]).offerCount).toBe(0);
 });
 test('outcome changes cannot be bundled with damage advancement to bypass checking',()=>{
  call([]);expect(()=>sql(`update pending_attacks set state='damage_rolled',attack_total=18 where id='${attack}'`)).toThrow(/changed attack outcome/);
  expect(sql(`select state||'|'||attack_total from pending_attacks where id='${attack}'`)).toBe('attack_rolled|17');
 });
 test('a concurrent outcome change never leaves an old check authoritative',async()=>{
  const result=await Promise.allSettled([parallelSql(query([])),parallelSql(`update pending_attacks set attack_total=18 where id='${attack}'`)]);
  expect(result[1].status).toBe('fulfilled');expect(call(null)).toBeNull();
  expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Recover the attack reaction check/);
  refreshRevision();expect(call([]).offerCount).toBe(0);sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`);
 });
 test('app roles cannot forge reaction revisions or invoke their trigger',()=>{
  expect(()=>sql(`begin;set local role authenticated;insert into dndkeep_private.attack_reaction_revisions values('${attack}',99);commit;`)).toThrow();
  expect(sql(`select has_function_privilege('authenticated','dndkeep_private.track_attack_reaction_revision()','execute')`)).toBe('f');
 });
 test('read is nonmutating and an empty batch stays empty across later candidates',()=>{
 expect(call(null)).toBeNull();expect(sql(`select count(*) from dndkeep_private.attack_reaction_offer_batches where attack_id='${attack}'`)).toBe('0');
 expect(call([]).offerCount).toBe(0);expect(call(['shield']).offerCount).toBe(0);expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}'`)).toBe('0');
 });
 for(const state of ['accepted','declined','expired'])test(`replays ${state} offers without resetting identity or deadline`,()=>{
 expect(call().offerCount).toBe(1);const original=sql(`select id||'|'||expires_at from pending_reactions where pending_attack_id='${attack}'`);
 sql(`update pending_reactions set state='${state}' where pending_attack_id='${attack}'`);
 expect(call().offerCount).toBe(1);expect(sql(`select id||'|'||expires_at from pending_reactions where pending_attack_id='${attack}'`)).toBe(original);expect(sql(`select state from pending_reactions where pending_attack_id='${attack}'`)).toBe(state);
 });
 test('simultaneous requests create one batch and one offer',async()=>{
 const results=await Promise.all([parallelSql(query()),parallelSql(query())]);expect(results.map(r=>JSON.parse(r).offerCount)).toEqual([1,1]);expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}'`)).toBe('1');
 });
 test('rejects strangers, stale candidates, invalid keys and closed windows without batches',()=>{
 expect(()=>call(['shield'],randomUUID())).toThrow();expect(()=>call(['shield'],owner,'2000-01-01')).toThrow();expect(()=>call(['counterspell'])).toThrow();expect(()=>call(['shield'],owner,revision,'post_damage_roll')).toThrow();
 expect(sql(`select count(*) from dndkeep_private.attack_reaction_offer_batches where attack_id='${attack}'`)).toBe('0');
 });
 test('an existing legacy offer is adopted without duplication',()=>{
 sql(`insert into pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,state,expires_at) values('${camp}','${attack}','${target}','Psion','character','shield','Shield','post_attack_roll','declined',now())`);
 expect(call().offerCount).toBe(1);expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}'`)).toBe('1');
 });
 test('saved batch remains readable after the attack finishes, without reopening',()=>{
 call();sql(`update pending_reactions set state='declined' where pending_attack_id='${attack}';update pending_attacks set state='canceled' where id='${attack}'`);
 expect(call().offerCount).toBe(1);expect(call(null).offerCount).toBe(1);
 });
 test('lost batch responses recover on the same attack without another roll or offer',async({page})=>{
 await signInAsSeedDm(page,email);let dropped=0;
 await page.route('**/rest/v1/rpc/attack_reaction_offers',async route=>{const body=route.request().postDataJSON();if(body.p_keys===null){await route.continue();return;}const response=await route.fetch();expect(response.ok()).toBe(true);dropped++;await route.abort('failed');});
 const result=await page.evaluate(async id=>{const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');try{await rollAttackRoll(id);return null;}catch(e){return String(e);}},attack);
 expect(result).not.toBeNull();expect(dropped).toBe(2);expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}'`)).toBe('1');
 await page.unroute('**/rest/v1/rpc/attack_reaction_offers');await page.reload();
 const recovered=await page.evaluate(async id=>{const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');const prior=Math.random;let rolls=0;Math.random=()=>{rolls++;return .9;};try{return {attack:await rollAttackRoll(id),rolls};}finally{Math.random=prior;}},attack);
 expect(recovered.rolls).toBe(0);expect(recovered.attack?.attack_total).toBe(17);expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}'`)).toBe('1');
 });
 test('damage advancement restores an unanswered offer and the server holds damage',async({page})=>{
 await signInAsSeedDm(page,email);
 const result=await page.evaluate(async id=>{const {rollDamage}=await import('/src/lib/pendingAttack.ts');try{await rollDamage(id);return null;}catch(e){return String(e);}},attack);
 expect(result).toContain('Resolve offered reactions');expect(sql(`select state||'|'||(damage_raw is null) from pending_attacks where id='${attack}'`)).toBe('attack_rolled|true');
 expect(sql(`select count(*) from pending_reactions where pending_attack_id='${attack}' and state='offered'`)).toBe('1');
 });
 test('a stranger cannot read an existing receipt or its private table',()=>{
 call();expect(()=>call(null,randomUUID())).toThrow();expect(()=>sql(`begin;set local role authenticated;select * from dndkeep_private.attack_reaction_offer_batches;rollback;`)).toThrow();
 });

 test('a member can recover their own attack and loses receipt access after leaving',()=>{
 const dm=randomUUID();sql(`insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@local.test','{}');update campaigns set owner_id='${dm}' where id='${camp}';
 insert into campaign_members(campaign_id,user_id) values('${camp}','${owner}') on conflict(campaign_id,user_id) do nothing;update combatants set definition_id='${character}' where id=(select combatant_id from combat_participants where id='${target}');
 update pending_attacks set attacker_participant_id='${target}',attacker_type='character' where id='${attack}'`);
 try{revision=sql(`select updated_at from pending_attacks where id='${attack}'`);expect(call([]).offerCount).toBe(0);sql(`delete from campaign_members where campaign_id='${camp}' and user_id='${owner}'`);expect(()=>call(null)).toThrow();}
 finally{sql(`update campaigns set owner_id='${owner}' where id='${camp}';delete from auth.users where id='${dm}'`);}
 });

 test('missing offer batches block both windows even when no offer exists',()=>{
 expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Recover the attack reaction check/);
 call([]);sql(`update pending_attacks set state='damage_rolled',damage_raw=3,damage_final=3 where id='${attack}'`);
 expect(()=>sql(`update pending_attacks set state='applied' where id='${attack}'`)).toThrow(/Recover the damage reaction check/);
 revision=sql(`select updated_at from pending_attacks where id='${attack}'`);call([],owner,revision,'post_damage_roll');sql(`update pending_attacks set state='applied' where id='${attack}'`);
 expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('applied');
 });
 test('rejecting advancement rolls back HP writes in the same transaction',()=>{
 const before=sql(`select current_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`);
 expect(()=>sql(`begin;update combatants set current_hp=0 where id=(select combatant_id from combat_participants where id='${target}');update pending_attacks set state='applied' where id='${attack}';commit;`)).toThrow();
 expect(sql(`select current_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`)).toBe(before);
 });

 test('skipping straight from a declaration to damage cannot bypass reaction review',()=>{
 sql(`update pending_attacks set state='declared' where id='${attack}'`);
 expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Recover the attack reaction check/);
 expect(()=>sql(`update pending_attacks set state='applied' where id='${attack}'`)).toThrow(/Recover the attack reaction check/);
 });

});
