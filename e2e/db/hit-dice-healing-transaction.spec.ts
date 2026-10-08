import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});}
test.describe('Atomic Hit Dice healing (local stack)',()=>{
 gateDbSuite();let owner:string,other:string,character:string;
 test.beforeEach(()=>{
  owner=randomUUID();other=randomUUID();character=randomUUID();
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@healing.local','{}'),('${other}','${other}@healing.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,constitution,current_hp,max_hp,hit_dice_spent)
    values('${character}','${owner}','Healing fixture','Human','Psion','Sage',5,4,1,30,0);`);
 });
 test.afterEach(()=>sql(`delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`));
 const row=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${character}'`));
 const snapshot=()=>{const c=row();return Object.fromEntries(['current_hp','max_hp','hit_point_revision','psionic_hit_dice_revision','constitution','inventory'].map(k=>[k,c[k]]));};
 const request=(rolls=[1,6],die=6,modifier=-3,id=randomUUID(),expected=snapshot())=>
  `select public.spend_rest_hit_dice('${character}','${id}',${die},array[${rolls}]::integer[],${modifier},'${JSON.stringify(expected)}')`;
 const counts=()=>sql(`select (select count(*) from dndkeep_private.hit_dice_healing_uses where character_id='${character}')||','||(select count(*) from character_history where character_id='${character}')||','||(select count(*) from combat_events where actor_id='${character}')`);
 test('applies the per-die minimum and records one payment and both history surfaces',()=>{
  const q=request();const result=JSON.parse(sql(auth(owner,q)));
  expect(result).toMatchObject({healing:4,gained:4,replayed:false,character:{current_hp:5,hit_dice_spent:2,hit_dice_spent_by_type:{'6':2},hit_point_revision:1,psionic_hit_dice_revision:1}});
  expect(JSON.parse(sql(auth(owner,q)))).toMatchObject({healing:4,gained:4,replayed:true});expect(counts()).toBe('1,1,1');
 });
 test('an exact retry after later damage returns current HP without another heal',()=>{
  const q=request();sql(auth(owner,q));sql(auth(owner,`update characters set current_hp=2 where id='${character}'`));
  expect(JSON.parse(sql(auth(owner,q)))).toMatchObject({gained:4,replayed:true,character:{current_hp:2,hit_point_revision:2,hit_dice_spent:2}});
  expect(counts()).toBe('1,1,1');
 });
 test('changed retries and unrelated callers cannot use a saved request',()=>{
  const id=randomUUID(),expected=snapshot(),q=request([1,6],6,-3,id,expected);sql(auth(owner,q));
  expect(()=>sql(auth(owner,request([2,6],6,-3,id,expected)))).toThrow(/does not match/);
  expect(()=>sql(auth(other,q))).toThrow(/Character is unavailable/);
  expect(()=>sql(`begin;set local role anon;${q};commit;`)).toThrow(/permission denied/);
  expect(counts()).toBe('1,1,1');expect(row().current_hp).toBe(5);
 });
 test('caps healing, supports a non-Psion pool and rejects an exhausted or wrong pool',()=>{
  sql(`update characters set class_name='Fighter',constitution=14,current_hp=29 where id='${character}'`);
  expect(JSON.parse(sql(auth(owner,request([10],10,2))))).toMatchObject({healing:12,gained:1,character:{current_hp:30,hit_dice_spent:1,hit_dice_spent_by_type:{'10':1}}});
  expect(()=>sql(auth(owner,request([1],10,2)))).toThrow(/maximum HP/);
  sql(`update characters set current_hp=20,hit_dice_spent=5 where id='${character}'`);
  expect(()=>sql(auth(owner,request([1],10,2)))).toThrow(/Not enough Hit Dice/);
  expect(()=>sql(auth(owner,request([1],6,2)))).toThrow(/Not enough Hit Dice/);
 });
 test('rejects zero HP and malformed rolls without spending or history',()=>{
  for(const rolls of [[],[0],[7],Array(21).fill(1)])expect(()=>sql(auth(owner,request(rolls)))).toThrow(/Invalid Hit Dice/);
  expect(()=>sql(auth(owner,request([1],6,11)))).toThrow(/Invalid Hit Dice/);
  sql(`update characters set current_hp=0 where id='${character}'`);
  expect(()=>sql(auth(owner,request([1])))).toThrow(/at least 1 HP/);expect(counts()).toBe('0,0,0');expect(row().hit_dice_spent).toBe(0);
 });
 test('rejects changed HP even when it returned to its old value',()=>{
  const q=request();sql(`update characters set current_hp=2 where id='${character}';update characters set current_hp=1 where id='${character}'`);
  expect(()=>sql(auth(owner,q))).toThrow(/Character changed/);expect(counts()).toBe('0,0,0');
 });
 for(const patch of ["max_hp=31","constitution=12","inventory='[]'","hit_dice_spent=1"])test(`rejects a stale snapshot after ${patch}`,()=>{
  if(patch.startsWith('inventory'))sql(`update characters set inventory='[{"id":"fixture","name":"Fixture item"}]' where id='${character}'`);
  const q=request();sql(`update characters set ${patch} where id='${character}'`);
  expect(()=>sql(auth(owner,q))).toThrow(/Character changed/);expect(counts()).toBe('0,0,0');
 });
 test('competing requests cannot both spend the last die or overwrite HP',async()=>{
  sql(`update characters set hit_dice_spent=4 where id='${character}'`);
  const results=await Promise.all([request([6]),request([6])].map(q=>parallel(auth(owner,q))));
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(row()).toMatchObject({current_hp:4,hit_dice_spent:5});expect(counts()).toBe('1,1,1');
 });
 test('simultaneous identical requests settle once',async()=>{
  const q=request();const results=await Promise.all([parallel(auth(owner,q)),parallel(auth(owner,q))]);
  expect(results.every(r=>r.code===0)).toBe(true);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(counts()).toBe('1,1,1');
 });
 test('a failed history insert rolls back HP, dice and ledger together',()=>{
  const id=randomUUID();sql(`insert into character_history(id,character_id,user_id,event_type,description) values('${id}','${character}','${owner}','roll','Fixture collision')`);
  expect(()=>sql(auth(owner,request([1],6,-3,id)))).toThrow(/duplicate key/);
  expect(row()).toMatchObject({current_hp:1,hit_dice_spent:0,hit_point_revision:0});expect(counts()).toBe('0,1,0');
 });
 test('the campaign DM can heal but authenticated callers cannot edit the ledger',()=>{
  const campaign=randomUUID();
  try{sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Healing fixture');update characters set campaign_id='${campaign}' where id='${character}'`);
   expect(JSON.parse(sql(auth(other,request()))).gained).toBe(4);
   expect(()=>sql(auth(owner,'select * from dndkeep_private.hit_dice_healing_uses'))).toThrow(/permission denied/);
  }finally{sql(`update characters set campaign_id=null where id='${character}';delete from campaigns where id='${campaign}'`);}
 });
 test('HP revisions are server-owned and ordinary saves keep invoker permissions',()=>{
  sql(auth(owner,`update characters set hit_point_revision=999,name='Renamed' where id='${character}'`));expect(row().hit_point_revision).toBe(0);
  sql(auth(owner,`update characters set temp_hp=3,hit_point_revision=0 where id='${character}'`));expect(row().hit_point_revision).toBe(1);
  sql(auth(owner,`select patch_character_preserving_psion('${character}','{"current_hp":3,"hit_point_revision":999}')`));expect(row()).toMatchObject({current_hp:3,hit_point_revision:2});
  expect(sql("select prosecdef from pg_proc where oid='public.refresh_hit_point_revision()'::regprocedure")).toBe('f');
 });
 test('mixed-class healing spends only the selected size and leaves Energy Dice alone',()=>{
  sql(`update characters set level=7,secondary_class='Fighter',secondary_level=3,constitution=10,hit_dice_spent=2,class_resources='{"psionic-energy-dice":4}' where id='${character}'`);
  sql(auth(owner,`select review_hit_dice_pool('${character}',${row().psionic_hit_dice_revision},'{"6":1,"10":1}')`));
  expect(JSON.parse(sql(auth(owner,request([10],10,0))))).toMatchObject({healing:10,gained:10,character:{hit_dice_spent:3,hit_dice_spent_by_type:{'6':1,'10':2},class_resources:{'psionic-energy-dice':4}}});
 });
 test('invalid allocation and multidimensional dice cannot create partial payments',()=>{
  sql(`update characters set level=7,secondary_class='Fighter',secondary_level=3,hit_dice_spent=2 where id='${character}'`);
  expect(()=>sql(auth(owner,request([1])))).toThrow(/Review which Hit Die sizes/);
  const q=request().replace('array[1,6]::integer[]','array[[1,6],[1,6]]::integer[]');
  expect(()=>sql(auth(owner,q))).toThrow(/Invalid Hit Dice/);expect(counts()).toBe('0,0,0');
 });
 test('new characters cannot supply a fabricated HP revision',()=>{
  const fresh=randomUUID();
  try{sql(auth(owner,`insert into characters(id,user_id,name,species,class_name,background,level,hit_point_revision) values('${fresh}','${owner}','Revision fixture','Human','Fighter','Sage',1,999)`));
   expect(sql(`select hit_point_revision from characters where id='${fresh}'`)).toBe('0');
  }finally{sql(`delete from characters where id='${fresh}'`);}
 });

});
