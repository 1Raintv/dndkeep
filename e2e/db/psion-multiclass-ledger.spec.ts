import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string;error:string}>(resolve=>{const child=spawn('docker',args);let out='',error='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(query);});}
for(const secondary of [false,true])test.describe(`Psion multiclass ledger (${secondary?'secondary':'primary'})`,()=>{
 gateDbSuite();let owner:string,other:string,character:string;
 test.beforeEach(()=>{
  owner=randomUUID();other=randomUUID();character=randomUUID();
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@multiclass.local','{}'),('${other}','${other}@multiclass.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,secondary_class,secondary_level,hit_dice_spent,class_resources,feature_uses)
   values('${character}','${owner}','Multiclass fixture','Human','${secondary?'Fighter':'Psion'}','Sage',${secondary?11:7},'${secondary?'Psion':'Fighter'}',${secondary?7:11},0,'{"psionic-energy-dice":2,"other":7}','{"Other":2}');commit;`);
 });
 test.afterEach(()=>sql(`delete from action_logs where character_id='${character}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`));
 const row=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${character}'`));
 const energy=(operation:string,count:number,rolls:number[],feature:string,id=randomUUID())=>`select public.settle_psionic_energy('${character}','${id}','${operation}',${count},array[${rolls.join(',')}]::integer[],'${feature}')`;
 const restore=()=>energy('restore',0,[],'Psionic Restoration');
 test('Restoration races have one winner and retries preserve later expenditure',async()=>{
  const queries=[restore(),restore()],results=await Promise.all(queries.map(q=>parallel(auth(owner,q))));
  expect(results.filter(r=>r.code===0)).toHaveLength(1);
  expect(row()).toMatchObject({class_resources:{'psionic-energy-dice':6,'psionic-restoration':0,other:7},feature_uses:{'Psionic Restoration':1,Other:2}});
  sql(auth(owner,energy('spend',1,[8],'Telekinetic Propel')));
  const winner=results.findIndex(r=>r.code===0);
  expect(JSON.parse(sql(auth(owner,queries[winner])))).toMatchObject({remaining:5,replayed:true});
  expect(()=>sql(auth(owner,restore()))).toThrow(/already used/);
  expect(sql(`select count(*) from action_logs where character_id='${character}'`)).toBe('2');
 });
 test('Surge uses Psion die size and total Hit Dice while keeping retry and ownership checks',()=>{
  const surge=(rolls:string,id=randomUUID())=>`select public.spend_psionic_surge('${character}','${id}',array[${rolls}]::integer[],'Telekinetic Propel')`;
  expect(()=>sql(auth(owner,surge('1,10')))).toThrow(/Invalid Psionic Surge dice/);
  sql(`update characters set hit_dice_spent=17 where id='${character}'`);
  const query=surge('1,8');
  expect(()=>sql(auth(other,query))).toThrow(/Character is unavailable/);
  expect(JSON.parse(sql(auth(owner,query)))).toMatchObject({rolls:[4,8],total:12,hitDiceSpent:18,replayed:false});
  expect(JSON.parse(sql(auth(owner,query)))).toMatchObject({hitDiceSpent:18,replayed:true});
  expect(()=>sql(auth(owner,surge('1')))).toThrow(/Not enough Hit Point Dice/);
  expect(row().class_resources).toEqual({'psionic-energy-dice':2,other:7});
 });
 test('Short/Long Rest and ordinary patches preserve transaction ownership and the other class',()=>{
  sql(auth(owner,restore()));sql(auth(owner,energy('spend',2,[2,3],'Biofeedback')));
  const rest=(kind:'short'|'long')=>{
   const c=row(),keys=kind==='short'?['spell_slots','class_resources','feature_uses']:
    ['current_hp','temp_hp','spell_slots','active_conditions','exhaustion_level','death_saves_successes','death_saves_failures','hit_dice_spent','class_resources','feature_uses','inventory','concentration_spell','concentration_rounds_remaining','concentration_slot_level'];
   const expected=Object.fromEntries([...keys,'class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'].map(k=>[k,c[k]]));
   const updates=Object.fromEntries(keys.map(k=>[k,c[k]]));
   const query=`select public.complete_psionic_rest('${character}','${randomUUID()}','${kind}','${JSON.stringify(expected)}'::jsonb,'${JSON.stringify(updates)}'::jsonb)`;
   sql(auth(owner,query));return query;
  };
  const short=rest('short');expect(row()).toMatchObject({class_resources:{'psionic-energy-dice':5,'psionic-restoration':0,other:7},feature_uses:{'Psionic Restoration':1,Other:2}});
  sql(auth(owner,short));expect(row().class_resources['psionic-energy-dice']).toBe(5);
  const long=rest('long');expect(row()).toMatchObject({class_resources:{'psionic-energy-dice':6,'psionic-restoration':1,other:7},feature_uses:{},hit_dice_spent:0});
  sql(auth(owner,energy('spend',1,[2],'Telekinetic Propel')));sql(auth(owner,long));expect(row().class_resources['psionic-energy-dice']).toBe(5);
  sql(auth(owner,`select public.patch_character_preserving_psion('${character}','{"class_resources":{"psionic-energy-dice":6,"other":3},"feature_uses":{"Psionic Restoration":1,"Other":4}}')`));
  expect(row()).toMatchObject({class_resources:{'psionic-energy-dice':5,'psionic-restoration':1,other:3},feature_uses:{Other:4}});
  expect(row().feature_uses['Psionic Restoration']).toBeUndefined();
 });
 test('subclass and feature requirements use the Psion side of the sheet',()=>{
  const psiLevel=secondary?'secondary_level':'level',psiSubclass=secondary?'secondary_subclass':'subclass',otherSubclass=secondary?'subclass':'secondary_subclass';
  sql(`update characters set ${psiLevel}=4,${psiSubclass}='Telepath',${otherSubclass}='Psi Warper' where id='${character}'`);
  expect(()=>sql(auth(owner,restore()))).toThrow(/requires Psion level 5/);
  const teleport=()=>energy('use-misty-step',0,[],'Free Misty Step (Teleportation)');
  expect(()=>sql(auth(owner,teleport()))).toThrow(/Requires Psi Warper/);
  sql(`update characters set ${psiSubclass}='Psi Warper' where id='${character}'`);
  expect(JSON.parse(sql(auth(owner,teleport())))).toMatchObject({mistyStepUsed:1,remaining:2});
  sql(`update characters set ${psiLevel}=2 where id='${character}'`);
  expect(()=>sql(auth(owner,teleport()))).toThrow(/Requires Psi Warper/);
 });
});
