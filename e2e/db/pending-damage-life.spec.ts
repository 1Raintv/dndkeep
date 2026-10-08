import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Private damage life-state stage',()=>{
 gateDbSuite();let dm:string,player:string,campaign:string,char:string,cb:string,enc:string,cp:string,attack:string;
 test.beforeEach(()=>{
  [dm,player,campaign,char,cb,enc,cp,attack]=Array.from({length:8},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@ctx.local','{}'),('${player}','${player}@ctx.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Damage context');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,damage_resistances) values('${char}','${player}','${campaign}','Actor','Human','Psion','Sage',array['psychic']);
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,stat_block_snapshot) values('${cb}','${campaign}','${player}','Actor','character','${char}',20,20,'{"damage_resistances":["fire"]}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${cp}','${enc}','${campaign}','character','${char}','Actor',0,'${cb}');
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id) values('${attack}','${campaign}','${enc}','${cp}','${cp}','Actor','character','Target','Hit','attack_roll','melee','hit','damage_rolled','1d6','psychic','${randomUUID()}');update combatants set temp_hp=3 where id='${cb}';update characters set current_hp=20,max_hp=20 where id='${char}';commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${dm}','${player}')`));
 const context=(id=attack)=>JSON.parse(sql(auth(dm,`select get_pending_damage_context('${id}')`)));
 const encoded=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
 const call=(expected:unknown,damage=8,id=attack)=>`select dndkeep_private.settle_pending_damage_life('${id}',${encoded(expected)},${damage},2,true)`;
 // Internal-stage tests use the database owner with an authenticated DM claim.
 // The app role is deliberately denied this partial-stage function.
 const internal=(q:string)=>`begin;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';${q};commit;`;
 const run=(q:string)=>JSON.parse(sql(internal(q)));
 const pools=()=>JSON.parse(sql(`select jsonb_build_object('hp',current_hp,'temp',temp_hp) from combatants where id='${cb}'`));
 const count=()=>sql(`select count(*) from dndkeep_private.pending_damage_pool_records where attack_id='${attack}'`);
 test('syncs the sheet and combat HP, and creates one revision-bound concentration offer',()=>{
  sql(`update characters set concentration_spell='Bless',gained_feats=array['War Caster'] where id='${char}'`);
  const q=call(context()),r=run(q);expect(r).toMatchObject({afterHP:15,afterTempHP:0,dead:false,concentrationBroken:false});
  expect(r.concentrationCheckId).toBeTruthy();expect(run(q)).toEqual({...r,replayed:true});
  expect(JSON.parse(sql(`select jsonb_build_object('hp',current_hp,'temp',temp_hp,'marker',last_campaign_damage_id) from characters where id='${char}'`))).toEqual({hp:15,temp:0,marker:attack});
  const offers=JSON.parse(sql(`select jsonb_agg(jsonb_build_object('damage',damage,'dc',dc,'bonus',con_bonus,'advantage',has_advantage)) from pending_concentration_saves where character_id='${char}'`));
  expect(offers).toEqual([{damage:8,dc:10,bonus:2,advantage:true}]);
 });
 test('dropping to zero ends concentration and adds unconscious state without a save',()=>{
  sql(`update characters set concentration_spell='Bless' where id='${char}';update combatants set current_hp=4 where id='${cb}'`);
  const r=run(call(context(),8));expect(r).toMatchObject({afterHP:0,dead:false,failures:0,concentrationBroken:true,concentrationCheckId:null});
  expect(sql(`select concentration_spell from characters where id='${char}'`)).toBe('');
  expect(JSON.parse(sql(`select to_jsonb(active_conditions) from combatants where id='${cb}'`))).toEqual(expect.arrayContaining(['Unconscious','Prone','Incapacitated']));
 });
 test('massive overflow after temporary HP kills at the exact maximum threshold',()=>{
  sql(`update combatants set current_hp=4,max_hp=20 where id='${cb}'`);
  expect(run(call(context(),27))).toMatchObject({afterHP:0,dead:true,massiveDamage:true,failures:3});
 });
 test('damage just below the massive threshold leaves a downed character alive',()=>{
  sql(`update combatants set current_hp=4,max_hp=20 where id='${cb}'`);
  expect(run(call(context(),26))).toMatchObject({afterHP:0,dead:false,massiveDamage:false,failures:0});
 });
 test('critical damage at zero adds two failures and removes Stable',()=>{
  sql(`update combatants set current_hp=0,is_stable=true,death_save_failures=0 where id='${cb}';update pending_attacks set hit_result='crit' where id='${attack}'`);
  expect(run(call(context(),1))).toMatchObject({afterHP:0,afterTempHP:2,dead:false,stable:false,failures:2});
 });
 test('zero damage does not break concentration or Stable and creates no save',()=>{
  sql(`update characters set concentration_spell='Bless' where id='${char}';update combatants set current_hp=0,is_stable=true where id='${cb}'`);
  expect(run(call(context(),0))).toMatchObject({stable:true,failures:0,concentrationBroken:false,concentrationCheckId:null});
  expect(sql(`select concentration_spell from characters where id='${char}'`)).toBe('Bless');
 });
 test('concentration automation off skips offers but cannot prevent incapacitation ending the spell',()=>{
  sql(`update campaigns set automation_defaults='{"concentration_on_damage":"off"}' where id='${campaign}';update characters set concentration_spell='Bless' where id='${char}';update combatants set active_conditions=array['Stunned'] where id='${cb}'`);
  expect(run(call(context()))).toMatchObject({concentrationMode:'off',concentrationBroken:true,concentrationCheckId:null});
 });
 test('failure after life-state settlement rolls back HP, sheet marker and concentration offer',()=>{
  sql(`update characters set concentration_spell='Bless' where id='${char}'`);const q=call(context());
  expect(()=>sql(internal(q+';select 1/0'))).toThrow(/division by zero/);expect(pools()).toEqual({hp:20,temp:3});expect(count()).toBe('0');
  expect(sql(`select count(*) from pending_concentration_saves where character_id='${char}'`)).toBe('0');
  expect(sql(`select last_campaign_damage_id is null from characters where id='${char}'`)).toBe('t');
 });
 test('a downed caster loses only effects belonging to the ended concentration spell',()=>{
  const otherCb=randomUUID(),otherCp=randomUUID();
  sql(`insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,active_buffs) values('${otherCb}','${campaign}','${dm}','Other','custom','${otherCb}',20,20,'[{"key":"bless","source":"spell:bless","casterParticipantId":"${cp}"},{"key":"aid","source":"spell:aid","casterParticipantId":"${cp}"}]');
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${otherCp}','${enc}','${campaign}','creature','${otherCb}','Other',1,'${otherCb}');
   update characters set concentration_spell='Bless' where id='${char}';update combatants set current_hp=4 where id='${cb}'`);
  run(call(context(),8));expect(JSON.parse(sql(`select active_buffs from combatants where id='${otherCb}'`))).toEqual([{key:'aid',source:'spell:aid',casterParticipantId:cp}]);
 });
 test('monsters die at zero unless explicitly receiving character-style death saves',()=>{
  sql(`update combat_participants set participant_type='creature' where id='${cp}';update combatants set definition_type='custom',current_hp=4,stat_block_snapshot='{}' where id='${cb}'`);
  expect(run(call(context(),8).replace(',2,true)',',2,false)'))).toMatchObject({dead:true,characterId:null,concentrationCheckId:null});
 });
 test('failed concentration offer insertion rolls back both sheets and pool receipt',()=>{
  sql(`update characters set concentration_spell='Bless' where id='${char}'`);const q=call(context());
  expect(()=>sql(internal(`create function pg_temp.reject_damage_offer() returns trigger language plpgsql as $$begin raise exception 'offer fixture failure';end;$$;
   create trigger reject_damage_offer before insert on public.pending_concentration_saves for each row execute function pg_temp.reject_damage_offer();${q}`))).toThrow(/offer fixture failure/);
  expect(pools()).toEqual({hp:20,temp:3});expect(count()).toBe('0');expect(sql(`select last_campaign_damage_id is null from characters where id='${char}'`)).toBe('t');
 });
 test('off automation preserves a surviving conscious caster without creating a save',()=>{
  sql(`update campaigns set automation_defaults='{"concentration_on_damage":"off"}' where id='${campaign}';update characters set concentration_spell='Bless' where id='${char}'`);
  expect(run(call(context()))).toMatchObject({concentrationMode:'off',concentrationBroken:false,concentrationCheckId:null});expect(sql(`select concentration_spell from characters where id='${char}'`)).toBe('Bless');
 });
 test('mismatched sheet and combat maxima cannot write sheet HP above its maximum',()=>{
  sql(`update characters set max_hp=10,current_hp=10 where id='${char}'`);
  expect(()=>run(call(context()))).toThrow(/HP maximum differ/);expect(pools()).toEqual({hp:20,temp:3});expect(count()).toBe('0');
 });
 test('authenticated clients cannot call the incomplete private composition stage',()=>{expect(()=>sql(auth(dm,call(context())))).toThrow(/permission denied/);expect(count()).toBe('0');});
});
