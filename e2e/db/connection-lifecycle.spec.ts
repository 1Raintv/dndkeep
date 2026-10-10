import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
// Private lifecycle is not exposed yet. Claims still exercise the real owner
// check; separate tests prove authenticated/anonymous cannot call it directly.
const asUser=(u:string,q:string)=>`begin;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('saved Connection private lifecycle',()=>{
 gateDbSuite();let owner:string,other:string,character:string,id:string,turn:string;
 const invoke=(q:string,user=owner)=>JSON.parse(sql(asUser(user,`select ${q}`))||'null');
 const begin=(free=true,roll=2)=>invoke(`dndkeep_private.begin_connection('${character}','${id}','${turn}',${roll},${free})`);
 const read=()=>invoke(`dndkeep_private.read_connection('${character}','${id}')`);
 test.beforeEach(()=>{
  [owner,other,character,id]=Array.from({length:4},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@connection.local','{}'),('${other}','${other}@connection.local','{}');
   insert into characters(id,user_id,name,species,class_name,subclass,background,level,class_resources,hit_dice_spent) values('${character}','${owner}','Connection','Human','Psion','Telepath','Sage',7,'{"psionic-energy-dice":6}',0);`);
  turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;
 });
 test.afterEach(()=>{sql(`delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}')`);});
 test('saves a free use and Bonus Action once, rejects a changed replay',()=>{
  expect(begin()).toMatchObject({base_roll:2,base_range:60,psion_level:7,replayed:false});
  expect(begin()).toMatchObject({replayed:true});
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('6');
  expect(()=>begin(true,3)).toThrow();
  expect(read().remainingSeconds).toBe(3600);
 });
 test('a stale paid claim rolls the action back and another declaration cannot reuse the Bonus Action',()=>{
  expect(()=>begin(false)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('0');
  begin();id=randomUUID();expect(()=>begin(false)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.connection_declarations where character_id='${character}'`)).toBe('1');
 });
 test('links Surge once and recovers a finalized roll',()=>{
  begin();const enhancement=randomUUID();
  const surge=()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${enhancement}','surge',null,6)`);
  expect(surge()).toMatchObject({total:4,hitDiceSpent:1});
  expect(surge()).toMatchObject({total:4,hitDiceSpent:1,replayed:true});
  const finalize=()=>invoke(`dndkeep_private.finalize_connection_roll('${character}','${id}')`);
  expect(finalize()).toMatchObject({total:4,originalRolls:[2],rolls:[4],usedSurge:true});
  expect(finalize()).toEqual(read().roll_result);
  expect(()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
 });
 test('expires at one hour of game time, not at finalization or reload',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3599 where character_id='${character}'`);
  expect(read().remainingSeconds).toBe(1);
  invoke(`dndkeep_private.finalize_connection_roll('${character}','${id}')`);
  expect(read().remainingSeconds).toBe(1);
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+1 where character_id='${character}'`);
  expect(read().remainingSeconds).toBe(0);
 });
 test('Restoration consumes one minute instead of ending the whole extension',()=>{
  begin();invoke(`public.settle_psionic_energy('${character}','${randomUUID()}','spend',1,'{}','Manual test')`);
  invoke(`public.settle_psionic_energy('${character}','${randomUUID()}','restore',0,'{}','Psionic Restoration')`);
  expect(read().remainingSeconds).toBe(3540);
 });
 test('ownership and private execution privileges are enforced',()=>{
  begin();expect(()=>invoke(`dndkeep_private.read_connection('${character}','${id}')`,other)).toThrow();
  expect(sql(`select has_function_privilege('anon','dndkeep_private.begin_connection(uuid,uuid,text,integer,boolean)','execute'),has_function_privilege('authenticated','dndkeep_private.begin_connection(uuid,uuid,text,integer,boolean)','execute')`)).toBe('f|f');
 });
 test('a later paid extension spends exactly one die',()=>{
  begin();const previous=id;
  const context=invoke(`public.psionic_turn_context_internal('${character}')`);
  invoke(`public.advance_psionic_solo_turn('${character}','${randomUUID()}',${context.soloTurn})`);
  turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;id=randomUUID();
  expect(begin(false)).toMatchObject({energy_receipt:{remaining:5}});
  expect(begin(false).replayed).toBe(true);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('5');
  expect(invoke(`dndkeep_private.read_connection('${character}','${previous}')`).remainingSeconds).toBe(3594);
 });
 test('Enkindled and Surge finalize their saved total without extra Energy Die spending',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}' where id='${character}'`);
  begin();
  expect(invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','enkindled',array[6,9],null)`)).toMatchObject({hitDiceSpent:2,extraRolls:[6,9]});
  expect(invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toMatchObject({hitDiceSpent:3,total:19});
  expect(invoke(`dndkeep_private.finalize_connection_roll('${character}','${id}')`)).toMatchObject({total:19,originalRolls:[2,6,9],rolls:[4,6,9]});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('12');
 });
 test('a completed short rest expires the effect',()=>{
  begin();
  const row=JSON.parse(sql(`select to_jsonb(c) from characters c where id='${character}'`));
  const fields=['spell_slots','class_resources','feature_uses'];
  const expected=Object.fromEntries([...fields,'class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'].map(k=>[k,row[k]]));
  const updates=Object.fromEntries(fields.map(k=>[k,row[k]??{}]));
  invoke(`public.complete_psionic_rest('${character}','${randomUUID()}','short','${JSON.stringify(expected)}','${JSON.stringify(updates)}')`);
  expect(read().remainingSeconds).toBe(0);
 });
 test('expired declarations cannot spend new enhancement dice',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3600 where character_id='${character}'`);
  expect(()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });

 test('a missing game clock blocks enhancements and reports an unknown duration',()=>{
  begin();sql(`delete from dndkeep_private.psionic_duration_clocks where character_id='${character}'`);
  expect(read().remainingSeconds).toBeNull();
  expect(()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });

});
