import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});}
test.describe('Standalone concentration ledger',()=>{
 gateDbSuite();let owner:string,other:string,character:string,request:string,campaign:string;
 test.beforeEach(()=>{
  [owner,other,character,request,campaign]=Array.from({length:5},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@save.local','{}'),('${other}','${other}@save.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,secondary_class,secondary_level,constitution,
    saving_throw_proficiencies,concentration_spell,concentration_rounds_remaining,concentration_slot_level,current_hp,max_hp,nat_1_20_saves)
   values('${character}','${owner}','Solo Psion','Human','Psion','Sage',3,'Fighter',2,14,array['constitution'],'Fly',10,3,20,20,false);`);
 });
 test.afterEach(()=>sql(`delete from action_logs where character_id='${character}';delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`));
 const snapshot=()=>sql(`select jsonb_build_object('concentration_spell',concentration_spell,'concentration_revision',concentration_revision,
  'constitution',constitution,'inventory',inventory,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,
  'saving_throw_proficiencies',saving_throw_proficiencies,'gained_feats',gained_feats,'nat_1_20_saves',nat_1_20_saves) from characters where id='${character}'`);
 const queue=(id=request,damage=5,expected=snapshot())=>`select queue_standalone_concentration_save('${character}','${id}',${damage},2,'${expected}'::jsonb)`;
 const settle=(dice='array[3]',id=request)=>`select settle_standalone_concentration_save('${character}','${id}',${dice})`;
 const run=(q:string,user=owner)=>JSON.parse(sql(auth(user,q)));
 const spell=()=>sql(`select concentration_spell from characters where id='${character}'`);
 const war=()=>sql(`update characters set gained_feats=array['War Caster'] where id='${character}'`);
 test('queue records total-level proficiency, capped DC and War Caster without changing HP',()=>{
  war();expect(run(queue(request,80))).toMatchObject({dc:30,save_bonus:5,has_advantage:true,damage:80,outcome:null,replayed:false});
  expect(sql(`select current_hp from characters where id='${character}'`)).toBe('20');expect(spell()).toBe('Fly');
 });
 test('exact creation retries return the same row and changed requests are rejected',()=>{
  const q=queue();const first=run(q);expect(run(q)).toMatchObject({...first,replayed:true});
  expect(()=>run(queue(request,8))).toThrow(/request changed/);
  expect(run(`select get_standalone_concentration_saves('${character}')`).pending).toHaveLength(1);
 });
 test('stale creation cannot silently bind to a later casting',()=>{
  const q=queue();sql(`update characters set concentration_spell='Fly' where id='${character}'`);
  expect(()=>run(q)).toThrow(/Character changed/);
  expect(run(`select get_standalone_concentration_saves('${character}')`).pending).toEqual([]);
 });
 test('multiple damage checks remain independently recoverable after reads',()=>{
  const next=randomUUID();run(queue());run(queue(next,20));
  const pending=run(`select get_standalone_concentration_saves('${character}')`).pending;
  expect(pending.map((r:{request_id:string})=>r.request_id).sort()).toEqual([request,next].sort());
  run(settle('array[20]'));expect(run(`select get_standalone_concentration_saves('${character}')`).pending).toHaveLength(1);
 });
 test('failed save clears the spell, duration and slot and writes one result in both logs',()=>{
  run(queue());const result=run(settle());expect(result).toMatchObject({outcome:'failed',reason:'save',rolls:[3],d20:3,total:8,replayed:false});
  expect(result.character).toMatchObject({concentration_spell:'',concentration_rounds_remaining:null,concentration_slot_level:null,concentration_casting_context:null});
  expect(run(settle('array[20]'))).toMatchObject({outcome:'failed',rolls:[3],replayed:true});
  expect(sql(`select count(*) from action_logs where id='${request}'`)).toBe('1');expect(sql(`select count(*) from character_history where id='${request}'`)).toBe('1');
 });
 test('passing advantage keeps both dice and captured bonus after feat/stat changes',()=>{
  war();run(queue());sql(`update characters set gained_feats=array[]::text[],constitution=30 where id='${character}'`);
  expect(run(settle('array[1,17]'))).toMatchObject({outcome:'passed',rolls:[1,17],d20:17,total:22,bonus:5,advantage:true});expect(spell()).toBe('Fly');
 });
 for(const natural of [false,true])test(`selected natural twenty follows captured house rule ${natural}`,()=>{
  war();sql(`update characters set nat_1_20_saves=${natural} where id='${character}'`);run(queue(request,80));
  expect(run(settle('array[1,20]'))).toMatchObject({outcome:natural?'passed':'failed',d20:20,total:25});
 });
 for(const replacement of ['Fly','Invisibility'])test(`later ${replacement} casting retires the old save without a new die`,()=>{
  run(queue());sql(`update characters set concentration_spell='${replacement}' where id='${character}'`);
  expect(run(settle('null'))).toMatchObject({outcome:'obsolete',rolls:null,d20:null});expect(spell()).toBe(replacement);
  expect(sql(`select count(*) from action_logs where id='${request}'`)).toBe('0');
 });
 test('joining a campaign retires a solo check rather than applying it to campaign state',()=>{
  run(queue());sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Joined');update characters set campaign_id='${campaign}' where id='${character}'`);
  expect(run(settle('null'))).toMatchObject({outcome:'obsolete'});expect(spell()).toBe('Fly');expect(()=>run(queue(randomUUID()))).toThrow(/Use campaign/);
 });
 test('racing clients share one recorded result',async()=>{
  run(queue());const results=await Promise.all([parallel(auth(owner,settle('array[3]'))),parallel(auth(owner,settle('array[20]')))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);const receipts=results.map(r=>JSON.parse(r.out));
  expect(receipts[0].rolls).toEqual(receipts[1].rolls);expect(receipts.map(r=>r.replayed).sort()).toEqual([false,true]);
  expect(sql(`select count(*) from action_logs where id='${request}'`)).toBe('1');
 });
 test('two failing hits clear one casting once and retire the other',async()=>{
  const next=randomUUID();run(queue());run(queue(next));
  const results=await Promise.all([parallel(auth(owner,settle())),parallel(auth(owner,settle('array[2]',next)))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).outcome).sort()).toEqual(['failed','obsolete']);
  expect(sql(`select count(*) from action_logs where character_id='${character}'`)).toBe('1');
 });
 test('invalid dice cannot resolve or discard a pending check',()=>{
  war();run(queue());for(const dice of ['null','array[1]','array[0,21]','array[1,null]','array[[1,2]]'])expect(()=>run(settle(dice))).toThrow(/Invalid concentration dice/);
  expect(run(`select get_standalone_concentration_saves('${character}')`).pending).toHaveLength(1);expect(spell()).toBe('Fly');
 });
 for(const condition of ['hp','Stunned'])test(`incapacitation (${condition}) ends concentration without a die`,()=>{
  run(queue());sql(`update characters set ${condition==='hp'?'current_hp=0':"active_conditions=array['Stunned']"} where id='${character}'`);
  expect(run(settle('null'))).toMatchObject({outcome:'failed',reason:'incapacitated',rolls:null,d20:null,total:null});expect(spell()).toBe('');
 });
 test('outsiders, anonymous callers and direct ledger reads are denied',()=>{
  const q=queue();run(q);for(const query of [q,settle(),`select get_standalone_concentration_saves('${character}')`])expect(()=>run(query,other)).toThrow(/unavailable/);
  expect(()=>sql(`set role anon;${settle()}`)).toThrow(/permission denied/);
  expect(()=>sql(auth(owner,'select * from dndkeep_private.standalone_concentration_saves'))).toThrow(/permission denied/);
 });
 for(const table of ['action_logs','character_history'])test(`${table} failure rolls back spell, receipt and every history write`,()=>{
  run(queue());const trigger='test_solo_'+request.replaceAll('-','');
  try{
   sql(`create function public.${trigger}() returns trigger language plpgsql as $$begin if new.id='${request}' then raise exception 'injected log failure';end if;return new;end;$$;
    create trigger ${trigger} before insert on ${table} for each row execute function public.${trigger}();`);
   expect(()=>run(settle())).toThrow(/injected log failure/);expect(spell()).toBe('Fly');
   expect(run(`select get_standalone_concentration_saves('${character}')`).pending).toHaveLength(1);
   expect(sql(`select count(*) from action_logs where id='${request}'`)).toBe('0');
  }finally{sql(`drop trigger if exists ${trigger} on ${table};drop function if exists public.${trigger}();`);}
  expect(run(settle())).toMatchObject({outcome:'failed',replayed:false});
 });
});
