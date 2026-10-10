import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Propel participant bindings',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,character:string,campaign:string,encounter:string,caster:string,target:string,id:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,character,campaign,encounter,caster,target,id]=Array.from({length:9},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@propelsave.local','{}'),('${dm}','${dm}@propelsave.local','{}'),('${outsider}','${outsider}@propelsave.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Propel saves');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,class_resources) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5,'{"psionic-energy-dice":2}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,in_lair) values('${encounter}','${campaign}','active',1,0,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
    ('${caster}','${encounter}','${campaign}','character','${character}','Psion',0),('${target}','${encounter}','${campaign}','creature','${target}','Target',1);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}';`);
  const turn=JSON.parse(sql(auth(owner,`select psionic_propel('${character}','context')`))).turnId;
  const payload=JSON.stringify({requestId:id,turnId:turn,mode:'powered',movement:'push',roll:3,target:{participantId:target,legalTargetConfirmed:true}});
  sql(auth(owner,`select psionic_propel('${character}','begin','${payload}');select psionic_propel('${character}','finalize','{"declarationId":"${id}"}')`));
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));
 const context=()=>JSON.parse(sql(auth(owner,`select get_propel_save_context('${character}','${id}')`)));
 const settle=()=>JSON.parse(sql(auth(owner,`select settle_propel_save('${character}','${id}','${JSON.stringify(context())}',10,array[2],0,0,'[]',3)`)));
 const binding=()=>JSON.parse(sql(`select participant_bindings from dndkeep_private.propel_declarations where request_id='${id}'`));
 test('captures the original actor and target, excluding display names',()=>{
  expect(binding()).toMatchObject({campaignId:campaign,encounterId:encounter,actor:{id:caster,entityId:character},target:{id:target,entityId:target}});
  sql(`update combat_participants set name='Renamed' where id='${target}'`);
  expect(settle()).toMatchObject({finalOutcome:'failed',record:{result:{energyCost:1}}});
 });
 for(const change of ['target entity','caster entity','target piece','caster piece'])test(`rejects changed ${change} and rolls back energy and save receipt`,()=>{
  const who=change.startsWith('target')?target:caster;
  if(change.endsWith('entity')){const replacement=randomUUID();sql(`update combat_participants set entity_id='${replacement}' where id='${who}';update combatants set definition_id='${replacement}' where id=(select combatant_id from combat_participants where id='${who}')`);}
  else sql(`update combatants set definition_id='${randomUUID()}' where id=(select combatant_id from combat_participants where id='${who}')`);
  expect(()=>settle()).toThrow(/original Propel|query returned no rows|Saving target definition changed/);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('2');
  expect(sql(`select count(*) from dndkeep_private.propel_save_receipts where declaration_id='${id}'`)).toBe('0');
  expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('0');
  expect(sql(`select outcome is null from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('t');
 });
 test('rejects finalizing dice after the original target changes',()=>{
  sql(`update dndkeep_private.propel_declarations set roll_result=null where request_id='${id}'`);
  sql(`update combatants set definition_id='${randomUUID()}' where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(()=>sql(auth(owner,`select psionic_propel('${character}','finalize','{"declarationId":"${id}"}')`))).toThrow(/original Propel/);
  expect(sql(`select roll_result is null from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('t');
 });
 test('rejects reassignment to another map piece even with the same roster ID',()=>{
  const replacement=randomUUID();
  sql(`insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) select '${replacement}',campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp from combatants where id=(select combatant_id from combat_participants where id='${target}');update combat_participants set combatant_id='${replacement}' where id='${target}'`);
  expect(()=>settle()).toThrow(/original Propel|Saving target definition changed/);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('2');
 });
 test('allows cancellation after target replacement without spending a die',()=>{
  sql(`update combatants set definition_id='${randomUUID()}' where id=(select combatant_id from combat_participants where id='${target}')`);
  const result=JSON.parse(sql(auth(owner,`select psionic_propel('${character}','finish','{"declarationId":"${id}","outcome":"cancelled","save":null}')`)));
  expect(result).toMatchObject({outcome:'cancelled',result:{energyCost:0}});
 });
 test('does not rewrite or revalidate an already completed receipt on replay',()=>{
  const result=settle();
  sql(`update combatants set definition_id='${randomUUID()}' where id=(select combatant_id from combat_participants where id='${target}')`);
  const replay=JSON.parse(sql(auth(owner,`select get_propel_save('${character}','${id}')`)));
  expect(replay.record.result).toEqual(result.record.result);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('1');
 });
 test('denies public helper access and refuses binding rewrites',()=>{
  expect(sql(`select has_function_privilege('authenticated','dndkeep_private.propel_current_bindings(uuid,uuid,uuid)','execute')`)).toBe('f');
  expect(()=>sql(`update dndkeep_private.propel_declarations set participant_bindings=null where request_id='${id}'`)).toThrow(/cannot be rewritten/);
 });
});
