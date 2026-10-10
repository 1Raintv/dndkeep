import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Authoritative aura preparation',()=>{
 gateDbSuite();let dm:string,player:string,campaign:string,enc:string,a:string,b:string,ca:string,cb:string,pa:string,pb:string,turn:string;
 test.beforeEach(()=>{
  [dm,player,campaign,enc,a,b,ca,cb,pa,pb]=Array.from({length:10},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@aura.local','{}'),('${player}','${player}@aura.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Aura fixture');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,current_hp,max_hp) values('${a}','${player}','${campaign}','A','Human','Psion','Sage',20,20),('${b}','${dm}','${campaign}','B','Human','Fighter','Sage',20,20);
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${ca}','${campaign}','${player}','A','character','${a}',20,20),('${cb}','${campaign}','${dm}','B','character','${b}',20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,1);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${pa}','${enc}','${campaign}','character','${a}','A',0,'${ca}'),('${pb}','${enc}','${campaign}','character','${b}','B',1,'${cb}');commit;`);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);writeAura();
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id in('${a}','${b}');delete from homebrew_monsters where id='${b}';delete from monsters where id='${b}';delete from auth.users where id in('${dm}','${player}')`));
 function aura(){return {key:'aura:fixture',name:'Aura',casterParticipantId:pa,aura:{key:'fixture',name:'Aura',radiusFt:15,saveAbility:'WIS',saveDC:14,damageDice:'3d8',damageType:'radiant',halfOnSave:true,triggers:['turn_end','creature_entered','emanation_entered'],exemptParticipantIds:[],speedInside:'half',affects:'all'}};}
 function writeAura(value:unknown=[aura()]){sql(`update combatants set active_buffs='${JSON.stringify(value).replaceAll("'","''")}' where id='${ca}'`);}
 const call=(trigger='turn_end',expected=turn,origin=pa,target=pb)=>`select get_aura_resolution_context('${enc}','${expected}','${origin}','${target}','fixture','${trigger}')`;
 const read=()=>JSON.parse(sql(auth(dm,call())));
 const state=()=>sql(`select jsonb_build_object('characters',(select jsonb_agg(to_jsonb(c) order by id) from characters c where id in('${a}','${b}')),'combatants',(select jsonb_agg(to_jsonb(c) order by id) from combatants c where id in('${ca}','${cb}')),'participants',(select jsonb_agg(to_jsonb(p) order by id) from combat_participants p where encounter_id='${enc}'),'encounter',(select to_jsonb(e) from combat_encounters e where id='${enc}'))`);
 test('reads the stored aura and shared save/damage context without mutating anything',()=>{
  const before=state(),result=read();expect(result).toMatchObject({encounterId:enc,campaignId:campaign,turnId:turn,trigger:'turn_end',aura:aura(),marker:`aura_save:${pa}:fixture`,markers:[],geometryVerified:false,
   origin:{participant:{id:pa}},target:{participant:{id:pb}},save:{target:{id:pb},autoFail:false},partyDamage:{participant:{id:pb},pools:{current_hp:20,max_hp:20,temp_hp:0}}});
  expect(read()).toEqual(result);expect(state()).toBe(before);
 });
 test('only the current DM can read, including through the private wrapper',()=>{
  expect(()=>sql(auth(player,call()))).toThrow(/only to its DM/);expect(()=>sql('set role anon;'+call())).toThrow(/permission denied/);
  expect(()=>sql(auth(dm,call().replace('get_aura_resolution_context','dndkeep_private.aura_resolution_context')))).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);expect(()=>read()).toThrow(/only to its DM/);expect(JSON.parse(sql(auth(player,call()))).target.participant.id).toBe(pb);
 });
 test('rejects stale, ended and wrong-actor turns',()=>{
  expect(()=>sql(auth(dm,call('turn_end',randomUUID())))).toThrow(/Aura turn changed/);
  expect(()=>sql(auth(dm,call('turn_end',turn,pb,pa)))).toThrow(/Aura is missing/);
  sql(`update combat_encounters set current_turn_index=0 where id='${enc}'`);turn=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);
  expect(()=>read()).toThrow(/not ending its turn/);
  expect(JSON.parse(sql(auth(dm,call('creature_entered')))).geometryVerified).toBe(false);
  sql(`update combat_encounters set status='ended' where id='${enc}'`);expect(()=>read()).toThrow(/Aura turn changed/);
 });
 test('does not infer map entry from a valid stored aura',()=>{
  for(const trigger of ['creature_entered','emanation_entered'])expect(JSON.parse(sql(auth(dm,call(trigger)))).geometryVerified).toBe(false);
 });
 for(const [name,value] of [['missing',[]],['duplicate',null]] as const)test(`rejects ${name} aura`,()=>{writeAura(value===null?[aura(),aura()]:value);expect(()=>read()).toThrow(/missing or ambiguous/);});
 test('rejects exempt targets, disabled triggers and same-group enemy-only effects',()=>{
  writeAura([{...aura(),aura:{...aura().aura,exemptParticipantIds:[pb.toUpperCase()]}}]);expect(()=>read()).toThrow(/exempt/);
  writeAura([{...aura(),aura:{...aura().aura,triggers:['creature_entered']}}]);expect(()=>read()).toThrow(/does not use this trigger/);
  writeAura([{...aura(),aura:{...aura().aura,affects:'enemies'}}]);expect(()=>read()).toThrow(/outside this aura group/);
 });
 for(const field of ['saveAbility','saveDC','radiusFt','halfOnSave','triggers','exemptParticipantIds','damageDice','damageType','speedInside','affects'])test(`fails closed on missing ${field}`,()=>{
  const spec:Record<string,unknown>={...aura().aura};delete spec[field];writeAura([{...aura(),aura:spec}]);expect(()=>read()).toThrow(/Review stored aura/);
 });
 test('rejects self, missing, dead and definition-mismatched targets',()=>{
  expect(()=>sql(auth(dm,call('turn_end',turn,pa,pa)))).toThrow(/Invalid aura identity/);
  expect(()=>sql(auth(dm,call('turn_end',turn,pa,randomUUID())))).toThrow(/Aura target changed/);
  sql(`update combatants set is_dead=true where id='${cb}'`);expect(()=>read()).toThrow(/target is unavailable/);
  sql(`update combatants set is_dead=false,definition_id='${randomUUID()}' where id='${cb}'`);expect(()=>read()).toThrow(/Damage participant definition changed/);
 });
 test('rejects malformed aura numbers, flags and array entries',()=>{
  for(const patch of [{saveDC:-1},{saveDC:1.5},{saveDC:1001},{radiusFt:-1},{halfOnSave:'true'},{damageType:'unknown'},{triggers:[null]},{exemptParticipantIds:['not-a-uuid']}]){
   writeAura([{...aura(),aura:{...aura().aura,...patch}}]);expect(()=>read()).toThrow(/Review stored aura/);
  }
 });
 test('source removal, caster mismatch and death invalidate the prepared aura',()=>{
  read();writeAura([{...aura(),casterParticipantId:pb}]);expect(()=>read()).toThrow(/Review stored aura/);
  writeAura();sql(`update combatants set is_dead=true where id='${ca}'`);expect(()=>read()).toThrow(/origin is unavailable/);
  sql(`update combatants set is_dead=false where id='${ca}'`);writeAura([]);expect(()=>read()).toThrow(/missing or ambiguous/);
 });
 test('refuses an already consumed once-per-turn marker',()=>{
  sql(`update combat_participants set once_per_turn_used=array['aura_save:${pa}:fixture'] where id='${pb}'`);expect(()=>read()).toThrow(/already used/);
 });
 for(const kind of ['homebrew_monster','srd_monster','custom'])test(`${kind} stat changes invalidate the creature snapshot`,()=>{
  if(kind==='homebrew_monster')sql(`insert into homebrew_monsters(id,campaign_id,owner_id,name,ability_scores) values('${b}','${campaign}','${dm}','Fixture creature','{"str":10}')`);
  if(kind==='srd_monster')sql(`insert into monsters(id,name,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha) values('${b}','Fixture creature','Beast','1',200,'Medium',20,'3d8',10,30,10,10,10,10,10,10)`);
  sql(`update combatants set definition_type='${kind}',stat_block_snapshot='{"str":10}' where id='${cb}';update combat_participants set participant_type='monster' where id='${pb}'`);
  const before=read();expect(before.partyDamage).toBeNull();expect(before.target.definitionType).toBe(kind);
  if(kind==='homebrew_monster')sql(`update homebrew_monsters set ability_scores='{"str":18}' where id='${b}'`);
  if(kind==='srd_monster')sql(`update monsters set str=18 where id='${b}'`);
  if(kind==='custom')sql(`update combatants set stat_block_snapshot='{"str":18}' where id='${cb}'`);
  expect(read().creatureRevision).not.toBe(before.creatureRevision);
 });
 test('snapshots reflect changed HP, defenses, equipment, conditions and source DC',()=>{
  let before=read();
  sql(`update combatants set current_hp=19 where id='${cb}'`);let after=read();expect(after).not.toEqual(before);expect(after.partyDamage.pools.current_hp).toBe(19);before=after;
  sql(`update characters set damage_resistances=array['radiant'],intelligence=18 where id='${b}'`);after=read();expect(after.target.definition.damage_resistances).toEqual(['radiant']);expect(after.save.bonusRevision).not.toBe(before.save.bonusRevision);before=after;
  sql(`update characters set inventory='[{"name":"Cloak of Protection","equipped":true}]' where id='${b}'`);after=read();expect(after.save.bonusRevision).not.toBe(before.save.bonusRevision);
  sql(`update combatants set active_conditions=array['Restrained'],exhaustion_level=2 where id='${cb}'`);
  writeAura([{...aura(),aura:{...aura().aura,saveAbility:'DEX',saveDC:16}}]);after=read();expect(after.save).toMatchObject({disadvantage:true,exhaustion:2});expect(after.aura.aura.saveDC).toBe(16);
 });
});
