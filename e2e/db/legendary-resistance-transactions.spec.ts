import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic Legendary Resistance decisions',()=>{
 gateDbSuite();let dm:string,outsider:string,campaign:string,enc:string,target:string,attack:string,chain:string;
 test.beforeEach(()=>{
  [dm,outsider,campaign,enc,target,attack,chain]=Array.from({length:7},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@lr.local','{}'),('${outsider}','${outsider}@lr.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','LR transaction');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,legendary_resistance,legendary_resistance_used)
   values('${target}','${enc}','${campaign}','creature','${randomUUID()}','Target',0,1,0);commit;`);
  addAttack(attack);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from auth.users where id in('${dm}','${outsider}')`));
 function addAttack(id:string){sql(`insert into pending_attacks(id,campaign_id,encounter_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,save_dc,save_ability,save_success_effect,save_result,pending_lr_decision,state,chain_id)
  values('${id}','${campaign}','${enc}','Psion','character','${target}','Target','creature','spell','Mind Sliver','save',15,'INT','none','failed',true,'declared','${chain}')`);}
 const call=(accept=true,id=attack)=>`select decide_legendary_resistance('${id}',${accept})`;
 const run=(accept=true,id=attack,user=dm)=>JSON.parse(sql(auth(user,call(accept,id))));
 const used=()=>Number(sql(`select legendary_resistance_used from combat_participants where id='${target}'`));
 const events=()=>Number(sql(`select count(*) from combat_events where campaign_id='${campaign}' and event_type='legendary_resistance_used'`));
 test('acceptance spends once and replays the same final save',()=>{
  const first=run();expect(first).toMatchObject({id:attack,pending_lr_decision:false,save_result:'passed'});expect(run()).toEqual(first);
  expect(used()).toBe(1);expect(events()).toBe(1);expect(()=>run(false)).toThrow(/already decided differently/);
 });
 test('decline consumes no charge and cannot later become an acceptance',()=>{
  expect(run(false)).toMatchObject({pending_lr_decision:false,save_result:'failed'});expect(run(false).save_result).toBe('failed');
  expect(used()).toBe(0);expect(events()).toBe(0);expect(()=>run()).toThrow(/already decided differently/);
 });
 test('two tabs accepting the same attack spend only once',async()=>{
  const results=await Promise.all([parallel(auth(dm,call())),parallel(auth(dm,call()))]);expect(results.every(r=>r.code===0),JSON.stringify(results)).toBe(true);
  expect(used()).toBe(1);expect(events()).toBe(1);
 });
 test('two different saves cannot both spend the final charge',async()=>{
  const second=randomUUID();addAttack(second);
  const results=await Promise.all([parallel(auth(dm,call())),parallel(auth(dm,call(true,second)))]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('No Legendary Resistance charges remain');expect(used()).toBe(1);expect(events()).toBe(1);
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}' and pending_lr_decision`)).toBe('1');
 });
 test('exhausted acceptance leaves the failed save pending',()=>{
  sql(`update combat_participants set legendary_resistance_used=1 where id='${target}'`);expect(()=>run()).toThrow(/No Legendary Resistance/);
  expect(sql(`select pending_lr_decision from pending_attacks where id='${attack}'`)).toBe('t');expect(events()).toBe(0);
 });
 test('the existing in-lair allowance still permits one extra use',()=>{
  sql(`update combat_encounters set in_lair=true where id='${enc}';update combat_participants set legendary_resistance_used=1 where id='${target}'`);
  expect(run().save_result).toBe('passed');expect(used()).toBe(2);
 });
 test('outsiders cannot decide or replay another DM decision',()=>{
  expect(()=>run(true,attack,outsider)).toThrow(/Only this campaign DM/);run();expect(()=>run(true,attack,outsider)).toThrow(/Only this campaign DM/);
 });
 test('failure after the charge write rolls the entire decision back',()=>{
  sql(`alter table dndkeep_private.legendary_resistance_decisions add constraint lr_fixture_failure check(attack_id<>'${attack}'::uuid) not valid`);
  try {
   expect(()=>run()).toThrow(/lr_fixture_failure/);expect(used()).toBe(0);expect(events()).toBe(0);
   expect(sql(`select pending_lr_decision from pending_attacks where id='${attack}'`)).toBe('t');
  } finally {sql('alter table dndkeep_private.legendary_resistance_decisions drop constraint lr_fixture_failure');}
 });
 test('lair does not grant resistance to a creature with no base uses',()=>{
  sql(`update combat_encounters set in_lair=true where id='${enc}';update combat_participants set legendary_resistance=0 where id='${target}'`);
  expect(()=>run()).toThrow(/No Legendary Resistance/);expect(run(false).save_result).toBe('failed');expect(used()).toBe(0);
 });
 test('a cancelled attack cannot spend a charge',()=>{
  sql(`update pending_attacks set state='canceled' where id='${attack}'`);
  expect(()=>run()).toThrow(/no longer awaiting/);expect(used()).toBe(0);
 });
 test('hidden target resistance remains hidden in the combat log',()=>{
  sql(`update combat_participants set hidden_from_players=true where id='${target}'`);run();
  expect(sql(`select visibility from combat_events where campaign_id='${campaign}' and event_type='legendary_resistance_used'`)).toBe('hidden_from_players');
 });
});
