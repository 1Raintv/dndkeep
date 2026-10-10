import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(query:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('Telepath attack context',()=>{
 gateDbSuite();let owner:string,other:string,character:string,campaign:string,encounter:string,participant:string,enemy:string;
 test.beforeEach(()=>{
  [owner,other,character,campaign,encounter,participant,enemy]=Array.from({length:7},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@action.local','{}'),('${other}','${other}@action.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Telepath context');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${participant}','${encounter}','${campaign}','character','${character}','Psion',0),
   ('${enemy}','${encounter}','${campaign}','creature','${enemy}','Enemy',1);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}';`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});

 let attack:string;
 test.beforeEach(()=>{
  attack=randomUUID();
  sql(`update characters set subclass='Telepath',level=10,current_hp=20,max_hp=20,class_resources='{"psionic-energy-dice":8}' where id='${character}';
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${participant}','Telepath','character','Strike','attack_roll',5,15,'${randomUUID()}')`);
  const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:participant,d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'};
  sql(`update pending_attacks set state='attack_rolled',attack_d20=12,attack_total=17,hit_result='hit',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
 });
 const context=(feature='distraction',user?:string)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${user??owner}","role":"authenticated"}';set local role authenticated;select public.get_telepath_attack_context('${character}','${attack}','${feature}');rollback;`));
 test('returns a scoped current hit without spending and requires spatial review',()=>{
  expect(context()).toMatchObject({characterId:character,psionLevel:10,energyRemaining:8,telepathyRange:60,rangeVerified:true,reactionAvailable:true,spatialReviewRequired:true,subject:{participantId:enemy,self:false},attack:{id:attack,total:17,result:'hit'}});
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('0');
 });
 test('enforces ownership, subclass and level',()=>{
  expect(()=>context('distraction',other)).toThrow();
  sql(`update characters set subclass='Psi Warper' where id='${character}'`);expect(()=>context()).toThrow();
  sql(`update characters set subclass='Telepath',level=2 where id='${character}'`);expect(()=>context()).toThrow();
 });
 test('Bolstering uses the current miss and rejects a hit or low level',()=>{
  expect(()=>context('bolstering')).toThrow();
  sql(`update pending_attacks set target_ac=20,hit_result='miss' where id='${attack}'`);
  expect(context('bolstering')).toMatchObject({attack:{total:17,targetAC:20,result:'miss'}});expect(()=>context()).toThrow();
  sql(`update characters set level=9 where id='${character}'`);expect(()=>context('bolstering')).toThrow();
 });
 test('reports spent Reaction and incapacitation',()=>{
  sql(`update combat_participants set reaction_used=true where id='${participant}'`);expect(context().reactionAvailable).toBe(false);
  sql(`update combat_participants set reaction_used=false where id='${participant}';update combatants set active_conditions=array['Incapacitated'] where id=(select combatant_id from combat_participants where id='${participant}')`);expect(context().reactionAvailable).toBe(false);
 });
 test('rejects changed identities, terminal state and inconsistent outcomes',()=>{
  sql(`update pending_attacks set attacker_participant_id='${participant}' where id='${attack}'`);expect(()=>context()).toThrow();
  sql(`update pending_attacks set attacker_participant_id='${enemy}' where id='${attack}';
   begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';
   select public.attack_reaction_offers('${attack}','post_attack_roll',(select updated_at from pending_attacks where id='${attack}'),array[]::text[]);
   update pending_attacks set state='damage_rolled' where id='${attack}';commit;`);expect(()=>context()).toThrow();
  sql(`update pending_attacks set state='attack_rolled',hit_result='miss' where id='${attack}'`);expect(()=>context('bolstering')).toThrow();
 });
 test('rejects malformed energy pools',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":9}' where id='${character}'`);expect(()=>context()).toThrow();
 });
 test('Connection range requires a finished roll and expires with game time',()=>{
  const request=randomUUID();sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select public.psionic_connection('${character}','begin',jsonb_build_object('requestId','${request}','turnId',dndkeep_private.action_turn_context('${character}')->>'turnId','roll',2,'free',true));commit;`);
  expect(context()).toMatchObject({rangeVerified:false,telepathyRange:null});
  sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select public.psionic_connection('${character}','finish',jsonb_build_object('declarationId','${request}'));commit;`);
  expect(context()).toMatchObject({rangeVerified:true,telepathyRange:80});
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3600 where character_id='${character}'`);expect(context().telepathyRange).toBe(60);
 });
 test('rejects an old unresolved attack after advancing, rewinding or leaving combat',()=>{
  sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);expect(()=>context()).toThrow();
  sql(`update combat_encounters set current_turn_index=0 where id='${encounter}'`);expect(()=>context()).toThrow();
  sql(`update combat_encounters set status='setup' where id='${encounter}'`);expect(()=>context()).toThrow();
 });
 test('a fresh attack rolled on an enemy turn still permits the off-turn Reaction',()=>{
  sql(`update combat_encounters set current_turn_index=1 where id='${encounter}';delete from pending_attacks where id='${attack}';
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${participant}','Telepath','character','Strike','attack_roll',5,15,'${randomUUID()}')`);
  const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:participant,d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'};
  sql(`update pending_attacks set state='attack_rolled',attack_d20=12,attack_total=17,hit_result='hit',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
  const ctx=context();expect(ctx).toMatchObject({reactionAvailable:true,budget:{context:{isOwnTurn:false}}});expect(ctx.attack.triggerTurnId).toBe(ctx.budget.context.turnId);
  const d=beginSaved(3);expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,result:'miss'});
 });
 test('original participant/combatant identities cannot be rebound before reaction preparation',()=>{
  sql(`update combat_participants set entity_id='other' where id='${enemy}'`);expect(()=>context()).toThrow();
  sql(`update combat_participants set entity_id='${enemy}' where id='${enemy}';update combatants set definition_id='different' where id=(select combatant_id from combat_participants where id='${participant}')`);expect(()=>context()).toThrow();
 });
 test('does not invent original context for a legacy roll',()=>{
  sql(`delete from dndkeep_private.attack_reaction_origins where attack_id='${attack}'`);expect(()=>context()).toThrow();
  sql(`update pending_attacks set target_ac=16 where id='${attack}'`);expect(()=>context()).toThrow();
 });
 const beginSaved=(roll:number,feature='distraction',review:unknown={distanceFeet:30,visible:true,confirmed:true},request=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';
  select dndkeep_private.begin_telepath_reaction('${character}','${request}','${attack}','${feature}',dndkeep_private.telepath_attack_context('${character}','${attack}','${feature}'),${roll},'${JSON.stringify(review)}');commit;`));
 const finishSaved=(request:string,cancel=false)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.finish_telepath_reaction('${character}','${request}',${cancel});commit;`));
 test('saved Distraction spends Reaction once and charges energy only when the hit becomes a miss',()=>{
  const d=beginSaved(3);expect(d).toMatchObject({base_roll:3,result:null});
  expect(sql(`select reaction_used from combat_participants where id='${participant}'`)).toBe('t');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('8');
  expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow();
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,reactionCost:1,originalTotal:17,total:14,result:'miss',changed:true,replayed:false});
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,total:14,replayed:true});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('7');
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${d.request_id}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${d.request_id}'`)).toBe('1');
  expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe('accepted');
 });
 test('an ineffective Distraction retains its Energy Die and still spends Reaction',()=>{
  const d=beginSaved(2);expect(finishSaved(d.request_id)).toMatchObject({energyCost:0,energy:null,reactionCost:1,total:15,result:'hit',changed:false});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('8');
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${d.request_id}'`)).toBe('0');
 });
 test('Bolstering turns a missed attack into a hit with one conditional payment',()=>{
  sql(`update pending_attacks set target_ac=20,hit_result='miss' where id='${attack}'`);const d=beginSaved(3,'bolstering');
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,total:20,result:'hit',changed:true});
 });

 test('saved Bolstering invalidates a prior empty check and permits the target Shield offer',()=>{
  const defender=randomUUID(),defenderParticipant=randomUUID();
  try{
   sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,known_spells,spell_slots) values('${defender}','${other}','${campaign}','Defender','Human','Wizard','Sage',5,array['shield'],'{"1":{"total":2,"used":0}}');
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${defenderParticipant}','${encounter}','${campaign}','character','${defender}','Defender',2);
    update combatants set definition_id='${defender}' where id=(select combatant_id from combat_participants where id='${defenderParticipant}');
    delete from pending_attacks where id='${attack}';
    insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
    values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${defenderParticipant}','Defender','character','Strike','attack_roll',5,20,'${randomUUID()}');`);
   const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:defenderParticipant,d20:12,total:17,targetAC:20,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'miss'};
   sql(`update pending_attacks set state='attack_rolled',attack_d20=12,attack_total=17,hit_result='miss',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
   const check=(keys:string[]|null)=>sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;
    select public.attack_reaction_offers('${attack}','post_attack_roll',(select updated_at from pending_attacks where id='${attack}'),${keys===null?'null':`array[${keys.map(k=>`'${k}'`).join(',')}]::text[]`});commit;`);
   expect(JSON.parse(check([])).offerCount).toBe(0);
   const d=beginSaved(3,'bolstering');expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,result:'hit',total:20});
   const current=sql(`select revision from dndkeep_private.attack_reaction_revisions where attack_id='${attack}'`);
   expect(check(null)).toBe('');expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Recover the attack reaction check/);
   expect(finishSaved(d.request_id).replayed).toBe(true);expect(sql(`select revision from dndkeep_private.attack_reaction_revisions where attack_id='${attack}'`)).toBe(current);
   expect(JSON.parse(check(['shield'])).offerCount).toBe(1);
   expect(sql(`select reactor_participant_id from pending_reactions where pending_attack_id='${attack}' and reaction_key='shield'`)).toBe(defenderParticipant);
   expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Resolve offered reactions/);
  }finally{sql(`delete from characters where id='${defender}'`);}
 });
 test('saved declarations recover exactly and refuse changed rolls on the same identity',()=>{
  const d=beginSaved(3),expected=JSON.stringify(d.context),review=JSON.stringify(d.review);
  const replay=(roll:number)=>sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.begin_telepath_reaction('${character}','${d.request_id}','${attack}','distraction','${expected}',${roll},'${review}');commit;`);
  expect(JSON.parse(replay(3))).toMatchObject({replayed:true,base_roll:3});expect(()=>replay(4)).toThrow();
  expect(()=>beginSaved(3)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,reactionCost:1,energyCost:0});
  expect(()=>finishSaved(d.request_id)).toThrow();
 });
 test('range, visibility, resource and die validation happen before the Reaction claim',()=>{
  for(const review of [{distanceFeet:61,visible:true,confirmed:true},{distanceFeet:30,visible:false,confirmed:true},{distanceFeet:30,visible:true,confirmed:false}])expect(()=>beginSaved(3,'distraction',review)).toThrow();
  expect(()=>beginSaved(9)).toThrow();
  sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);expect(()=>beginSaved(3)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('0');
 });
 test('changed attack or depleted energy never partially settles the saved result',()=>{
  const d=beginSaved(3);sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(sql(`select attack_total from pending_attacks where id='${attack}'`)).toBe('17');
  expect(sql(`select result is null from dndkeep_private.telepath_declarations where request_id='${d.request_id}'`)).toBe('t');
  sql(`update characters set class_resources='{"psionic-energy-dice":8}' where id='${character}';update pending_attacks set target_ac=16 where id='${attack}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0});
 });
 test('timer/decline/delete cannot erase a paid Reaction before explicit saved cancellation',()=>{
  const d=beginSaved(3);
  for(const state of ['expired','declined','accepted'])expect(()=>sql(`update pending_reactions set state='${state}' where id='${d.request_id}'`)).toThrow();
  expect(()=>sql(`delete from pending_reactions where id='${d.request_id}'`)).toThrow();
  expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true});
  expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe('declined');
  expect(()=>sql(`update pending_reactions set state='offered' where id='${d.request_id}'`)).toThrow();
 });
 test('rebound participants and changed turns require cancellation without spending energy',()=>{
  const d=beginSaved(3);sql(`update combat_participants set entity_id='other-creature' where id='${enemy}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(sql(`select attack_total from pending_attacks where id='${attack}'`)).toBe('17');
  sql(`update combat_participants set entity_id='${enemy}' where id='${enemy}';update combat_encounters set current_turn_index=1 where id='${encounter}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0});
 });
 test('changed Psion progression requires cancellation, and saved payments remain untouched',()=>{
  const d=beginSaved(3);sql(`update characters set subclass='Psi Warper' where id='${character}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0});
 });
 test('a natural 20 remains a critical hit even after Distraction lowers its total',()=>{
  // A new original roll, never a rewrite of immutable evidence.
  sql(`delete from pending_attacks where id='${attack}';insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${participant}','Telepath','character','Strike','attack_roll',0,20,'${randomUUID()}')`);
  const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:participant,d20:20,total:20,targetAC:20,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'crit'};
  sql(`update pending_attacks set state='attack_rolled',attack_d20=20,attack_total=20,hit_result='crit',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
  const d=beginSaved(8);expect(finishSaved(d.request_id)).toMatchObject({total:12,result:'crit',changed:false,energyCost:0});
 });
 test('simultaneous completion requests spend once and return the same attack result',async()=>{
  const d=beginSaved(3),query=`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.finish_telepath_reaction('${character}','${d.request_id}',false);commit;`;
  const run=()=>new Promise<Record<string,unknown>>((resolve,reject)=>{
   const process=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';
   process.stdout.on('data',data=>out+=data);process.stderr.on('data',data=>err+=data);process.on('error',reject);
   process.on('close',code=>{if(code)reject(new Error(err));else{try{resolve(JSON.parse(out.trim()));}catch(error){reject(error);}}});process.stdin.end(query);
  });
  const results=await Promise.all([run(),run()]);expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
  for(const result of results)expect(result).toMatchObject({total:14,result:'miss',energyCost:1});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('7');
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${d.request_id}'`)).toBe('1');
 });
 const enhanceSaved=(declaration:string,kind='surge',extra:number[]|null=null,die:number|null=6,request=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';
  select dndkeep_private.enhance_telepath_reaction('${character}','${declaration}','${request}','${kind}',${extra?'array['+extra.join(',')+']':'null'},${die??'null'});commit;`));
 test('linked Surge is spent once and its adjusted roll survives completion/retry',()=>{
  const d=beginSaved(2),request=randomUUID();expect(enhanceSaved(d.request_id,'surge',null,6,request)).toMatchObject({total:4,hitDiceSpent:1});
  expect(enhanceSaved(d.request_id,'surge',null,6,request)).toMatchObject({replayed:true,total:4,hitDiceSpent:1});
  expect(finishSaved(d.request_id)).toMatchObject({roll:4,originalRolls:[2],rolls:[4],usedSurge:true,total:13,energyCost:1});
  expect(enhanceSaved(d.request_id,'surge',null,6,request)).toMatchObject({replayed:true});
  expect(()=>enhanceSaved(d.request_id)).toThrow();expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
 });
 test('Enkindled extra dice and Surge affect the saved total but cost only one conditional Energy Die',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}',hit_dice_spent=0 where id='${character}'`);
  const d=beginSaved(2);expect(enhanceSaved(d.request_id,'enkindled',[6,9],null)).toMatchObject({extraRolls:[6,9],hitDiceSpent:2});
  expect(enhanceSaved(d.request_id)).toMatchObject({total:19,hitDiceSpent:3});
  expect(finishSaved(d.request_id)).toMatchObject({roll:19,originalRolls:[2,6,9],enkindledRolls:[6,9],rolls:[4,6,9],usedSurge:true,total:-2,result:'miss',energyCost:1});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('11');
 });
 test('ineffective enhanced reactions retain Energy Dice while paid Hit Dice stay spent',()=>{
  sql(`update pending_attacks set target_ac=5 where id='${attack}'`);const d=beginSaved(2);enhanceSaved(d.request_id);
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:0,usedSurge:true,changed:false,total:13});
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('8');
 });
 test('canceling an enhanced reaction keeps Hit Dice and Reaction spent, without an Energy Die charge',()=>{
  const d=beginSaved(2);enhanceSaved(d.request_id);expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0,reactionCost:1});
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');expect(()=>enhanceSaved(d.request_id)).toThrow();
 });
 test('rejects unearned Enkindled, a wrong Hit Die pool, changed attack and changed roster before enhancement payment',()=>{
  const d=beginSaved(2);expect(()=>enhanceSaved(d.request_id,'enkindled',[2],null)).toThrow();expect(()=>enhanceSaved(d.request_id,'surge',null,8)).toThrow();
  sql(`update combat_participants set entity_id='changed' where id='${enemy}'`);expect(()=>enhanceSaved(d.request_id)).toThrow();
  sql(`update combat_participants set entity_id='${enemy}' where id='${enemy}';update pending_attacks set target_ac=16 where id='${attack}'`);expect(()=>enhanceSaved(d.request_id)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });
 test('Enkindled must precede Surge and each enhancement kind has one saved identity',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}' where id='${character}'`);
  const d=beginSaved(2);enhanceSaved(d.request_id);expect(()=>enhanceSaved(d.request_id,'enkindled',[2],null)).toThrow();expect(()=>enhanceSaved(d.request_id)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
 });

 test('the unfinished lifecycle is private and cannot be called by app roles',()=>{
  for(const role of ['anon','authenticated']){
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.begin_telepath_reaction(uuid,uuid,uuid,text,jsonb,integer,jsonb)','execute') or has_function_privilege('${role}','dndkeep_private.finish_telepath_reaction(uuid,uuid,boolean)','execute') or has_function_privilege('${role}','dndkeep_private.enhance_telepath_reaction(uuid,uuid,uuid,text,integer[],integer)','execute') or has_table_privilege('${role}','dndkeep_private.telepath_enhancements','select') or has_table_privilege('${role}','dndkeep_private.telepath_declarations','select') or has_table_privilege('${role}','dndkeep_private.attack_reaction_origins','select')`)).toBe('f');
  }
 });

 test('anonymous callers cannot invoke either context entry point',()=>{
  expect(sql(`select has_function_privilege('anon','public.get_telepath_attack_context(uuid,uuid,text)','execute') or has_function_privilege('anon','dndkeep_private.telepath_attack_context(uuid,uuid,text)','execute')`)).toBe('f');
 });

 test('browser validates real context and measures the exact placed subject',async({page})=>{
  const scene=randomUUID();
  sql(`update auth.users set instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data=jsonb_build_object('provider','email','providers',jsonb_build_array('email')),created_at=now(),updated_at=now(),confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@action.local'),'email',now(),now(),now());
   update campaigns set use_combatants_for_battlemap=true where id='${campaign}';
   insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published) values('${scene}','${campaign}','${owner}','Telepath range','square',70,20,20,'bright',true);
   insert into scene_token_placements(scene_id,combatant_id,x,y,size_override) select '${scene}',combatant_id,35,35,'medium' from combat_participants where id='${participant}';
   insert into scene_token_placements(scene_id,combatant_id,x,y,size_override) select '${scene}',combatant_id,455,35,'medium' from combat_participants where id='${enemy}';`);
  await signInAsSeedDm(page,`${owner}@action.local`);
  const result=await page.evaluate(async({character,attack,scene})=>{
   const {getTelepathAttackContext}=await import('/src/lib/api/telepathReactions.ts');
   const {loadTelepathSpatialEvidence}=await import('/src/lib/telepathSpatialEvidence.ts');
   const context=await getTelepathAttackContext(character,attack,'distraction');
   return {context,spatial:await loadTelepathSpatialEvidence(context,scene)};
  },{character,attack,scene});
  expect(result.context).toMatchObject({reactionAvailable:true,telepathyRange:60,spatialReviewRequired:true});
  expect(result.spatial).toMatchObject({status:'measured',distanceFeet:30,visibilityReviewRequired:true});
 });

});
