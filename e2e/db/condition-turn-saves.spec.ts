import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string}>(resolve=>{const p=spawn('docker',args);let out='';p.stdout.on('data',d=>out+=d);p.on('close',code=>resolve({code,out}));p.stdin.end(q);});
test.describe('Atomic condition turn saves',()=>{
 gateDbSuite();let owner:string,dm:string,other:string,char:string,campaign:string,encounter:string,part:string,turn:string;
 test.beforeEach(()=>{
  [owner,dm,other,char,campaign,encounter,part]=Array.from({length:7},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@cond.local','{}'),('${dm}','${dm}@cond.local','{}'),('${other}','${other}@cond.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Condition saves');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${char}','${owner}','${campaign}','Psion','Human','Psion','Sage',5,20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${part}','${encounter}','${campaign}','character','${char}','Psion',0);`);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`);
  update(`active_conditions=array['Poisoned'],condition_sources='{"Poisoned":{"source":"monster:fixture","save_to_end":{"ability":"INT","dc":12}}}'`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${owner}','${dm}','${other}');`));
 const update=(set:string)=>sql(`update combatants set ${set} where id=(select combatant_id from combat_participants where id='${part}')`);
 const ctx=()=>JSON.parse(sql(auth(owner,`select get_condition_turn_save_context('${part}','${turn}','Poisoned')`)));
 const command=(dice=[12],c=ctx(),bonus=0,request=randomUUID(),penalty:number|null=3)=>`select settle_condition_turn_save('${request}','${part}','${turn}','Poisoned','${JSON.stringify(c)}',array[${dice}]::integer[],${bonus},${penalty===null?'null':penalty})`;
 const settle=(dice=[12],c=ctx(),bonus=0)=>JSON.parse(sql(auth(owner,command(dice,c,bonus))));
 const sliver=()=>{
  sql(auth(owner,`select psionic_propel('${char}','context')`));
  const effect=randomUUID(),clock=JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${encounter}','${part}')`));
  sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${effect}','${encounter}','${part}','${part}','${clock.turnId}',${clock.castTurnOrdinal},'active')`);return effect;
 };
 test('success removes the condition and records one event; any retry returns the first result',()=>{
  const c=ctx(),first=settle([12],c);expect(first).toMatchObject({passed:true,removed:['Poisoned']});
  expect(settle([1],c)).toEqual({...first,replayed:true});
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type='condition_resave'`)).toBe('1');
 });
 test('racing rolls settle one result',async()=>{
  const c=ctx(),rows=await Promise.all([parallel(auth(owner,command([12],c))),parallel(auth(dm,command([2],c)))]);
  expect(rows.map(r=>r.code)).toEqual([0,0]);const values=rows.map(r=>JSON.parse(r.out));expect(values[0].passed).toBe(values[1].passed);expect(values.filter(r=>r.replayed)).toHaveLength(1);
 });
 test('Mind Sliver changes a success to failure and is consumed once',()=>{
  const effect=sliver(),c=ctx(),first=settle([12],c);expect(first).toMatchObject({passed:false,total:9,penalty:{penalty:3}});
  expect(settle([20],c)).toMatchObject({passed:false,replayed:true});expect(sql(`select consumed_by is not null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');
  expect(ctx().state.conditions).toContain('Poisoned');
 });
 test('transaction failure rolls back condition, penalty, result and event together',()=>{
  const effect=sliver(),c=ctx();expect(()=>sql(auth(owner,command([20],c)+';select 1/0'))).toThrow();
  expect(ctx().state.conditions).toContain('Poisoned');expect(sql(`select consumed_by is null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');
  expect(sql(`select count(*) from dndkeep_private.condition_turn_saves where participant_id='${part}'`)).toBe('0');
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}'`)).toBe('0');
 });
 test('outdated settings cannot consume a penalty or resolve a condition',()=>{
  const effect=sliver(),c=ctx();update('exhaustion_level=1');expect(()=>settle([20],c)).toThrow();
  expect(sql(`select consumed_by is null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');
 });
 test('exhaustion is applied separately from reviewed bonuses',()=>{update('exhaustion_level=2');expect(settle([12],ctx(),3)).toMatchObject({total:11,passed:false,exhaustion:2});});
 test('a derived condition does not get a separate save',()=>{update(`condition_sources='{"Poisoned":{"source":"cascade:Other","save_to_end":{"ability":"INT","dc":12}}}'`);expect(()=>ctx()).toThrow();});
 test('wrong turn and nonowner calls fail without a result',()=>{
  const c=ctx(),q=command([20],c);expect(()=>sql(auth(other,q))).toThrow();
  sql(`update combat_encounters set round_number=2 where id='${encounter}'`);expect(()=>settle([20],c)).toThrow();
 });
 test('private receipts cannot be read directly',()=>{expect(()=>sql(auth(owner,'select * from dndkeep_private.condition_turn_saves'))).toThrow();});
 test('natural extremes are determined by the character setting',()=>{expect(settle([1],ctx(),100)).toMatchObject({passed:false});});
 test('condition cascades and source immunity commit with the successful save',()=>{
  update(`active_conditions=array['Poisoned','Incapacitated'],condition_sources='{"Poisoned":{"source":"monster:fixture","save_to_end":{"ability":"INT","dc":12},"source_kind":"fixture","source_attacker_id":"${part}"},"Incapacitated":{"source":"cascade:Poisoned"}}'`);
  expect(settle()).toMatchObject({passed:true,removed:['Poisoned','Incapacitated']});
  expect(sql(`select expires_at_rounds-granted_at_rounds from campaign_condition_immunities where campaign_id='${campaign}'`)).toBe('14400');
 });
 test('automatic failure uses no dice but still consumes the next-save effect',()=>{
  update(`active_conditions=array['Poisoned','Paralyzed'],condition_sources='{"Poisoned":{"source":"monster:fixture","save_to_end":{"ability":"STR","dc":12}}}'`);const effect=sliver();
  const r=JSON.parse(sql(auth(owner,command([],ctx(),0,randomUUID(),null))));expect(r).toMatchObject({passed:false,d20:null,total:null,automaticFailure:true,penalty:{penalty:0}});
  expect(sql(`select consumed_by is not null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');
 });
 test('Psionic Guards chooses the higher Intelligence die before Mind Sliver',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":6,"psion-disciplines":["psionic-guards"]}',intelligence=18 where id='${char}'`);
  const guardTurn=JSON.parse(sql(auth(owner,`select get_psionic_discipline_turn('${char}')`))).turn;
  const expected=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${char}'`);
  sql(auth(owner,`select begin_psionic_discipline('${char}','${randomUUID()}','${JSON.stringify(guardTurn)}','psionic-guards',array[]::integer[],1,4,'${expected}')`));
  sliver();expect(ctx().state.advantage).toBe(true);expect(settle([4,12])).toMatchObject({d20:12,total:9,passed:false,advantage:true});
 });
 test('Restrained Dexterity save uses disadvantage',()=>{
  update(`active_conditions=array['Poisoned','Restrained'],condition_sources='{"Poisoned":{"source":"fixture","save_to_end":{"ability":"DEX","dc":12}}}'`);
  expect(settle([16,3])).toMatchObject({d20:3,passed:false,disadvantage:true});
 });
 test('disabled natural-extremes setting uses the total',()=>{
  sql(`update characters set nat_1_20_saves=false where id='${char}'`);expect(settle([1],ctx(),20)).toMatchObject({passed:true,total:21});
 });
 test('recorded result remains recoverable after the turn advances',()=>{
  const c=ctx(),first=settle([3],c);sql(`update combat_encounters set round_number=2 where id='${encounter}'`);
  expect(settle([20],c)).toEqual({...first,replayed:true});
 });

 test('owner and DM can recover a committed receipt after condition removal and turn change',()=>{
  const first=settle();sql(`update combat_encounters set round_number=2 where id='${encounter}'`);
  const read=`select get_condition_turn_save('${part}','${turn}','Poisoned')`;
  expect(JSON.parse(sql(auth(owner,read)))).toEqual({...first,replayed:true});expect(JSON.parse(sql(auth(dm,read)))).toEqual({...first,replayed:true});
  expect(()=>sql(auth(other,read))).toThrow();
 });
 test('receipt discovery returns no invented result for an unrolled save',()=>{expect(sql(auth(owner,`select get_condition_turn_save('${part}','${turn}','Poisoned')`))).toBe('');});

});
