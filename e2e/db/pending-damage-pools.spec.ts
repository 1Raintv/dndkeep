import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Private pending damage pool stage',()=>{
 gateDbSuite();let dm:string,player:string,campaign:string,char:string,cb:string,enc:string,cp:string,attack:string;
 test.beforeEach(()=>{
  [dm,player,campaign,char,cb,enc,cp,attack]=Array.from({length:8},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@ctx.local','{}'),('${player}','${player}@ctx.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Damage context');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,damage_resistances) values('${char}','${player}','${campaign}','Actor','Human','Psion','Sage',array['psychic']);
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,stat_block_snapshot) values('${cb}','${campaign}','${player}','Actor','character','${char}',20,20,'{"damage_resistances":["fire"]}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${cp}','${enc}','${campaign}','character','${char}','Actor',0,'${cb}');
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id) values('${attack}','${campaign}','${enc}','${cp}','${cp}','Actor','character','Target','Hit','attack_roll','melee','hit','damage_rolled','1d6','psychic','${randomUUID()}');update combatants set temp_hp=3 where id='${cb}';commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${dm}','${player}')`));
 const context=(id=attack)=>JSON.parse(sql(auth(dm,`select get_pending_damage_context('${id}')`)));
 const encoded=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
 const call=(expected:unknown,damage=8,id=attack)=>`select dndkeep_private.settle_pending_damage_pools('${id}',${encoded(expected)},${damage})`;
 // Internal-stage tests use the database owner with an authenticated DM claim.
 // The app role is deliberately denied this partial-stage function.
 const internal=(q:string)=>`begin;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';${q};commit;`;
 const run=(q:string)=>JSON.parse(sql(internal(q)));
 const pools=()=>JSON.parse(sql(`select jsonb_build_object('hp',current_hp,'temp',temp_hp) from combatants where id='${cb}'`));
 const count=()=>sql(`select count(*) from dndkeep_private.pending_damage_pool_records where attack_id='${attack}'`);
 const parallel=(q:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const p=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']);let out='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',()=>{});p.on('close',code=>resolve({code,out}));p.stdin.end(q);});
 test('temp HP and HP share the saved receipt and exact retry does not damage twice',()=>{
  const q=call(context()),first=run(q);expect(first).toMatchObject({damage:8,beforeHP:20,beforeTempHP:3,afterHP:15,afterTempHP:0,replayed:false});
  expect(run(q)).toEqual({...first,replayed:true});expect(pools()).toEqual({hp:15,temp:0});expect(count()).toBe('1');
  expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('damage_rolled');
 });
 test('competing exact requests consume pools once',async()=>{
  const q=internal(call(context())),results=await Promise.all([parallel(q),parallel(q)]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(pools()).toEqual({hp:15,temp:0});expect(count()).toBe('1');
 });
 test('different hits cannot overwrite shared target HP with stale snapshots',async()=>{
  const second=randomUUID();sql(`insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id) select '${second}',campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,'${randomUUID()}' from pending_attacks where id='${attack}'`);
  const results=await Promise.all([parallel(internal(call(context()))),parallel(internal(call(context(second),8,second)))]);
  expect(results.map(r=>r.code).sort()).toEqual([0,3]);expect(pools()).toEqual({hp:15,temp:0});
  const retry=results[0].code===0?second:attack;expect(run(call(context(retry),8,retry)).replayed).toBe(false);expect(pools()).toEqual({hp:7,temp:0});
 });
 for(const state of ['declared','attack_rolled','canceled'])test(`rejects ${state} attacks without a pool write`,()=>{sql(`update pending_attacks set state='${state}' where id='${attack}'`);expect(()=>run(call(context()))).toThrow(/Resolve the attack/);expect(pools()).toEqual({hp:20,temp:3});expect(count()).toBe('0');});
 test('unresolved Legendary Resistance blocks the pool stage',()=>{sql(`update pending_attacks set pending_lr_decision=true where id='${attack}'`);expect(()=>run(call(context()))).toThrow(/Resolve the attack/);expect(count()).toBe('0');});
 test('changed amount on a used identity is rejected',()=>{const c=context();run(call(c));expect(()=>run(call(c,9))).toThrow(/Saved damage settlement changed/);expect(pools()).toEqual({hp:15,temp:0});});
 test('stale runtime HP rolls back before spending pools',()=>{const c=context();sql(`update combatants set current_hp=19 where id='${cb}'`);expect(()=>run(call(c))).toThrow(/Damage context changed/);expect(pools()).toEqual({hp:19,temp:3});expect(count()).toBe('0');});
 test('offered reactions block settlement even when their expiry timestamp has passed',()=>{
  sql(`insert into pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,state,expires_at) values('${campaign}','${attack}','${cp}','Actor','character','uncanny_dodge','Uncanny Dodge','post_damage_roll','offered',now()-interval '1 minute')`);
  expect(()=>run(call(context()))).toThrow(/Resolve offered reactions/);expect(pools()).toEqual({hp:20,temp:3});expect(count()).toBe('0');
 });
 test('a later failure in the outer transaction rolls back pools and receipt together',()=>{
  const q=call(context());expect(()=>sql(internal(q+';select 1/0'))).toThrow(/division by zero/);expect(pools()).toEqual({hp:20,temp:3});expect(count()).toBe('0');expect(run(q).replayed).toBe(false);
 });
 test('failed receipt insertion rolls back the preceding pool write',()=>{
  const q=call(context());expect(()=>sql(internal(`create function pg_temp.reject_damage_receipt() returns trigger language plpgsql as $$begin raise exception 'receipt fixture failure';end;$$;
   create trigger reject_damage_receipt before insert on dndkeep_private.pending_damage_pool_records for each row execute function pg_temp.reject_damage_receipt();${q}`))).toThrow(/receipt fixture failure/);
  expect(pools()).toEqual({hp:20,temp:3});expect(count()).toBe('0');
 });
 test('partial settlement is inaccessible to authenticated and anonymous app clients',()=>{
  const q=call(context());expect(()=>sql(auth(dm,q))).toThrow(/permission denied/);expect(()=>sql(`begin;set local role anon;${q};commit;`)).toThrow(/permission denied/);
  expect(()=>sql(auth(dm,'select * from dndkeep_private.pending_damage_pool_records'))).toThrow(/permission denied/);expect(count()).toBe('0');
 });
 test('a saved receipt survives target deletion without looking up new target pools',()=>{
  const q=call(context()),first=run(q);sql(`delete from combat_participants where id='${cp}'`);expect(run(q)).toEqual({...first,replayed:true});expect(pools()).toEqual({hp:15,temp:0});
 });
 test('free-text targets get an explicit no-pools receipt',()=>{sql(`update pending_attacks set target_participant_id=null where id='${attack}'`);expect(run(call(context()))).toMatchObject({combatantId:null,beforeHP:null,afterHP:null,afterTempHP:null});expect(pools()).toEqual({hp:20,temp:3});});
 test('zero damage retains temporary HP and current HP',()=>{expect(run(call(context(),0))).toMatchObject({afterHP:20,afterTempHP:3});expect(pools()).toEqual({hp:20,temp:3});});
});
