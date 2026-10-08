import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});}
test.describe('Concentration casting source',()=>{
 gateDbSuite();let owner:string,other:string,character:string;
 test.beforeEach(()=>{
  owner=randomUUID();other=randomUUID();character=randomUUID();
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@source.local','{}'),('${other}','${other}@source.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level) values('${character}','${owner}','Casting source','Human','Psion','Sage',5);`);
 });
 test.afterEach(()=>sql(`delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`));
 const row=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${character}'`));
 const cast=(id=randomUUID(),revision=0,source='class:Psion',ability='intelligence')=>`select public.record_concentration_cast('${character}','${id}',${revision},'detect-magic',1,100,'${source}','${ability}')`;
 test('source persists and a retry does not restart duration or casting identity',()=>{
  const query=cast();const first=JSON.parse(sql(auth(owner,query)));
  expect(first).toMatchObject({concentration_spell:'detect-magic',concentration_revision:1,concentration_casting_context:{source:'class:Psion',ability:'intelligence',slotLevel:1}});
  sql(auth(owner,`update characters set concentration_rounds_remaining=99 where id='${character}'`));
  expect(JSON.parse(sql(auth(owner,query)))).toMatchObject({concentration_revision:1,concentration_rounds_remaining:99});
 });
 test('new casting invalidates older retries and ordinary recasts clear stale source',()=>{
  const old=cast();sql(auth(owner,old));sql(auth(owner,cast(randomUUID(),1,'class:Cleric','wisdom')));
  expect(()=>sql(auth(owner,old))).toThrow(/Concentration changed/);
  expect(row().concentration_casting_context.source).toBe('class:Cleric');
  sql(auth(owner,`update characters set concentration_spell='detect-magic' where id='${character}'`));
  expect(row()).toMatchObject({concentration_revision:3,concentration_casting_context:null});
 });
 test('clearing concentration cannot leave a source attached to a future spell',()=>{
  sql(auth(owner,cast()));sql(auth(owner,`update characters set concentration_spell='' where id='${character}'`));
  expect(row()).toMatchObject({concentration_spell:'',concentration_casting_context:null});
 });
 test('rejects unauthorized users, changed retries and invalid ability data',()=>{
  expect(()=>sql(auth(other,cast()))).toThrow(/Character is unavailable/);
  expect(()=>sql(auth(owner,cast(randomUUID(),0,'class:Psion','strength')))).toThrow(/Invalid concentration/);
  const id=randomUUID();sql(auth(owner,cast(id)));
  expect(()=>sql(auth(owner,cast(id,0,'class:Cleric','wisdom')))).toThrow(/Casting request changed/);
  expect(row().concentration_revision).toBe(1);
 });
 test('two casts from the same revision cannot both become the active concentration',async()=>{
  const results=await Promise.all([cast(),cast()].map(query=>parallel(auth(owner,query))));
  expect(results.filter(result=>result.code===0)).toHaveLength(1);
  expect(row().concentration_revision).toBe(1);
 });
 test('campaign owner can record concentration while unrelated users cannot',()=>{
  const campaign=randomUUID();
  try{
   sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Source fixture');update characters set campaign_id='${campaign}' where id='${character}'`);
   expect(JSON.parse(sql(auth(other,cast()))).concentration_casting_context.source).toBe('class:Psion');
  }finally{sql(`update characters set campaign_id=null where id='${character}';delete from campaigns where id='${campaign}'`);}
 });
 test('transaction rollback leaves both casting revision and source unchanged',()=>{
  sql(`begin;${cast()};rollback;`.replace('begin;','begin;set local role authenticated;set local request.jwt.claims=\'{"sub":"'+owner+'","role":"authenticated"}\';'));
  expect(row()).toMatchObject({concentration_revision:0,concentration_casting_context:null});
 });

});
