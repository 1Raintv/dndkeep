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
 const final=run(finalize());expect({...preview,finalized:undefined,incapacitationTracked:undefined,endedByIncapacitation:undefined,durationTracked:undefined,remainingSeconds:undefined,expiredByDuration:undefined}).toEqual({...final,replayed:undefined,finalized:undefined,incapacitationTracked:undefined,endedByIncapacitation:undefined,durationTracked:undefined,remainingSeconds:undefined,expiredByDuration:undefined});
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

 const record=()=>run(`select get_sharpened_roll_records('${char}')`).find((r:{requestId:string})=>r.requestId===activation);
 for(const condition of ['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'])test(`${condition} permanently ends the activation even after removal and delayed confirmation`,()=>{
 expect(record().endedByIncapacitation).toBe(false);sql(`update characters set active_conditions=array['${condition}'] where id='${char}'`);
 sql(`update characters set active_conditions='{}' where id='${char}'`);expect(record().endedByIncapacitation).toBe(true);
 run(finalize());expect(record()).toMatchObject({total:2,finalized:true,endedByIncapacitation:true});
 });
 test('incapacitation rolls back a new enhancement but preserves paid replay',()=>{
 const paid=enhance();run(paid);sql(`update characters set active_conditions=array['Stunned'] where id='${char}';update characters set active_conditions='{}' where id='${char}'`);
 expect(run(paid).replayed).toBe(true);expect(()=>run(enhance(randomUUID(),'surge','null','6'))).toThrow(/ended on incapacitation/);
 expect(spent()).toBe(2);expect(sql(`select count(*) from psionic_surge_uses where character_id='${char}'`)).toBe('0');expect(run(finalize()).total).toBe(13);
 });
 test('a fresh activation after recovery uses the new epoch; unrelated conditions do not expire it',()=>{
 sql(`update characters set active_conditions=array['Stunned'] where id='${char}';update characters set active_conditions=array['Prone','Poisoned'] where id='${char}'`);
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const next=randomUUID();begin(next,1);
 const latest=run(`select get_sharpened_roll_records('${char}')`).find((r:{requestId:string})=>r.requestId===next);expect(latest.endedByIncapacitation).toBe(false);expect(record().endedByIncapacitation).toBe(true);
 });
 test('activation while already incapacitated cannot become active after the condition clears',()=>{
 sql(`update characters set active_conditions=array['Stunned'] where id='${char}'`);run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const next=randomUUID();begin(next,1);
 sql(`update characters set active_conditions='{}' where id='${char}'`);expect(run(`select get_sharpened_roll_records('${char}')`).find((r:{requestId:string})=>r.requestId===next).endedByIncapacitation).toBe(true);
 });
 function combat(check:(cb:string,encounter:string,participant:string)=>void){
 const campaign=randomUUID(),cb=randomUUID(),encounter=randomUUID(),participant=randomUUID();try{
 sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Sharp conditions');update characters set campaign_id='${campaign}' where id='${char}';
 insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,is_dead) values('${cb}','${campaign}','${owner}','Sharp','character','${char}',20,20,false);
 insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
 insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${participant}','${encounter}','${campaign}','character','${char}','Sharp',0,'${cb}')`);
 check(cb,encounter,participant);
 }finally{sql(`delete from campaigns where id='${campaign}'`);}
 }
 test('active combatant incapacitation remains ended after combat recovery',()=>combat(cb=>{
 sql(`update combatants set active_conditions=array['Stunned'] where id='${cb}';update combatants set active_conditions='{}' where id='${cb}'`);expect(record().endedByIncapacitation).toBe(true);
 }));
 test('healthy active combatant takes precedence over stale sheet conditions',()=>combat(cb=>{
 sql(`update characters set active_conditions=array['Stunned'] where id='${char}'`);expect(record().endedByIncapacitation).toBe(false);
 sql(`update combatants set is_dead=true where id='${cb}';update combatants set is_dead=false where id='${cb}'`);expect(record().endedByIncapacitation).toBe(true);
 }));
 test('reactivating an encounter with an incapacitated combatant latches expiration',()=>combat((cb,encounter)=>{
 sql(`update combat_encounters set status='ended' where id='${encounter}';update combatants set active_conditions=array['Stunned'] where id='${cb}'`);expect(record().endedByIncapacitation).toBe(false);
 sql(`update combat_encounters set status='active' where id='${encounter}';update combatants set active_conditions='{}' where id='${cb}'`);expect(record().endedByIncapacitation).toBe(true);
 }));
 test('removing a healthy roster entry reveals and latches sheet incapacitation',()=>combat((_cb,_encounter,participant)=>{
 sql(`update characters set active_conditions=array['Stunned'] where id='${char}'`);expect(record().endedByIncapacitation).toBe(false);
 sql(`delete from combat_participants where id='${participant}';update characters set active_conditions='{}' where id='${char}'`);expect(record().endedByIncapacitation).toBe(true);
 }));

 test('ten declared solo rounds expire one minute without using wall-clock age',()=>{
 sql(`update dndkeep_private.psionic_discipline_uses set created_at=now()-interval '1 day' where request_id='${activation}'`);
 expect(record()).toMatchObject({durationTracked:true,remainingSeconds:60,expiredByDuration:false});
 for(let turn=0;turn<9;turn++)run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',${turn})`);
 expect(record().remainingSeconds).toBe(6);const request=randomUUID();run(`select advance_psionic_solo_turn('${char}','${request}',9)`);
 expect(record()).toMatchObject({remainingSeconds:0,expiredByDuration:true});run(`select advance_psionic_solo_turn('${char}','${request}',9)`);run(finalize());expect(record().expiredByDuration).toBe(true);
 });
 test('campaign clock honors its configured seconds per round and ignores no-op or backward edits',()=>combat((_cb,encounter)=>{
 const campaign=sql(`select campaign_id from combat_encounters where id='${encounter}'`);
 sql(`update campaigns set seconds_per_round=10,combat_rounds_elapsed=3 where id='${campaign}'`);expect(record().remainingSeconds).toBe(30);
 sql(`update campaigns set combat_rounds_elapsed=3 where id='${campaign}';update campaigns set combat_rounds_elapsed=2 where id='${campaign}'`);expect(record().remainingSeconds).toBe(30);
 sql(`update campaigns set seconds_per_round=6 where id='${campaign}';update campaigns set combat_rounds_elapsed=7 where id='${campaign}'`);expect(record().expiredByDuration).toBe(true);
 }));
 test('combat turn changes do not double-count the separate campaign round tick',()=>combat((_cb,encounter)=>{
 sql(`update combat_encounters set round_number=2 where id='${encounter}'`);expect(record().remainingSeconds).toBe(60);
 sql(`update campaigns set seconds_per_round=6,combat_rounds_elapsed=1 where id=(select campaign_id from combat_encounters where id='${encounter}')`);
 // The old configured scale (10) applies to this same update; changing a
 // setting cannot retroactively reinterpret elapsed time.
 expect(record().remainingSeconds).toBe(50);
 }));

 test('elapsed campaign time blocks new enhancements without charging resources',()=>{
 const campaign=randomUUID();try{
 sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Sharp elapsed');update characters set campaign_id='${campaign}' where id='${char}';update campaigns set combat_rounds_elapsed=6 where id='${campaign}'`);
 expect(record().expiredByDuration).toBe(true);expect(()=>run(enhance())).toThrow(/duration ended/);expect(spent()).toBe(0);
 expect(sql(`select count(*) from psionic_feature_uses where character_id='${char}'`)).toBe('0');expect(run(finalize()).total).toBe(2);expect(record().remainingSeconds).toBe(0);
 }finally{sql(`delete from campaigns where id='${campaign}'`);}
 });
 test('Restoration recovery expires the duration without resetting a newer activation on replay',()=>{
 const id=randomUUID();const restore=`select settle_psionic_energy('${char}','${id}','restore',0,array[]::integer[],'Psionic Restoration')`;
 run(restore);expect(record().expiredByDuration).toBe(true);
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const next=randomUUID();begin(next,1);run(restore);
 expect(run(`select get_sharpened_roll_records('${char}')`).find((r:{requestId:string})=>r.requestId===next).remainingSeconds).toBe(60);
 });

 test('a completed Short Rest expires the duration without inventing its exact elapsed length',()=>{
 const row=JSON.parse(sql(`select to_jsonb(c) from characters c where id='${char}'`)),keys=['spell_slots','class_resources','feature_uses'];
 const expected=Object.fromEntries([...keys,'class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'].map(k=>[k,row[k]]));
 const updates=Object.fromEntries(keys.map(k=>[k,row[k]??{}]));
 run(`select complete_psionic_rest('${char}','${randomUUID()}','short','${JSON.stringify(expected)}','${JSON.stringify(updates)}')`);expect(record().expiredByDuration).toBe(true);
 });

});
