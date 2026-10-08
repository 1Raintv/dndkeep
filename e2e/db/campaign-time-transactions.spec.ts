import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic campaign time',()=>{
 gateDbSuite();let dm:string,player:string,campaign:string,char:string,cb:string,monster:string,request:string;
 const buffs=JSON.stringify([{id:'timed',duration:20},{id:'expired',duration:1},{id:'indefinite',duration:-1},{id:'rider'},{id:'text',duration:'10'}]);
 test.beforeEach(()=>{
  [dm,player,campaign,char,cb,monster,request]=Array.from({length:7},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@clock.local','{}'),('${player}','${player}@clock.local','{}');
   insert into campaigns(id,owner_id,name,seconds_per_round) values('${campaign}','${dm}','Time fixture',6);
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,active_buffs) values('${char}','${player}','${campaign}','Clock','Human','Psion','Sage','${buffs}');
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,active_buffs) values('${cb}','${campaign}','${player}','Clock','character','${char}',20,20,'${buffs}');
   insert into homebrew_monsters(id,campaign_id,name,active_buffs) values('${monster}','${campaign}','Clock creature','${buffs}');commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from homebrew_monsters where id='${monster}';delete from auth.users where id in('${dm}','${player}')`));
 const call=(id=request,unit='seconds',amount=60,scale=6)=>`select advance_campaign_time('${campaign}','${id}','${unit}',${amount},${scale})`;
 const run=(q=call(),user=dm)=>JSON.parse(sql(auth(user,q)));
 const clock=()=>Number(sql(`select combat_rounds_elapsed from campaigns where id='${campaign}'`));
 const readBuffs=(table='characters',id=char)=>JSON.parse(sql(`select active_buffs from ${table} where id='${id}'`));
 test('advances the clock and all buff stores together preserving indefinite and untyped riders',()=>{
  expect(run()).toMatchObject({requestId:request,campaignId:campaign,beforeRounds:0,afterRounds:10,advancedRounds:10,secondsPerRound:6,replayed:false});
  const expected=[{id:'timed',duration:10},{id:'indefinite',duration:-1},{id:'rider'},{id:'text',duration:'10'}];
  expect(readBuffs()).toEqual(expected);expect(readBuffs('combatants',cb)).toEqual(expected);expect(readBuffs('homebrew_monsters',monster)).toEqual(expected);
  expect(sql(`select elapsed_seconds from dndkeep_private.psionic_duration_clocks where character_id='${char}'`)).toBe('60');
 });
 test('a lost-response replay preserves its original receipt without ticking later buffs',()=>{
  const first=run();run(call(randomUUID(),'rounds',2));expect(run()).toEqual({...first,replayed:true});expect(clock()).toBe(12);expect(readBuffs()[0].duration).toBe(8);
 });
 test('racing identical requests advance once',async()=>{
  const results=await Promise.all([parallel(auth(dm,call())),parallel(auth(dm,call()))]);
  expect(results.map(r=>({code:r.code,error:r.error}))).toEqual([{code:0,error:''},{code:0,error:''}]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(clock()).toBe(10);
 });
 test('racing independent requests preserve both increments and buff ticks',async()=>{
  const results=await Promise.all([parallel(auth(dm,call(request,'rounds',2))),parallel(auth(dm,call(randomUUID(),'rounds',3)))]);
  expect(results.every(r=>r.code===0),JSON.stringify(results)).toBe(true);expect(clock()).toBe(5);expect(readBuffs()[0].duration).toBe(15);
 });
 test('rejects changed saved requests and stale time scales but permits an exact old replay',()=>{
  run();expect(()=>run(call(request,'rounds',1))).toThrow(/Saved campaign time request changed/);
  sql(`update campaigns set seconds_per_round=10 where id='${campaign}'`);
  expect(()=>run(call(randomUUID()))).toThrow(/time scale changed/);expect(run().replayed).toBe(true);expect(clock()).toBe(10);
 });
 test('player membership does not authorize clock writes or saved receipt reads',()=>{
  run();expect(()=>run(call(),player)).toThrow(/only to its DM/);
  expect(()=>sql(`begin;set local role anon;${call()};commit;`)).toThrow(/permission denied/);
  expect(()=>sql(auth(dm,'select * from dndkeep_private.campaign_time_events'))).toThrow(/permission denied/);expect(clock()).toBe(10);
 });
 test('invalid intervals do not move time and a short interval never silently rounds to zero',()=>{
  for(const amount of [0,-1,86401])expect(()=>run(call(request,'seconds',amount))).toThrow(/Invalid campaign time request/);
  sql(`update campaigns set seconds_per_round=600 where id='${campaign}'`);
  expect(()=>run(call(request,'seconds',60,600))).toThrow(/shorter than one round/);expect(clock()).toBe(0);
 });
 test('malformed later buff data rolls back earlier character writes and the clock',()=>{
  sql(`update homebrew_monsters set active_buffs='{}' where id='${monster}'`);
  expect(()=>run()).toThrow(/Check campaign buff data/);expect(clock()).toBe(0);expect(readBuffs()).toEqual(JSON.parse(buffs));expect(readBuffs('combatants',cb)).toEqual(JSON.parse(buffs));
  expect(sql(`select count(*) from dndkeep_private.campaign_time_events where campaign_id='${campaign}'`)).toBe('0');
 });
 test('prunes only expired campaign immunities in the same transaction',()=>{
  sql(`insert into campaign_condition_immunities(campaign_id,target_type,target_id,source_kind,source_id,expires_at_rounds)
   values('${campaign}','character','${char}','feature','expired',10),('${campaign}','character','${char}','feature','future',11),('${campaign}','character','${char}','feature','forever',null)`);
  run();expect(sql(`select string_agg(source_id,',' order by source_id) from campaign_condition_immunities where campaign_id='${campaign}'`)).toBe('forever,future');
 });
 test('uses the current configured scale and keeps an explicit round request exact',()=>{
  sql(`update campaigns set seconds_per_round=10 where id='${campaign}'`);
  expect(run(call(request,'seconds',60,10)).advancedRounds).toBe(6);
  expect(run(call(randomUUID(),'rounds',1,10)).afterRounds).toBe(7);
  expect(sql(`select elapsed_seconds from dndkeep_private.psionic_duration_clocks where character_id='${char}'`)).toBe('70');
 });
 test('does not lose an unrelated buff committed while waiting for its row lock',async()=>{
  const update=parallel(`begin;update characters set active_buffs=active_buffs||'[{"id":"new","duration":30}]'::jsonb where id='${char}';select pg_sleep(0.3);commit;`);
  const tick=parallel(auth(dm,call()));const results=await Promise.all([update,tick]);
  expect(results.every(r=>r.code===0),JSON.stringify(results)).toBe(true);
  // Regardless of which transaction wins the lock, no array overwrite loses the new rider.
  expect(readBuffs().find((b:{id:string})=>b.id==='new')).toBeTruthy();expect(clock()).toBe(10);
 });
 test('canceling first fences delayed requests without advancing anything',()=>{
  const cancel=call().replace('advance_campaign_time','cancel_campaign_time');expect(run(cancel).canceled).toBe(true);expect(run(cancel).canceled).toBe(true);
  expect(()=>run()).toThrow(/canceled/);expect(clock()).toBe(0);expect(readBuffs()).toEqual(JSON.parse(buffs));
 });
 test('canceling after commit keeps the applied clock and original receipt',()=>{
  const first=run();expect(run(call().replace('advance_campaign_time','cancel_campaign_time')).canceled).toBe(false);expect(run()).toEqual({...first,replayed:true});expect(clock()).toBe(10);
 });
 test('cancel and advance races cannot leave an unfenced late request',async()=>{
  const results=await Promise.all([parallel(auth(dm,call())),parallel(auth(dm,call().replace('advance_campaign_time','cancel_campaign_time')))]);
  const canceled=JSON.parse(results[1].out).canceled;
  if(canceled){expect(clock()).toBe(0);expect(()=>run()).toThrow(/canceled/);}else{expect(clock()).toBe(10);expect(run().replayed).toBe(true);}
 });
 test('clock overflow rolls back the entire request',()=>{
  sql(`update campaigns set combat_rounds_elapsed=2147483647 where id='${campaign}'`);
  expect(()=>run()).toThrow(/clock limit reached/);expect(readBuffs()).toEqual(JSON.parse(buffs));
 });
});
