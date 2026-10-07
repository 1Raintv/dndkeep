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
});
