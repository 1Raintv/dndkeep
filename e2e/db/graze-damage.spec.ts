import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,finishEmptyFixtureReactionWindow} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('recorded optional Graze damage',()=>{
 gateDbSuite();let owner:string,camp:string,character:string,actor:string,target:string,enc:string,attack:string;
 test.beforeEach(()=>{
  [owner,camp,character,actor,target,enc,attack]=Array.from({length:7},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@graze.local','{}');
   insert into campaigns(id,owner_id,name) values('${camp}','${owner}','Graze fixture');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,weapon_masteries) values('${character}','${owner}','${camp}','Fighter','Human','Fighter','Soldier',5,array['Greatsword']);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
    ('${actor}','${enc}','${camp}','character','${character}','Fighter',0),('${target}','${enc}','${camp}','creature','${target}','Target',1);
   update combatants set current_hp=20,max_hp=20,temp_hp=3 where id=(select combatant_id from combat_participants where id='${target}');
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_source,attack_bonus,attack_ability_modifier,graze_resolution_version,target_ac,chain_id,state,attack_d20,attack_total,hit_result,damage_dice,damage_type)
    values('${attack}','${camp}','${enc}','${actor}','${target}','Fighter','character','Target','creature','Greatsword +2','attack_roll','weapon',9,4,1,20,'${randomUUID()}','attack_rolled',5,14,'miss','2d6+6','Slashing');`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${camp}';delete from characters where id='${character}';delete from auth.users where id='${owner}';`);});
 const context=()=>JSON.parse(sql(`select to_jsonb(a) from pending_attacks a where id='${attack}'`));
 const call=(use=true,expected=context(),user=owner)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';set local role authenticated;
  select public.record_graze_damage('${attack}','${JSON.stringify(expected).replaceAll("'","''")}',${use});commit;`));
 const ready=()=>finishEmptyFixtureReactionWindow(sql,owner,attack,'post_attack_roll');
 const unchanged=()=>{
  expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('attack_rolled');
  expect(sql(`select count(*) from dndkeep_private.damage_roll_records where attack_id='${attack}'`)).toBe('0');
  expect(sql(`select current_hp||'|'||temp_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`)).toBe('20|3');
 };
 test('records only the ability contribution; replay does not write HP or consume hit-only bonuses',()=>{
  const buff='[{"key":"absorb_elements_rider","damageRider":{"dice":"1d6","damageType":"fire"}}]';
  sql(`update combatants set active_buffs='${buff}' where id=(select combatant_id from combat_participants where id='${actor}')`);ready();
  const expected=context(),first=call(true,expected);expect(first).toMatchObject({replayed:false,attack:{state:'damage_rolled',damage_raw:4,damage_final:4,damage_rolls:[]}});
  expect(first.attack.damage_components.components).toEqual([{key:'base',source:'base',label:'Graze',damageType:'slashing',expression:'4',rolls:[],dieKinds:[],modifier:4,rawTotal:4}]);
  expect(call(true,expected)).toMatchObject({replayed:true,attack:{damage_raw:4}});expect(()=>call(false)).toThrow(/saved damage choice/);
  expect(JSON.parse(sql(`select active_buffs from combatants where id=(select combatant_id from combat_participants where id='${actor}')`))).toEqual(JSON.parse(buff));
  expect(sql(`select current_hp||'|'||temp_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`)).toBe('20|3');
 });
 test('declining is durable and cannot later become extra damage',()=>{
  ready();expect(call(false)).toMatchObject({attack:{damage_raw:0,damage_final:0,damage_components:{version:1,components:[]}}});
  expect(call(false).replayed).toBe(true);expect(()=>call(true)).toThrow(/saved damage choice/);
 });
 test('missing reaction evidence rolls back the entire choice',()=>{expect(()=>call()).toThrow(/Recover the attack reaction check/);unchanged();});
 test('an unanswered reaction blocks even after an empty batch was recorded',()=>{
  ready();sql(`insert into pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,state)
   values('${camp}','${attack}','${target}','Target','creature','shield','Shield','post_attack_roll',now()+interval '120 seconds','offered')`);
  expect(()=>call()).toThrow(/Resolve offered reactions/);unchanged();
 });
 for(const patch of ["hit_result='hit'","cover_level='total'","attack_source='spell'","target_participant_id=null","attack_name='Greatswordfish'","damage_type='unknown'"])
  test(`rejects unsupported or changed attack: ${patch}`,()=>{ready();sql(`update pending_attacks set ${patch} where id='${attack}'`);expect(()=>call()).toThrow();unchanged();});
 test('stale preview and removed mastery cannot commit damage',()=>{
  ready();const expected=context();sql(`update pending_attacks set target_ac=21 where id='${attack}'`);expect(()=>call(true,expected)).toThrow(/Attack changed/);unchanged();
  sql(`update characters set weapon_masteries=array[]::text[] where id='${character}'`);expect(()=>call()).toThrow(/Review Graze weapon mastery/);unchanged();
 });
 test('unrelated users cannot record damage or read the private receipt',()=>{
  ready();expect(()=>call(true,context(),randomUUID())).toThrow(/current DM only/);unchanged();
  expect(()=>sql(`begin;set local role authenticated;select * from dndkeep_private.damage_roll_records;rollback;`)).toThrow();
 });
 for(const modifier of [0,-2,null])test(`records zero or refuses unknown ability: ${modifier}`,()=>{
  const id=randomUUID();sql(`insert into pending_attacks select (jsonb_populate_record(null::pending_attacks,to_jsonb(a)||jsonb_build_object('id','${id}','attack_ability_modifier',${modifier===null?'null':modifier}))).* from pending_attacks a where id='${attack}'`);attack=id;ready();
  if(modifier===null){expect(()=>call()).toThrow(/Review the ability modifier/);unchanged();}
  else expect(call()).toMatchObject({attack:{damage_raw:0,damage_final:0,damage_rolls:[]}});
 });
 test('legacy declarations require review even if they have an ability snapshot',()=>{
  const id=randomUUID();sql(`insert into pending_attacks select (jsonb_populate_record(null::pending_attacks,to_jsonb(a)||jsonb_build_object('id','${id}','graze_resolution_version',null))).* from pending_attacks a where id='${attack}'`);attack=id;ready();
  expect(()=>call()).toThrow(/Review legacy/);unchanged();
 });
 test('two simultaneous choices cannot both win',async()=>{
  ready();const expected=JSON.stringify(context()).replaceAll("'","''");
  const requests=[true,false].map(use=>promisify(execFile)('docker',['exec','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c',`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;select public.record_graze_damage('${attack}','${expected}',${use});commit;`]));
  const results=await Promise.allSettled(requests);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  expect(sql(`select count(*) from dndkeep_private.damage_roll_records where attack_id='${attack}'`)).toBe('1');
  expect(sql(`select current_hp||'|'||temp_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`)).toBe('20|3');
 });
 test('resolution version cannot be retrofitted onto a legacy attack',()=>{
  expect(()=>sql(`update pending_attacks set graze_resolution_version=null where id='${attack}'`)).toThrow(/cannot be changed/);unchanged();
  sql(`insert into pending_attacks(campaign_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,chain_id) values('${camp}','Legacy','system','Target','object','Legacy','attack_roll','${randomUUID()}')`);
  expect(()=>sql(`update pending_attacks set graze_resolution_version=1 where campaign_id='${camp}' and attack_name='Legacy'`)).toThrow(/cannot be changed/);
 });
 const applicationContext=()=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;select public.get_pending_damage_context('${attack}');commit;`));
 const apply=(review:unknown=null,expected=applicationContext())=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;select public.apply_graze_damage('${attack}','${JSON.stringify(expected).replaceAll("'","''")}',0,'${JSON.stringify(review).replaceAll("'","''")}');commit;`));
 const pools=()=>sql(`select current_hp||'|'||temp_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`);
 const defenses=(r:string[]=[],i:string[]=[],v:string[]=[])=>sql(`update combatants set definition_type='custom',definition_id='${target}',stat_block_snapshot='${JSON.stringify({damage_resistances:r,damage_immunities:i,damage_vulnerabilities:v})}' where id=(select combatant_id from combat_participants where id='${target}')`);
 const prepare=(use=true,post=true)=>{defenses();ready();call(use);if(post)finishEmptyFixtureReactionWindow(sql,owner,attack,'post_damage_roll');};
 test('atomic application updates pools and history once, including retry after lost response',()=>{
  prepare();const expected=applicationContext(),first=apply(null,expected);expect(first).toMatchObject({replayed:false,attack:{state:'applied',damage_final:4},settlement:{damage:4}});expect(pools()).toBe('19|0');
  expect(apply(null,expected).replayed).toBe(true);expect(pools()).toBe('19|0');
  expect(sql(`select count(*) from combat_events where chain_id=(select chain_id from pending_attacks where id='${attack}') and event_type='damage_applied'`)).toBe('1');
 });
 for(const c of [{r:['slashing'],i:[],v:[],damage:2,pools:'20|1'},{r:[],i:['slashing'],v:[],damage:0,pools:'20|3'},
  {r:[],i:[],v:['slashing'],damage:8,pools:'15|0'},{r:['slashing'],i:[],v:['slashing'],damage:4,pools:'19|0'}])
  test(`atomic defenses ${JSON.stringify(c)}`,()=>{prepare();defenses(c.r,c.i,c.v);expect(apply().settlement.damage).toBe(c.damage);expect(pools()).toBe(c.pools);});
 test('atomic application rolls HP and events back when post-damage checks are missing',()=>{
  prepare(true,false);expect(()=>apply()).toThrow(/Recover the damage reaction check/);expect(pools()).toBe('20|3');
  expect(sql(`select state from pending_attacks where id='${attack}'`)).toBe('damage_rolled');
  expect(sql(`select count(*) from dndkeep_private.pending_damage_pool_records where attack_id='${attack}'`)).toBe('0');
  expect(sql(`select count(*) from combat_events where chain_id=(select chain_id from pending_attacks where id='${attack}') and event_type='damage_applied'`)).toBe('0');
 });
 test('atomic application rejects changed pools or rewritten participant identity',()=>{
  prepare();const expected=applicationContext();sql(`update combatants set current_hp=18 where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(()=>apply(null,expected)).toThrow(/context changed/);expect(pools()).toBe('18|3');
  sql(`update combat_participants set entity_id='${randomUUID()}' where id='${target}'`);expect(()=>apply()).toThrow();expect(pools()).toBe('18|3');
 });
 test('atomic conditional defenses require an explicit review and preserve it',()=>{
  prepare();defenses(['slashing from nonmagical attacks']);expect(()=>apply()).toThrow(/Review target damage defenses/);expect(pools()).toBe('20|3');
  const review={immune:false,resistant:true,vulnerable:false,note:'Nonmagical weapon confirmed'};
  expect(apply(review)).toMatchObject({settlement:{damage:2},resolution:{review}});expect(pools()).toBe('20|1');
 });
 test('atomic decline settles zero even when creature defenses are unknown',()=>{
  prepare(false);sql(`update combatants set stat_block_snapshot='{}' where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(apply().settlement.damage).toBe(0);expect(pools()).toBe('20|3');
 });
 test('atomic Absorb Elements does not stack with existing resistance',()=>{
  sql(`update pending_attacks set damage_type='fire' where id='${attack}'`);prepare();defenses(['fire']);
  sql(`insert into pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,state)
   values('${camp}','${attack}','${target}','Target','creature','absorb_elements','Absorb Elements','post_damage_roll',now()+interval '120 seconds','accepted');
   update pending_attacks set damage_final=2 where id='${attack}'`);
  expect(apply().settlement.damage).toBe(2);expect(pools()).toBe('20|1');
 });
 test('atomic application records creature death',()=>{
  prepare();sql(`update combatants set current_hp=2,temp_hp=0 where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(apply().settlement.dead).toBe(true);
  expect(sql(`select is_dead from combatants where id=(select combatant_id from combat_participants where id='${target}')`)).toBe('t');
 });

 for(const hp of [2,20])test(`atomic character concentration after Graze at ${hp} HP`,()=>{
  const defender=randomUUID();
  try{
   sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp,concentration_spell)
    values('${defender}','${owner}','${camp}','Defender','Human','Wizard','Sage',5,${hp},20,'Bless');
    update combat_participants set entity_id='${defender}',participant_type='character' where id='${target}';
    update combatants set definition_type='character',definition_id='${defender}',current_hp=${hp},max_hp=20,temp_hp=0 where id=(select combatant_id from combat_participants where id='${target}');
    update pending_attacks set target_type='character' where id='${attack}'`);
   ready();call();finishEmptyFixtureReactionWindow(sql,owner,attack,'post_damage_roll');const result=apply();
   if(hp===2){expect(result.settlement.concentrationBroken).toBe(true);expect(sql(`select coalesce(concentration_spell,'') from characters where id='${defender}'`)).toBe('');
    expect(result.settlement.dead).toBe(false);expect(result.settlement.afterHP).toBe(0);
   }else{expect(result.settlement.concentrationCheckId).toBeTruthy();expect(result.settlement.concentrationMode).toBe('prompt');expect(result.settlement.afterHP).toBe(16);}
  }finally{sql(`delete from characters where id='${defender}'`);}
 });
 test('atomic concurrent application writes HP and history exactly once',async()=>{
  prepare();const expected=JSON.stringify(applicationContext()).replaceAll("'","''");
  const query=`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;select public.apply_graze_damage('${attack}','${expected}',0);commit;`;
  const results=await Promise.all([1,2].map(()=>promisify(execFile)('docker',['exec','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c',query])));
  expect(results.map(r=>JSON.parse(r.stdout.trim()).replayed).sort()).toEqual([false,true]);expect(pools()).toBe('19|0');
  expect(sql(`select count(*) from combat_events where chain_id=(select chain_id from pending_attacks where id='${attack}') and event_type='damage_applied'`)).toBe('1');
 });

 test('a reviewed defense choice cannot be applied after those defenses change',()=>{
  prepare();defenses(['slashing from nonmagical attacks']);const expected=applicationContext();defenses([],['slashing']);
  expect(()=>apply({immune:false,resistant:true,vulnerable:false,note:'Old review'},expected)).toThrow(/context changed/);expect(pools()).toBe('20|3');
 });
 test('application receipt is private and unauthorized replay is denied',()=>{
  prepare();apply();const stranger=randomUUID();
  expect(()=>sql(`begin;set local request.jwt.claims='{"sub":"${stranger}","role":"authenticated"}';set local role authenticated;select public.apply_graze_damage('${attack}');commit;`)).toThrow(/current DM only/);
  expect(()=>sql(`begin;set local role authenticated;select * from dndkeep_private.graze_damage_applications;rollback;`)).toThrow();
  expect(()=>sql(`begin;set local request.jwt.claims='{"sub":"${stranger}","role":"authenticated"}';set local role authenticated;select public.read_graze_choice('${attack}');commit;`)).toThrow(/current DM only/);
  expect(sql(`select has_function_privilege('anon','public.apply_graze_damage(uuid,jsonb,integer,jsonb)','execute')`)).toBe('f');
  expect(pools()).toBe('19|0');
 });

});
