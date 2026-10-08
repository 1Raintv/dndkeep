import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const p=spawn('docker',args);let out='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',()=>{});p.on('close',code=>resolve({code,out}));p.stdin.end(q);});
test.describe('Linked effect saved activation rolls',()=>{
 gateDbSuite();let owner:string,other:string,char:string,activation:string;
 test.beforeEach(()=>{owner=randomUUID();other=randomUUID();char=randomUUID();activation=randomUUID();sql(`begin;
 insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@sharp.local','{}'),('${other}','${other}@sharp.local','{}');
 insert into characters(id,user_id,name,species,class_name,background,level,intelligence,hit_dice_spent,class_resources)
 values('${char}','${owner}','Linked effect fixture','Human','Psion','Sage',20,18,0,'{"psionic-energy-dice":12,"psion-disciplines":["destructive-thoughts"]}');commit;`);begin();});
 test.afterEach(()=>sql(`delete from action_logs where character_id='${char}';delete from characters where id='${char}';delete from auth.users where id in('${owner}','${other}');`));
 const run=(q:string,u=owner)=>JSON.parse(sql(auth(u,q)));
 function begin(id=activation,turn=0){
 const snapshot=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${char}'`);
 return run(`select begin_psionic_effect_roll('${char}','${id}','{"soloTurn":${turn}}','destructive-thoughts',array[2],1,4,'${snapshot}','{}')`);
 }
 const enhance=(id=randomUUID(),kind='enkindled',extra='array[3,8]',die='null',base=activation)=>`select enhance_psionic_effect_roll('${char}','${base}','${id}','${kind}',${extra}::integer[],${die})`;
 const finalize=(base=activation)=>`select finalize_psionic_effect_roll('${char}','${base}')`;
 const spent=()=>Number(sql(`select hit_dice_spent from characters where id='${char}'`));
 test('records the base roll once and keeps original timing across turn changes and retries',()=>{
 const first=run(finalize());expect(first.total).toBe(6);expect(first.rolls).toEqual([2]);expect(first.replayed).toBe(false);
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);
 const replay=run(finalize());expect(replay).toEqual({...first,replayed:true});expect(spent()).toBe(0);
 expect(()=>run(enhance())).toThrow(/already finalized/);
 });
 test('adds two paid extras then applies Surge to each die, with no extra Energy Die cost',()=>{
 const extra=enhance(),surge=enhance(randomUUID(),'surge','null','6');run(extra);run(surge);
 const final=run(finalize());expect(final.originalRolls).toEqual([2,3,8]);expect(final.rolls).toEqual([4,4,8]);expect(final.total).toBe(20);
 expect(spent()).toBe(3);expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${char}'`)).toBe('11');
 expect(run(extra).replayed).toBe(true);expect(run(surge).replayed).toBe(true);expect(spent()).toBe(3);
 });
 test('rejects changed requests, reversed enhancement order and a second Surge',()=>{
 const id=randomUUID();run(enhance(id,'surge','null','6'));
 expect(()=>run(enhance(id,'surge','null','8'))).toThrow(/Saved enhancement changed/);
 expect(()=>run(enhance())).toThrow(/before Surge/);expect(()=>run(enhance(randomUUID(),'surge','null','6'))).toThrow(/already attached/);expect(spent()).toBe(1);
 });
 test('cannot attach a generic paid enhancement retroactively',()=>{
 const id=randomUUID();run(`select spend_enkindled_life_force('${char}','${id}','{"soloTurn":0}',2,array[2],array[3,8],'Linked effect Mind')`);
 expect(()=>run(enhance(id))).toThrow(/identity already used/);expect(run(finalize()).total).toBe(6);expect(spent()).toBe(2);
 });
 test('new enhancements stop when the turn advances but paid replay remains available',()=>{
 const paid=enhance();run(paid);run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);
 expect(run(paid).replayed).toBe(true);expect(()=>run(enhance(randomUUID(),'surge','null','6'))).toThrow(/turn changed/);
 expect(run(finalize()).total).toBe(17);expect(spent()).toBe(2);
 });
 test('unrelated and anonymous users cannot finalize, enhance or inspect saved rolls',()=>{
 expect(()=>run(finalize(),other)).toThrow(/Character is unavailable/);expect(()=>run(enhance(),other)).toThrow(/Character is unavailable/);
 expect(()=>sql(`begin;set local role anon;select finalize_psionic_effect_roll('${char}','${activation}');commit;`)).toThrow(/permission denied/);
 expect(()=>sql(auth(owner,'select * from dndkeep_private.psionic_effect_rolls'))).toThrow(/permission denied/);expect(spent()).toBe(0);
 });
 test('another activation cannot reuse the first activations payment identity',()=>{
 const id=randomUUID();run(enhance(id));run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const next=randomUUID();begin(next,1);
 expect(()=>run(enhance(id,'enkindled','array[3,8]','null',next))).toThrow(/Saved enhancement changed/);expect(run(finalize(next)).total).toBe(6);
 });
 test('competing tabs pay only one enhancement and finalization cannot race in a different total',async()=>{
 const paid=enhance();const results=await Promise.all([parallel(auth(owner,paid)),parallel(auth(owner,paid))]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(spent()).toBe(2);
 const finish=await Promise.all([parallel(auth(owner,finalize())),parallel(auth(owner,finalize()))]);expect(finish.map(r=>r.code)).toEqual([0,0]);
 expect(finish.map(r=>JSON.parse(r.out).total)).toEqual([17,17]);expect(finish.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
 });
 test('invalid enhancement rolls or missing Hit Die pool leave no payment or association',()=>{
 expect(()=>run(enhance(randomUUID(),'enkindled','array[0]'))).toThrow(/Invalid Enkindled dice/);
 expect(()=>run(enhance(randomUUID(),'surge','null','null'))).toThrow(/Hit Die pool/);
 expect(spent()).toBe(0);expect(sql(`select count(*) from dndkeep_private.psionic_effect_enhancements where activation_id='${activation}'`)).toBe('0');
 });
 test('an enhancement racing finalization is either fully included or not spent',async()=>{
 const results=await Promise.all([parallel(auth(owner,enhance())),parallel(auth(owner,finalize()))]);
 expect(results[1].code).toBe(0);const result=run(finalize());
 if(results[0].code===0){expect(result.total).toBe(17);expect(spent()).toBe(2);}
 else{expect(result.total).toBe(6);expect(spent()).toBe(0);}
 });
 test('a current DM can recover the roll and loses access when the character leaves',()=>{
 const campaign=randomUUID();try{
 sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Linked effect DM');update characters set campaign_id='${campaign}' where id='${char}'`);
 expect(run(finalize(),other).total).toBe(6);sql(`update characters set campaign_id=null where id='${char}'`);
 expect(()=>run(finalize(),other)).toThrow(/Character is unavailable/);
 }finally{sql(`delete from campaigns where id='${campaign}'`);}
 });
 test('one owners other character cannot use this activation',()=>{
 const otherChar=randomUUID();try{
 sql(`insert into characters(id,user_id,name,species,class_name,background,level) values('${otherChar}','${owner}','Other','Human','Psion','Sage',20)`);
 expect(()=>run(`select finalize_psionic_effect_roll('${otherChar}','${activation}')`)).toThrow(/activation is unavailable/);
 expect(()=>run(`select enhance_psionic_effect_roll('${otherChar}','${activation}','${randomUUID()}','surge',null,6)`)).toThrow(/activation is unavailable/);
 }finally{sql(`delete from characters where id='${otherChar}'`);}
 });

 test('new base-only activations remain discoverable without browser storage',()=>{
 const rows=run(`select get_psionic_effect_roll_records('${char}')`);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({requestId:activation,total:6,finalized:false});
 expect(rows[0].modifier).toBe(4);expect(rows[0].sides).toBe(12);expect(rows[0].discipline).toBe('destructive-thoughts');const timestamp=rows[0].activatedAt;run(finalize());const confirmed=run(`select get_psionic_effect_roll_records('${char}')`);
 expect(confirmed[0]).toMatchObject({total:6,finalized:true,activatedAt:timestamp});
 });
 test('read previews match paid enhancements and finalized results exactly',()=>{
 run(enhance());run(enhance(randomUUID(),'surge','null','6'));const preview=run(`select get_psionic_effect_roll_records('${char}')`)[0];
 expect(preview).toMatchObject({originalRolls:[2,3,8],rolls:[4,4,8],total:20,finalized:false});
 const final=run(finalize());expect({...preview,expiredByLongRest:undefined,applied:undefined,finalized:undefined,incapacitationTracked:undefined,endedByIncapacitation:undefined,durationTracked:undefined,remainingSeconds:undefined,expiredByDuration:undefined}).toEqual({...final,expiredByLongRest:undefined,applied:undefined,replayed:undefined,finalized:undefined,incapacitationTracked:undefined,endedByIncapacitation:undefined,durationTracked:undefined,remainingSeconds:undefined,expiredByDuration:undefined});
 });
 test('unrelated users and anonymous callers cannot list records',()=>{
 expect(()=>run(`select get_psionic_effect_roll_records('${char}')`,other)).toThrow(/Character is unavailable/);
 expect(()=>sql(`begin;set local role anon;select get_psionic_effect_roll_records('${char}');commit;`)).toThrow(/permission denied/);
 });



 test('rejects retroactive linking of a generic base payment',()=>{
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const id=randomUUID();const snapshot=sql(`select request->'expected' from dndkeep_private.psionic_discipline_uses where request_id='${activation}'`);
 run(`select begin_psionic_discipline('${char}','${id}','{"soloTurn":1}','destructive-thoughts',array[2],1,4,'${snapshot}')`);
 expect(()=>run(`select begin_psionic_effect_roll('${char}','${id}','{"soloTurn":1}','destructive-thoughts',array[2],1,4,'${snapshot}','{}')`)).toThrow(/generic payment/);
 expect(()=>run(finalize(id))).toThrow(/no linked effect/);expect(()=>run(enhance(randomUUID(),'enkindled','array[3,8]','null',id))).toThrow(/no linked effect/);
 });
 test('base replay cannot change recovery context or charge again',()=>{
 const snapshot=sql(`select request->'expected' from dndkeep_private.psionic_discipline_uses where request_id='${activation}'`);
 expect(begin().replayed).toBe(true);
 expect(()=>run(`select begin_psionic_effect_roll('${char}','${activation}','{"soloTurn":0}','destructive-thoughts',array[2],1,4,'${snapshot}','{"target":"changed"}')`)).toThrow(/context changed/);
 expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${char}'`)).toBe('11');
 });
 test('multiple base dice retain their Intelligence modifier exactly once through both enhancements',()=>{
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const id=randomUUID();const snapshot=sql(`select request->'expected' from dndkeep_private.psionic_discipline_uses where request_id='${activation}'`);
 run(`select begin_psionic_effect_roll('${char}','${id}','{"soloTurn":1}','destructive-thoughts',array[1,2,3],3,4,'${snapshot}','{}')`);
 run(enhance(randomUUID(),'enkindled','array[3,8]','null',id));run(enhance(randomUUID(),'surge','null','6',id));
 const value=run(finalize(id));expect(value.originalRolls).toEqual([1,2,3,3,8]);expect(value.rolls).toEqual([4,4,4,4,8]);expect(value.total).toBe(28);expect(value.baseRolls).toEqual([1,2,3]);expect(value.enkindledRolls).toEqual([3,8]);
 expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${char}'`)).toBe('8');expect(spent()).toBe(3);
 });

 test('Biofeedback keeps the same linked payment math without applying temporary HP',()=>{
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);sql(`update characters set class_resources=jsonb_set(class_resources,'{psion-disciplines}','["biofeedback"]'),temp_hp=19 where id='${char}'`);
 const id=randomUUID(),snapshot=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${char}'`);
 run(`select begin_psionic_effect_roll('${char}','${id}','{"soloTurn":1}','biofeedback',array[2,3],2,4,'${snapshot}','{"purpose":"temporary HP"}')`);run(enhance(randomUUID(),'surge','null','6',id));
 expect(run(finalize(id))).toMatchObject({discipline:'biofeedback',originalRolls:[2,3],rolls:[4,4],modifier:4,total:12,context:{purpose:'temporary HP'}});expect(sql(`select temp_hp from characters where id='${char}'`)).toBe('19');
 });
 test('failure to save the linked record rolls back the base payment and turn claim',()=>{
 run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);const id=randomUUID();const snapshot=sql(`select request->'expected' from dndkeep_private.psionic_discipline_uses where request_id='${activation}'`);
 const name='e2e_effect_'+id.replaceAll('-','');
 try{
 sql(`create function dndkeep_private.${name}() returns trigger language plpgsql as $$begin raise exception 'receipt rejected';end;$$;create trigger ${name} before insert on dndkeep_private.psionic_effect_rolls for each row when(new.request_id='${id}') execute function dndkeep_private.${name}();`);
 expect(()=>run(`select begin_psionic_effect_roll('${char}','${id}','{"soloTurn":1}','destructive-thoughts',array[2],1,4,'${snapshot}','{}')`)).toThrow(/receipt rejected/);
 expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${char}'`)).toBe('11');expect(sql(`select count(*) from dndkeep_private.psionic_discipline_uses where request_id='${id}'`)).toBe('0');
 }finally{sql(`drop trigger if exists ${name} on dndkeep_private.psionic_effect_rolls;drop function if exists dndkeep_private.${name}();`);}
 expect(run(`select begin_psionic_effect_roll('${char}','${id}','{"soloTurn":1}','destructive-thoughts',array[2],1,4,'${snapshot}','{}')`).replayed).toBe(false);
 });

 function bio(){run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',0)`);sql(`update characters set class_resources=jsonb_set(class_resources,'{psion-disciplines}','["biofeedback"]') where id='${char}'`);const id=randomUUID(),snapshot=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${char}'`);run(`select begin_psionic_effect_roll('${char}','${id}','{"soloTurn":1}','biofeedback',array[2],1,4,'${snapshot}','{}')`);return id;}
 const applyBio=(id:string)=>`select apply_biofeedback_effect('${char}','${id}')`;
 test('Biofeedback keeps higher temporary HP and replay never restores consumed HP',()=>{
 const id=bio();run(finalize(id));sql(`update characters set current_hp=0,temp_hp=19,active_conditions=array['Unconscious'] where id='${char}'`);
 const applied=run(applyBio(id));expect(applied).toMatchObject({granted:6,beforeTempHP:19,afterTempHP:19,replayed:false});expect(applied.character).toMatchObject({current_hp:0,temp_hp:19,active_conditions:['Unconscious']});
 sql(`update characters set temp_hp=1 where id='${char}'`);const repeat=run(applyBio(id));expect(repeat).toMatchObject({afterTempHP:19,replayed:true,character:{temp_hp:1}});expect(sql(`select count(*) from action_logs where character_id='${char}' and action_name='Biofeedback'`)).toBe('1');expect(run(`select get_psionic_effect_roll_records('${char}')`).find((r:{requestId:string})=>r.requestId===id).applied).toBe(true);
 });
 test('unfinished, unrelated, anonymous and wrong-discipline application is rejected',()=>{
 const id=bio();expect(()=>run(applyBio(id))).toThrow(/Finalize/);run(finalize(id));expect(()=>run(applyBio(id),other)).toThrow(/Character is unavailable/);expect(()=>sql(`begin;set local role anon;${applyBio(id)};commit;`)).toThrow(/permission denied/);run(finalize());expect(()=>run(applyBio(activation))).toThrow(/Finalize/);
 });
 test('concurrent benefit requests apply once with one history entry',async()=>{
 const id=bio();run(finalize(id));const results=await Promise.all([parallel(auth(owner,applyBio(id))),parallel(auth(owner,applyBio(id)))]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(sql(`select temp_hp from characters where id='${char}'`)).toBe('6');expect(sql(`select count(*) from character_history where character_id='${char}' and description like 'Biofeedback: rolled %Applied once.'`)).toBe('1');
 });
 test('Biofeedback synchronizes its campaign map pool and refuses divergent pools',()=>{
 const id=bio();run(finalize(id));const camp=randomUUID(),outside=randomUUID(),cb=randomUUID(),otherCb=randomUUID();try{
 sql(`insert into campaigns(id,owner_id,name) values('${camp}','${owner}','Biofeedback map'),('${outside}','${other}','Other map');update characters set campaign_id='${camp}',temp_hp=2 where id='${char}';insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,temp_hp) values('${cb}','${camp}','${owner}','PC','character','${char}',3),('${otherCb}','${outside}','${owner}','Other','character','${char}',99);`);
 expect(()=>run(applyBio(id))).toThrow(/temporary HP differ/);expect(sql(`select temp_hp from characters where id='${char}'`)).toBe('2');expect(sql(`select applied_result is null from dndkeep_private.psionic_effect_rolls where request_id='${id}'`)).toBe('t');
 sql(`update combatants set temp_hp=2 where id='${cb}'`);run(applyBio(id));expect(sql(`select temp_hp from combatants where id='${cb}'`)).toBe('6');expect(sql(`select temp_hp from combatants where id='${otherCb}'`)).toBe('99');
 }finally{sql(`update characters set campaign_id=null where id='${char}';delete from campaigns where id in('${camp}','${outside}');`);}
 });
 test('failure to save the application receipt rolls back HP and history',()=>{
 const id=bio();run(finalize(id));const name='e2e_bio_'+id.replaceAll('-','');try{
 sql(`create function dndkeep_private.${name}() returns trigger language plpgsql as $$begin raise exception 'application rejected';end;$$;create trigger ${name} before update of applied_result on dndkeep_private.psionic_effect_rolls for each row when(new.request_id='${id}') execute function dndkeep_private.${name}();`);
 expect(()=>run(applyBio(id))).toThrow(/application rejected/);expect(sql(`select temp_hp from characters where id='${char}'`)).toBe('0');expect(sql(`select count(*) from character_history where character_id='${char}' and description like 'Biofeedback: rolled %Applied once.'`)).toBe('0');
 }finally{sql(`drop trigger if exists ${name} on dndkeep_private.psionic_effect_rolls;drop function if exists dndkeep_private.${name}();`);}
 expect(run(applyBio(id)).replayed).toBe(false);
 });

 function rest(kind:'short'|'long'){
 const keys=kind==='short'?['spell_slots','class_resources','feature_uses']:['current_hp','temp_hp','spell_slots','active_conditions','exhaustion_level','death_saves_successes','death_saves_failures','hit_dice_spent','class_resources','feature_uses','inventory','concentration_spell','concentration_rounds_remaining','concentration_slot_level'];
 return run(`select complete_psionic_rest('${char}','${randomUUID()}','${kind}',(select to_jsonb(c) from characters c where id='${char}'),(select jsonb_object_agg(key,value) from characters c,jsonb_each(to_jsonb(c)) where c.id='${char}' and key=any(array[${keys.map(k=>"'"+k+"'").join(',')}])))`);
 }
 test('a real long rest expires an unapplied benefit but not the ability to read an applied receipt',()=>{
 const id=bio();run(finalize(id));rest('long');expect(()=>run(applyBio(id))).toThrow(/Long Rest ended/);expect(run(`select get_psionic_effect_roll_records('${char}')`).find((r:{requestId:string})=>r.requestId===id).expiredByLongRest).toBe(true);expect(sql(`select temp_hp from characters where id='${char}'`)).toBe('0');
 });
 test('a long rest prevents new enhancement costs while preserving an existing payment replay',()=>{
 const id=bio(),paid=randomUUID();run(enhance(paid,'enkindled','array[2]','null',id));rest('long');
 expect(()=>run(enhance(randomUUID(),'surge','null','6',id))).toThrow(/Long Rest ended/);expect(run(enhance(paid,'enkindled','array[2]','null',id)).replayed).toBe(true);expect(spent()).toBe(0);
 });
 test('a short rest retains the benefit; an applied receipt cannot restore HP after a later long rest',()=>{
 const id=bio();run(finalize(id));rest('short');expect(run(applyBio(id)).afterTempHP).toBe(6);rest('long');expect(run(applyBio(id))).toMatchObject({replayed:true,character:{temp_hp:0}});expect(sql(`select temp_hp from characters where id='${char}'`)).toBe('0');
 });
 test('finalized but unapplied rolls remain recoverable beyond the completed history limit',()=>{
 run(finalize());for(let turn=1;turn<=6;turn++){run(`select advance_psionic_solo_turn('${char}','${randomUUID()}',${turn-1})`);const id=randomUUID();begin(id,turn);run(finalize(id));}
 const rows=run(`select get_psionic_effect_roll_records('${char}')`);expect(rows).toHaveLength(7);expect(rows.find((r:{requestId:string})=>r.requestId===activation)).toMatchObject({finalized:true,applied:false,total:6});
 });

 for(const targetKind of ['creature','character'] as const)test.describe(`combat delivery to ${targetKind}`,()=>{
 let camp:string,enc:string,self:string,target:string,cbSelf:string,cbTarget:string,id:string,targetCharacter:string;
 test.beforeEach(()=>{
  camp=randomUUID();enc=randomUUID();self=randomUUID();target=randomUUID();cbSelf=randomUUID();cbTarget=randomUUID();id=randomUUID();targetCharacter=randomUUID();
  if(targetKind==='character')sql(`insert into characters(id,user_id,name,species,class_name,background) values('${targetCharacter}','${other}','Goblin','Human','Fighter','Soldier')`);
  const targetEntity=targetKind==='character'?targetCharacter:'goblin';
  sql(`insert into campaigns(id,owner_id,name) values('${camp}','${other}','Linked delivery');insert into campaign_members(campaign_id,user_id,role) values('${camp}','${owner}','player');update characters set campaign_id='${camp}' where id='${char}';
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${cbSelf}','${camp}','${owner}','Psion','character','${char}',30,30),('${cbTarget}','${camp}','${other}','Goblin','${targetKind==='character'?'character':'custom'}','${targetEntity}',30,30);
   insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
   insert into combat_participants(id,campaign_id,encounter_id,name,participant_type,entity_id,combatant_id,turn_order) values('${self}','${camp}','${enc}','Psion','character','${char}','${cbSelf}',0),('${target}','${camp}','${enc}','Goblin','${targetKind}','${targetEntity}','${cbTarget}',1);`);
  const metadata={characterName:'Psion',targetName:'Goblin',target:{id:target,entity_id:targetEntity,participant_type:targetKind,combatant_id:cbTarget},context:{campaignId:camp,encounterId:enc,self:{id:self,entity_id:char,participant_type:'character',combatant_id:cbSelf}}};
  const snapshot=sql(`select request->'expected' from dndkeep_private.psionic_discipline_uses where request_id='${activation}'`);
  const turn=JSON.stringify(run(`select get_enkindled_turn('${char}')`).turn);
  run(`select begin_psionic_effect_roll('${char}','${id}','${turn}','destructive-thoughts',array[2,3],2,4,'${snapshot}','${JSON.stringify(metadata)}')`);
 });
 test.afterEach(()=>sql(`update characters set campaign_id=null where id='${char}';delete from campaigns where id='${camp}';delete from characters where id='${targetCharacter}';`));
 const queue=()=>`select queue_destructive_thoughts_effect('${char}','${id}')`;
 test('queues exact finalized enhanced dice once and does not recreate a deleted declaration',()=>{
  run(enhance(randomUUID(),'surge','null','6',id));run(finalize(id));
  expect(run(queue())).toMatchObject({attackId:id,replayed:false});expect(run(queue()).replayed).toBe(true);
  expect(JSON.parse(sql(`select jsonb_build_object('dice',psionic_damage_dice,'total',damage_dice,'target',target_participant_id) from pending_attacks where id='${id}'`))).toEqual({dice:{version:1,sides:12,originalRolls:[2,3],rolls:[4,4],modifier:4},total:'12',target});
  expect(sql(`select count(*) from combat_events where campaign_id='${camp}' and event_type='attack_declared'`)).toBe('1');
  expect(sql(`select target_type from combat_events where campaign_id='${camp}' and event_type='attack_declared'`)).toBe(targetKind==='character'?'player':'creature');
  sql(`delete from pending_attacks where id='${id}';update combat_encounters set status='ended' where id='${enc}'`);expect(run(queue()).replayed).toBe(true);expect(sql(`select count(*) from pending_attacks where id='${id}'`)).toBe('0');
 });
 test('concurrent delivery creates a single declaration and receipt',async()=>{
  run(finalize(id));const results=await Promise.all([parallel(auth(owner,queue())),parallel(auth(owner,queue()))]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(sql(`select count(*) from pending_attacks where id='${id}'`)).toBe('1');
 });
 for(const kind of ['target identity','actor identity','target map piece','hidden target','ended encounter'])test(`refuses changed ${kind} before inserting a declaration`,()=>{
  run(finalize(id));
  const mutations:Record<string,string>={'target identity':`update combat_participants set entity_id='dragon' where id='${target}'`,'actor identity':`update combat_participants set entity_id='other-character' where id='${self}'`,'target map piece':`update combatants set definition_id='dragon' where id='${cbTarget}'`,'hidden target':`update combat_participants set hidden_from_players=true where id='${target}'`,'ended encounter':`update combat_encounters set status='ended' where id='${enc}'`};sql(mutations[kind]);
  expect(()=>run(queue())).toThrow(/changed|hidden|ended/);expect(sql(`select count(*) from pending_attacks where id='${id}'`)).toBe('0');expect(sql(`select applied_result is null from dndkeep_private.psionic_effect_rolls where request_id='${id}'`)).toBe('t');
 });
 test('unfinished and unauthorized rolls cannot be delivered',()=>{
  expect(()=>run(queue())).toThrow(/Finalize/);run(finalize(id));const stranger=randomUUID();try{sql(`insert into auth.users(id,email,raw_user_meta_data) values('${stranger}','${stranger}@effect.local','{}')`);expect(()=>run(queue(),stranger)).toThrow(/Character is unavailable/);expect(()=>sql(`begin;set local role anon;${queue()};commit;`)).toThrow(/permission denied/);}finally{sql(`delete from auth.users where id='${stranger}'`);}
 });
 test('renames retain identity and use current names',()=>{
  run(finalize(id));sql(`update combat_participants set name='Renamed Goblin' where id='${target}'`);run(queue());expect(sql(`select target_name from pending_attacks where id='${id}'`)).toBe('Renamed Goblin');
 });
 test('a failed receipt rolls back both declaration and event',()=>{
  run(finalize(id));const name='e2e_delivery_'+id.replaceAll('-','');try{
   sql(`create function dndkeep_private.${name}() returns trigger language plpgsql as $$begin raise exception 'delivery rejected';end;$$;create trigger ${name} before update of applied_result on dndkeep_private.psionic_effect_rolls for each row when(new.request_id='${id}') execute function dndkeep_private.${name}();`);
   expect(()=>run(queue())).toThrow(/delivery rejected/);expect(sql(`select count(*) from pending_attacks where id='${id}'`)).toBe('0');expect(sql(`select count(*) from combat_events where campaign_id='${camp}' and event_type='attack_declared'`)).toBe('0');
  }finally{sql(`drop trigger if exists ${name} on dndkeep_private.psionic_effect_rolls;drop function if exists dndkeep_private.${name}();`);}
  expect(run(queue()).replayed).toBe(false);
 });
 });

});
