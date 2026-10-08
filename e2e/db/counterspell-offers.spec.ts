import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
const parallel=(query:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});

test.describe('Counterspell offer retries (local stack)',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,campaign:string,hero:string,caster:string,encounter:string,reactor:string,target:string,cast:string,offer:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,campaign,hero,caster,encounter,reactor,target,cast,offer]=Array.from({length:11},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@counter.local','{}'),('${dm}','${dm}@counter.local','{}'),('${outsider}','${outsider}@counter.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Counterspell transaction');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,intelligence,prepared_spells,spell_sources,spell_preparation_sources,spell_slots) values
   ('${hero}','${owner}','${campaign}','Reactor','Human','Psion','Sage',5,18,ARRAY['counterspell'],'{"counterspell":["class:Psion"]}','{"counterspell":["class:Psion"]}','{"3":{"total":2,"used":0}}'),
   ('${caster}','${dm}','${campaign}','Caster','Human','Wizard','Sage',17,20,'{}','{}','{}','{}');
   insert into combat_encounters(id,campaign_id,status) values('${encounter}','${campaign}','active');
   insert into combat_participants(id,campaign_id,encounter_id,participant_type,entity_id,name,turn_order) values
   ('${reactor}','${campaign}','${encounter}','character','${hero}','Reactor',0),('${target}','${campaign}','${encounter}','character','${caster}','Caster',1);
   insert into pending_spell_casts(id,campaign_id,encounter_id,chain_id,caster_participant_id,caster_character_id,caster_name,spell_name,spell_level,expires_at)
   values('${cast}','${campaign}','${encounter}','${randomUUID()}','${target}','${caster}','Caster','Wish',9,now()+interval '5 minutes');
   insert into pending_reactions(id,campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload)
   values('${offer}','${campaign}','${reactor}','Reactor','character','counterspell','Counterspell','spell_declared',now()+interval '5 minutes','{"spell_cast_id":"${cast}"}');`);
 });

 test.beforeEach(()=>sql(`delete from pending_reactions where id='${offer}'`));
 test.afterEach(()=>sql(`delete from pending_reactions where campaign_id='${campaign}';delete from pending_spell_casts where campaign_id='${campaign}';delete from pending_attacks where campaign_id='${campaign}';delete from combat_participants where campaign_id='${campaign}';delete from combat_encounters where campaign_id='${campaign}';delete from characters where campaign_id='${campaign}';delete from combatants where campaign_id='${campaign}';delete from campaigns where id='${campaign}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));
 const request=(candidates=[reactor])=>`select offer_counterspell_once('${cast}',ARRAY[${candidates.map(id=>`'${id}'::uuid`).join(',')}]::uuid[])`;
 const offers=()=>JSON.parse(sql(`select coalesce(json_agg(r order by id),'[]') from pending_reactions r where campaign_id='${campaign}'`));
 test('concurrent retries create one prompt and preserve its original deadline',async()=>{
  const results=await Promise.all([parallel(auth(dm,request([reactor,reactor]))),parallel(auth(dm,request()))]);
  expect(results.every(r=>r.code===0)).toBe(true);expect(results.map(r=>JSON.parse(r.out).offerCount)).toEqual([1,1]);
  const rows=offers();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({reactor_name:'Reactor',reaction_key:'counterspell',state:'offered',decision_payload:{spell_cast_id:cast,spell_name:'Wish',spell_level:9,save_dc:null}});
  expect(sql(`select expires_at=(select expires_at from pending_spell_casts where id='${cast}') from pending_reactions where id='${rows[0].id}'`)).toBe('t');
 });
 test('a caster can create another player prompt without gaining read access to it',()=>{
  sql(`insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${outsider}','player');update characters set user_id='${outsider}' where id='${caster}'`);
  expect(JSON.parse(sql(auth(outsider,request()))).offerCount).toBe(1);
  expect(sql(auth(outsider,`select count(*) from pending_reactions where campaign_id='${campaign}'`))).toBe('0');
  expect(sql(auth(owner,`select count(*) from pending_reactions where campaign_id='${campaign}'`))).toBe('1');
 });
 test('reactors and unrelated users cannot offer on someone else cast',()=>{
  expect(()=>sql(auth(owner,request()))).toThrow(/unavailable/);expect(()=>sql(auth(outsider,request()))).toThrow(/unavailable/);
  expect(offers()).toHaveLength(0);
 });
 test('anonymous access is denied and the exposed wrapper is invoker',()=>{
  expect(()=>sql(`begin;set local role anon;${request()};rollback;`)).toThrow(/permission denied/);
  expect(sql("select prosecdef from pg_proc where oid='public.offer_counterspell_once(uuid,uuid[])'::regprocedure")).toBe('f');
 });
 test('self, nonexistent and foreign-encounter candidates reject the whole batch',()=>{
  expect(()=>sql(auth(dm,request([reactor,target])))).toThrow(/candidate is unavailable/);
  expect(()=>sql(auth(dm,request([reactor,randomUUID()])))).toThrow(/candidate is unavailable/);
  const other=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status) values('${other}','${campaign}','active');update combat_participants set encounter_id='${other}' where id='${reactor}'`);
  expect(()=>sql(auth(dm,request()))).toThrow(/candidate is unavailable/);expect(offers()).toHaveLength(0);
 });
 test('a stale caster participant cannot cause an offer',()=>{
  sql(`update pending_spell_casts set caster_participant_id='${reactor}' where id='${cast}'`);
  expect(()=>sql(auth(dm,request()))).toThrow(/context changed/);expect(offers()).toHaveLength(0);
 });
 test('declined offers stay declined and are never reopened',()=>{
  sql(auth(dm,request()));const row=offers()[0];sql(auth(owner,`update pending_reactions set state='declined',decided_at=now() where id='${row.id}'`));
  const before=offers()[0];expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(1);expect(offers()).toEqual([before]);
 });
 test('accepted and expired prompts are not recreated',()=>{
  sql(auth(dm,request()));const row=offers()[0];
  for(const state of ['accepted','expired']){
   sql(`update pending_reactions set state='${state}' where id='${row.id}'`);const before=offers()[0];sql(auth(dm,request()));expect(offers()).toEqual([before]);
  }
 });
 test('expired, resolved and already contested casts create no new prompts',()=>{
  sql(`update pending_spell_casts set expires_at=now()-interval '1 second' where id='${cast}'`);
  expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
  for(const state of ['resolved','countered','canceled','counterspell_offered']){
   sql(`update pending_spell_casts set state='${state}',expires_at=now()+interval '5 minutes' where id='${cast}'`);
   expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
  }
  expect(offers()).toHaveLength(0);
 });
 test('stopped encounters and spent reactions create no prompts',()=>{
  sql(`update combat_encounters set status='ended' where id='${encounter}'`);expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
  sql(`update combat_encounters set status='active' where id='${encounter}';update combat_participants set reaction_used=true where id='${reactor}'`);
  expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
 });
 test('canonical incapacitation, death and zero HP exclude a reactor',()=>{
  for(const patch of ["active_conditions=ARRAY['Unconscious']","active_conditions='{}',is_dead=true","is_dead=false,current_hp=0"]){
   sql(`update combatants set ${patch} where id=(select combatant_id from combat_participants where id='${reactor}')`);
   expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
  }
 });
 test('exhausted and malformed slots exclude a reactor',()=>{
  for(const slots of ['{"3":{"used":2,"total":2}}','{"3":{"used":-1,"total":2}}','{"3":{"used":"bad","total":2}}','{"2":{"used":0,"total":2}}','{}']){
   sql(`update characters set spell_slots='${slots}' where id='${hero}'`);expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
  }
 });
 test('orphaned or unprepared sources exclude a reactor',()=>{
  sql(`update characters set class_name='Cleric' where id='${hero}'`);expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
  sql(`update characters set class_name='Psion',spell_preparation_sources='{"counterspell":[]}' where id='${hero}'`);
  expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
 });
 test('ambiguous legacy preparation fails closed; a reviewed secondary source works',()=>{
  sql(`update characters set secondary_class='Wizard',secondary_level=3,spell_sources='{"counterspell":["class:Psion","class:Wizard"]}',spell_preparation_sources='{}' where id='${hero}'`);
  expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(0);
  sql(`update characters set spell_preparation_sources='{"counterspell":["class:Wizard"]}' where id='${hero}'`);
  expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(1);
 });
 test('an automatic grant does not require duplicate preparation',()=>{
  sql(`update characters set spell_sources='{"counterspell":["grant:class:Psion"]}',spell_preparation_sources='{}',prepared_spells='{}' where id='${hero}'`);
  expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(1);
 });
 test('empty candidate arrays are harmless; null and oversized arrays fail',()=>{
  expect(JSON.parse(sql(auth(dm,request([])))).offerCount).toBe(0);
  expect(()=>sql(auth(dm,`select offer_counterspell_once('${cast}',null)`))).toThrow(/Invalid/);
  expect(()=>sql(auth(dm,`select offer_counterspell_once('${cast}',ARRAY[null]::uuid[])`))).toThrow(/Invalid/);
  expect(()=>sql(auth(dm,request(Array(129).fill(reactor))))).toThrow(/Invalid/);expect(offers()).toHaveLength(0);
 });
 test('a failed prompt insert rolls the batch back and the same request can retry',()=>{
  const constraint='fixture_'+randomUUID().replaceAll('-','');
  try{
   sql(`alter table pending_reactions add constraint ${constraint} check(campaign_id<>'${campaign}') not valid`);
   expect(()=>sql(auth(dm,request()))).toThrow(/violates check constraint/);expect(offers()).toHaveLength(0);
  }finally{sql(`alter table pending_reactions drop constraint ${constraint}`);}
  expect(JSON.parse(sql(auth(dm,request()))).offerCount).toBe(1);
 });
});
