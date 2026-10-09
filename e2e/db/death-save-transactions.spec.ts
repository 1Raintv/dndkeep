import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string}>(resolve=>{const p=spawn('docker',args);let out='';p.stdout.on('data',d=>out+=d);p.on('close',code=>resolve({code,out}));p.stdin.end(q);});
test.describe('Atomic prompted death saves',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,char:string,campaign:string,encounter:string,part:string,id:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,char,campaign,encounter,part,id]=Array.from({length:8},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@death.local','{}'),('${dm}','${dm}@death.local','{}'),('${outsider}','${outsider}@death.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Death saves');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${char}','${owner}','${campaign}','Dying Psion','Human','Psion','Sage',5,0,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${part}','${encounter}','${campaign}','character','${char}','Dying Psion',0);
   insert into pending_death_saves(id,campaign_id,encounter_id,participant_id,character_id) values('${id}','${campaign}','${encounter}','${part}','${char}');`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));
 const ctx=()=>JSON.parse(sql(auth(owner,`select get_death_save_context('${id}')`)));
 const command=(dice=[10],context=ctx(),bonus=0,adv=false,dis=false)=>`select settle_pending_death_save('${id}','${JSON.stringify(context)}',array[${dice}]::integer[],${bonus},${adv},${dis},3)`;
 const settle=(dice=[10],context=ctx(),bonus=0,adv=false,dis=false)=>JSON.parse(sql(auth(owner,command(dice,context,bonus,adv,dis))));
 const update=(set:string)=>sql(`update combatants set ${set} where id=(select combatant_id from combat_participants where id='${part}')`);
 const sliver=()=>{
  sql(auth(owner,`select psionic_propel('${char}','context')`));
  const effect=randomUUID(),clock=JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${encounter}','${part}')`));
  sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${effect}','${encounter}','${part}','${part}','${clock.turnId}',${clock.castTurnOrdinal},'active')`);return effect;
 };
 test('Mind Sliver changes success to failure and is consumed once',()=>{
  const effect=sliver();expect(settle([12])).toMatchObject({outcome:'failure',total:9,penalty:{penalty:3,consumedIds:[effect]}});
  expect(sql(`select consumed_kind||':'||consumed_by from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe(`death:${id}`);
 });
 test('natural twenty still consumes the next-save effect but restores HP',()=>{
  const effect=sliver();expect(settle([20])).toMatchObject({outcome:'crit_success',hp:1,penalty:{consumedIds:[effect]}});
 });
 test('obsolete save does not consume Mind Sliver',()=>{
  const effect=sliver();update('is_stable=true');expect(settle()).toMatchObject({outcome:'obsolete'});
  expect(sql(`select consumed_by is null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');
 });
 test('later transaction failure rolls back penalty, counters, receipt and event',()=>{
  const effect=sliver(),q=command([12]);expect(()=>sql(auth(owner,q+';select 1/0'))).toThrow();
  expect(sql(`select state from pending_death_saves where id='${id}'`)).toBe('pending');
  expect(sql(`select consumed_by is null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');
  expect(sql(`select count(*) from dndkeep_private.death_save_receipts where pending_id='${id}'`)).toBe('0');
  expect(sql(`select count(*) from combat_events where chain_id='${id}'`)).toBe('0');
  expect(ctx().failures).toBe(0);expect(settle([12])).toMatchObject({outcome:'failure',failures:1});
 });
 test('third success clears both counters and mirrors stable state to sheet',()=>{
  update('death_save_successes=2,death_save_failures=2');expect(settle()).toMatchObject({outcome:'success',stable:true,hp:0,successes:0,failures:0});
  expect(sql(`select is_stable::text||':'||death_saves_successes||':'||death_saves_failures from characters where id='${char}'`)).toBe('true:0:0');
 });
 test('natural twenty restores one HP despite a negative total',()=>{expect(settle([20],ctx(),-30)).toMatchObject({outcome:'crit_success',hp:1,successes:0,failures:0});});
 test('natural one adds two failures despite a positive total',()=>{update('death_save_failures=1');expect(settle([1],ctx(),30)).toMatchObject({outcome:'crit_failure',failures:3,dead:true});});
 test('exhaustion modifies the total without an ability score',()=>{update('exhaustion_level=2');expect(settle([12])).toMatchObject({outcome:'failure',total:8,failures:1});});
 test('disadvantage chooses the lower natural face',()=>{expect(settle([20,1],ctx(),0,false,true)).toMatchObject({outcome:'crit_failure',d20:1,failures:2});});
 test('advantage and disadvantage cancel',()=>{expect(settle([10],ctx(),0,true,true)).toMatchObject({outcome:'success'});});
 test('replay returns original result and writes one event',()=>{const c=ctx(),first=settle([10],c);expect(settle([1],c)).toEqual({...first,replayed:true});expect(sql(`select count(*) from combat_events where chain_id='${id}'`)).toBe('1');});
 test('racing requests commit one result',async()=>{const c=ctx(),out=await Promise.all([parallel(auth(owner,command([10],c))),parallel(auth(owner,command([1],c)))]);expect(out.map(v=>v.code)).toEqual([0,0]);const rows=out.map(v=>JSON.parse(v.out.trim()));expect(rows[0].outcome).toBe(rows[1].outcome);expect(rows.filter(v=>v.replayed)).toHaveLength(1);});
 for(const set of ['current_hp=1','is_stable=true','is_dead=true'])test(`obsolete save expires without a roll: ${set}`,()=>{const c=ctx();update(set);expect(settle([10],c)).toMatchObject({outcome:'obsolete',d20:null,penalty:null});expect(sql(`select count(*) from combat_events where chain_id='${id}'`)).toBe('0');});
 test('changed counters require review',()=>{const c=ctx();update('death_save_failures=1');expect(()=>settle([10],c)).toThrow();expect(sql(`select state from pending_death_saves where id='${id}'`)).toBe('pending');});
 test('outsider cannot read or settle',()=>{expect(()=>sql(auth(outsider,`select get_death_save_context('${id}')`))).toThrow();const q=command();expect(()=>sql(auth(outsider,q))).toThrow();});
 test('DM can settle and private receipt table stays inaccessible',()=>{expect(JSON.parse(sql(auth(dm,command())))).toMatchObject({outcome:'success'});expect(()=>sql(auth(owner,'select * from dndkeep_private.death_save_receipts'))).toThrow();});
 test('invalid dice fail without writes',()=>{expect(()=>settle([21])).toThrow();expect(sql(`select state from pending_death_saves where id='${id}'`)).toBe('pending');});
});
