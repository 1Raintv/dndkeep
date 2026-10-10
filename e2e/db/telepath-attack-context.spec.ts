import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
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
  sql(`update pending_attacks set attacker_participant_id='${enemy}',state='damage_rolled' where id='${attack}'`);expect(()=>context()).toThrow();
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
 test('allows off-turn reactions but rejects an inactive encounter',()=>{
  sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);
  expect(context()).toMatchObject({reactionAvailable:true,budget:{context:{isOwnTurn:false}}});
  sql(`update combat_encounters set status='setup' where id='${encounter}'`);expect(()=>context()).toThrow();
 });
 test('anonymous callers cannot invoke either context entry point',()=>{
  expect(sql(`select has_function_privilege('anon','public.get_telepath_attack_context(uuid,uuid,text)','execute') or has_function_privilege('anon','dndkeep_private.telepath_attack_context(uuid,uuid,text)','execute')`)).toBe('f');
 });

});
