import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});}
test.describe('Hit Dice allocation (local stack)',()=>{
 gateDbSuite();let owner:string,other:string,character:string;
 test.beforeEach(()=>{
  owner=randomUUID();other=randomUUID();character=randomUUID();
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@hitdice.local','{}'),('${other}','${other}@hitdice.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,secondary_class,secondary_level,hit_dice_spent) values('${character}','${owner}','Hit Dice fixture','Human','Psion','Sage',7,'Fighter',3,2);`);
 });
 test.afterEach(()=>sql(`delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`));
 const row=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${character}'`));
 const review=(counts:Record<string,number>,revision=0)=>`select public.review_hit_dice_pool('${character}',${revision},'${JSON.stringify(counts)}')`;
 test('owner review preserves total spending and exact retries do not advance revision',()=>{
  const request=review({'6':1,'10':1});sql(auth(owner,request));
  expect(row()).toMatchObject({hit_dice_spent:2,hit_dice_spent_by_type:{'6':1,'10':1},psionic_hit_dice_revision:1});
  sql(auth(owner,request));expect(row().psionic_hit_dice_revision).toBe(1);
 });
 test('rejects unauthorized and malformed allocation without altering resources',()=>{
  expect(()=>sql(auth(other,review({'6':2})))).toThrow(/Character is unavailable/);
  for(const counts of [{'6':1},{'10':4,'6':-2},{'6':2.5,'10':-0.5},{'8':2}])expect(()=>sql(auth(owner,review(counts)))).toThrow();
  expect(row()).toMatchObject({hit_dice_spent:2,hit_dice_spent_by_type:null,psionic_hit_dice_revision:0});
 });
 test('two different reviews from the same revision cannot both replace allocation',async()=>{
  const results=await Promise.all([review({'6':2}),review({'10':2})].map(query=>parallel(auth(owner,query))));
  expect(results.filter(result=>result.code===0)).toHaveLength(1);expect(row().psionic_hit_dice_revision).toBe(1);
 });
 test('old-client aggregate updates invalidate allocation and a Long Rest clears it',()=>{
  sql(auth(owner,review({'6':2})));
  sql(auth(owner,`update characters set hit_dice_spent=3 where id='${character}'`));
  expect(row()).toMatchObject({hit_dice_spent:3,hit_dice_spent_by_type:null,psionic_hit_dice_revision:2});
  expect(()=>sql(auth(owner,review({'6':3})))).toThrow(/Hit Dice changed/);
  sql(auth(owner,`update characters set hit_dice_spent=0 where id='${character}'`));
  expect(row()).toMatchObject({hit_dice_spent:0,hit_dice_spent_by_type:{},psionic_hit_dice_revision:3});
 });
 test('class changes invalidate prior allocation and old reviews',()=>{
  sql(auth(owner,review({'6':2})));
  sql(auth(owner,`update characters set secondary_class='Cleric' where id='${character}'`));
  expect(row()).toMatchObject({hit_dice_spent_by_type:null,psionic_hit_dice_revision:2});
  expect(()=>sql(auth(owner,review({'6':2},1)))).toThrow(/Hit Dice changed/);
 });
 test('ordinary edits do not create a resource revision on an untouched zero pool',()=>{
  const fresh=randomUUID();
  try{
   sql(`insert into characters(id,user_id,name,species,class_name,background,level,hit_dice_spent) values('${fresh}','${owner}','Untouched pool','Human','Psion','Sage',7,0)`);
   const saved=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${fresh}'`));
   expect(saved()).toMatchObject({hit_dice_spent_by_type:null,psionic_hit_dice_revision:0});
   sql(auth(owner,`update characters set name='Renamed fixture' where id='${fresh}'`));
   expect(saved()).toMatchObject({hit_dice_spent_by_type:null,psionic_hit_dice_revision:0});
  }finally{sql(`delete from characters where id='${fresh}'`);}

 });
 test('campaign DM can review another characters allocation',()=>{
  const campaign=randomUUID();
  try{sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Dice fixture');update characters set campaign_id='${campaign}' where id='${character}'`);
   expect(JSON.parse(sql(auth(other,review({'10':2})))).hit_dice_spent_by_type).toEqual({'6':0,'10':2});
  }finally{sql(`update characters set campaign_id=null where id='${character}';delete from campaigns where id='${campaign}'`);}
 });
 const surge=(die:number,id=randomUUID())=>`select public.spend_psionic_surge_from_pool('${character}','${id}',array[1,5],'Telekinetic Propel',${die})`;
 test('Surge spends the selected size exactly once and rejects a changed retry',()=>{
  sql(auth(owner,review({'6':1,'10':1})));const id=randomUUID(),request=surge(10,id);
  const receipt=JSON.parse(sql(auth(owner,request)));
  expect(receipt).toMatchObject({rolls:[4,5],total:9,hitDiceSpent:3,hitDiceSpentByType:{'6':1,'10':2},replayed:false});
  expect(JSON.parse(sql(auth(owner,request)))).toMatchObject({hitDiceSpent:3,replayed:true});
  expect(()=>sql(auth(owner,surge(6,id)))).toThrow(/does not match/);
  expect(sql(`select count(*) from action_logs where character_id='${character}' and action_name='Psionic Surge'`)).toBe('1');
 });
 test('Surge requires legacy allocation review and refuses unavailable sizes',()=>{
  expect(()=>sql(auth(owner,surge(10)))).toThrow(/Review which/);
  sql(auth(owner,review({'6':2})));
  expect(()=>sql(auth(owner,surge(8)))).toThrow(/selected pool/);
  expect(()=>sql(auth(other,surge(6)))).toThrow();expect(row().hit_dice_spent).toBe(2);
 });
 test('the first selected spend from an empty pool records its size',()=>{
  sql(`update characters set hit_dice_spent=0 where id='${character}'`);
  expect(JSON.parse(sql(auth(owner,surge(10))))).toMatchObject({hitDiceSpent:1,hitDiceSpentByType:{'6':0,'10':1}});
 });
 test('competing Surge requests cannot both spend the last die in a pool',async()=>{
  sql(`update characters set hit_dice_spent=9 where id='${character}'`);
  sql(auth(owner,review({'6':6,'10':3},row().psionic_hit_dice_revision)));
  const results=await Promise.all([surge(6),surge(6)].map(query=>parallel(auth(owner,query))));
  expect(results.filter(result=>result.code===0)).toHaveLength(1);
  expect(row()).toMatchObject({hit_dice_spent:10,hit_dice_spent_by_type:{'6':7,'10':3}});
 });
 test('private helpers are not callable by authenticated clients',()=>{
  expect(sql(`select has_function_privilege('authenticated','public.spend_psionic_surge_pool_internal(uuid,uuid,integer[],text,integer)','EXECUTE')`)).toBe('f');
  expect(sql(`select has_function_privilege('authenticated','public.hit_dice_capacity_internal(public.characters)','EXECUTE')`)).toBe('f');
  expect(sql(`select has_function_privilege('anon','public.review_hit_dice_pool(uuid,bigint,jsonb)','EXECUTE')`)).toBe('f');
 });
});
