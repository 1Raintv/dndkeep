import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const authenticated=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string;error:string}>(resolve=>{const child=spawn('docker',args);let out='',error='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(query);});}
test.describe('Atomic Psion Energy Dice',()=>{
 gateDbSuite();
 let owner:string,other:string,character:string;
 test.beforeEach(()=>{
  owner=randomUUID();other=randomUUID();character=randomUUID();
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@ledger.local','{}'),('${other}','${other}@ledger.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,hit_dice_spent,class_resources)
   values('${character}','${owner}','Turn ledger','Human','Psion','Sage',20,0,'{"psionic-energy-dice":10,"other":7}');commit;`);
 });
 test.afterEach(()=>{sql(`delete from action_logs where character_id='${character}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});

 function spend(request=randomUUID(),count=1,rolls='array[3]'){
  return `select public.settle_psionic_energy('${character}','${request}','spend',${count},${rolls}::integer[],'Psionic Energy Dice')`;
 }
 function restore(request=randomUUID()){
  return `select public.settle_psionic_energy('${character}','${request}','restore',0,array[]::integer[],'Psionic Restoration')`;
 }
 const pool=()=>JSON.parse(sql(`select class_resources from characters where id='${character}'`));
 test('concurrent payments each deduct once and preserve other resources',async()=>{
  const results=await Promise.all([parallel(authenticated(owner,spend())),parallel(authenticated(owner,spend()))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(pool()).toEqual({'psionic-energy-dice':8,other:7});
  expect(sql(`select count(*) from psionic_energy_uses where character_id='${character}'`)).toBe('2');
 });
 test('same-request retries commit one charge and history, returning the current pool',async()=>{
  const request=randomUUID(),query=spend(request);
  const results=await Promise.all([parallel(authenticated(owner,query)),parallel(authenticated(owner,query))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
  expect(pool()['psionic-energy-dice']).toBe(9);
  expect(sql(`select count(*) from action_logs where character_id='${character}'`)).toBe('1');
  sql(authenticated(owner,spend()));expect(JSON.parse(sql(authenticated(owner,query)))).toMatchObject({remaining:8,replayed:true,rolls:[3]});
  expect(()=>sql(authenticated(owner,spend(request,2,'array[3,3]')))).toThrow(/does not match/);
 });
 test('last die has one winner and failed history rolls the entire payment back',async()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":1}' where id='${character}'`);
  const results=await Promise.all([parallel(authenticated(owner,spend())),parallel(authenticated(owner,spend()))]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('Not enough');expect(pool()['psionic-energy-dice']).toBe(0);
  const trigger='energy_test_'+character.replaceAll('-','');
  try{
   sql(`update characters set class_resources='{"psionic-energy-dice":2}' where id='${character}';
    create function public.${trigger}() returns trigger language plpgsql as $$begin if new.character_id='${character}' then raise exception 'injected history failure';end if;return new;end;$$;
    create trigger ${trigger} before insert on public.action_logs for each row execute function public.${trigger}();`);
   expect(()=>sql(authenticated(owner,spend()))).toThrow(/injected history failure/);expect(pool()['psionic-energy-dice']).toBe(2);
   expect(sql(`select count(*) from psionic_energy_uses where character_id='${character}'`)).toBe('1');
  }finally{sql(`drop trigger if exists ${trigger} on public.action_logs;drop function if exists public.${trigger}();`);}
 });
 test('restoration is once per Long Rest, retry-safe, and preserves unrelated fields',async()=>{
  sql(`update characters set feature_uses='{"Other":2}' where id='${character}'`);
  const request=randomUUID(),query=restore(request);
  const results=await Promise.all([parallel(authenticated(owner,query)),parallel(authenticated(owner,restore()))]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(pool()).toEqual({'psionic-energy-dice':12,'psionic-restoration':0,other:7});
  expect(JSON.parse(sql(`select feature_uses from characters where id='${character}'`))).toEqual({'Psionic Restoration':1,Other:2});
  const winner=JSON.parse(results.find(r=>r.code===0)!.out).requestId;
  sql(authenticated(owner,spend()));expect(JSON.parse(sql(authenticated(owner,restore(winner))))).toMatchObject({remaining:11,replayed:true});
  expect(()=>sql(authenticated(owner,restore()))).toThrow(/already used/);
  sql(`update characters set class_resources=class_resources||'{"psionic-restoration":1}',feature_uses=feature_uses-'Psionic Restoration' where id='${character}'`);
  expect(JSON.parse(sql(authenticated(owner,restore())))).toMatchObject({remaining:12,replayed:false});
 });
 test('enforces authorization, private ledger and valid resource values',()=>{
  expect(()=>sql(authenticated(other,spend()))).toThrow(/Character is unavailable/);
  expect(()=>sql(`set role anon;${spend()}`)).toThrow(/permission denied/);
  expect(()=>sql(authenticated(owner,`delete from psionic_energy_uses`))).toThrow(/permission denied/);
  for(const rolls of ['array[0]','array[13]','array[null]','array[1,2]','array[[1],[2]]'])expect(()=>sql(authenticated(owner,spend(randomUUID(),1,rolls)))).toThrow(/Invalid Energy/);
  for(const count of [0,-1,13])expect(()=>sql(authenticated(owner,spend(randomUUID(),count)))).toThrow(/Invalid Energy/);
  for(const value of ['null','"6"','-1','1.5','13']){
   sql(`update characters set class_resources=jsonb_build_object('psionic-energy-dice','${value}'::jsonb) where id='${character}'`);
   expect(()=>sql(authenticated(owner,spend()))).toThrow(/Check Psionic Energy Dice/);
  }
  expect(sql(`select count(*) from psionic_energy_uses where character_id='${character}'`)).toBe('0');
 });
 test('uses every level pool and die size; missing legacy pools begin full',()=>{
  for(let level=1;level<=20;level++){
   const maximum=level>=17?12:level>=13?10:level>=9?8:level>=5?6:4;
   const sides=level>=17?12:level>=11?10:level>=5?8:6;
   sql(`update characters set level=${level},class_resources='{}',feature_uses='{}' where id='${character}'`);
   expect(JSON.parse(sql(authenticated(owner,spend(randomUUID(),1,`array[${sides}]`))))).toMatchObject({remaining:maximum-1});
   expect(()=>sql(authenticated(owner,spend(randomUUID(),1,`array[${sides+1}]`)))).toThrow(/Invalid Energy/);
   if(level<5)expect(()=>sql(authenticated(owner,restore()))).toThrow(/requires Psion level 5/);
   else expect(JSON.parse(sql(authenticated(owner,restore()))).remaining).toBe(maximum);
  }
 });
 test('validates Restoration counters and tracks spending/recovery revisions',()=>{
  for(const patch of [`class_resources='{"psionic-energy-dice":3,"psionic-restoration":"bad"}'`, `class_resources='{"psionic-energy-dice":3,"psionic-restoration":2}'`, `class_resources='{"psionic-energy-dice":3}',feature_uses='{"Psionic Restoration":-1}'`, `class_resources='{"psionic-energy-dice":3}',feature_uses='{"Psionic Restoration":0.5}'`]){
   sql(`update characters set feature_uses='{}' where id='${character}';update characters set ${patch} where id='${character}'`);
   expect(()=>sql(authenticated(owner,restore()))).toThrow(/Check Psionic Restoration/);
  }
  sql(`update characters set class_resources='{"psionic-energy-dice":3}',feature_uses='{}' where id='${character}'`);
  const before=Number(sql(`select psionic_energy_revision from characters where id='${character}'`));
  const spent=JSON.parse(sql(authenticated(owner,spend())));expect(spent.energyRevision).toBe(before+1);
  const recovered=JSON.parse(sql(authenticated(owner,restore())));expect(recovered.energyRevision).toBe(before+2);
  sql(`update characters set class_resources=class_resources||'{"Other":9}' where id='${character}'`);
  expect(Number(sql(`select psionic_energy_revision from characters where id='${character}'`))).toBe(before+2);
  sql(`update characters set secondary_class='Wizard',secondary_level=1 where id='${character}'`);
  expect(()=>sql(authenticated(owner,spend()))).toThrow(/valid Psion level/);
 });

 test('Connection free-use claims cannot race or silently become paid uses',async()=>{
  const connection=(id=randomUUID(),cost=0)=>`select public.settle_psionic_energy('${character}','${id}','connection',${cost},array[3],'Telepathic Connection')`;
  const queries=[connection(),connection()];const results=await Promise.all(queries.map(query=>parallel(authenticated(owner,query))));
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('free use changed');expect(pool()['psionic-energy-dice']).toBe(10);
  const winner=results.findIndex(r=>r.code===0);expect(JSON.parse(sql(authenticated(owner,queries[winner])))).toMatchObject({remaining:10,connectionUsed:1,replayed:true});
  expect(JSON.parse(sql(authenticated(owner,connection(randomUUID(),1))))).toMatchObject({remaining:9,connectionUsed:2});
  sql(`update characters set class_resources='{"psionic-energy-dice":0}',feature_uses='{}' where id='${character}'`);
  expect(()=>sql(authenticated(owner,connection()))).toThrow(/Not enough/);
 });

 test('ordinary stale sheet patches preserve paid Psion keys and existing authorization',()=>{
  const patch=(values:unknown)=>`select public.patch_character_preserving_psion('${character}','${JSON.stringify(values)}'::jsonb)`;
  sql(authenticated(owner,spend()));sql(authenticated(owner,restore()));
  sql(authenticated(owner,`select public.settle_psionic_energy('${character}','${randomUUID()}','connection',0,array[3],'Telepathic Connection')`));
  const revised=JSON.parse(sql(authenticated(owner,patch({name:'Edited',class_resources:{'psionic-energy-dice':1,'psionic-restoration':1,other:99},feature_uses:{'Psionic Restoration':0,'Telepathic Connection':0,Other:8}}))));
  expect(revised.name).toBe('Edited');expect(revised.class_resources).toEqual({'psionic-energy-dice':12,'psionic-restoration':0,other:99});
  expect(revised.feature_uses).toEqual({'Psionic Restoration':1,'Telepathic Connection':1,Other:8});
  expect(()=>sql(authenticated(other,patch({name:'Not yours'})))).toThrow(/Character is unavailable/);
  for(const values of [{user_id:other},{id:other},{psionic_energy_revision:0},{not_a_column:1}])expect(()=>sql(authenticated(owner,patch(values)))).toThrow(/Unsupported character field/);
  expect(()=>sql(`set role anon;${patch({name:'No'})}`)).toThrow(/permission denied/);
  expect(JSON.parse(sql(authenticated(owner,patch({current_hp:7})))).current_hp).toBe(7);
  sql(`update characters set class_name='Fighter' where id='${character}'`);
  expect(JSON.parse(sql(authenticated(owner,patch({class_resources:{'action-surge':0},feature_uses:{Other:3}}))))).toMatchObject({class_resources:{'action-surge':0},feature_uses:{Other:3}});
 });

 test('manual recovery and teleportation refresh are retry-safe under contention',async()=>{
  const request=randomUUID(),recover=`select public.settle_psionic_energy('${character}','${request}','recover-die',1,array[]::integer[],'Manual Energy Die recovery')`;
  expect(JSON.parse(sql(authenticated(owner,recover))).remaining).toBe(11);expect(JSON.parse(sql(authenticated(owner,recover))).remaining).toBe(11);
  sql(`update characters set subclass='Psi Warper',feature_uses='{"Free Misty Step (Teleportation)":1,"Other":8}' where id='${character}'`);
  const refresh=(id=randomUUID())=>`select public.settle_psionic_energy('${character}','${id}','refresh-misty-step',1,array[]::integer[],'Free Misty Step (Teleportation)')`;
  const queries=[refresh(),refresh()],results=await Promise.all(queries.map(query=>parallel(authenticated(owner,query))));
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(pool()['psionic-energy-dice']).toBe(10);
  const winner=results.findIndex(r=>r.code===0);expect(JSON.parse(sql(authenticated(owner,queries[winner])))).toMatchObject({remaining:10,mistyStepUsed:0,replayed:true});
  const use=`select public.settle_psionic_energy('${character}','${randomUUID()}','use-misty-step',0,array[]::integer[],'Free Misty Step (Teleportation)')`;
  expect(JSON.parse(sql(authenticated(owner,use)))).toMatchObject({remaining:10,mistyStepUsed:1});
  expect(JSON.parse(sql(authenticated(owner,use)))).toMatchObject({remaining:10,mistyStepUsed:1,replayed:true});
  expect(JSON.parse(sql(`select feature_uses from characters where id='${character}'`))).toEqual({'Free Misty Step (Teleportation)':1,Other:8});
  const correct=(id=randomUUID())=>`select public.settle_psionic_energy('${character}','${id}','recover-misty-step',0,array[]::integer[],'Free Misty Step (Teleportation)')`;
  const corrections=[correct(),correct()],corrected=await Promise.all(corrections.map(query=>parallel(authenticated(owner,query))));
  expect(corrected.filter(r=>r.code===0)).toHaveLength(1);
  expect(JSON.parse(sql(authenticated(owner,corrections[corrected.findIndex(r=>r.code===0)])))).toMatchObject({remaining:10,mistyStepUsed:0,replayed:true});
  expect(JSON.parse(sql(`select feature_uses from characters where id='${character}'`))).toEqual({'Free Misty Step (Teleportation)':0,Other:8});
  sql(`update characters set subclass='Telepath' where id='${character}'`);expect(()=>sql(authenticated(owner,refresh()))).toThrow(/Requires Psi Warper/);
 });

 function rest(kind:'short'|'long',id=randomUUID(),base?:Record<string,unknown>){
  const row=base??JSON.parse(sql(`select to_jsonb(c) from characters c where id='${character}'`));
  const keys=kind==='short'?['spell_slots','class_resources','feature_uses']:['current_hp','temp_hp','spell_slots','active_conditions','exhaustion_level','death_saves_successes','death_saves_failures','hit_dice_spent','class_resources','feature_uses','inventory','concentration_spell','concentration_rounds_remaining','concentration_slot_level'];
  const updates=Object.fromEntries(keys.map(k=>[k,row[k]]));
  updates.class_resources={...(row.class_resources as object),'psionic-energy-dice':99};updates.feature_uses={};
  const expected=Object.fromEntries([...keys,'class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'].map(k=>[k,row[k]]));
  return `select public.complete_psionic_rest('${character}','${id}','${kind}','${JSON.stringify(expected)}'::jsonb,'${JSON.stringify(updates)}'::jsonb)`;
 }
 test('Short Rest recovers one die once and keeps daily features spent',async()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":8,"psionic-restoration":0,"other":7}',feature_uses='{"Psionic Restoration":1,"Telepathic Connection":2,"Free Misty Step (Teleportation)":1}' where id='${character}'`);
  const query=rest('short'),results=await Promise.all([parallel(authenticated(owner,query)),parallel(authenticated(owner,query))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(pool()).toEqual({'psionic-energy-dice':9,'psionic-restoration':0,other:7});
  expect(JSON.parse(results[0].out).character.feature_uses).toEqual({'Psionic Restoration':1,'Telepathic Connection':2,'Free Misty Step (Teleportation)':1});
  sql(authenticated(owner,spend()));expect(JSON.parse(sql(authenticated(owner,query))).character.class_resources['psionic-energy-dice']).toBe(8);
  expect(sql(`select count(*) from action_logs where character_id='${character}' and action_name='Short Rest'`)).toBe('1');
 });
 test('stale rest snapshots reject concurrent costs without refunding them',async()=>{
  const old=rest('short');sql(authenticated(owner,spend()));expect(()=>sql(authenticated(owner,old))).toThrow(/Character changed/);expect(pool()['psionic-energy-dice']).toBe(9);
  const row=JSON.parse(sql(`select to_jsonb(c) from characters c where id='${character}'`));
  const results=await Promise.all([rest('short',randomUUID(),row),rest('short',randomUUID(),row)].map(q=>parallel(authenticated(owner,q))));
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(pool()['psionic-energy-dice']).toBe(10);
 });
 test('Long Rest repairs malformed dice, restores all Hit Point Dice and replays without repeating recovery',()=>{
  sql(`update characters set current_hp=2,max_hp=50,hit_dice_spent=17,exhaustion_level=3,class_resources='{"psionic-energy-dice":"broken","psionic-restoration":0,"psion-disciplines":["Biofeedback"]}',feature_uses='{"Psionic Restoration":1,"Telepathic Connection":2}' where id='${character}'`);
  const query=rest('long'),paid=JSON.parse(sql(authenticated(owner,query)));
  expect(paid.character).toMatchObject({current_hp:50,hit_dice_spent:0,exhaustion_level:2,feature_uses:{},class_resources:{'psionic-energy-dice':12,'psionic-restoration':1,'psion-disciplines':['Biofeedback']}});
  sql(authenticated(owner,spend()));const replay=JSON.parse(sql(authenticated(owner,query)));expect(replay.replayed).toBe(true);
  expect(replay.character).toMatchObject({exhaustion_level:2,class_resources:{'psionic-energy-dice':11}});
  expect(sql(`select count(*) from action_logs where character_id='${character}' and action_name='Long Rest'`)).toBe('1');
  expect(()=>sql(authenticated(other,query))).toThrow();expect(()=>sql(`set role anon;${query}`)).toThrow(/permission denied/);
 });
 test('rest validation and history failure leave the entire character unchanged',()=>{
  const query=rest('long');expect(()=>sql(authenticated(owner,query.replace("'long'","'invalid'")))).toThrow(/Invalid rest kind/);
  const trigger='rest_test_'+character.replaceAll('-','');
  try{
   sql(`create function public.${trigger}() returns trigger language plpgsql as $$begin if new.character_id='${character}' then raise exception 'injected rest failure';end if;return new;end;$$;create trigger ${trigger} before insert on public.action_logs for each row execute function public.${trigger}();`);
   const before=sql(`select to_jsonb(c) from characters c where id='${character}'`);
   expect(()=>sql(authenticated(owner,query))).toThrow(/injected rest failure/);expect(sql(`select to_jsonb(c) from characters c where id='${character}'`)).toBe(before);
   expect(sql(`select count(*) from psionic_energy_uses where character_id='${character}'`)).toBe('0');
  }finally{sql(`drop trigger if exists ${trigger} on public.action_logs;drop function if exists public.${trigger}();`);}
 });

});
