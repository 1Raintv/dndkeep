import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
const parallel=(query:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});

test.describe('Atomic Counterspell acceptance (local stack)',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,campaign:string,hero:string,caster:string,encounter:string,reactor:string,target:string,cast:string,offer:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,campaign,hero,caster,encounter,reactor,target,cast,offer]=Array.from({length:11},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@counter.local','{}'),('${dm}','${dm}@counter.local','{}'),('${outsider}','${outsider}@counter.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Counterspell transaction');
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
 test.afterEach(()=>sql(`delete from pending_reactions where campaign_id='${campaign}';delete from pending_spell_casts where campaign_id='${campaign}';delete from pending_attacks where campaign_id='${campaign}';delete from combat_participants where campaign_id='${campaign}';delete from combat_encounters where campaign_id='${campaign}';delete from characters where campaign_id='${campaign}';delete from combatants where campaign_id='${campaign}';delete from campaigns where id='${campaign}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));
 const row=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${hero}'`));
 const snapshot=()=>{const c=row();return {...Object.fromEntries(['class_name','level','subclass','secondary_class','secondary_level','secondary_subclass','intelligence','wisdom','charisma','inventory','spell_sources','spell_preparation_sources','prepared_spells'].map(k=>[k,c[k]])),slot:c.spell_slots['3']};};
 const request=(id=offer,expected=snapshot(),source='class:Psion',ability='intelligence',modifier=4)=>`select accept_counterspell_atomic('${id}',3,'${source}','${ability}',${modifier},'${JSON.stringify(expected)}')`;
 const counts=()=>sql(`select (select count(*) from pending_attacks where campaign_id='${campaign}')||','||(select count(*) from dndkeep_private.counterspell_acceptances where character_id='${hero}')||','||(select count(*) from combat_events where campaign_id='${campaign}')`);
 const reaction=()=>sql(`select reaction_used from combat_participants where id='${reactor}'`);
 test('saved Counterspell reaction survives stale resets and expires only at the next own turn',()=>{
  const q=request();sql(auth(owner,q));
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${offer}' and grant_id='normal:reaction'`)).toBe('1');
  sql(`update combat_participants set reaction_used=false where id='${reactor}'`);expect(reaction()).toBe('t');
  sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);expect(reaction()).toBe('t');
  sql(`update combat_encounters set current_turn_index=0,round_number=2 where id='${encounter}'`);expect(reaction()).toBe('f');
  expect(JSON.parse(sql(auth(owner,q))).replayed).toBe(true);expect(reaction()).toBe('f');
 });
 test('a failed Counterspell history write rolls the shared reaction back with its payment',()=>{
  sql(`insert into combat_events(id,chain_id,actor_type,actor_name,event_type,campaign_id,payload) values('${offer}','${randomUUID()}','system','Fixture','reaction_used','${campaign}','{}')`);
  expect(()=>sql(auth(owner,request()))).toThrow(/duplicate key/);
  expect(reaction()).toBe('f');expect(row().spell_slots['3'].used).toBe(0);
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${offer}'`)).toBe('0');
 });
 test('Counterspell acceptance and another reaction spell cannot both spend the reaction',async()=>{
  const id=randomUUID();const declare=`select public.declare_spell_cast_atomic('${id}','${hero}','${reactor}','counterspell','Counterspell',3,'${JSON.stringify(row().spell_slots['3'])}','{"source":"class:Psion","spellLevel":3,"actionKind":"reaction","isBonusAction":false}')`;
  const outcomes=await Promise.all([parallel(auth(owner,request())),parallel(auth(owner,declare))]);
  expect(outcomes.filter(r=>r.code===0)).toHaveLength(1);expect(reaction()).toBe('t');expect(row().spell_slots['3'].used).toBe(1);
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${hero}'`)).toBe('1');
 });
 test('links another caster while preserving the restriction on arbitrary direct edits',()=>{
  expect(sql(auth(owner,`update pending_spell_casts set state='canceled' where id='${cast}' returning id`))).toBe('');
  const q=request(),r=JSON.parse(sql(auth(owner,q)));
  expect(r).toMatchObject({offerId:offer,castId:cast,slotLevel:3,saveDC:15,replayed:false,spellSlots:{3:{total:2,used:1}}});
  expect(sql(`select state||','||counterspell_attack_id from pending_spell_casts where id='${cast}'`)).toBe('counterspell_offered,'+r.attackId);
  expect(sql(`select reaction_used from combat_participants where id='${reactor}'`)).toBe('t');
  expect(JSON.parse(sql(auth(owner,q)))).toMatchObject({attackId:r.attackId,replayed:true});expect(counts()).toBe('1,1,2');
 });
 test('exact replay returns current slots without charging or restoring later spending',()=>{
  const q=request();sql(auth(owner,q));sql(`update characters set spell_slots='{"3":{"total":2,"used":2}}' where id='${hero}'`);
  expect(JSON.parse(sql(auth(owner,q)))).toMatchObject({replayed:true,spellSlots:{3:{total:2,used:2}}});expect(counts()).toBe('1,1,2');
 });
 test('rejects outsiders, anonymous callers and altered paid requests',()=>{
  const q=request();expect(()=>sql(auth(outsider,q))).toThrow(/unavailable/);
  expect(()=>sql(`begin;set local role anon;${q};commit;`)).toThrow(/permission denied/);
  sql(auth(owner,q));expect(()=>sql(auth(owner,q.replace(",4,'",",5,'")))).toThrow(/request changed/);
  expect(()=>sql(auth(owner,'select * from dndkeep_private.counterspell_acceptances'))).toThrow(/permission denied/);expect(counts()).toBe('1,1,2');
 });
 for(const patch of ["intelligence=20","spell_slots='{}'","spell_preparation_sources='{}',prepared_spells='{}'","inventory='[{\"id\":\"new-item\"}]'"])
 test(`rejects stale casting inputs: ${patch}`,()=>{const q=request();sql(`update characters set ${patch} where id='${hero}'`);expect(()=>sql(auth(owner,q))).toThrow();expect(counts()).toBe('0,0,0');});
 test('rejects a spent reaction, expired offer, closed cast, or stopped encounter without payment',()=>{
  const q=request();
  for(const [change,undo] of [
   [`update combat_participants set reaction_used=true where id='${reactor}'`,`update combat_participants set reaction_used=false where id='${reactor}'`],
   [`update pending_reactions set expires_at=now()-interval '1 second' where id='${offer}'`,`update pending_reactions set expires_at=now()+interval '5 minutes' where id='${offer}'`],
   [`update pending_spell_casts set state='resolved' where id='${cast}'`,`update pending_spell_casts set state='declared' where id='${cast}'`],
   [`update combat_encounters set status='ended' where id='${encounter}'`,`update combat_encounters set status='active' where id='${encounter}'`],
  ]){sql(change);expect(()=>sql(auth(owner,q))).toThrow();sql(undo);}
  expect(row().spell_slots['3'].used).toBe(0);expect(counts()).toBe('0,0,0');
 });
 test('requires an owned prepared source and its class ability',()=>{
  expect(()=>sql(auth(owner,request(offer,snapshot(),'class:Wizard')))).toThrow(/source/);
  expect(()=>sql(auth(owner,request(offer,snapshot(),'class:Psion','charisma')))).toThrow(/ability/);
  sql(`update characters set spell_preparation_sources='{"counterspell":[]}' where id='${hero}'`);
  expect(()=>sql(auth(owner,request()))).toThrow(/not prepared/);expect(counts()).toBe('0,0,0');
 });
 test('simultaneous identical requests charge once and return one attack',async()=>{
  const q=request(),r=await Promise.all([parallel(auth(owner,q)),parallel(auth(owner,q))]);
  expect(r.every(v=>v.code===0)).toBe(true);expect(new Set(r.map(v=>JSON.parse(v.out).attackId)).size).toBe(1);expect(counts()).toBe('1,1,2');
 });
 test('competing reactors cannot both pay for the same interrupted cast',async()=>{
  const second=randomUUID(),secondHero=randomUUID(),secondParticipant=randomUUID();
  sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,intelligence,prepared_spells,spell_sources,spell_preparation_sources,spell_slots)
    select '${secondHero}',user_id,campaign_id,'Second reactor',species,class_name,background,level,intelligence,prepared_spells,spell_sources,spell_preparation_sources,spell_slots from characters where id='${hero}';
   insert into combat_participants(id,campaign_id,encounter_id,participant_type,entity_id,name,turn_order) values('${secondParticipant}','${campaign}','${encounter}','character','${secondHero}','Second reactor',2);
   insert into pending_reactions(id,campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload) select '${second}',campaign_id,'${secondParticipant}','Second reactor',reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload from pending_reactions where id='${offer}'`);
  const r=await Promise.all([parallel(auth(owner,request())),parallel(auth(owner,request(second)))]);
  expect(r.filter(v=>v.code===0)).toHaveLength(1);
  expect(sql(`select sum((spell_slots->'3'->>'used')::int) from characters where id in('${hero}','${secondHero}')`)).toBe('1');
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('1');
 });
 test('history failure rolls back the slot, reaction, attack, cast link and receipt',()=>{
  sql(`insert into combat_events(id,chain_id,actor_type,actor_name,event_type,campaign_id,payload) values('${offer}','${randomUUID()}','system','Fixture','reaction_used','${campaign}','{}')`);
  expect(()=>sql(auth(owner,request()))).toThrow(/duplicate key/);
  expect(row().spell_slots['3'].used).toBe(0);expect(sql(`select state from pending_spell_casts where id='${cast}'`)).toBe('declared');
  expect(sql(`select reaction_used from combat_participants where id='${reactor}'`)).toBe('f');expect(counts()).toBe('0,0,1');
 });
 test('blocks incapacitated and zero-HP reactors using current combatant state',()=>{
  sql(`update combatants set active_conditions=ARRAY['Stunned'] where id=(select combatant_id from combat_participants where id='${reactor}')`);
  expect(()=>sql(auth(owner,request()))).toThrow(/cannot take a reaction/);
  sql(`update combatants set active_conditions='{}',current_hp=0 where id=(select combatant_id from combat_participants where id='${reactor}')`);
  expect(()=>sql(auth(owner,request()))).toThrow(/cannot take a reaction/);expect(counts()).toBe('0,0,0');
 });
 test('rejects a substituted cast from another campaign',()=>{
  const otherCampaign=randomUUID();
  try{
   sql(`insert into campaigns(id,owner_id,name) values('${otherCampaign}','${outsider}','Other campaign');update pending_spell_casts set campaign_id='${otherCampaign}' where id='${cast}'`);
   expect(()=>sql(auth(owner,request()))).toThrow(/context changed/);expect(counts()).toBe('0,0,0');
  }finally{sql(`update pending_spell_casts set campaign_id='${campaign}' where id='${cast}';delete from campaigns where id='${otherCampaign}'`);}
 });
 test('the campaign DM can accept on behalf of the reactor',()=>{expect(JSON.parse(sql(auth(dm,request()))).saveDC).toBe(15);});
 test('closing reservation preserves an eligible Counterspell reaction and its retry',()=>{
  sql(auth(dm,`select prepare_combat_turn_end('${encounter}',(select psionic_turn_id from combat_encounters where id='${encounter}'))`));
  const q=request(),first=JSON.parse(sql(auth(owner,q)));expect(first.replayed).toBe(false);expect(reaction()).toBe('t');expect(row().spell_slots['3'].used).toBe(1);
  expect(JSON.parse(sql(auth(owner,q)))).toMatchObject({attackId:first.attackId,replayed:true});expect(row().spell_slots['3'].used).toBe(1);
 });

});
