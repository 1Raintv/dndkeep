import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const asUser=(user:string,q:string)=>`begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';select ${q};commit;`;
// Deliberately private until the complete effect application and UI are wired.
test.describe('Mutable Form saved private lifecycle',()=>{
 gateDbSuite();let owner:string,other:string,character:string,id:string,turn:string;
 const invoke=(q:string,user=owner)=>JSON.parse(sql(asUser(user,q))||'null');
 const expression=(flesh=false,choice:unknown=null,roll=2)=>`dndkeep_private.begin_mutable_form('${character}','${id}','${turn}',${roll},${flesh},'${JSON.stringify(choice)}'::jsonb)`;
 const begin=(flesh=false,choice:unknown=null,roll=2)=>invoke(expression(flesh,choice,roll));
 const read=()=>invoke(`dndkeep_private.read_mutable_form('${character}','${id}')`);
 const next=()=>{const c=invoke(`public.psionic_turn_context_internal('${character}')`);invoke(`public.advance_psionic_solo_turn('${character}','${randomUUID()}',${c.soloTurn})`);turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;id=randomUUID();};
 test.beforeEach(()=>{
  [owner,other,character,id]=Array.from({length:4},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@mutable.local','{}'),('${other}','${other}@mutable.local','{}');
   insert into characters(id,user_id,name,species,class_name,subclass,background,level,intelligence,class_resources,hit_dice_spent) values('${character}','${owner}','Mutable Form','Human','Psion','Metamorph','Sage',7,16,'{"psionic-energy-dice":6}',0);`);
  turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;
 });
 test.afterEach(()=>sql(`delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}')`));
 test('saves the roll, original ability inputs and one action/payment; exact retry does not pay again',()=>{
  expect(begin()).toMatchObject({base_roll:2,duration_seconds:60,ability_context:{intelligence:16},replayed:false,energy_receipt:{remaining:5}});
  expect(begin().replayed).toBe(true);expect(()=>begin(false,null,3)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('1');
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
  expect(read().remainingSeconds).toBe(60);
 });
 test('Flesh Weaver spends two dice but saves only one rolled face',()=>{
  expect(begin(true)).toMatchObject({base_roll:2,energy_receipt:{remaining:4}});
  expect(invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`)).toMatchObject({originalRolls:[2],total:2});
 });
 test('failed payment rolls back the Bonus Action and permits a corrected affordable request',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":1}' where id='${character}'`);
  expect(()=>begin(true)).toThrow();expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('0');
  expect(begin().energy_receipt.remaining).toBe(0);
 });
 test('another request cannot reuse the Bonus Action',()=>{begin();id=randomUUID();expect(()=>begin()).toThrow();expect(sql(`select count(*) from dndkeep_private.mutable_form_declarations where character_id='${character}'`)).toBe('1');});
 test('level boundaries and illegal choices do not spend resources',()=>{
  for(const level of [2,5]){sql(`update characters set level=${level},class_resources='{"psionic-energy-dice":4}' where id='${character}'`);expect(()=>begin(true)).toThrow();}
  sql(`update characters set level=10 where id='${character}'`);
  for(const choice of [null,{kind:'stony',resistance:'Psychic'},{kind:'stride',resistance:'Acid'},{kind:'unknown'}])expect(()=>begin(false,choice)).toThrow();
  expect(begin(false,{kind:'stony',resistance:'Fire'}).duration_seconds).toBe(600);
 });
 test('secondary Psion level determines eligibility and duration',()=>{
  sql(`update characters set class_name='Fighter',subclass='Champion',level=10,secondary_class='Psion',secondary_subclass='Metamorph',secondary_level=3,class_resources='{"psionic-energy-dice":4}' where id='${character}'`);
  expect(()=>begin(true)).toThrow();expect(begin()).toMatchObject({psion_level:3,duration_seconds:60});
 });
 test('a new activation replaces the old form without refreshing it on replay',()=>{
  begin();const old=id;next();begin(true);
  const prior=invoke(`dndkeep_private.read_mutable_form('${character}','${old}')`);expect(prior).toMatchObject({ended_reason:'replaced',remainingSeconds:0});
  expect(begin(true).replayed).toBe(true);expect(read().remainingSeconds).toBe(60);
 });
 test('uses game time and expires exactly at the boundary',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+59 where character_id='${character}'`);
  expect(read().remainingSeconds).toBe(1);invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);expect(read().remainingSeconds).toBe(1);
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+1 where character_id='${character}'`);expect(read().remainingSeconds).toBe(0);
 });
 test('Restoration consumes one minute from the ten-minute form',()=>{
  sql(`update characters set level=10 where id='${character}'`);begin(false,{kind:'stride'});
  invoke(`public.settle_psionic_energy('${character}','${randomUUID()}','restore',0,'{}','Psionic Restoration')`);expect(read().remainingSeconds).toBe(540);
 });
 test('a completed short rest ends the ten-minute form',()=>{
  sql(`update characters set level=10 where id='${character}'`);begin(false,{kind:'stride'});
  const row=JSON.parse(sql(`select to_jsonb(c) from characters c where id='${character}'`));
  const fields=['spell_slots','class_resources','feature_uses'];
  const expected=Object.fromEntries([...fields,'class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'].map(k=>[k,row[k]]));
  const updates=Object.fromEntries(fields.map(k=>[k,row[k]??{}]));
  invoke(`public.complete_psionic_rest('${character}','${randomUUID()}','short','${JSON.stringify(expected)}','${JSON.stringify(updates)}')`);
  expect(read()).toMatchObject({remainingSeconds:0,ended_reason:'rest'});
 });
 test('expired forms cannot spend enhancement Hit Dice',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+60 where character_id='${character}'`);
  expect(()=>invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });
 test('unknown/rewound game clock does not claim an effect is active',()=>{
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=20 where character_id='${character}'`);begin();
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=19 where character_id='${character}'`);expect(read().remainingSeconds).toBeNull();
 });
 test('links Surge once and preserves its roll on replay',()=>{
  begin();const enhancement=randomUUID(),q=`dndkeep_private.enhance_mutable_form('${character}','${id}','${enhancement}','surge',null,6)`;
  expect(invoke(q)).toMatchObject({total:4,hitDiceSpent:1});expect(invoke(q).replayed).toBe(true);
  const q2=`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`;
  expect(invoke(q2)).toMatchObject({originalRolls:[2],rolls:[4],total:4});expect(invoke(q2)).toEqual(read().roll_result);
  expect(()=>invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
 });
 test('Enkindled and Surge use saved faces without charging extra Energy Dice',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}' where id='${character}'`);begin(true,{kind:'flexibility'});
  invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','enkindled',array[6,9],null)`);
  invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','surge',null,6)`);
  expect(invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`)).toMatchObject({originalRolls:[2,6,9],total:19});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('10');
 });
 test('ownership, direct execution privileges and table privacy are enforced',()=>{
  begin();expect(()=>invoke(`dndkeep_private.read_mutable_form('${character}','${id}')`,other)).toThrow();
  expect(sql(`select has_function_privilege('anon','dndkeep_private.begin_mutable_form(uuid,uuid,text,integer,boolean,jsonb)','execute'),has_function_privilege('authenticated','dndkeep_private.begin_mutable_form(uuid,uuid,text,integer,boolean,jsonb)','execute'),has_table_privilege('authenticated','dndkeep_private.mutable_form_declarations','select')`)).toBe('f|f|f');
 });
 test('concurrent identical requests commit one payment and one Bonus Action',async()=>{
  const query=asUser(owner,expression());
  const results=await Promise.all([1,2].map(()=>promisify(execFile)('docker',[...args,'-c',query],{encoding:'utf8'})));
  const receipts=results.map(r=>JSON.parse(r.stdout.trim()));expect(receipts.filter(r=>r.replayed)).toHaveLength(1);
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('5');
 });
});
