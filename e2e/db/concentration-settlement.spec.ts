import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const authenticated=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string;error:string}>(resolve=>{const child=spawn('docker',args);let out='',error='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(query);});}
test.describe('Atomic campaign concentration settlement',()=>{
 gateDbSuite();
 let owner:string,dm:string,outsider:string,character:string,campaign:string,encounter:string,participant:string,pending:string,chain:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,character,campaign,encounter,participant,pending,chain]=Array.from({length:9},()=>randomUUID());
  sql(`begin;
   insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@save.local','{}'),('${dm}','${dm}@save.local','{}'),('${outsider}','${outsider}@save.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Concentration fixture');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,concentration_spell,concentration_slot_level,nat_1_20_saves)
    values('${character}','${owner}','${campaign}','Save fixture','Human','Psion','Sage',5,'detect-magic',2,false);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order)
    values('${participant}','${encounter}','${campaign}','character','${character}','Save fixture',0);
   insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision)
    values('${pending}','${campaign}','${encounter}','${chain}','${participant}','${character}','detect-magic',5,10,0,false,now()+interval '2 minutes',0);
   update combatants set active_conditions=array['Paralyzed','Incapacitated','Poisoned'],condition_sources=jsonb_build_object(
    'Paralyzed',jsonb_build_object('source','spell:detect-magic','casterParticipantId','${participant}'),
    'Incapacitated',jsonb_build_object('source','cascade:Paralyzed'),
    'Poisoned',jsonb_build_object('source','other')),
    active_buffs=jsonb_build_array(jsonb_build_object('key','owned','source','spell:detect-magic','casterParticipantId','${participant}'),jsonb_build_object('key','other','source','spell:detect-magic','casterParticipantId','someone-else'))
    where id=(select combatant_id from combat_participants where id='${participant}');commit;`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`);});
 const settle=(die=1,source='player')=>`select settle_pending_concentration_save('${pending}',${die},'${source}')`;
 const receipt=(user=owner,die=1,source='player')=>JSON.parse(sql(authenticated(user,settle(die,source))));
 const spell=()=>sql(`select concentration_spell from characters where id='${character}'`);
 const effects=()=>JSON.parse(sql(`select jsonb_build_object('conditions',active_conditions,'sources',condition_sources,'buffs',active_buffs) from combatants where id=(select combatant_id from combat_participants where id='${participant}')`));
 test('owner and DM racing one offer receive one saved result and one history entry',async()=>{
  const results=await Promise.all([parallel(authenticated(owner,settle(1))),parallel(authenticated(dm,settle(2,'timeout')))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);const receipts=results.map(r=>JSON.parse(r.out));
  expect(receipts.map(r=>r.replayed).sort()).toEqual([false,true]);expect(receipts[0].d20).toBe(receipts[1].d20);
  expect(spell()).toBe('');expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
  expect(receipt(owner,20).d20).toBe(receipts[0].d20);
 });
 test('failure removes only owned effects, includes cascades, and clears slot metadata',()=>{
  expect(receipt()).toMatchObject({outcome:'failed',d20:1,total:1,replayed:false});
  expect(effects()).toEqual({conditions:['Poisoned'],sources:{Poisoned:{source:'other'}},buffs:[{key:'other',source:'spell:detect-magic',casterParticipantId:'someone-else'}]});
  expect(sql(`select concentration_slot_level is null from characters where id='${character}'`)).toBe('t');
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='concentration_broken'`)).toBe('1');
 });
 test('failed concentration leaves a waking target Prone and retains another source of incapacity',()=>{
  sql(`update combatants set active_conditions=array['Unconscious','Prone','Incapacitated','Stunned'],condition_sources=jsonb_build_object(
   'Unconscious',jsonb_build_object('source','spell:detect-magic','casterParticipantId','${participant}'),
   'Prone',jsonb_build_object('source','cascade:Unconscious','expires_at_round',1),
   'Incapacitated',jsonb_build_object('source','cascade:Unconscious'),
   'Stunned',jsonb_build_object('source','other')) where id=(select combatant_id from combat_participants where id='${participant}')`);
  expect(receipt().outcome).toBe('failed');
  expect(effects()).toMatchObject({conditions:['Prone','Incapacitated','Stunned'],sources:{Prone:{source:'fall:Unconscious'},Incapacitated:{source:'cascade:Stunned'},Stunned:{source:'other'}}});
 });
 test('ending both parent effects in one concentration transaction removes their shared incapacity',()=>{
  sql(`update combatants set active_conditions=array['Paralyzed','Stunned','Incapacitated'],condition_sources=jsonb_build_object(
   'Paralyzed',jsonb_build_object('source','spell:detect-magic','casterParticipantId','${participant}'),
   'Stunned',jsonb_build_object('source','spell:detect-magic','casterParticipantId','${participant}'),
   'Incapacitated',jsonb_build_object('source','cascade:Paralyzed')) where id=(select combatant_id from combat_participants where id='${participant}')`);
  expect(receipt().outcome).toBe('failed');expect(effects().conditions).toEqual([]);expect(effects().sources).toEqual({});
 });
 for(const next of ['detect-magic','invisibility'])test(`an offer from an earlier casting cannot clear ${next}`,()=>{
  const before=effects();sql(`update characters set concentration_spell='${next}' where id='${character}'`);
  expect(receipt()).toMatchObject({outcome:'obsolete',d20:null,total:null});expect(spell()).toBe(next);expect(effects()).toEqual(before);
  expect(sql(`select count(*) from combat_events where chain_id='${chain}'`)).toBe('0');
 });
 for(const natural of [false,true])test(`natural one respects house rule ${natural}`,()=>{
  sql(`update pending_concentration_saves set con_bonus=12 where id='${pending}';update characters set nat_1_20_saves=${natural} where id='${character}'`);
  expect(receipt()).toMatchObject({outcome:natural?'failed':'passed',total:13});expect(spell()).toBe(natural?'':'detect-magic');
  expect(effects().conditions.includes('Paralyzed')).toBe(!natural);
 });
 test('different failing offers of one casting clear it once and retire the later offer',async()=>{
  const second=randomUUID();sql(`insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision)
   select '${second}',campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision from pending_concentration_saves where id='${pending}'`);
  const results=await Promise.all([parallel(authenticated(owner,settle())),parallel(authenticated(dm,settle().replace(pending,second)))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).outcome).sort()).toEqual(['failed','obsolete']);
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='concentration_broken'`)).toBe('1');
 });
 test('legacy offers retire without guessing a casting',()=>{
  sql(`update pending_concentration_saves set concentration_revision=null where id='${pending}'`);
  expect(receipt()).toMatchObject({outcome:'obsolete'});expect(spell()).toBe('detect-magic');
 });
 test('rejects outsiders and malformed rolls without touching the offer',()=>{
  expect(()=>receipt(outsider)).toThrow(/unavailable/);expect(()=>sql(`set role anon;${settle()}`)).toThrow(/permission denied/);
  for(const die of [0,21])expect(()=>receipt(owner,die)).toThrow(/Invalid concentration/);
  expect(sql(`select state from pending_concentration_saves where id='${pending}'`)).toBe('offered');expect(spell()).toBe('detect-magic');
 });
 test('failed history rolls back spell, effects and result; retry remains usable',()=>{
  const before=effects(),trigger='concentration_test_'+pending.replaceAll('-','');
  try{
   sql(`create function public.${trigger}() returns trigger language plpgsql as $$begin if new.chain_id='${chain}' then raise exception 'injected history failure';end if;return new;end;$$;
    create trigger ${trigger} before insert on combat_events for each row execute function public.${trigger}();`);
   expect(()=>receipt()).toThrow(/injected history failure/);expect(spell()).toBe('detect-magic');expect(effects()).toEqual(before);
   expect(sql(`select state from pending_concentration_saves where id='${pending}'`)).toBe('offered');
  }finally{sql(`drop trigger if exists ${trigger} on combat_events;drop function if exists public.${trigger}();`);}
  expect(receipt()).toMatchObject({outcome:'failed',replayed:false});
 });
 function withWarCaster(){
  sql(`update characters set gained_feats=array['War Caster'] where id='${character}';
   insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision)
   select '${randomUUID()}',campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision
   from pending_concentration_saves where id='${pending}';delete from pending_concentration_saves where id='${pending}'`);
  pending=sql(`select id from pending_concentration_saves where character_id='${character}'`);
 }
 const pair=(first=2,second=17)=>`select settle_pending_concentration_save('${pending}',${first},'player',${second})`;
 test('War Caster uses the higher die, retains both dice and replays the winning receipt',()=>{
  withWarCaster();const result=JSON.parse(sql(authenticated(owner,pair())));
  expect(result).toMatchObject({outcome:'passed',d20:17,total:17,rolls:[2,17],advantage:true,replayed:false});
  expect(JSON.parse(sql(authenticated(dm,pair(1,1))))).toMatchObject({...result,replayed:true});
  expect(spell()).toBe('detect-magic');
  expect(JSON.parse(sql(`select payload from combat_events where chain_id='${chain}' and event_type='save_rolled'`))).toMatchObject({d20:17,rolls:[2,17],advantage:true});
 });
 test('advantage keeps the first die when it is higher and uses the selected natural extreme',()=>{
  withWarCaster();sql(`update characters set nat_1_20_saves=true where id='${character}'`);
  expect(JSON.parse(sql(authenticated(owner,pair(20,1))))).toMatchObject({outcome:'passed',d20:20,rolls:[20,1]});
 });
 test('two low dice fail and clear concentration exactly once',()=>{
  withWarCaster();expect(JSON.parse(sql(authenticated(owner,pair(2,3))))).toMatchObject({outcome:'failed',d20:3,rolls:[2,3]});
  expect(spell()).toBe('');expect(JSON.parse(sql(authenticated(owner,pair()))).replayed).toBe(true);
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='concentration_broken'`)).toBe('1');
 });
 test('feat removal after damage does not remove captured advantage',()=>{
  withWarCaster();sql(`update characters set gained_feats=array[]::text[] where id='${character}'`);
  expect(JSON.parse(sql(authenticated(owner,pair())))).toMatchObject({advantage:true,d20:17});
 });
 test('adding the feat after an ordinary offer does not grant retroactive advantage',()=>{
  sql(`update characters set gained_feats=array['War Caster'] where id='${character}'`);
  expect(()=>sql(authenticated(owner,pair()))).toThrow(/requires one die/);
  expect(receipt(owner,12)).toMatchObject({advantage:false,rolls:[12],d20:12});
 });
 test('advantage requires two valid dice and cannot be disabled on the offer',()=>{
  withWarCaster();expect(()=>receipt()).toThrow(/requires two dice/);
  for(const value of [0,21])expect(()=>sql(authenticated(owner,pair(12,value)))).toThrow(/requires two dice/);
  expect(()=>sql(`update pending_concentration_saves set has_advantage=false where id='${pending}'`)).toThrow(/fixed when/);
  expect(sql(`select state from pending_concentration_saves where id='${pending}'`)).toBe('offered');
 });
 test('obsolete advantage offer retires without requiring or recording another die',()=>{
  withWarCaster();sql(`update characters set concentration_spell='Fly' where id='${character}'`);
  expect(receipt()).toMatchObject({outcome:'obsolete',rolls:null,d20:null});expect(spell()).toBe('Fly');
 });
 test('concurrent advantage requests share one pair and one result',async()=>{
  withWarCaster();const results=await Promise.all([parallel(authenticated(owner,pair(2,17))),parallel(authenticated(dm,pair(3,18)))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);const receipts=results.map(r=>JSON.parse(r.out));
  expect(receipts[0].rolls).toEqual(receipts[1].rolls);expect(receipts.map(r=>r.replayed).sort()).toEqual([false,true]);
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
 });

 const outside=()=>{
  sql(`delete from pending_concentration_saves where id='${pending}'`);
  // Exercise a real authenticated INSERT, including the advantage snapshot.
  sql(authenticated(owner,`insert into pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,damage,dc,con_bonus,has_con_prof,expires_at,concentration_revision)
   select '${pending}','${campaign}',null,'${chain}',null,id,concentration_spell,5,10,0,false,now()+interval '2 minutes',concentration_revision from characters where id='${character}'`));
 };
 test('party damage between encounters clears only the casters lingering effects',()=>{
  outside();expect(receipt(dm)).toMatchObject({outcome:'failed',d20:1,total:1,replayed:false});
  expect(spell()).toBe('');expect(effects()).toEqual({conditions:['Poisoned'],sources:{Poisoned:{source:'other'}},buffs:[{key:'other',source:'spell:detect-magic',casterParticipantId:'someone-else'}]});
  expect(receipt(owner,20)).toMatchObject({outcome:'failed',d20:1,replayed:true});
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and encounter_id is null and event_type='save_rolled'`)).toBe('1');
 });
 test('outside-encounter success retains concentration and saved advantage dice',()=>{
  withWarCaster();outside();const before=effects();
  expect(JSON.parse(sql(authenticated(owner,pair(2,17))))).toMatchObject({outcome:'passed',advantage:true,rolls:[2,17],d20:17});
  expect(spell()).toBe('detect-magic');expect(effects()).toEqual(before);
 });
 test('outside-encounter offer cannot clear a later casting or follow a departed character',()=>{
  outside();sql(`update characters set campaign_id=null where id='${character}'`);
  expect(receipt()).toMatchObject({outcome:'obsolete',d20:null});expect(spell()).toBe('detect-magic');
 });
 test('outside-encounter offers keep owner/DM authorization',()=>{
  outside();expect(()=>receipt(outsider)).toThrow(/unavailable/);
  expect(()=>sql(`set role anon;${settle()}`)).toThrow(/permission denied/);
  expect(sql(`select state from pending_concentration_saves where id='${pending}'`)).toBe('offered');
 });
 test('an encounter offer cannot drop only its participant',()=>{
  expect(()=>sql(`update pending_concentration_saves set participant_id=null where id='${pending}'`)).toThrow(/concentration_encounter_requires_participant/);
  expect(receipt(owner,12)).toMatchObject({outcome:'passed'});
 });
 test('racing outside-encounter saves still settle exactly once',async()=>{
  outside();const results=await Promise.all([parallel(authenticated(owner,settle(1))),parallel(authenticated(dm,settle(2,'timeout')))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);const receipts=results.map(r=>JSON.parse(r.out));
  expect(receipts.map(r=>r.replayed).sort()).toEqual([false,true]);expect(receipts[0].d20).toBe(receipts[1].d20);
  expect(sql(`select count(*) from combat_events where chain_id='${chain}' and event_type='save_rolled'`)).toBe('1');
 });

 test('outside-encounter failure with no participant identity preserves all unrelated buffs',()=>{
  outside();sql(`update combat_participants set entity_id='unrelated-character' where id='${participant}'`);
  const before=effects();expect(receipt()).toMatchObject({outcome:'failed'});expect(effects()).toEqual(before);expect(spell()).toBe('');
 });

});
