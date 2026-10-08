import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const p=spawn('docker',args);let out='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',()=>{});p.on('close',code=>resolve({code,out}));p.stdin.end(q);});
test.describe('Sharpened saved activation rolls',()=>{
 gateDbSuite();let owner:string,other:string,char:string,activation:string;
 test.beforeEach(()=>{owner=randomUUID();other=randomUUID();char=randomUUID();activation=randomUUID();sql(`begin;
 insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@sharp.local','{}'),('${other}','${other}@sharp.local','{}');
 insert into characters(id,user_id,name,species,class_name,background,level,intelligence,hit_dice_spent,class_resources)
 values('${char}','${owner}','Sharpened fixture','Human','Psion','Sage',20,18,0,'{"psionic-energy-dice":12,"psion-disciplines":["sharpened-mind"]}');commit;`);begin();});
 test.afterEach(()=>sql(`delete from action_logs where character_id='${char}';delete from characters where id='${char}';delete from auth.users where id in('${owner}','${other}');`));
 const run=(q:string,u=owner)=>JSON.parse(sql(auth(u,q)));
 function begin(id=activation,turn=0){
 const snapshot=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${char}'`);
 return run(`select begin_psionic_discipline('${char}','${id}','{"soloTurn":${turn}}','sharpened-mind',array[2],1,4,'${snapshot}')`);
 }
 const enhance=(id=randomUUID(),kind='enkindled',extra='array[3,8]',die='null',base=activation)=>`select enhance_sharpened_roll('${char}','${base}','${id}','${kind}',${extra}::integer[],${die})`;
 const finalize=(base=activation)=>`select finalize_sharpened_roll('${char}','${base}')`;
 const spent=()=>Number(sql(`select hit_dice_spent from characters where id='${char}'`));
 test('records the base roll once and keeps original timing across turn changes and retries',()=>{
 const first=run(finalize());expect(first.total).toBe(2);expect(first.rolls).toEqual([2]);expect(first.replayed).toBe(false);
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);
 const replay=run(finalize());expect(replay).toEqual({...first,replayed:true});expect(spent()).toBe(0);
 expect(()=>run(enhance())).toThrow(/already finalized/);
 });
 test('adds two paid extras then applies Surge to each die, with no extra Energy Die cost',()=>{
 const extra=enhance(),surge=enhance(randomUUID(),'surge','null','6');run(extra);run(surge);
 const final=run(finalize());expect(final.originalRolls).toEqual([2,3,8]);expect(final.rolls).toEqual([4,4,8]);expect(final.total).toBe(16);
 expect(spent()).toBe(3);expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${char}'`)).toBe('11');
 expect(run(extra).replayed).toBe(true);expect(run(surge).replayed).toBe(true);expect(spent()).toBe(3);
 });
 test('rejects changed requests, reversed enhancement order and a second Surge',()=>{
 const id=randomUUID();run(enhance(id,'surge','null','6'));
 expect(()=>run(enhance(id,'surge','null','8'))).toThrow(/Saved enhancement changed/);
 expect(()=>run(enhance())).toThrow(/before Surge/);expect(()=>run(enhance(randomUUID(),'surge','null','6'))).toThrow(/already attached/);expect(spent()).toBe(1);
 });
 test('cannot attach a generic paid enhancement retroactively',()=>{
 const id=randomUUID();run(`select spend_enkindled_life_force('${char}','${id}','{"soloTurn":0}',2,array[2],array[3,8],'Sharpened Mind')`);
 expect(()=>run(enhance(id))).toThrow(/identity already used/);expect(run(finalize()).total).toBe(2);expect(spent()).toBe(2);
 });
 test('new enhancements stop when the turn advances but paid replay remains available',()=>{
 const paid=enhance();run(paid);run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);
 expect(run(paid).replayed).toBe(true);expect(()=>run(enhance(randomUUID(),'surge','null','6'))).toThrow(/turn changed/);
 expect(run(finalize()).total).toBe(13);expect(spent()).toBe(2);
 });
 test('unrelated and anonymous users cannot finalize, enhance or inspect saved rolls',()=>{
 expect(()=>run(finalize(),other)).toThrow(/Character is unavailable/);expect(()=>run(enhance(),other)).toThrow(/Character is unavailable/);
 expect(()=>sql(`begin;set local role anon;select finalize_sharpened_roll('${char}','${activation}');commit;`)).toThrow(/permission denied/);
 expect(()=>sql(auth(owner,'select * from dndkeep_private.sharpened_rolls'))).toThrow(/permission denied/);expect(spent()).toBe(0);
 });
 test('another activation cannot reuse the first activations payment identity',()=>{
 const id=randomUUID();run(enhance(id));run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const next=randomUUID();begin(next,1);
 expect(()=>run(enhance(id,'enkindled','array[3,8]','null',next))).toThrow(/Saved enhancement changed/);expect(run(finalize(next)).total).toBe(2);
 });
 test('competing tabs pay only one enhancement and finalization cannot race in a different total',async()=>{
 const paid=enhance();const results=await Promise.all([parallel(auth(owner,paid)),parallel(auth(owner,paid))]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(spent()).toBe(2);
 const finish=await Promise.all([parallel(auth(owner,finalize())),parallel(auth(owner,finalize()))]);expect(finish.map(r=>r.code)).toEqual([0,0]);
 expect(finish.map(r=>JSON.parse(r.out).total)).toEqual([13,13]);expect(finish.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
 });
 test('invalid enhancement rolls or missing Hit Die pool leave no payment or association',()=>{
 expect(()=>run(enhance(randomUUID(),'enkindled','array[0]'))).toThrow(/Invalid Enkindled dice/);
 expect(()=>run(enhance(randomUUID(),'surge','null','null'))).toThrow(/Hit Die pool/);
 expect(spent()).toBe(0);expect(sql(`select count(*) from dndkeep_private.sharpened_enhancements where activation_id='${activation}'`)).toBe('0');
 });
 test('an enhancement racing finalization is either fully included or not spent',async()=>{
 const results=await Promise.all([parallel(auth(owner,enhance())),parallel(auth(owner,finalize()))]);
 expect(results[1].code).toBe(0);const result=run(finalize());
 if(results[0].code===0){expect(result.total).toBe(13);expect(spent()).toBe(2);}
 else{expect(result.total).toBe(2);expect(spent()).toBe(0);}
 });
 test('a current DM can recover the roll and loses access when the character leaves',()=>{
 const campaign=randomUUID();try{
 sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Sharpened DM');update characters set campaign_id='${campaign}' where id='${char}'`);
 expect(run(finalize(),other).total).toBe(2);sql(`update characters set campaign_id=null where id='${char}'`);
 expect(()=>run(finalize(),other)).toThrow(/Character is unavailable/);
 }finally{sql(`delete from campaigns where id='${campaign}'`);}
 });
 test('one owners other character cannot use this activation',()=>{
 const otherChar=randomUUID();try{
 sql(`insert into characters(id,user_id,name,species,class_name,background,level) values('${otherChar}','${owner}','Other','Human','Psion','Sage',20)`);
 expect(()=>run(`select finalize_sharpened_roll('${otherChar}','${activation}')`)).toThrow(/activation is unavailable/);
 expect(()=>run(`select enhance_sharpened_roll('${otherChar}','${activation}','${randomUUID()}','surge',null,6)`)).toThrow(/activation is unavailable/);
 }finally{sql(`delete from characters where id='${otherChar}'`);}
 });

 test('new base-only activations remain discoverable without browser storage',()=>{
 const rows=run(`select get_sharpened_roll_records('${char}')`);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({requestId:activation,total:2,finalized:false});
 const timestamp=rows[0].activatedAt;run(finalize());const confirmed=run(`select get_sharpened_roll_records('${char}')`);
 expect(confirmed[0]).toMatchObject({total:2,finalized:true,activatedAt:timestamp});
 });
 test('read previews match paid enhancements and finalized results exactly',()=>{
 run(enhance());run(enhance(randomUUID(),'surge','null','6'));const preview=run(`select get_sharpened_roll_records('${char}')`)[0];
 expect(preview).toMatchObject({originalRolls:[2,3,8],rolls:[4,4,8],total:16,finalized:false});
 const final=run(finalize());expect({...preview,finalized:undefined}).toEqual({...final,replayed:undefined,finalized:undefined});
 });
 test('unrelated users and anonymous callers cannot list records',()=>{
 expect(()=>run(`select get_sharpened_roll_records('${char}')`,other)).toThrow(/Character is unavailable/);
 expect(()=>sql(`begin;set local role anon;select get_sharpened_roll_records('${char}');commit;`)).toThrow(/permission denied/);
 });

 test('keeps all unfinished records while limiting only completed history',()=>{
 const ids=[activation];
 for(let turn=1;turn<=6;turn++){run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',${turn-1})`);const next=randomUUID();begin(next,turn);ids.push(next);}
 expect(run(`select get_sharpened_roll_records('${char}')`)).toHaveLength(7);
 for(const id of ids)run(finalize(id));
 const rows=run(`select get_sharpened_roll_records('${char}')`);expect(rows).toHaveLength(5);expect(rows.every((r:{finalized:boolean})=>r.finalized)).toBe(true);expect(rows.map((r:{requestId:string})=>r.requestId)).toEqual(ids.slice(2).reverse());
 });

});
