import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const asUser=(user:string,q:string)=>`begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';select ${q};commit;`;
// Deliberately private until the complete effect application and UI are wired.
test.describe('Mutable Form saved private lifecycle',()=>{
 gateDbSuite();let owner:string,other:string,character:string,id:string,turn:string;
 const invoke=(q:string,user=owner)=>JSON.parse(sql(asUser(user,q))||'null');
 const expression=(flesh=false,choice:unknown=null,roll=2)=>`dndkeep_private.begin_mutable_form('${character}','${id}','${turn}',${roll},${flesh},'${JSON.stringify(choice)}'::jsonb)`;
 const begin=(flesh=false,choice:unknown=null,roll=2)=>invoke(expression(flesh,choice,roll));
 const read=()=>invoke(`dndkeep_private.read_mutable_form('${character}','${id}')`);
 const next=()=>{const c=invoke(`public.psionic_turn_context_internal('${character}')`);invoke(`public.advance_psionic_solo_turn('${character}','${randomUUID()}',${c.soloTurn})`);turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;id=randomUUID();};
 test.beforeEach(()=>{
  [owner,other,character,id]=Array.from({length:4},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@mutable.local','{}'),('${other}','${other}@mutable.local','{}');
   insert into characters(id,user_id,name,species,class_name,subclass,background,level,intelligence,class_resources,hit_dice_spent) values('${character}','${owner}','Mutable Form','Human','Psion','Metamorph','Sage',7,16,'{"psionic-energy-dice":6}',0);`);
  turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;
 });
 test.afterEach(()=>sql(`delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}')`));
 const concentrationSnapshot=()=>sql(`select jsonb_build_object('concentration_spell',concentration_spell,'concentration_revision',concentration_revision,
  'constitution',constitution,'inventory',inventory,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,
  'saving_throw_proficiencies',saving_throw_proficiencies,'gained_feats',gained_feats,'nat_1_20_saves',nat_1_20_saves) from characters where id='${character}'`);
 const queueSave=(save=randomUUID())=>invoke(`public.queue_standalone_concentration_save('${character}','${save}',5,2,'${concentrationSnapshot()}')`);
 test('Stony concentration advantage survives expiry and replays the original two dice',()=>{
  sql(`update characters set level=10,concentration_spell='Fly',constitution=14,nat_1_20_saves=false where id='${character}'`);
  begin(false,{kind:'stony',resistance:'Fire'});const save=randomUUID();expect(queueSave(save).has_advantage).toBe(true);
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+600 where character_id='${character}'`);
  const result=invoke(`public.settle_standalone_concentration_save('${character}','${save}',array[3,17])`);
  expect(result).toMatchObject({advantage:true,rolls:[3,17],d20:17,total:19,outcome:'passed'});
  expect(invoke(`public.settle_standalone_concentration_save('${character}','${save}',array[1,2])`)).toMatchObject({...result,replayed:true});
  expect(queueSave().has_advantage).toBe(false);
  expect(sql(`select notes from action_logs where id='${save}'`)).toContain('Concentration advantage');
  expect(sql(`select notes from action_logs where id='${save}'`)).not.toContain('War Caster');
 });
 for(const choice of [{kind:'stride'},{kind:'flexibility'}])test(`other improved choices do not grant concentration advantage: ${choice.kind}`,()=>{
  sql(`update characters set level=10,concentration_spell='Fly' where id='${character}'`);begin(false,choice);
  expect(queueSave().has_advantage).toBe(false);
  sql(`update characters set gained_feats=array['War Caster'] where id='${character}'`);expect(queueSave().has_advantage).toBe(true);
 });
 test('activating Stony later does not upgrade an existing concentration check',()=>{
  sql(`update characters set level=10,concentration_spell='Fly' where id='${character}'`);const save=randomUUID();queueSave(save);
  begin(false,{kind:'stony',resistance:'Cold'});
  expect(invoke(`public.get_standalone_concentration_saves('${character}')`).pending[0]).toMatchObject({request_id:save,has_advantage:false});
  expect(()=>sql(`update dndkeep_private.standalone_concentration_saves set has_advantage=true where request_id='${save}'`)).toThrow();
 });
 test('unreadable active clocks block a new check but do not block cancellation tombstones',()=>{
  sql(`update characters set level=10,concentration_spell='Fly' where id='${character}'`);begin(false,{kind:'stony',resistance:'Cold'});
  sql(`delete from dndkeep_private.psionic_duration_clocks where character_id='${character}'`);
  expect(()=>queueSave()).toThrow('clock');
  expect(invoke(`public.cancel_standalone_concentration_request('${character}','${randomUUID()}',5,2,'${concentrationSnapshot()}')`).canceled).toBe(true);
 });
 test('campaign offers capture Stony, reject advantage edits and retain the original dice contract',()=>{
  const camp=randomUUID(),enc=randomUUID(),participant=randomUUID(),save=randomUUID();
  try{
   sql(`insert into campaigns(id,owner_id,name) values('${camp}','${owner}','Stony saves');
    update characters set campaign_id='${camp}',level=10,concentration_spell='Fly',nat_1_20_saves=false where id='${character}';
    insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${enc}','${camp}','character','${character}','Stony',0);`);
   turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;begin(false,{kind:'stony',resistance:'Fire'});
   sql(`insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision,has_advantage)
    select '${save}','${camp}','${enc}','${randomUUID()}','${participant}',id,'Fly',5,10,2,false,now()+interval '2 minutes',concentration_revision,false from characters where id='${character}'`);
   expect(sql(`select has_advantage from pending_concentration_saves where id='${save}'`)).toBe('t');
   expect(()=>sql(`update pending_concentration_saves set has_advantage=false where id='${save}'`)).toThrow();
   sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+600 where character_id='${character}'`);
   expect(invoke(`public.settle_pending_concentration_save('${save}',3,'player',17,null)`)).toMatchObject({advantage:true,rolls:[3,17],d20:17,outcome:'passed'});
  }finally{sql(`delete from campaigns where id='${camp}'`);}
 });
 test('the trusted active-form reader cannot be invoked by an authenticated client',()=>{
  expect(sql(`select has_function_privilege('authenticated','dndkeep_private.read_mutable_form_active_internal(uuid)','execute')`)).toBe('f');
 });
 test('saves the roll, original ability inputs and one action/payment; exact retry does not pay again',()=>{
  expect(begin()).toMatchObject({base_roll:2,duration_seconds:60,ability_context:{intelligence:16},replayed:false,energy_receipt:{remaining:5}});
  expect(begin().replayed).toBe(true);expect(()=>begin(false,null,3)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('1');
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
  expect(read().remainingSeconds).toBe(60);
 });
 test('Flesh Weaver spends two dice but saves only one rolled face',()=>{
  expect(begin(true)).toMatchObject({base_roll:2,energy_receipt:{remaining:4}});
  expect(invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`)).toMatchObject({originalRolls:[2],total:2});
 });
 test('failed payment rolls back the Bonus Action and permits a corrected affordable request',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":1}' where id='${character}'`);
  expect(()=>begin(true)).toThrow();expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('0');
  expect(begin().energy_receipt.remaining).toBe(0);
 });
 test('another request cannot reuse the Bonus Action',()=>{begin();id=randomUUID();expect(()=>begin()).toThrow();expect(sql(`select count(*) from dndkeep_private.mutable_form_declarations where character_id='${character}'`)).toBe('1');});
 test('level boundaries and illegal choices do not spend resources',()=>{
  for(const level of [2,5]){sql(`update characters set level=${level},class_resources='{"psionic-energy-dice":4}' where id='${character}'`);expect(()=>begin(true)).toThrow();}
  sql(`update characters set level=10 where id='${character}'`);
  for(const choice of [null,{kind:'stony',resistance:'Psychic'},{kind:'stride',resistance:'Acid'},{kind:'unknown'}])expect(()=>begin(false,choice)).toThrow();
  expect(begin(false,{kind:'stony',resistance:'Fire'}).duration_seconds).toBe(600);
 });
 test('secondary Psion level determines eligibility and duration',()=>{
  sql(`update characters set class_name='Fighter',subclass='Champion',level=10,secondary_class='Psion',secondary_subclass='Metamorph',secondary_level=3,class_resources='{"psionic-energy-dice":4}' where id='${character}'`);
  expect(()=>begin(true)).toThrow();expect(begin()).toMatchObject({psion_level:3,duration_seconds:60});
 });
 test('a new activation replaces the old form without refreshing it on replay',()=>{
  begin();const old=id;next();begin(true);
  const prior=invoke(`dndkeep_private.read_mutable_form('${character}','${old}')`);expect(prior).toMatchObject({ended_reason:'replaced',remainingSeconds:0});
  expect(begin(true).replayed).toBe(true);expect(read().remainingSeconds).toBe(60);
 });
 test('uses game time and expires exactly at the boundary',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+59 where character_id='${character}'`);
  expect(read().remainingSeconds).toBe(1);invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);expect(read().remainingSeconds).toBe(1);
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+1 where character_id='${character}'`);expect(read().remainingSeconds).toBe(0);
 });
 test('Restoration consumes one minute from the ten-minute form',()=>{
  sql(`update characters set level=10 where id='${character}'`);begin(false,{kind:'stride'});
  invoke(`public.settle_psionic_energy('${character}','${randomUUID()}','restore',0,'{}','Psionic Restoration')`);expect(read().remainingSeconds).toBe(540);
 });
 test('a completed short rest ends the ten-minute form',()=>{
  sql(`update characters set level=10 where id='${character}'`);begin(false,{kind:'stride'});
  const row=JSON.parse(sql(`select to_jsonb(c) from characters c where id='${character}'`));
  const fields=['spell_slots','class_resources','feature_uses'];
  const expected=Object.fromEntries([...fields,'class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'].map(k=>[k,row[k]]));
  const updates=Object.fromEntries(fields.map(k=>[k,row[k]??{}]));
  invoke(`public.complete_psionic_rest('${character}','${randomUUID()}','short','${JSON.stringify(expected)}','${JSON.stringify(updates)}')`);
  expect(read()).toMatchObject({remainingSeconds:0,ended_reason:'rest'});
 });
 test('expired forms cannot spend enhancement Hit Dice',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+60 where character_id='${character}'`);
  expect(()=>invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });
 test('unknown/rewound game clock does not claim an effect is active',()=>{
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=20 where character_id='${character}'`);begin();
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=19 where character_id='${character}'`);expect(read().remainingSeconds).toBeNull();
 });
 test('links Surge once and preserves its roll on replay',()=>{
  begin();const enhancement=randomUUID(),q=`dndkeep_private.enhance_mutable_form('${character}','${id}','${enhancement}','surge',null,6)`;
  expect(invoke(q)).toMatchObject({total:4,hitDiceSpent:1});expect(invoke(q).replayed).toBe(true);
  const q2=`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`;
  expect(invoke(q2)).toMatchObject({originalRolls:[2],rolls:[4],total:4});expect(invoke(q2)).toEqual(read().roll_result);
  expect(()=>invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
 });
 test('Enkindled and Surge use saved faces without charging extra Energy Dice',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}' where id='${character}'`);begin(true,{kind:'flexibility'});
  invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','enkindled',array[6,9],null)`);
  invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','surge',null,6)`);
  expect(invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`)).toMatchObject({originalRolls:[2,6,9],total:19});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('10');
 });
 test('ownership, direct execution privileges and table privacy are enforced',()=>{
  begin();expect(()=>invoke(`dndkeep_private.read_mutable_form('${character}','${id}')`,other)).toThrow();
  expect(sql(`select has_function_privilege('anon','dndkeep_private.begin_mutable_form(uuid,uuid,text,integer,boolean,jsonb)','execute'),has_function_privilege('authenticated','dndkeep_private.begin_mutable_form(uuid,uuid,text,integer,boolean,jsonb)','execute'),has_table_privilege('authenticated','dndkeep_private.mutable_form_declarations','select')`)).toBe('f|f|f');
 });
 test('applies HP once and replays current HP without restoring damage or duplicating history',()=>{
  begin();invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);
  const q=`dndkeep_private.apply_mutable_form_hp('${character}','${id}',false)`;
  expect(invoke(q)).toMatchObject({granted:5,intelligenceModifier:3,afterTempHP:5,replayed:false});
  sql(`update characters set temp_hp=1 where id='${character}'`);
  expect(invoke(q)).toMatchObject({afterTempHP:5,character:{temp_hp:1},replayed:true});
  expect(()=>invoke(`dndkeep_private.apply_mutable_form_hp('${character}','${id}',true)`)).toThrow();
  expect(sql(`select count(*) from character_history where character_id='${character}' and description like 'Mutable Form:%'`)).toBe('1');
  expect(sql(`select count(*) from action_logs where character_id='${character}' and action_name='Mutable Form'`)).toBe('1');
 });
 for(const keep of [true,false])test(`explicitly ${keep?'keeps':'replaces'} a higher temporary HP pool without stacking`,()=>{
  sql(`update characters set temp_hp=20 where id='${character}'`);begin();invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);
  expect(invoke(`dndkeep_private.apply_mutable_form_hp('${character}','${id}',${keep})`)).toMatchObject({granted:5,beforeTempHP:20,afterTempHP:keep?20:5,keptExisting:keep});
 });
 for(const equipment of [{equipped:true,attuned:true,expected:4},{equipped:false,attuned:true,expected:3},{equipped:true,attuned:false,expected:3}])test(`captures Headband eligibility ${JSON.stringify(equipment)}`,()=>{
  sql(`update characters set inventory='${JSON.stringify([{id:'headband',name:'Headband',magic_item_id:'headband-of-intellect',equipped:equipment.equipped,attuned:equipment.attuned}])}' where id='${character}'`);
  expect(begin().intelligence_modifier).toBe(equipment.expected);
  sql(`update characters set intelligence=30,inventory='[]' where id='${character}'`);
  invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);
  expect(invoke(`dndkeep_private.apply_mutable_form_hp('${character}','${id}',false)`).granted).toBe(2+equipment.expected);
 });
 test('never lowers higher natural Intelligence and ignores a renamed homebrew item',()=>{
  sql(`update characters set intelligence=22,inventory='[{"name":"Headband of Intellect","magic_item_id":"homebrew-headband","equipped":true,"attuned":true,"abilityOverride":{"ability":"intelligence","value":30}},{"name":"Headband","magic_item_id":"headband-of-intellect","equipped":true,"attuned":true}]' where id='${character}'`);
  expect(begin().intelligence_modifier).toBe(6);
 });
 test('uses the enhanced total and minimum one HP, never adds the Flesh Weaver cost as a roll',()=>{
  sql(`update characters set intelligence=1 where id='${character}'`);begin(true);
  invoke(`dndkeep_private.enhance_mutable_form('${character}','${id}','${randomUUID()}','surge',null,6)`);
  invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);
  expect(invoke(`dndkeep_private.apply_mutable_form_hp('${character}','${id}',false)`)).toMatchObject({granted:1,intelligenceModifier:-5});
 });
 test('rejects unfinalized/expired grants and another owner; no HP or history is written',()=>{
  begin();const q=`dndkeep_private.apply_mutable_form_hp('${character}','${id}',false)`;
  expect(()=>invoke(q)).toThrow();invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);expect(()=>invoke(q,other)).toThrow();
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+60 where character_id='${character}'`);expect(()=>invoke(q)).toThrow();
  expect(sql(`select temp_hp from characters where id='${character}'`)).toBe('0');
  expect(sql(`select count(*) from action_logs where character_id='${character}' and action_name='Mutable Form'`)).toBe('0');
  expect(sql(`select has_function_privilege('authenticated','dndkeep_private.apply_mutable_form_hp(uuid,uuid,boolean)','execute')`)).toBe('f');
 });
 test('ending the form does not subtract previously granted temporary HP',()=>{
  begin();invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);invoke(`dndkeep_private.apply_mutable_form_hp('${character}','${id}',false)`);
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+60 where character_id='${character}'`);expect(read().remainingSeconds).toBe(0);
  expect(sql(`select temp_hp from characters where id='${character}'`)).toBe('5');
 });
 test('checks map pool consistency and updates the matching pool atomically',()=>{
  const campaign=randomUUID(),cb=randomUUID();
  try {
   sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Mutable HP');update characters set campaign_id='${campaign}',temp_hp=2 where id='${character}';insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,temp_hp) values('${cb}','${campaign}','${owner}','PC','character','${character}',3)`);
   turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;
   begin();invoke(`dndkeep_private.finalize_mutable_form_roll('${character}','${id}')`);const q=`dndkeep_private.apply_mutable_form_hp('${character}','${id}',false)`;
   expect(()=>invoke(q)).toThrow();expect(read().applied_result).toBeNull();expect(sql(`select temp_hp from characters where id='${character}'`)).toBe('2');
   sql(`update combatants set temp_hp=2 where id='${cb}'`);invoke(q);
   expect(sql(`select temp_hp from combatants where id='${cb}'`)).toBe('5');
  } finally {sql(`update characters set campaign_id=null where id='${character}';delete from campaigns where id='${campaign}'`);}
 });
 test('shared active read returns no private fields and expires with game time',()=>{
  const q=`public.get_mutable_form_active('${character}')`;expect(invoke(q)).toBeNull();begin(true);
  expect(invoke(q)).toEqual({declarationId:id,remainingSeconds:60,durationSeconds:60,fleshWeaver:true,improvement:null,wearingArmor:false});
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+60 where character_id='${character}'`);expect(invoke(q)).toBeNull();
 });
 test('shared active read follows current armor, excluding shields and unequipped armor',()=>{
  sql(`update characters set level=10 where id='${character}'`);begin(false,{kind:'stride'});
  for(const [inventory,expected] of [[[{equipped:true,armorType:'shield'}],false],[[{equipped:false,armorType:'heavy'}],false],[[{equipped:true,armorType:'light'}],true],[[{equipped:true,armorType:'medium'}],true],[[{equipped:true,armorType:'heavy'}],true],[[],false]] as const){
   sql(`update characters set inventory='${JSON.stringify(inventory)}' where id='${character}'`);
   expect(invoke(`public.get_mutable_form_active('${character}')`).wearingArmor).toBe(expected);
  }
 });
 test('shared active read refuses unknown clock state instead of reporting no effect',()=>{
  begin();sql(`delete from dndkeep_private.psionic_duration_clocks where character_id='${character}'`);
  expect(()=>invoke(`public.get_mutable_form_active('${character}')`)).toThrow();
 });
 test('the authenticated owner can call the narrow read but anonymous callers cannot',()=>{
  begin();const q=`public.get_mutable_form_active('${character}')`;
  expect(JSON.parse(sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select ${q};commit;`)).declarationId).toBe(id);
  expect(()=>sql(`begin;set local role anon;select ${q};commit;`)).toThrow();
  expect(()=>invoke(q,other)).toThrow();
 });
 test('only the current campaign grants shared read access to its DM or members',()=>{
  const campaign=randomUUID();
  try {
   sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${other}','Mutable shared');update characters set campaign_id='${campaign}' where id='${character}'`);
   turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;begin();const q=`public.get_mutable_form_active('${character}')`;
   expect(invoke(q,other).declarationId).toBe(id);
   sql(`update campaigns set owner_id='${owner}' where id='${campaign}';insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${other}','player') on conflict(campaign_id,user_id) do update set role='player'`);
   expect(invoke(q,other).declarationId).toBe(id);
   sql(`delete from campaign_members where campaign_id='${campaign}' and user_id='${other}'`);expect(()=>invoke(q,other)).toThrow();
  } finally {sql(`update characters set campaign_id=null where id='${character}';delete from campaigns where id='${campaign}'`);}
 });
 test('concurrent identical requests commit one payment and one Bonus Action',async()=>{
  const query=asUser(owner,expression());
  const results=await Promise.all([1,2].map(()=>promisify(execFile)('docker',[...args,'-c',query],{encoding:'utf8'})));
  const receipts=results.map(r=>JSON.parse(r.stdout.trim()));expect(receipts.filter(r=>r.replayed)).toHaveLength(1);
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('5');
 });
});
