import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(q);});
test.describe('Manual HP transaction (local stack)',()=>{
 gateDbSuite();let owner:string,dm:string,other:string,character:string,campaign:string,request:string;
 test.beforeEach(()=>{
  [owner,dm,other,character,campaign,request]=Array.from({length:6},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@hp.local','{}'),('${dm}','${dm}@hp.local','{}'),('${other}','${other}@hp.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','HP fixture');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,current_hp,max_hp,temp_hp)
   values('${character}','${owner}','${campaign}','HP fixture','Human','Psion','Sage',10,20,4)`);
 });
 test.afterEach(()=>sql(`delete from characters where id='${character}';delete from campaigns where id='${campaign}';delete from auth.users where id in('${owner}','${dm}','${other}')`));
 const row=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${character}'`));
 const call=(mode='damage',amount=6,revision=row().hit_point_revision,id=request)=>`select adjust_character_hit_points_atomic('${character}','${id}','${mode}',${amount},${revision})`;
 const cancel=(q=call())=>q.replace('adjust_character_hit_points_atomic','cancel_hit_point_adjustment_atomic');
 test('cancels an unpaid adjustment durably without history or HP changes',()=>{
  const q=call();expect(JSON.parse(sql(auth(dm,cancel(q))))).toMatchObject({canceled:true,replayed:false});
  expect(JSON.parse(sql(auth(dm,cancel(q))))).toMatchObject({canceled:true,replayed:true});
  expect(()=>sql(auth(dm,q))).toThrow(/canceled/);expect(row()).toMatchObject({current_hp:10,temp_hp:4});
  expect(sql(`select count(*) from character_history where id='${request}'`)).toBe('0');
 });
 test('a stale rejected adjustment remains cancelable after HP changes',()=>{
  const q=call();sql(`update characters set current_hp=5 where id='${character}'`);
  expect(()=>sql(auth(dm,q))).toThrow(/HP changed/);expect(JSON.parse(sql(auth(dm,cancel(q)))).canceled).toBe(true);
 });
 test('already-paid adjustments cannot be canceled or refunded',()=>{
  const q=call();sql(auth(dm,q));expect(JSON.parse(sql(auth(dm,cancel(q)))).canceled).toBe(false);
  expect(JSON.parse(sql(auth(dm,q))).replayed).toBe(true);expect(row()).toMatchObject({current_hp:8,temp_hp:0});
 });
 test('cancellation enforces ownership and exact request identity',()=>{
  const q=call();expect(()=>sql(auth(other,cancel(q)))).toThrow(/unavailable/);sql(auth(dm,cancel(q)));
  expect(()=>sql(auth(dm,cancel(call('heal',6,0))))).toThrow(/request changed/);
 });
 test('concurrent cancel and adjustment produce one consistent result',async()=>{
  const q=call(),results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,cancel(q)))]);
  expect(results[1].code).toBe(0);const canceled=JSON.parse(results[1].out).canceled;
  expect(results[0].code===0).toBe(!canceled);expect(row()).toMatchObject(canceled?{current_hp:10,temp_hp:4}:{current_hp:8,temp_hp:0});
 });
 test('simultaneous cancellations acknowledge the same tombstone',async()=>{
  const q=cancel();const results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,q))]);
  expect(results.every(r=>r.code===0)).toBe(true);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
 });
 test('damage consumes temporary HP first and records one history entry',()=>{
  const receipt=JSON.parse(sql(auth(dm,call())));expect(receipt).toMatchObject({beforeHP:10,beforeTempHP:4,afterHP:8,afterTempHP:0,replayed:false});
  expect(row()).toMatchObject({current_hp:8,temp_hp:0,hit_point_revision:1});expect(sql(`select count(*) from character_history where id='${request}'`)).toBe('1');
 });
 test('setting zero works and preserves temporary HP',()=>{sql(auth(dm,call('set',0)));expect(row()).toMatchObject({current_hp:0,temp_hp:4});});
 test('explicit set can repair HP above a lowered maximum',()=>{
  sql(`update characters set max_hp=5 where id='${character}'`);sql(auth(dm,call('set',3)));expect(row()).toMatchObject({current_hp:3,max_hp:5,temp_hp:4});
 });
 test('healing caps safely even at the largest integer amount',()=>{sql(auth(owner,call('heal',2147483647)));expect(row()).toMatchObject({current_hp:20,temp_hp:4});});
 test('identical retries cannot apply a second adjustment',async()=>{
  const q=call();const results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,q))]);expect(results.every(r=>r.code===0)).toBe(true);
  expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(row()).toMatchObject({current_hp:8,temp_hp:0});
 });
 test('different concurrent adjustments cannot overwrite the captured HP state',async()=>{
  const first=call(),second=call('damage',7,0,randomUUID());const results=await Promise.all([parallel(auth(dm,first)),parallel(auth(dm,second))]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect([7,8]).toContain(row().current_hp);expect(row().hit_point_revision).toBe(1);
 });
 test('an old receipt returns current HP without undoing later damage',()=>{
  const first=call();sql(auth(dm,first));sql(auth(dm,call('damage',2,row().hit_point_revision,randomUUID())));
  const receipt=JSON.parse(sql(auth(dm,first)));expect(receipt).toMatchObject({afterHP:8,replayed:true,character:{current_hp:6}});expect(row().current_hp).toBe(6);
 });
 test('changed requests and unrelated callers cannot change HP',()=>{
  const first=call();expect(()=>sql(auth(other,first))).toThrow(/unavailable/);sql(auth(owner,first));
  expect(()=>sql(auth(owner,call('heal',6,0)))).toThrow(/request changed/);expect(row().current_hp).toBe(8);
 });
 for(const [mode,amount] of [['damage',0],['heal',0],['set',-1],['unknown',1]] as const)test(`rejects ${mode} ${amount}`,()=>{
  expect(()=>sql(auth(dm,call(mode,amount)))).toThrow(/whole-number/);expect(row()).toMatchObject({current_hp:10,temp_hp:4,hit_point_revision:0});
 });
 test('history failure rolls back HP and the receipt together',()=>{
  sql(`insert into character_history(id,character_id,user_id,event_type,field,description) values('${request}','${character}','${owner}','hp_change','current_hp','fixture')`);
  expect(()=>sql(auth(dm,call()))).toThrow();expect(row()).toMatchObject({current_hp:10,temp_hp:4});
  expect(sql(`select count(*) from dndkeep_private.manual_hit_point_adjustments where request_id='${request}'`)).toBe('0');
 });
 test('ledger is private and public RPC remains security invoker',()=>{
  expect(()=>sql(auth(owner,'select * from dndkeep_private.manual_hit_point_adjustments'))).toThrow(/permission denied/);
  expect(sql("select prosecdef from pg_proc where oid='public.adjust_character_hit_points_atomic(uuid,uuid,text,integer,bigint)'::regprocedure")).toBe('f');
 });
});
