import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const encoded=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
test.describe('Private weapon retaliation lifecycle (local stack)',()=>{
 gateDbSuite();let dm:string,player:string,camp:string,hero:string,defender:string,actorCb:string,targetCb:string,enc:string,actor:string,target:string,attack:string;
 test.beforeEach(()=>{
  [dm,player,camp,hero,defender,actorCb,targetCb,enc,actor,target,attack]=Array.from({length:11},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@retaliation.local','{}'),('${player}','${player}@retaliation.local','{}');
   insert into campaigns(id,owner_id,name) values('${camp}','${dm}','Retaliation fixture');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,current_hp,max_hp,constitution,damage_resistances,concentration_spell) values
    ('${hero}','${player}','${camp}','Attacker','Human','Fighter','Soldier',20,20,14,array['cold'],'Fly'),('${defender}','${dm}','${camp}','Defender','Human','Fighter','Soldier',30,30,14,array[]::text[],'');
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,temp_hp,active_buffs) values
    ('${actorCb}','${camp}','${player}','Attacker','character','${hero}',20,20,2,'[]'),('${targetCb}','${camp}','${dm}','Defender','character','${defender}',30,30,5,'[{"key":"armor","name":"Armor of Agathys","meleeRetaliation":{"damage":15,"damageType":"cold","requiresTempHp":true}}]');
   insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
   insert into combat_participants(id,campaign_id,encounter_id,participant_type,entity_id,name,combatant_id,turn_order) values
    ('${actor}','${camp}','${enc}','character','${hero}','Attacker','${actorCb}',0),('${target}','${camp}','${enc}','character','${defender}','Defender','${targetCb}',1);
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,target_name,attacker_type,target_type,attack_source,attack_mode,attack_name,attack_kind,hit_result,state,damage_dice,damage_type,damage_final,chain_id)
    values('${attack}','${camp}','${enc}','${actor}','${target}','Attacker','Defender','character','character','weapon','melee','Longsword','attack_roll','hit','damage_rolled','1d8','slashing',7,'${randomUUID()}');commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${camp}';delete from characters where id in('${hero}','${defender}');delete from auth.users where id in('${dm}','${player}');`));
 const auth=(q:string,user=dm)=>`begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${q};commit;`;
 const run=(q:string,user=dm)=>{const lines=sql(auth(q,user)).split('\n');return JSON.parse(lines[lines.length-1]);};
 function calls(damage=7){const ctx=run(`select get_pending_damage_context('${attack}')`),plan=JSON.parse(sql(`select dndkeep_private.pending_retaliation_plan(${encoded(ctx)})`));return `select dndkeep_private.settle_pending_damage_life('${attack}',${encoded(ctx)},${damage},2,true);select dndkeep_private.settle_pending_retaliation('${attack}',${encoded(plan)},'{}',2)`;}
 const pools=()=>JSON.parse(sql(`select jsonb_build_object('actor',(select current_hp from combatants where id='${actorCb}'),'target',(select current_hp from combatants where id='${targetCb}'),'actorSheet',(select current_hp from characters where id='${hero}'),'targetSheet',(select current_hp from characters where id='${defender}'))`));
 test('retaliation applies resistance, temp HP and one concentration offer; replay is harmless',()=>{
  const q=calls(),first=run(q);expect(first.entries[0].settlement).toMatchObject({damage:7,beforeHP:20,beforeTempHP:2,afterHP:15,afterTempHP:0,concentrationMode:'prompt'});
  expect(pools()).toEqual({actor:15,target:28,actorSheet:15,targetSheet:28});expect(run(q).replayed).toBe(true);
  expect(sql(`select count(*) from pending_attacks where attack_source='retaliation' and campaign_id='${camp}'`)).toBe('1');expect(sql(`select count(*) from pending_concentration_saves where campaign_id='${camp}'`)).toBe('1');
  expect(sql(`select active_buffs from combatants where id='${targetCb}'`)).toBe('[]');
 });
 test('retaliation at zero HP adds one failure, not the original attack critical multiplier',()=>{
  sql(`update pending_attacks set hit_result='crit' where id='${attack}';update combatants set current_hp=0,temp_hp=0,is_stable=true,death_save_failures=1 where id='${actorCb}';update characters set current_hp=0,damage_resistances=array[]::text[] where id='${hero}'`);
  const life=run(calls()).entries[0].settlement;expect(life).toMatchObject({afterHP:0,failures:2,stable:false,dead:false,concentrationBroken:true});
 });
 test('retaliation dropping the attacker ends concentration and marks unconscious',()=>{
  sql(`update combatants set current_hp=5,temp_hp=0 where id='${actorCb}';update characters set current_hp=5,damage_resistances=array[]::text[] where id='${hero}'`);
  expect(run(calls()).entries[0].settlement).toMatchObject({afterHP:0,dead:false,concentrationBroken:true});expect(sql(`select concentration_spell from characters where id='${hero}'`)).toBe('');expect(sql(`select 'Unconscious'=any(active_conditions) from combatants where id='${actorCb}'`)).toBe('t');
 });
 test('a ranged hit removes an emptied temporary-HP effect without retaliation',()=>{
  sql(`update pending_attacks set attack_mode='ranged' where id='${attack}'`);expect(run(calls()).entries).toEqual([]);expect(pools().actor).toBe(20);expect(sql(`select active_buffs from combatants where id='${targetCb}'`)).toBe('[]');
 });
 test('a zero-damage melee hit still retaliates without ending remaining temporary HP',()=>{
  const result=run(calls(0));expect(result.entries[0].settlement.damage).toBe(7);expect(pools().target).toBe(30);expect(sql(`select jsonb_array_length(active_buffs) from combatants where id='${targetCb}'`)).toBe('1');
 });
 test('cold immunity leaves attacker HP and concentration unchanged',()=>{
  sql(`update characters set damage_immunities=array['cold'] where id='${hero}'`);expect(run(calls()).entries[0].settlement.damage).toBe(0);expect(pools().actor).toBe(20);expect(sql(`select count(*) from pending_concentration_saves where campaign_id='${camp}'`)).toBe('0');
 });
 test('refuses frozen resistance when the primary hit ends the ward caster concentration',()=>{
  sql(`update combatants set current_hp=1 where id='${targetCb}';update characters set current_hp=1,concentration_spell='Protection from Energy' where id='${defender}';
   update characters set damage_resistances=array[]::text[] where id='${hero}';
   update combatants set active_buffs='[{"key":"cold-ward","source":"spell:protection from energy","casterParticipantId":"${target}","resistances":["cold"]}]' where id='${actorCb}'`);
  expect(()=>run(calls())).toThrow(/changed retaliation defenses/);
  expect(pools()).toEqual({actor:20,target:1,actorSheet:20,targetSheet:1});
  expect(sql(`select concentration_spell from characters where id='${defender}'`)).toBe('Protection from Energy');
  expect(sql(`select count(*) from dndkeep_private.pending_retaliation_records where attack_id='${attack}'`)).toBe('0');
 });
 test('outer transaction failure rolls back both HP directions, offers and receipts',()=>{
  expect(()=>run(calls()+';select 1/0')).toThrow(/division by zero/);expect(pools()).toEqual({actor:20,target:30,actorSheet:20,targetSheet:30});
  expect(sql(`select count(*) from pending_attacks where attack_source='retaliation' and campaign_id='${camp}'`)).toBe('0');expect(sql(`select count(*) from dndkeep_private.pending_retaliation_records where attack_id='${attack}'`)).toBe('0');expect(sql(`select count(*) from pending_concentration_saves where campaign_id='${camp}'`)).toBe('0');
 });
 test('a player cannot compose damage using the private stage even under a privileged test connection',()=>{expect(()=>run(calls(),player)).toThrow(/current DM only/);expect(pools().actor).toBe(20);});
});
