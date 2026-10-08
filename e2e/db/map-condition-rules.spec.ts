import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null;out:string;error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic map conditions',()=>{
 gateDbSuite();let dm:string,other:string,camp:string,hero:string,body:string,creature:string;
 test.beforeEach(()=>{dm=randomUUID();other=randomUUID();camp=randomUUID();hero=randomUUID();body=randomUUID();creature=randomUUID();sql(`begin;
  insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@mapcondition.local','{}'),('${other}','${other}@mapcondition.local','{}');
  insert into campaigns(id,owner_id,name) values('${camp}','${dm}','Condition fixture');
  insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,intelligence,current_hp,max_hp,class_resources)
   values('${hero}','${dm}','${camp}','Psion','Human','Psion','Sage',5,18,20,20,'{"psionic-energy-dice":6,"psion-disciplines":["psionic-guards","sharpened-mind"]}');
  insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values
   ('${body}','${camp}','${dm}','Psion','character','${hero}',20,20),('${creature}','${camp}','${dm}','Creature','custom',null,20,20);commit;`);});
 test.afterEach(()=>sql(`delete from campaigns where id='${camp}';delete from characters where id='${hero}';delete from auth.users where id in('${dm}','${other}');`));
 const query=(condition:string,present=true,id=randomUUID(),type='character',target=hero,cancel=false)=>`select change_map_condition_atomic('${camp}','${type}','${target}','${id}','${condition}',${present},${cancel})`;
 const run=(q:string,u=dm)=>JSON.parse(sql(auth(u,q)));
 const conditions=(id=hero,table='characters')=>JSON.parse(sql(`select to_json(active_conditions) from ${table} where id='${id}'`));
 test('applies implied conditions to every character body, waking retains Prone',()=>{
  const extra=randomUUID();sql(`insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id) values('${extra}','${camp}','${dm}','Second scene','character','${hero}')`);
  run(query('Unconscious'));for(const [id,table] of [[hero,'characters'],[body,'combatants'],[extra,'combatants']])expect(conditions(id,table)).toEqual(['Unconscious','Prone','Incapacitated']);
  expect(run(query('Prone',false)).conditionPresent).toBe(true);
  run(query('Unconscious',false));for(const [id,table] of [[hero,'characters'],[body,'combatants'],[extra,'combatants']])expect(conditions(id,table)).toEqual(['Prone']);
 });
 test('preserves independent Incapacitated and unrelated conditions',()=>{
  run(query('Incapacitated'));run(query('Poisoned'));run(query('Unconscious'));run(query('Unconscious',false));expect(conditions()).toEqual(['Incapacitated','Poisoned','Prone']);
  expect(conditions(body,'combatants')).toEqual(conditions());
 });
 test('overlapping parents prevent premature removal and clear only derived incapacity',()=>{
  run(query('Stunned'));run(query('Paralyzed'));expect(run(query('Incapacitated',false)).conditionPresent).toBe(true);
  run(query('Stunned',false));expect(conditions()).toEqual(['Incapacitated','Paralyzed']);run(query('Paralyzed',false));expect(conditions()).toEqual([]);
 });
 test('cascade setting and unlocked override agree with campaign automation',()=>{
  sql(`update campaigns set automation_defaults='{"condition_cascade_auto":"off"}' where id='${camp}';update characters set automation_overrides='{"condition_cascade_auto":"auto"}' where id='${hero}'`);
  run(query('Stunned'));expect(conditions()).toEqual(['Stunned']);run(query('Stunned',false));
  sql(`update characters set advanced_automations_unlocked=true where id='${hero}'`);run(query('Stunned'));expect(conditions()).toEqual(['Stunned','Incapacitated']);
 });
 test('condition changes between encounters keep provenance without combatants',()=>{
  sql(`delete from combatants where id='${body}'`);run(query('Unconscious'));run(query('Unconscious',false));expect(conditions()).toEqual(['Prone']);
 });
 test('only the chosen creature instance changes and history identifies a creature',()=>{
  run(query('Unconscious',true,randomUUID(),'combatant',creature));expect(conditions(creature,'combatants')).toEqual(['Unconscious','Prone','Incapacitated']);expect(conditions()).toEqual([]);expect(conditions(body,'combatants')).toEqual([]);
  expect(sql(`select target_type from combat_events where campaign_id='${camp}'`)).toBe('creature');run(query('Unconscious',false,randomUUID(),'combatant',creature));expect(conditions(creature,'combatants')).toEqual(['Prone']);
 });
 test('exhaustion toggles its counter without increasing existing levels or reviving',()=>{
  sql(`update characters set exhaustion_level=3 where id='${hero}';update combatants set is_dead=true,exhaustion_level=3 where id='${body}'`);
  const id=randomUUID();run(query('Exhaustion',true,id));run(query('Exhaustion',true,id));expect(sql(`select exhaustion_level from characters where id='${hero}'`)).toBe('3');
  run(query('Exhaustion',false));expect(sql(`select exhaustion_level from characters where id='${hero}'`)).toBe('0');expect(sql(`select exhaustion_level||':'||is_dead from combatants where id='${body}'`)).toBe('0:true');
 });
 test('replays cannot resurrect conditions after removal and altered identities are refused',()=>{
  const id=randomUUID(),q=query('Poisoned',true,id);expect(run(q).replayed).toBe(false);run(query('Poisoned',false));expect(run(q).replayed).toBe(true);expect(conditions()).toEqual([]);
  expect(()=>run(query('Stunned',true,id))).toThrow(/request changed/);expect(sql(`select count(*) from combat_events where id='${id}'`)).toBe('1');
 });
 test('cancellation wins against a late application; completed changes cannot be canceled',()=>{
  const id=randomUUID();expect(run(query('Poisoned',true,id,'character',hero,true)).canceled).toBe(true);expect(run(query('Poisoned',true,id)).canceled).toBe(true);expect(conditions()).toEqual([]);
  const applied=randomUUID();run(query('Poisoned',true,applied));expect(run(query('Poisoned',true,applied,'character',hero,true)).canceled).toBe(false);expect(conditions()).toEqual(['Poisoned']);
 });
 test('denies other users, anonymous calls, private ledger reads and character bypass via combatant',()=>{
  expect(()=>run(query('Stunned'),other)).toThrow(/Only this campaign DM/);
  expect(()=>sql(`set role anon;${query('Stunned')}`)).toThrow(/permission denied/);
  expect(()=>run('select * from dndkeep_private.map_condition_changes')).toThrow(/permission denied/);
  expect(()=>run(query('Stunned',true,randomUUID(),'combatant',body))).toThrow(/no longer available/);
  expect(()=>run(query('Stunned',true,randomUUID(),'character',randomUUID()))).toThrow(/no longer/);
 });
 test('history failure rolls back conditions, concentration and receipt together',()=>{
  const id=randomUUID();sql(`update characters set concentration_spell='detect-magic' where id='${hero}';insert into combat_events(id,campaign_id,chain_id,actor_type,actor_id,actor_name,event_type,payload) values('${id}','${camp}','${id}','dm','${dm}','DM','test','{}')`);
  expect(()=>run(query('Unconscious',true,id))).toThrow(/duplicate key/);expect(conditions()).toEqual([]);expect(conditions(body,'combatants')).toEqual([]);
  expect(sql(`select concentration_spell from characters where id='${hero}'`)).toBe('detect-magic');expect(sql(`select count(*) from dndkeep_private.map_condition_changes where request_id='${id}'`)).toBe('0');
 });
 test('concurrent different conditions preserve both deltas and identical retries create one event',async()=>{
  const outcomes=await Promise.all([parallel(auth(dm,query('Poisoned'))),parallel(auth(dm,query('Blinded')))]);for(const o of outcomes)expect(o.error).toBe('');expect(new Set(conditions())).toEqual(new Set(['Poisoned','Blinded']));
  const id=randomUUID(),q=auth(dm,query('Stunned',true,id));const retries=await Promise.all([parallel(q),parallel(q)]);for(const o of retries)expect(o.code,o.error).toBe(0);
  expect(retries.map(o=>JSON.parse(o.out).replayed).sort()).toEqual([false,true]);expect(sql(`select count(*) from combat_events where id='${id}'`)).toBe('1');
 });
 test('Psionic Guards refuses Charmed/Frightened without reporting an applied condition',()=>{
  const expected=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${hero}'`);
  run(`select begin_psionic_discipline('${hero}','${randomUUID()}','{"soloTurn":0}','psionic-guards',array[]::integer[],1,4,'${expected}')`);
  for(const condition of ['Charmed','Frightened'])expect(run(query(condition))).toMatchObject({blocked:true,conditionPresent:false});
  expect(conditions()).toEqual([]);expect(conditions(body,'combatants')).toEqual([]);
 });
 test('incapacity ends concentration even with cascading off and cleans only this casters effects',()=>{
  const enc=randomUUID(),cp=randomUUID(),target=randomUUID();sql(`update campaigns set automation_defaults='{"condition_cascade_auto":"off"}' where id='${camp}';
   update characters set concentration_spell='hold-person',concentration_slot_level=2,concentration_rounds_remaining=8 where id='${hero}';
   insert into combat_encounters(id,campaign_id,status) values('${enc}','${camp}','active');
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,combatant_id) values
    ('${cp}','${enc}','${camp}','character','${hero}','Psion','${body}'),('${target}','${enc}','${camp}','creature','fixture','Creature','${creature}');
   update combatants set active_conditions=array['Paralyzed','Incapacitated','Poisoned'],condition_sources='{"Paralyzed":{"source":"spell:hold-person","casterParticipantId":"${cp}"},"Incapacitated":{"source":"cascade:Paralyzed"},"Poisoned":{"source":"spell:hold-person","casterParticipantId":"${randomUUID()}"}}',active_buffs='[{"source":"spell:hold-person","casterParticipantId":"${cp}"},{"source":"other"}]' where id='${creature}'`);
  expect(run(query('Unconscious')).concentrationEnded).toBe(true);expect(conditions()).toEqual(['Unconscious']);expect(conditions(creature,'combatants')).toEqual(['Poisoned']);
  expect(sql(`select concentration_spell||':'||coalesce(concentration_slot_level::text,'null')||':'||coalesce(concentration_rounds_remaining::text,'null') from characters where id='${hero}'`)).toBe(':null:null');
  expect(JSON.parse(sql(`select active_buffs from combatants where id='${creature}'`))).toEqual([{source:'other'}]);
 });
});
