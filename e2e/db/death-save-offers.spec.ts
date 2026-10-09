import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string}>(resolve=>{const p=spawn('docker',args);let out='';p.stdout.on('data',d=>out+=d);p.on('close',code=>resolve({code,out}));p.stdin.end(q);});
test.describe('Death-save offer identity',()=>{
 gateDbSuite();let owner:string,dm:string,other:string,char:string,campaign:string,encounter:string,part:string,turn:string;
 test.beforeEach(()=>{
  [owner,dm,other,char,campaign,encounter,part]=Array.from({length:7},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@offer.local','{}'),('${dm}','${dm}@offer.local','{}'),('${other}','${other}@offer.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Death offers');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player'),('${campaign}','${other}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${char}','${owner}','${campaign}','Dying','Human','Fighter','Sage',1,0,10);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${part}','${encounter}','${campaign}','character','${char}','Dying',0);`);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${owner}','${dm}','${other}');`));
 const command=(token=turn)=>`select create_death_save_offer('${char}','${part}','${token}')`;
 const create=(token=turn,user=owner)=>JSON.parse(sql(auth(user,command(token)))||'null');
 const update=(set:string)=>sql(`update combatants set ${set} where id=(select combatant_id from combat_participants where id='${part}')`);
 const settle=(id:string)=>{const ctx=JSON.parse(sql(auth(owner,`select get_death_save_context('${id}')`)));return JSON.parse(sql(auth(owner,`select settle_pending_death_save('${id}','${JSON.stringify(ctx)}',array[10],0,false,false,3)`)));};
 test('creation retries return the same offer even after resolution',()=>{const first=create();expect(create().id).toBe(first.id);expect(settle(first.id).outcome).toBe('success');expect(create().id).toBe(first.id);});
 test('concurrent creation produces one offer',async()=>{const rows=await Promise.all([parallel(auth(owner,command())),parallel(auth(dm,command()))]);expect(rows.map(r=>r.code)).toEqual([0,0]);expect(JSON.parse(rows[0].out).id).toBe(JSON.parse(rows[1].out).id);expect(sql(`select count(*) from pending_death_saves where character_id='${char}'`)).toBe('1');});
 test('another party member cannot create or directly insert an offer',()=>{expect(()=>create(turn,other)).toThrow();expect(()=>sql(auth(owner,`insert into pending_death_saves(campaign_id,encounter_id,participant_id,character_id) values('${campaign}','${encounter}','${part}','${char}')`))).toThrow();});
 test('direct pending-result edits are blocked',()=>{const r=create();expect(()=>sql(auth(owner,`update pending_death_saves set state='rolled' where id='${r.id}'`))).toThrow();});
 test('old turn is rejected and the previous pending save expires on next offer',()=>{const first=create();sql(`update combat_encounters set round_number=2 where id='${encounter}'`);expect(()=>create()).toThrow();const next=sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`);expect(create(next).id).not.toBe(first.id);expect(sql(`select state from pending_death_saves where id='${first.id}'`)).toBe('expired');});
 test('turn advancement makes an unresolved old save obsolete',()=>{const first=create();sql(`update combat_encounters set round_number=2 where id='${encounter}'`);expect(settle(first.id)).toMatchObject({outcome:'obsolete',d20:null});});
 test('healed then downed does not revive an old offer',()=>{const first=create();update('current_hp=1');update('current_hp=0');expect(settle(first.id)).toMatchObject({outcome:'obsolete',d20:null});});
 test('stable then damaged does not revive an old offer',()=>{const first=create();update('is_stable=true');update('is_stable=false,death_save_failures=1');expect(settle(first.id)).toMatchObject({outcome:'obsolete',d20:null});});
 test('manual revision writes cannot rewind the dying episode',()=>{update('current_hp=1');update('current_hp=0');update('death_state_revision=0');expect(sql(`select death_state_revision from combatants where id=(select combatant_id from combat_participants where id='${part}')`)).toBe('2');});
 test('a healthy current actor receives no offer',()=>{update('current_hp=1');expect(create()).toBeNull();});
 test('automatic offer keeps its identity and can be exposed for owner review',()=>{
  const first=JSON.parse(sql(auth(dm,`select create_death_save_offer('${char}','${part}','${turn}',true)`)));
  expect(first.resolution_mode).toBe('auto');expect(create().id).toBe(first.id);
  expect(()=>sql(auth(other,`select review_automatic_death_save('${first.id}')`))).toThrow();
  expect(sql(`select resolution_mode from pending_death_saves where id='${first.id}'`)).toBe('auto');
  sql(auth(owner,`select review_automatic_death_save('${first.id}')`));
  expect(create()).toMatchObject({id:first.id,resolution_mode:'prompt'});
  expect(settle(first.id).outcome).toBe('success');
  sql(auth(dm,`select review_automatic_death_save('${first.id}')`));
  expect(create().state).toBe('rolled');
 });
 test('equipment changes invalidate the saved context without recording a result',()=>{
  const first=create(),context=JSON.parse(sql(auth(owner,`select get_death_save_context('${first.id}')`)));
  expect(context.inventory).toEqual([]);
  sql(`update characters set inventory='[{"name":"Ring of Protection","equipped":true,"attuned":true,"saveBonus":1}]' where id='${char}'`);
  expect(()=>sql(auth(owner,`select settle_pending_death_save('${first.id}','${JSON.stringify(context)}',array[10],0,false,false,3)`))).toThrow();
  expect(sql(`select count(*) from dndkeep_private.death_save_receipts where pending_id='${first.id}'`)).toBe('0');
  expect(create().state).toBe('pending');
  expect(settle(first.id).outcome).toBe('success');
 });

 test('server discovery exposes abandoned automatic offers only after grace and only to owner or DM',()=>{
  const row=JSON.parse(sql(auth(owner,`select create_death_save_offer('${char}','${part}','${turn}',true)`)));
  const discover=`select next_recoverable_death_save('${char}')`;
  expect(sql(auth(owner,discover))).toBe('');
  sql(`update pending_death_saves set created_at=now()-interval '2 minutes' where id='${row.id}'`);
  expect(sql(auth(owner,discover))).toBe(row.id);expect(sql(auth(dm,discover))).toBe(row.id);
  expect(()=>sql(auth(other,discover))).toThrow();
  settle(row.id);expect(sql(auth(owner,discover))).toBe('');
 });
 test('review fences late automatic settlement while preserving committed replay',()=>{
  const row=JSON.parse(sql(auth(owner,`select create_death_save_offer('${char}','${part}','${turn}',true)`)));
  const stale=JSON.parse(sql(auth(owner,`select get_death_save_context('${row.id}')`)));
  sql(auth(dm,`select review_automatic_death_save('${row.id}')`));
  const attempt=`select settle_pending_death_save('${row.id}','${JSON.stringify(stale)}',array[10],0,false,false,3)`;
  expect(()=>sql(auth(owner,attempt))).toThrow();expect(create().state).toBe('pending');
  expect(settle(row.id).outcome).toBe('success');
  expect(JSON.parse(sql(auth(owner,attempt)))).toMatchObject({outcome:'success',replayed:true});
  expect(sql(`select count(*) from combat_events where chain_id='${row.id}'`)).toBe('1');
 });

});
