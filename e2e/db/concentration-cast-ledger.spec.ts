import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const authenticated=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string;error:string}>(resolve=>{const child=spawn('docker',args);let out='',error='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(query);});}
test.describe('Concentration casting identity',()=>{
 gateDbSuite();
 let owner:string,other:string,character:string;
 test.beforeEach(()=>{
  owner=randomUUID();other=randomUUID();character=randomUUID();
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@ledger.local','{}'),('${other}','${other}@ledger.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,hit_dice_spent,class_resources)
   values('${character}','${owner}','Turn ledger','Human','Psion','Sage',20,0,'{"psionic-energy-dice":10,"other":7}');commit;`);
 });
 test.afterEach(()=>{sql(`delete from action_logs where character_id='${character}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});

 const revision=()=>Number(sql(`select concentration_revision from characters where id='${character}'`));
 test('recasting the same spell advances identity; HP edits and duration ticks do not',()=>{
  expect(revision()).toBe(0);
  sql(authenticated(owner,`update characters set concentration_spell='detect-magic' where id='${character}'`));expect(revision()).toBe(1);
  sql(authenticated(owner,`update characters set current_hp=1,concentration_rounds_remaining=5 where id='${character}'`));expect(revision()).toBe(1);
  sql(authenticated(owner,`update characters set concentration_spell='detect-magic' where id='${character}'`));expect(revision()).toBe(2);
  sql(authenticated(owner,`update characters set concentration_spell='invisibility' where id='${character}'`));expect(revision()).toBe(3);
  sql(authenticated(owner,`update characters set concentration_spell='',concentration_slot_level=null where id='${character}'`));expect(revision()).toBe(4);
 });
 test('ordinary revision edits cannot spoof or rewind casting identity',()=>{
  sql(authenticated(owner,`update characters set concentration_revision=99 where id='${character}'`));expect(revision()).toBe(0);
  sql(authenticated(owner,`update characters set concentration_spell='detect-magic',concentration_revision=99 where id='${character}'`));expect(revision()).toBe(1);
  sql(authenticated(owner,`select patch_character_preserving_psion('${character}','{"concentration_revision":0,"name":"Renamed"}')`));expect(revision()).toBe(1);
  expect(sql(`select name from characters where id='${character}'`)).toBe('Renamed');
 });
 test('concurrent casts serialize into distinct identities',async()=>{
  const results=await Promise.all([parallel(authenticated(owner,`update characters set concentration_spell='detect-magic' where id='${character}' returning concentration_revision`)),parallel(authenticated(owner,`update characters set concentration_spell='detect-magic' where id='${character}' returning concentration_revision`))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>Number(r.out.trim())).sort()).toEqual([1,2]);expect(revision()).toBe(2);
 });
 test('a rolled-back cast leaves its identity unchanged',()=>{
  sql(`begin;update characters set concentration_spell='detect-magic' where id='${character}';rollback;`);expect(revision()).toBe(0);
 });
});
