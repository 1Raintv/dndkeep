import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Pending damage context',()=>{
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
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,attack_name,attack_kind,attack_source,hit_result,state,damage_dice,damage_type,chain_id) values('${attack}','${campaign}','${enc}','${cp}','${cp}','Actor','character','Target','Hit','attack_roll','melee','hit','attack_rolled','1d6','psychic','${randomUUID()}');commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${dm}','${player}')`));
 const read=(u=dm)=>JSON.parse(sql(auth(u,`select get_pending_damage_context('${attack}')`)));
 test('uses current character defenses and runtime HP, not stale combatant snapshot',()=>{
  const r=read();expect(r.target.definition.damage_resistances).toEqual(['psychic']);expect(r.target.combatant.current_hp).toBe(20);expect(r.encounter.id).toBe(enc);expect(r.reactions).toEqual([]);
  expect(r.target.combatant).not.toHaveProperty('stat_block_snapshot');expect(r.target.definition).not.toHaveProperty('notes');expect(r.target.definition).not.toHaveProperty('backstory');
  sql(`update characters set damage_resistances=array['cold'] where id='${char}'`);expect(read().target.definition.damage_resistances).toEqual(['cold']);
 });
 test('only the current DM may read settlement data; helper cannot be called directly',()=>{
  expect(()=>read(player)).toThrow(/current DM/);
  expect(()=>sql(`begin;set local role anon;select get_pending_damage_context('${attack}');commit;`)).toThrow(/permission denied/);
  expect(()=>sql(auth(dm,`select dndkeep_private.pending_damage_participant_context('${cp}','${campaign}','${enc}')`))).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);expect(()=>read()).toThrow(/current DM/);expect(read(player).attack.id).toBe(attack);
 });
 test('participant and combatant definitions must agree',()=>{sql(`update combatants set definition_id='${randomUUID()}' where id='${cb}'`);expect(()=>read()).toThrow(/definition changed/);});
 test('character must still belong to this campaign',()=>{sql(`update characters set campaign_id=null where id='${char}'`);expect(()=>read()).toThrow(/character is unavailable/);});
 test('a roster moved to another encounter is rejected',()=>{
  const other=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status) values('${other}','${campaign}','ended');update combat_participants set encounter_id='${other}' where id='${cp}'`);
  expect(()=>read()).toThrow(/roster changed/);
 });
 test('canonical catalog defenses are read by ID and null lists explicitly mean none',()=>{
  const monster='context-'+randomUUID();try{
   sql(`insert into monsters(id,name,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha,damage_immunities) values('${monster}','Context monster','construct','1',200,'Medium',20,'3d8',12,30,10,10,10,10,10,10,array['psychic']);
    update combatants set definition_type='srd_monster',definition_id='${monster}' where id='${cb}';update combat_participants set participant_type='creature',entity_id='${monster}' where id='${cp}'`);
   expect(read().target.definition).toMatchObject({damage_resistances:[],damage_immunities:['psychic'],damage_vulnerabilities:[]});
  }finally{sql(`delete from monsters where id='${monster}'`);}
 });
 test('free-text targets remain explicitly absent',()=>{sql(`update pending_attacks set target_participant_id=null where id='${attack}'`);expect(read().target).toBeNull();});
 test('includes offered reactions rather than assuming the damage total is final',()=>{
  sql(`insert into pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,state,expires_at) values('${campaign}','${attack}','${cp}','Actor','character','uncanny_dodge','Uncanny Dodge','post_damage_roll','offered',now()+interval '2 minutes')`);
  expect(read().reactions).toEqual([expect.objectContaining({state:'offered',reaction_key:'uncanny_dodge'})]);
 });
 test('reaction identities from another encounter do not enter the settlement context',()=>{
  const other=randomUUID(),reactor=randomUUID();
  sql(`insert into combat_encounters(id,campaign_id,status) values('${other}','${campaign}','ended');
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${reactor}','${other}','${campaign}','character','${char}','Actor',0,'${cb}');
   insert into pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,state,expires_at) values('${campaign}','${attack}','${reactor}','Actor','character','uncanny_dodge','Uncanny Dodge','post_damage_roll','offered',now()+interval '2 minutes')`);
  expect(()=>read()).toThrow(/reaction context changed/);
 });
 test('custom snapshots retain unknown defenses without a catalog name fallback',()=>{
  sql(`update combat_participants set participant_type='creature' where id='${cp}';update combatants set definition_type='custom',stat_block_snapshot='{}' where id='${cb}'`);
  expect(read().target.definition).toEqual({damage_resistances:null,damage_immunities:null,damage_vulnerabilities:null});
 });
 test('saved creature defenses retain conditional wording and distinguish unknown from none',()=>{
  const creature=randomUUID();try{
   sql(`insert into homebrew_monsters(id,user_id,owner_id,campaign_id,name,damage_resistances,damage_immunities) values('${creature}','${dm}','${dm}','${campaign}','Creature',array['psychic','fire while submerged'],array[]::text[]);
    update combatants set definition_type='narrative_npc',definition_id='${creature}' where id='${cb}';update combat_participants set participant_type='creature',entity_id='${creature}' where id='${cp}'`);
   expect(read().target.definition).toMatchObject({damage_resistances:['psychic','fire while submerged'],damage_immunities:[],damage_vulnerabilities:null});
  }finally{sql(`delete from homebrew_monsters where id='${creature}'`);}
 });
});
