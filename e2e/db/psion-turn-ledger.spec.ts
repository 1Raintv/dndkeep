import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const authenticated=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string;error:string}>(resolve=>{const child=spawn('docker',args);let out='',error='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(query);});}
test.describe('Persistent Psion turns',()=>{
 gateDbSuite();
 let owner:string,other:string,character:string;
 test.beforeEach(()=>{
  owner=randomUUID();other=randomUUID();character=randomUUID();
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@ledger.local','{}'),('${other}','${other}@ledger.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,hit_dice_spent,class_resources)
   values('${character}','${owner}','Turn ledger','Human','Psion','Sage',20,0,'{"psionic-energy-dice":10,"other":7}');commit;`);
 });
 test.afterEach(()=>{sql(`delete from action_logs where character_id='${character}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});
 const turn=(n=0)=>JSON.stringify({soloTurn:n});
 function spend(request=randomUUID(),context=turn(),count=2,base='array[1]',extra='array[2,3]'){
  return `select public.spend_enkindled_life_force('${character}','${request}','${context}'::jsonb,${count},${base},${extra},'Biofeedback')`;
 }
 const paid=()=>Number(sql(`select hit_dice_spent from characters where id='${character}'`));
 test('commits cost, saved rolls and history once; replay returns current resources',()=>{
  const request=randomUUID(),query=spend(request);
  const result=JSON.parse(sql(authenticated(owner,query)));expect(result).toMatchObject({extraRolls:[2,3],hitDiceSpent:2,replayed:false});
  expect(JSON.parse(sql(authenticated(owner,query)))).toMatchObject({hitDiceSpent:2,replayed:true});
  expect(sql(`select count(*) from action_logs where character_id='${character}' and action_name='Enkindled Life Force'`)).toBe('1');
  expect(JSON.parse(sql(authenticated(owner,`select public.get_enkindled_turn('${character}')`)))).toMatchObject({turn:{soloTurn:0},used:{requestId:request,extraRolls:[2,3]}});
  expect(()=>sql(authenticated(owner,spend()))).toThrow(/already used this turn/);
  expect(()=>sql(authenticated(owner,spend(request,turn(),1,'array[1]','array[3]')))).toThrow(/does not match/);
  sql(`update characters set hit_dice_spent=3 where id='${character}'`);
  expect(JSON.parse(sql(authenticated(owner,query))).hitDiceSpent).toBe(3);
  expect(JSON.parse(sql(`select class_resources from characters where id='${character}'`))).toEqual({'psionic-energy-dice':10,other:7});
 });
 test('rejects invalid eligibility and malformed dice without paying',()=>{
  for(const [count,base,extra] of [[0,'array[1]','array[2,3]'],[3,'array[1]','array[2,3,4]'],[2,'array[1]','array[2]'],[2,'array[0]','array[2,3]'],[2,'array[1]','array[2,13]'],[2,'array[1]','array[2,null]'],[2,'array[]::integer[]','array[2,3]']] as const){
   expect(()=>sql(authenticated(owner,spend(randomUUID(),turn(),count,base,extra)))).toThrow(/Invalid Enkindled dice/);
  }
  for(const change of ["level=19","class_name='Fighter'","secondary_class='Wizard',secondary_level=1"]){
   sql(`update characters set level=20,class_name='Psion',secondary_class=null,secondary_level=0 where id='${character}';update characters set ${change} where id='${character}'`);
   expect(()=>sql(authenticated(owner,spend()))).toThrow(/requires Psion level 20/);
  }
  expect(paid()).toBe(0);expect(sql(`select count(*) from psionic_feature_uses where character_id='${character}'`)).toBe('0');
  sql(`update characters set secondary_class=null,secondary_level=0,hit_dice_spent=19 where id='${character}'`);
  expect(()=>sql(authenticated(owner,spend()))).toThrow(/Not enough Hit Point Dice/);expect(paid()).toBe(19);
 });
 test('blocks unauthorized callers, internal helpers and direct ledger tampering',()=>{
  for(const query of [spend(),`select public.get_enkindled_turn('${character}')`,`select public.advance_psionic_solo_turn('${character}','${randomUUID()}',0)`])expect(()=>sql(authenticated(other,query))).toThrow(/Character is unavailable/);
  expect(()=>sql(authenticated(owner,`select public.psionic_character_for_update('${character}')`))).toThrow(/permission denied/);
  expect(()=>sql(authenticated(owner,`delete from public.psionic_feature_uses where character_id='${character}'`))).toThrow(/permission denied/);
  expect(()=>sql(`set role anon;select public.get_enkindled_turn('${character}')`)).toThrow(/permission denied/);
  expect(paid()).toBe(0);
 });
 test('competing tabs pay once and solo turn changes are idempotent',async()=>{
  const requests=[randomUUID(),randomUUID()];const results=await Promise.all(requests.map(id=>parallel(authenticated(owner,spend(id)+';select pg_sleep(0.1)'))));
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.filter(r=>r.code!==0)[0].error).toContain('already used this turn');expect(paid()).toBe(2);
  const advanceId=randomUUID(),advance=`select public.advance_psionic_solo_turn('${character}','${advanceId}',0)`;
  expect(sql(authenticated(owner,advance))).toBe('1');expect(sql(authenticated(owner,advance))).toBe('1');
  expect(()=>sql(authenticated(owner,`select public.advance_psionic_solo_turn('${character}','${randomUUID()}',0)`))).toThrow(/already changed/);
  expect(()=>sql(authenticated(owner,spend()))).toThrow(/turn changed/);
  expect(JSON.parse(sql(authenticated(owner,spend(randomUUID(),turn(1))))).hitDiceSpent).toBe(4);
 });
 test('simultaneous retries of one request share the saved roll and charge',async()=>{
  const query=spend(randomUUID());const results=await Promise.all([parallel(authenticated(owner,query)),parallel(authenticated(owner,query))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(paid()).toBe(2);
 });
 test('combat turn identity allows other actors turns and refuses solo reset',()=>{
  const campaign=randomUUID(),encounter=randomUUID(),participant=randomUUID();
  try{
   sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Ledger combat');update characters set campaign_id='${campaign}' where id='${character}';
    insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${character}','Turn ledger',0);`);
   const context=()=>JSON.parse(sql(authenticated(owner,`select public.get_enkindled_turn('${character}')`))).turn;
   const first=JSON.stringify(context());expect(JSON.parse(first)).toMatchObject({encounterId:encounter,round:1,index:0});
   // The campaign owner can operate a player's character, like existing combat permissions.
   expect(JSON.parse(sql(authenticated(other,spend(randomUUID(),first)))).hitDiceSpent).toBe(2);
   expect(()=>sql(authenticated(owner,`select public.advance_psionic_solo_turn('${character}','${randomUUID()}',0)`))).toThrow(/combat tracker/);
   sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);
   expect(()=>sql(authenticated(owner,spend(randomUUID(),first)))).toThrow(/turn changed/);
   expect(JSON.parse(sql(authenticated(owner,spend(randomUUID(),JSON.stringify(context()))))).hitDiceSpent).toBe(4);
   sql(`update combat_encounters set current_turn_index=0 where id='${encounter}'`);
   expect(context().turnId).not.toBe(JSON.parse(first).turnId);
   expect(JSON.parse(sql(authenticated(owner,spend(randomUUID(),JSON.stringify(context()))))).hitDiceSpent).toBe(6);
  }finally{sql(`delete from campaigns where id='${campaign}'`);}
 });
 test('history failure rolls back both the cost and the once-per-turn claim',()=>{
  const name='ledger_test_'+randomUUID().replaceAll('-','');
  try{
   sql(`create function public.${name}() returns trigger language plpgsql as $$begin if new.character_id='${character}'::uuid then raise exception 'ledger history fixture';end if;return new;end;$$;
    create trigger ${name} before insert on public.action_logs for each row execute function public.${name}();`);
   expect(()=>sql(authenticated(owner,spend()))).toThrow(/ledger history fixture/);expect(paid()).toBe(0);
   expect(()=>sql(authenticated(owner,surge()))).toThrow(/ledger history fixture/);expect(paid()).toBe(0);
   expect(sql(`select count(*) from psionic_surge_uses where character_id='${character}'`)).toBe('0');
   expect(sql(`select count(*) from psionic_feature_uses where character_id='${character}'`)).toBe('0');
  }finally{sql(`drop trigger if exists ${name} on public.action_logs;drop function if exists public.${name}();`);}
 });
 function surge(request=randomUUID(),rolls='array[1,3,6]'){
  return `select public.spend_psionic_surge('${character}','${request}',${rolls},'Biofeedback')`;
 }
 test('Surge adjusts every low die for one cost and permits distinct rolls in a turn',()=>{
  const request=randomUUID();const first=JSON.parse(sql(authenticated(owner,surge(request))));
  expect(first).toMatchObject({rolls:[4,4,6],total:14,hitDiceSpent:1,hitDiceRevision:1,replayed:false});
  expect(JSON.parse(sql(authenticated(owner,surge(request))))).toMatchObject({hitDiceSpent:1,replayed:true});
  expect(JSON.parse(sql(authenticated(owner,surge())))).toMatchObject({hitDiceSpent:2,hitDiceRevision:2});
  expect(()=>sql(authenticated(owner,surge(request,'array[2]')))).toThrow(/does not match/);
  expect(()=>sql(authenticated(other,surge()))).toThrow(/unavailable/);
  expect(sql(`select count(*) from action_logs where character_id='${character}' and action_name='Psionic Surge'`)).toBe('2');
 });
 test('concurrent Enkindled and Surge preserve both charges and ordered receipts',async()=>{
  const enkindledId=randomUUID(),surgeId=randomUUID();
  const results=await Promise.all([parallel(authenticated(owner,spend(enkindledId))),parallel(authenticated(owner,surge(surgeId)))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(paid()).toBe(3);
  expect(results.map(r=>JSON.parse(r.out).hitDiceRevision).sort()).toEqual([1,2]);
  expect(JSON.parse(sql(authenticated(owner,spend(enkindledId))))).toMatchObject({hitDiceSpent:3,hitDiceRevision:2,replayed:true});
 });
 test('competing enhancements cannot both spend the last Hit Point Die',async()=>{
  sql(`update characters set hit_dice_spent=19 where id='${character}'`);
  const results=await Promise.all([parallel(authenticated(owner,spend(randomUUID(),turn(),1,'array[1]','array[2]'))),parallel(authenticated(owner,surge()))]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.filter(r=>r.code!==0)[0].error).toContain('Not enough Hit Point Dice');expect(paid()).toBe(20);
  expect(sql(`select count(*) from action_logs where character_id='${character}'`)).toBe('1');
 });
 test('Surge validates level, die size, low rolls and multiclass Hit Point Dice',()=>{
  sql(`update characters set level=6 where id='${character}'`);expect(()=>sql(authenticated(owner,surge()))).toThrow(/requires Psion level 7/);
  sql(`update characters set level=7 where id='${character}'`);
  for(const rolls of ['array[1,9]','array[4,5]','array[null]::integer[]','array[]::integer[]'])expect(()=>sql(authenticated(owner,surge(randomUUID(),rolls)))).toThrow(/Invalid Psionic Surge dice/);
  sql(`update characters set secondary_class='Fighter',secondary_level=3,hit_dice_spent=9 where id='${character}'`);
  expect(JSON.parse(sql(authenticated(owner,surge()))).hitDiceSpent).toBe(10);
  expect(()=>sql(authenticated(owner,surge()))).toThrow(/Not enough Hit Point Dice/);
 });

});
