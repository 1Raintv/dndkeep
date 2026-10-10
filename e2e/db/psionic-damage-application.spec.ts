import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,finishEmptyFixtureReactionWindow} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Atomic Destructive Thoughts application',()=>{
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
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id,damage_final,psionic_damage_dice) values('${attack}','${campaign}','${enc}','${cp}','${cp}','Actor','character','Target','Destructive Thoughts','auto_hit','melee','hit','damage_rolled','13','psychic','${randomUUID()}',13,'{"version":1,"sides":8,"originalRolls":[1,5,3],"rolls":[1,5,3],"modifier":4}');update combatants set temp_hp=3 where id='${cb}';update characters set current_hp=20,max_hp=20 where id='${char}';commit;`);
  finishEmptyFixtureReactionWindow(sql,dm,attack,'post_damage_roll');
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${dm}','${player}')`));
 const context=(id=attack)=>JSON.parse(sql(auth(dm,`select get_pending_damage_context('${id}')`)));
 const encoded=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
 const call=(expected:unknown)=>`select apply_psionic_pending_damage('${attack}',${encoded(expected)},2)`;
 const run=(q:string,u=dm)=>JSON.parse(sql(auth(u,q))||'null');
 const pools=()=>JSON.parse(sql(`select jsonb_build_object('hp',current_hp,'temp',temp_hp) from combatants where id='${cb}'`));
 const events=()=>sql(`select count(*) from combat_events where campaign_id='${campaign}' and event_type='damage_applied'`);
 const parallel=(q:string)=>new Promise<string>((resolve,reject)=>{const child=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));child.stdin.end(auth(dm,q));});
 test('receipt probe is read-only and application synchronizes HP exactly once',()=>{
  expect(run(`select apply_psionic_pending_damage('${attack}')`)).toBe(null);expect(pools()).toEqual({hp:20,temp:3});
  const q=call(context()),r=run(q);expect(r.attack.state).toBe('applied');expect(r.settlement).toMatchObject({damage:6,afterHP:17,afterTempHP:0});
  expect(run(q)).toEqual({...r,replayed:true});expect(events()).toBe('1');expect(pools()).toEqual({hp:17,temp:0});
  expect(sql(`select current_hp from characters where id='${char}'`)).toBe('17');
 });
 test('concurrent identical applications share one HP change and one event',async()=>{
  const q=call(context()),rs=(await Promise.all([parallel(q),parallel(q)])).map(s=>JSON.parse(s));
  expect(rs.map(r=>r.replayed).sort()).toEqual([false,true]);expect(pools()).toEqual({hp:17,temp:0});expect(events()).toBe('1');
 });
 test('direct and preview applications racing share one defense calculation and receipt',async()=>{
  const ctx=context(),plan=run(`select preview_psionic_damage('${attack}')`);
  const rs=(await Promise.all([parallel(call(ctx)),parallel(`select apply_psionic_damage_resolution('${attack}',${encoded(plan)},2)`)])).map(s=>JSON.parse(s));
  expect(rs.map(r=>r.replayed).sort()).toEqual([false,true]);
  expect(rs.map(r=>r.settlement.damage)).toEqual([6,6]);expect(pools()).toEqual({hp:17,temp:0});expect(events()).toBe('1');
 });
 test('Petrified resistance is rounded once and replay cannot halve again',()=>{
  sql(`update combatants set active_conditions=array['Petrified','Incapacitated'] where id='${cb}'`);
  const q=call(context()),r=run(q);expect(r.attack.damage_final).toBe(6);expect(pools()).toEqual({hp:17,temp:0});
  expect(run(q).attack.damage_final).toBe(6);expect(pools()).toEqual({hp:17,temp:0});expect(events()).toBe('1');
 });
 test('stale recorded damage rejects without changing HP or publishing events',()=>{
  const ctx=context();sql(`update pending_attacks set damage_final=12 where id='${attack}'`);
  expect(()=>run(call(ctx))).toThrow(/Attack changed/);expect(events()).toBe('0');expect(pools()).toEqual({hp:20,temp:3});
 });
 test('stale target HP rejects without marking the attack applied',()=>{
  const ctx=context();sql(`update combatants set current_hp=19 where id='${cb}'`);
  expect(()=>run(call(ctx))).toThrow(/context changed/);expect(events()).toBe('0');expect(pools()).toEqual({hp:19,temp:3});
 });
 test('a failed final receipt rolls back HP, concentration offer, sheet and events',()=>{
  sql(`update characters set concentration_spell='Bless' where id='${char}'`);const q=call(context());
  expect(()=>sql(`begin;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';
   create function pg_temp.reject_final_receipt() returns trigger language plpgsql as $$begin raise exception 'final receipt fixture failure';end;$$;
   create trigger reject_final_receipt before insert on dndkeep_private.psionic_damage_applications for each row execute function pg_temp.reject_final_receipt();${q};commit;`)).toThrow(/final receipt fixture failure/);
  expect(pools()).toEqual({hp:20,temp:3});expect(events()).toBe('0');
  expect(sql(`select current_hp from characters where id='${char}'`)).toBe('20');
  expect(sql(`select count(*) from pending_concentration_saves where character_id='${char}'`)).toBe('0');
  expect(sql(`select count(*) from dndkeep_private.pending_damage_pool_records where attack_id='${attack}'`)).toBe('0');
  expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('damage_rolled');
 });
 test('only the current DM can apply or read receipts',()=>{
  const q=call(context());expect(()=>run(q,player)).toThrow(/current DM/);run(q);
  expect(()=>run(`select apply_psionic_pending_damage('${attack}')`,player)).toThrow(/current DM/);
 });
 test('concentration offer is created once and bound to the saved application',()=>{
  sql(`update characters set concentration_spell='Bless' where id='${char}'`);const q=call(context()),r=run(q);
  expect(r.settlement.concentrationCheckId).toBeTruthy();expect(run(q).settlement.concentrationCheckId).toBe(r.settlement.concentrationCheckId);
  expect(sql(`select count(*) from pending_concentration_saves where character_id='${char}'`)).toBe('1');
 });
 test('zero damage leaves a stable character untouched',()=>{
  sql(`update pending_attacks set damage_final=0 where id='${attack}';update combatants set current_hp=0,is_stable=true where id='${cb}'`);
  const r=run(call(context()));expect(r.settlement).toMatchObject({damage:0,stable:true,failures:0});expect(events()).toBe('1');
 });
});
