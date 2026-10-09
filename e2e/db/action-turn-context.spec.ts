import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(query:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('Private action turn context',()=>{
 gateDbSuite();let owner:string,other:string,character:string,campaign:string,encounter:string,participant:string,enemy:string;
 test.beforeEach(()=>{
  [owner,other,character,campaign,encounter,participant,enemy]=Array.from({length:7},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@action.local','{}'),('${other}','${other}@action.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Action clock');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${participant}','${encounter}','${campaign}','character','${character}','Psion',0),
   ('${enemy}','${encounter}','${campaign}','creature','${enemy}','Enemy',1);`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});
 const context=(user?:string)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${user??owner}","role":"authenticated"}';select dndkeep_private.action_turn_context('${character}');commit;`));
 const next=(index:number,round=1)=>sql(`update combat_encounters set current_turn_index=${index},round_number=${round} where id='${encounter}'`);
 test('keeps the owner refresh clock across enemy turns and refreshes on its own turn',()=>{
  const first=context();expect(first).toMatchObject({actorId:character,encounterId:encounter,participantId:participant,isOwnTurn:true});
  expect(context()).toEqual(first);next(1);const enemyTurn=context();expect(enemyTurn.turnId).not.toBe(first.turnId);
  expect(enemyTurn.ownerTurnId).toBe(first.ownerTurnId);expect(enemyTurn.isOwnTurn).toBe(false);
  next(0,2);const own=context();expect(own.isOwnTurn).toBe(true);expect(own.ownerTurnId).toBe(own.turnId);expect(own.ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('records unseen own turns even when no client reads during them',()=>{
  const first=context();next(1);next(0,2);next(1,2);const after=context();
  expect(after.isOwnTurn).toBe(false);expect(after.ownerTurnId).not.toBe(first.ownerTurnId);expect(after.ownerTurnId).not.toBe(after.turnId);
 });
 test('unrelated encounter edits do not refill action clocks',()=>{
  const first=context();sql(`update combat_encounters set round_number=round_number where id='${encounter}'`);expect(context()).toEqual(first);
 });
 test('rewinding initiative gets a fresh own-turn identity',()=>{
  const first=context();next(1);next(0);expect(context().ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('initial off-turn context remains stable until the first own turn',()=>{
  // No own-turn read occurred: use the encounter-start epoch, not enemy turn.
  next(1);const first=context();next(1,2);const nextEnemy=context();
  expect(nextEnemy.turnId).not.toBe(first.turnId);expect(nextEnemy.ownerTurnId).toBe(first.ownerTurnId);
  next(0,3);expect(context().ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('solo context is stable and changes only on confirmed solo advancement',()=>{
  sql(`delete from combat_encounters where id='${encounter}'`);const first=context();
  expect(first).toMatchObject({isOwnTurn:true,encounterId:null,participantId:null});expect(context()).toEqual(first);
  sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select advance_psionic_solo_turn('${character}','${randomUUID()}',0);commit;`);
  expect(context().ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('rejects another owner, duplicate participation, tied positions and missing current actors',()=>{
  expect(()=>context(other)).toThrow(/unavailable/);
  const duplicate=randomUUID(),secondEncounter=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${secondEncounter}','${campaign}','active',0);insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${duplicate}','${secondEncounter}','${campaign}','character','${character}','Duplicate',2)`);
  expect(()=>context()).toThrow(/duplicate/);sql(`delete from combat_encounters where id='${secondEncounter}'`);
  sql(`update combat_participants set turn_order=0 where id='${enemy}'`);expect(()=>context()).toThrow(/tied/);
  sql(`update combat_participants set turn_order=1 where id='${enemy}'`);next(9);expect(()=>context()).toThrow(/no current actor/);
 });
 test('restarting combat changes the encounter-start epoch for off-turn actors',()=>{
  const first=context();next(1);sql(`update combat_encounters set status='ended' where id='${encounter}';update combat_encounters set status='active' where id='${encounter}'`);
  const restarted=context();expect(restarted.isOwnTurn).toBe(false);expect(restarted.ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('keeps all clock functions and tables inaccessible to direct app callers',()=>{
  for(const role of ['anon','authenticated']){
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.action_turn_context(uuid)','EXECUTE')`)).toBe('f');
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.observe_action_turn()','EXECUTE')`)).toBe('f');
   for(const table of ['action_actor_turns','action_encounter_epochs'])expect(sql(`select has_table_privilege('${role}','dndkeep_private.${table}','SELECT,INSERT,UPDATE,DELETE')`)).toBe('f');
  }
 });
});
