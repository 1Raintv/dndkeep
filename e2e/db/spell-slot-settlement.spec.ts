import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
const parallel=(query:string)=>new Promise<{code:number|null;out:string}>(resolve=>{const child=spawn('docker',args);let out='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',()=>{});child.on('close',code=>resolve({code,out}));child.stdin.end(query);});

test.describe('Paid spell declaration and settlement (local stack)',()=>{
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
 test.beforeEach(()=>sql(`update combat_encounters set current_turn_index=1 where id='${encounter}';delete from pending_reactions where id='${offer}';delete from pending_spell_casts where id='${cast}';
  update characters set spell_slots='{"3":{"total":3,"used":0},"4":{"total":1,"used":0}}',prepared_spells=ARRAY['fly'],spell_sources='{"fly":["class:Wizard"],"light":["class:Wizard"],"misty-step":["class:Wizard"],"counterspell":["class:Wizard"]}',spell_preparation_sources='{"fly":["class:Wizard"],"misty-step":["class:Wizard"],"counterspell":["class:Wizard"]}' where id='${caster}'`));
 test.afterEach(()=>sql(`delete from pending_reactions where campaign_id='${campaign}';delete from pending_spell_casts where campaign_id='${campaign}';delete from pending_attacks where campaign_id='${campaign}';delete from combat_participants where campaign_id='${campaign}';delete from combat_encounters where campaign_id='${campaign}';delete from characters where campaign_id='${campaign}';delete from combatants where campaign_id='${campaign}';delete from campaigns where id='${campaign}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));

 const character=()=>JSON.parse(sql(`select row_to_json(c) from characters c where id='${caster}'`));
 const declare=(id=cast,level=3,expected=character().spell_slots[String(level)]??null,spell=level===0?'light':'fly')=>`select declare_spell_cast_atomic('${id}','${caster}','${target}','${spell}','${spell}',${level},${expected===null?'null':"'"+JSON.stringify(expected)+"'"},'{"source":"class:Wizard","actionKind":"action","isBonusAction":false,"spellLevel":${level===0?0:3},"target":"Self"}')`;
 const withKind=(query:string,kind:string)=>query.replace('"actionKind":"action"',`"actionKind":"${kind}"`).replace('"isBonusAction":false',`"isBonusAction":${kind==='bonusAction'}`)
  .replace("'fly','fly'",kind==='bonusAction'?"'misty-step','misty-step'":kind==='reaction'?"'counterspell','counterspell'":"'fly','fly'")
  .replace('"spellLevel":3',kind==='bonusAction'?'"spellLevel":2':'"spellLevel":3');
 const settle=(id=cast)=>`select settle_declared_spell_atomic('${id}')`;
 function counter(id=cast,passed=false){
  const offerId=randomUUID();
  sql(`insert into pending_reactions(id,campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload)
   values('${offerId}','${campaign}','${reactor}','Reactor','character','counterspell','Counterspell','spell_declared',now()+interval '5 minutes','{"spell_cast_id":"${id}"}')`);
  const c=JSON.parse(sql(`select row_to_json(c) from characters c where id='${hero}'`));
  const expected={...Object.fromEntries(['class_name','level','subclass','secondary_class','secondary_level','secondary_subclass','intelligence','wisdom','charisma','inventory','spell_sources','spell_preparation_sources','prepared_spells'].map(k=>[k,c[k]])),slot:c.spell_slots['3']};
  const receipt=JSON.parse(sql(auth(owner,`select accept_counterspell_atomic('${offerId}',3,'class:Psion','intelligence',4,'${JSON.stringify(expected)}')`)));
  sql(`update pending_attacks set save_result='${passed?'passed':'failed'}',save_d20=${passed?20:1},save_total=${passed?22:3} where id='${receipt.attackId}'`);
  return receipt.attackId;
 }

 // Advance through the reactor's own turn; emulate the legacy turn-reset writer.
 const nextTurn=(index=1)=>sql(`update combat_encounters set current_turn_index=0,round_number=round_number+1 where id='${encounter}';update combat_participants set reaction_used=false where id='${reactor}';update combat_encounters set current_turn_index=${index} where id='${encounter}'`);
 const spends=()=>JSON.parse(sql(`select coalesce(json_agg(s order by s.created_at),'[]') from dndkeep_private.spell_turn_slot_spends s where s.encounter_id='${encounter}'`));
 const readyHero=()=>sql(`update characters set spell_sources=spell_sources||'{"fly":["class:Psion"]}',spell_preparation_sources=spell_preparation_sources||'{"fly":["class:Psion"]}',prepared_spells=array_append(prepared_spells,'fly') where id='${hero}'`);
 const heroDeclare=()=>`select declare_spell_cast_atomic('${randomUUID()}','${hero}','${reactor}','fly','Fly',3,'${sql(`select spell_slots->'3' from characters where id='${hero}'`)}','{"source":"class:Psion","spellLevel":3,"actionKind":"action","isBonusAction":false}')`;
 test('one current-turn slot covers different spell levels and action types',()=>{
  sql(auth(dm,declare()));const before=character();
  const q=withKind(declare(randomUUID(),4),'bonusAction');
  expect(()=>sql(auth(dm,q))).toThrow(/Only one spell slot/);
  expect(character().spell_slots).toEqual(before.spell_slots);expect(spends()).toHaveLength(1);
  expect(sql(`select bonus_used from combat_participants where id='${target}'`)).toBe('f');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${caster}'`)).toBe('1');
  expect(sql(`select count(*) from pending_spell_casts where campaign_id='${campaign}'`)).toBe('1');
 });
 test('cantrips do not consume or collide with the slot limit',()=>{
  sql(auth(dm,declare(cast,0)));sql(auth(dm,withKind(declare(randomUUID(),3),'bonusAction')));expect(()=>sql(auth(dm,declare(randomUUID(),0)))).toThrow(/already spent/);
  expect(spends()).toHaveLength(1);expect(character().spell_slots['3'].used).toBe(1);
 });
 test('the next actor turn in the same round permits a new slot, with no stale replay charge',()=>{
  const q=declare();sql(auth(dm,q));const first=spends()[0].turn_id;
  sql(`update combat_encounters set current_turn_index=0 where id='${encounter}'`);
  sql(auth(dm,withKind(declare(randomUUID(),4),'reaction')));expect(spends()).toHaveLength(2);expect(spends()[1].turn_id).not.toBe(first);
  expect(JSON.parse(sql(auth(dm,q))).replayed).toBe(true);expect(spends()).toHaveLength(2);
  expect(()=>sql(auth(dm,withKind(declare(randomUUID(),3),'reaction')))).toThrow(/already spent/);
 });
 test('rewinding initiative does not reuse an old turn nonce',()=>{
  sql(auth(dm,declare()));sql(`update combat_encounters set current_turn_index=0 where id='${encounter}';update combat_encounters set current_turn_index=1 where id='${encounter}'`);
  sql(auth(dm,declare(randomUUID(),4)));expect(new Set(spends().map((s:any)=>s.turn_id)).size).toBe(2);
 });
 test('competing casts at different slot levels pay for only one spell',async()=>{
  const results=await Promise.all([parallel(auth(dm,declare(cast,3))),parallel(auth(dm,withKind(declare(randomUUID(),4),'bonusAction')))]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(spends()).toHaveLength(1);
  const slots=character().spell_slots;expect(slots['3'].used+slots['4'].used).toBe(1);
 });
 test('a refunded Counterspell interruption releases only that spell cost',()=>{
  sql(auth(dm,declare()));counter();sql(auth(dm,settle()));expect(spends().find((s:any)=>s.character_id===caster).released).toBe(true);
  sql(auth(dm,withKind(declare(randomUUID(),4),'bonusAction')));expect(spends().filter((s:any)=>s.character_id===caster&&!s.released)).toHaveLength(1);
  sql(auth(dm,settle()));expect(()=>sql(auth(dm,withKind(declare(randomUUID(),3),'reaction')))).toThrow(/Only one spell slot/);
 });
 test('successful saves keep the original slot spent for the current turn',()=>{
  sql(auth(dm,declare()));counter(cast,true);sql(auth(dm,settle()));
  expect(()=>sql(auth(dm,withKind(declare(randomUUID(),4),'bonusAction')))).toThrow(/Only one spell slot/);
 });
 test('Counterspell and normal casting share the reactor current-turn limit',()=>{
  readyHero();sql(`update combat_encounters set current_turn_index=0 where id='${encounter}'`);sql(auth(dm,withKind(declare(),'reaction')));counter();const before=sql(`select spell_slots from characters where id='${hero}'`);
  expect(()=>sql(auth(owner,heroDeclare()))).toThrow(/Only one spell slot/);expect(sql(`select spell_slots from characters where id='${hero}'`)).toBe(before);
  nextTurn(0);sql(auth(owner,heroDeclare()));expect(spends().filter((s:any)=>s.character_id===hero)).toHaveLength(2);
 });
 test('Counterspell rejection after an earlier spell rolls back reaction, save and receipt',()=>{
  readyHero();sql(`update combat_encounters set current_turn_index=0 where id='${encounter}'`);sql(auth(owner,heroDeclare()));sql(auth(dm,withKind(declare(),'reaction')));
  expect(()=>counter()).toThrow(/Only one spell slot/);
  expect(sql(`select reaction_used from combat_participants where id='${reactor}'`)).toBe('f');
  expect(sql(`select state from pending_spell_casts where id='${cast}'`)).toBe('declared');
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('0');
 });
 test('resting, deleting the public cast or editing counters cannot erase the private current-turn cost',()=>{
  sql(auth(dm,declare()));sql(`delete from pending_spell_casts where id='${cast}';update characters set spell_slots='{"3":{"total":3,"used":0},"4":{"total":1,"used":0}}' where id='${caster}'`);
  expect(()=>sql(auth(dm,withKind(declare(randomUUID(),4),'bonusAction')))).toThrow(/Only one spell slot/);expect(spends()).toHaveLength(1);
 });
 test('turn-slot records and trigger function are not accessible to ordinary clients',()=>{
  expect(()=>sql(auth(dm,'select * from dndkeep_private.spell_turn_slot_spends'))).toThrow(/permission denied/);
  expect(sql("select has_function_privilege('authenticated','dndkeep_private.record_spell_turn_slot_spend()','execute')")).toBe('f');
 });


 for(const kind of ['action','bonusAction','reaction'])test(`immutable ${kind} receipt preserves its original turn across replay`,()=>{
  const q=withKind(declare(),kind);
  const first=JSON.parse(sql(auth(dm,q))).actionContext;expect(first).toMatchObject({encounterId:encounter,kind});expect(first.turnId).toBe(first.currentTurnId);
  expect(spends()[0].turn_id).toBe(first.turnId);nextTurn();const replay=JSON.parse(sql(auth(dm,q)));expect(replay.replayed).toBe(true);
  expect(replay.actionContext.turnId).toBe(first.turnId);expect(replay.actionContext.currentTurnId).not.toBe(first.turnId);
  sql(`update dndkeep_private.declared_spell_payments set casting_action='bonusAction',casting_turn_id=gen_random_uuid() where cast_id='${cast}'`);
  expect(JSON.parse(sql(auth(dm,q))).actionContext).toEqual(replay.actionContext);
 });
 test('cantrip receipts capture action context without consuming a slot',()=>{
  const q=declare(cast,0).replace('"target":"Self"','"target":"Self","actionKind":"action","isBonusAction":false');
  expect(JSON.parse(sql(auth(dm,q))).actionContext.kind).toBe('action');expect(spends()).toHaveLength(0);
 });
 test('missing action metadata is rejected and unauthorized readers cannot inspect receipts',()=>{
  const q=declare().replace(',"actionKind":"action"','');expect(()=>sql(auth(dm,q))).toThrow(/action context is invalid/);sql(auth(dm,declare()));
  expect(()=>sql(auth(outsider,`select dndkeep_private.declared_spell_action_context('${cast}')`))).toThrow(/unavailable/);
  expect(sql("select has_function_privilege('anon','dndkeep_private.declared_spell_action_context(uuid)','execute')")).toBe('f');
 });
 test('invalid action context rejects the whole payment, not just the tracking metadata',()=>{
  const q=declare().replace('"target":"Self"','"target":"Self","actionKind":"reaction","isBonusAction":true');
  expect(()=>sql(auth(dm,q))).toThrow(/action context is invalid/);expect(character().spell_slots['3'].used).toBe(0);expect(spends()).toHaveLength(0);
 });
 test('a substituted public caster cannot read another character action receipt',()=>{
  const q=declare().replace('"target":"Self"','"target":"Self","actionKind":"action","isBonusAction":false');sql(auth(dm,q));
  sql(`update pending_spell_casts set caster_character_id='${hero}' where id='${cast}'`);
  expect(()=>sql(auth(owner,`select dndkeep_private.declared_spell_action_context('${cast}')`))).toThrow(/identity changed/);
 });
 const events=()=>sql(`select count(*) from combat_events where campaign_id='${campaign}' and event_type='spell_counterspell_resolved'`);
 const cancel=(id=cast,characterId=caster)=>`select cancel_unpaid_spell_atomic('${id}','${characterId}')`;
 test('cancels an unpaid request durably and blocks delayed declarations',()=>{
  const q=declare();expect(JSON.parse(sql(auth(dm,cancel())))).toMatchObject({castId:cast,characterId:caster,canceled:true,replayed:false});
  expect(JSON.parse(sql(auth(dm,cancel())))).toMatchObject({canceled:true,replayed:true});
  expect(()=>sql(auth(dm,q))).toThrow(/canceled/);expect(character().spell_slots['3'].used).toBe(0);
  expect(sql(`select count(*) from pending_spell_casts where id='${cast}'`)).toBe('0');
  sql(auth(dm,declare(randomUUID())));expect(character().spell_slots['3'].used).toBe(1);
 });
 test('rejects unpaid stale slots then permits cancellation after source and encounter changes',()=>{
  const q=declare(cast,3,{total:3,used:2});expect(()=>sql(auth(dm,q))).toThrow(/slots changed/);
  sql(`update characters set spell_sources='{}' where id='${caster}';delete from combat_participants where id='${target}'`);
  expect(JSON.parse(sql(auth(dm,cancel()))).canceled).toBe(true);expect(character().spell_slots['3'].used).toBe(0);
 });
 test('never cancels or refunds an already paid declaration',()=>{
  const q=declare();sql(auth(dm,q));expect(JSON.parse(sql(auth(dm,cancel()))).canceled).toBe(false);
  expect(JSON.parse(sql(auth(dm,q))).replayed).toBe(true);expect(character().spell_slots['3'].used).toBe(1);
  expect(sql(`select count(*) from dndkeep_private.canceled_spell_requests where cast_id='${cast}'`)).toBe('0');
 });
 test('refuses legacy declarations without inventing an unpaid receipt',()=>{
  sql(`insert into pending_spell_casts(id,campaign_id,encounter_id,chain_id,caster_participant_id,caster_character_id,caster_name,spell_name,spell_level,expires_at)
   values('${cast}','${campaign}','${encounter}','${randomUUID()}','${target}','${caster}','Caster','Fly',3,now())`);
  expect(JSON.parse(sql(auth(dm,cancel()))).canceled).toBe(false);expect(character().spell_slots['3'].used).toBe(0);
 });
 test('cancellation requires character owner or current DM, including retries',()=>{
  expect(()=>sql(auth(outsider,cancel()))).toThrow(/unavailable/);expect(()=>sql(auth(owner,cancel()))).toThrow(/unavailable/);
  sql(`update characters set user_id='${owner}' where id='${caster}'`);
  expect(JSON.parse(sql(auth(owner,cancel()))).canceled).toBe(true);
  expect(JSON.parse(sql(auth(dm,cancel()))).replayed).toBe(true);
  expect(()=>sql(auth(outsider,cancel()))).toThrow(/unavailable/);
 });
 test('cannot use a foreign cast or cancellation receipt for another character',()=>{
  sql(auth(dm,declare()));expect(()=>sql(auth(owner,cancel(cast,hero)))).toThrow(/identity changed/);
  const id=randomUUID();sql(auth(dm,cancel(id)));expect(()=>sql(auth(owner,cancel(id,hero)))).toThrow(/identity changed/);
 });
 test('a canceled ID cannot later pay for another authorized character',()=>{
  sql(auth(owner,cancel(cast,hero)));expect(()=>sql(auth(dm,declare()))).toThrow(/canceled/);
  expect(character().spell_slots['3'].used).toBe(0);
 });
 test('concurrent cancellation and declaration choose exactly one durable result',async()=>{
  const q=declare(),results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,cancel()))]);
  expect(results[1].code).toBe(0);const canceled=JSON.parse(results[1].out).canceled;
  expect(results[0].code===0).toBe(!canceled);expect(character().spell_slots['3'].used).toBe(canceled?0:1);
  expect(sql(`select count(*) from pending_spell_casts where id='${cast}'`)).toBe(canceled?'0':'1');
  expect(sql(`select count(*) from dndkeep_private.canceled_spell_requests where cast_id='${cast}'`)).toBe(canceled?'1':'0');
 });
 test('simultaneous cancellations return one original receipt and one replay',async()=>{
  const results=await Promise.all([parallel(auth(dm,cancel())),parallel(auth(dm,cancel()))]);
  expect(results.every(r=>r.code===0)).toBe(true);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
 });
 test('cancellation ledger stays private and its public entry point is invoker',()=>{
  expect(()=>sql(auth(dm,`select * from dndkeep_private.canceled_spell_requests`))).toThrow(/permission denied/);
  expect(sql("select prosecdef from pg_proc where oid='public.cancel_unpaid_spell_atomic(uuid,uuid)'::regprocedure")).toBe('f');
  expect(sql("select has_function_privilege('anon','public.cancel_unpaid_spell_atomic(uuid,uuid)','execute')")).toBe('f');
 });
 test('declares and pays once, even with concurrent identical requests',async()=>{
  const q=declare(),results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,q))]);
  expect(results.every(r=>r.code===0)).toBe(true);expect(character().spell_slots['3'].used).toBe(1);
  expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
  expect(sql(`select count(*) from combat_events where campaign_id='${campaign}' and event_type='spell_declared'`)).toBe('1');
 });
 test('a failed Counterspell save returns only the original caster slot once',()=>{
  sql(auth(dm,declare()));counter();
  expect(JSON.parse(sql(auth(dm,settle())))).toMatchObject({outcome:'countered',slotReturned:true,replayed:false});
  expect(character().spell_slots['3'].used).toBe(0);
  expect(sql(`select spell_slots->'3'->>'used' from characters where id='${hero}'`)).toBe('1');
  expect(JSON.parse(sql(auth(dm,settle())))).toMatchObject({outcome:'countered',slotReturned:true,replayed:true});expect(events()).toBe('1');
 });
 test('a successful save spends the original slot and releases the spell effect',()=>{
  sql(auth(dm,declare()));counter(cast,true);
  expect(JSON.parse(sql(auth(dm,settle())))).toMatchObject({outcome:'saved_through',slotReturned:false});expect(character().spell_slots['3'].used).toBe(1);
 });
 test('an uncontested expired window resolves without refund',()=>{
  sql(auth(dm,declare()));expect(()=>sql(auth(dm,settle()))).toThrow(/still open/);
  sql(`update pending_spell_casts set expires_at=now()-interval '1 second' where id='${cast}'`);
  expect(JSON.parse(sql(auth(dm,settle())))).toMatchObject({outcome:'went_off',slotReturned:false});expect(character().spell_slots['3'].used).toBe(1);
 });
 test('a rest followed by another spend must not be refunded by the older cast',()=>{
  sql(auth(dm,declare()));counter();
  sql(`update characters set spell_slots=jsonb_set(spell_slots,'{3,used}','0') where id='${caster}';update characters set spell_slots=jsonb_set(spell_slots,'{3,used}','1') where id='${caster}'`);
  expect(JSON.parse(sql(auth(dm,settle())))).toMatchObject({outcome:'countered',slotReturned:false});expect(character().spell_slots['3'].used).toBe(1);
 });
 test('separate paid spells of one level can each return their own slot',()=>{
  const otherCast=randomUUID();sql(auth(dm,declare()));counter();nextTurn();sql(auth(dm,declare(otherCast)));counter(otherCast);
  expect(character().spell_slots['3'].used).toBe(2);
  expect(JSON.parse(sql(auth(dm,settle()))).slotReturned).toBe(true);
  expect(JSON.parse(sql(auth(dm,settle(otherCast)))).slotReturned).toBe(true);expect(character().spell_slots['3'].used).toBe(0);expect(events()).toBe('2');
 });
 test('recovering another level does not invalidate this spell refund',()=>{
  sql(auth(dm,declare()));counter();sql(`update characters set spell_slots=jsonb_set(spell_slots,'{4,total}','2') where id='${caster}'`);
  expect(JSON.parse(sql(auth(dm,settle()))).slotReturned).toBe(true);
 });
 test('cannot fabricate recovery revisions or reset them through ordinary updates',()=>{
  const before=character().spell_slot_recovery_revisions;
  sql(auth(dm,`update characters set spell_slot_recovery_revisions='{"3":999}' where id='${caster}'`));expect(character().spell_slot_recovery_revisions).toEqual(before);
  expect(sql("select prosecdef from pg_proc where oid='public.advance_spell_slot_recovery_revisions()'::regprocedure")).toBe('f');
 });
 test('changed retries, stale slots, unprepared spells and unrelated users cannot pay',()=>{
  const q=declare();expect(()=>sql(auth(outsider,q))).toThrow(/unavailable/);expect(()=>sql(auth(owner,q))).toThrow(/unavailable/);
  sql(auth(dm,q));expect(()=>sql(auth(dm,q.replace("'fly','fly'","'fly','Changed'")))).toThrow(/request changed/);
  expect(()=>sql(auth(dm,declare(randomUUID(),3,{total:3,used:0})))).toThrow(/slots changed/);
  sql(`update characters set spell_preparation_sources='{"fly":[]}' where id='${caster}'`);
  expect(()=>sql(auth(dm,declare(randomUUID())))).toThrow(/not prepared/);expect(character().spell_slots['3'].used).toBe(1);
 });
 test('only caster or DM can settle, and a save must actually be recorded',()=>{
  sql(auth(dm,declare()));const attack=counter();
  expect(()=>sql(auth(owner,settle()))).toThrow(/unavailable/);expect(()=>sql(auth(outsider,settle()))).toThrow(/unavailable/);
  sql(`update pending_attacks set save_result=null where id='${attack}'`);expect(()=>sql(auth(dm,settle()))).toThrow(/not resolved/);
  expect(character().spell_slots['3'].used).toBe(1);expect(events()).toBe('0');
 });
 test('cantrips declare and resolve without inventing slots',()=>{
  const before=character().spell_slots;sql(auth(dm,declare(cast,0)));counter();
  expect(JSON.parse(sql(auth(dm,settle())))).toMatchObject({outcome:'countered',slotReturned:false});expect(character().spell_slots).toEqual(before);
 });
 test('concurrent settlement returns one slot and writes one outcome',async()=>{
  sql(auth(dm,declare()));counter();const q=settle();const results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,q))]);
  expect(results.every(r=>r.code===0)).toBe(true);expect(character().spell_slots['3'].used).toBe(0);expect(events()).toBe('1');
 });
 test('declaration history failure rolls back the slot, cast and payment together',()=>{
  sql(`insert into combat_events(id,chain_id,actor_type,actor_name,event_type,campaign_id,payload) values('${cast}','${randomUUID()}','system','Fixture','spell_declared','${campaign}','{}')`);
  expect(()=>sql(auth(dm,declare()))).toThrow(/duplicate key/);expect(character().spell_slots['3'].used).toBe(0);
  expect(sql(`select count(*) from pending_spell_casts where id='${cast}'`)).toBe('0');
  expect(sql(`select count(*) from dndkeep_private.declared_spell_payments where cast_id='${cast}'`)).toBe('0');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${cast}'`)).toBe('0');
  expect(sql(`select action_used from combat_participants where id='${target}'`)).toBe('f');
 });
 test('settlement history failure rolls back the refund, outcome and recovery revision',()=>{
  sql(auth(dm,declare()));counter();const before=character();const constraint='fixture_'+randomUUID().replaceAll('-','');
  try{
   sql(`alter table combat_events add constraint ${constraint} check(campaign_id<>'${campaign}' or event_type<>'spell_counterspell_resolved') not valid`);
   expect(()=>sql(auth(dm,settle()))).toThrow(/violates check constraint/);
   expect(character().spell_slots).toEqual(before.spell_slots);expect(character().spell_slot_recovery_revisions).toEqual(before.spell_slot_recovery_revisions);
   expect(sql(`select state from pending_spell_casts where id='${cast}'`)).toBe('counterspell_offered');expect(events()).toBe('0');
  }finally{sql(`alter table combat_events drop constraint ${constraint}`);}
  expect(JSON.parse(sql(auth(dm,settle()))).slotReturned).toBe(true);
 });
 test('a non-DM caster owns declaration and the DM can settle for them',()=>{
  sql(`update characters set user_id='${owner}' where id='${caster}'`);
  sql(auth(owner,declare()));counter();
  expect(JSON.parse(sql(auth(dm,settle()))).slotReturned).toBe(true);
  expect(JSON.parse(sql(auth(owner,settle()))).replayed).toBe(true);
  expect(()=>sql(auth(owner,'select * from dndkeep_private.declared_spell_payments'))).toThrow(/permission denied/);
 });
 test('an unrelated failed save cannot be substituted to obtain a refund',()=>{
  sql(auth(dm,declare()));const attack=counter();const second=randomUUID();nextTurn();sql(auth(dm,declare(second)));
  sql(`update pending_spell_casts set counterspell_attack_id='${attack}',state='counterspell_offered' where id='${second}'`);
  expect(()=>sql(auth(dm,settle(second)))).toThrow(/save is unavailable/);expect(character().spell_slots['3'].used).toBe(2);expect(events()).toBe('0');
 });
 test('legacy declarations cannot obtain an invented refund',()=>{
  sql(`insert into pending_spell_casts(id,campaign_id,encounter_id,chain_id,caster_participant_id,caster_character_id,caster_name,spell_name,spell_level,expires_at)
   values('${cast}','${campaign}','${encounter}','${randomUUID()}','${target}','${caster}','Caster','fly',3,now())`);
  expect(JSON.parse(sql(auth(dm,settle())))).toEqual({legacy:true,castId:cast});expect(character().spell_slots['3'].used).toBe(0);expect(events()).toBe('0');
 });
 test('stale class ownership and incapacitation prevent declaration before payment',()=>{
  sql(`update characters set class_name='Cleric' where id='${caster}'`);expect(()=>sql(auth(dm,declare()))).toThrow(/class is unavailable/);
  sql(`update characters set class_name='Wizard' where id='${caster}';update combatants set active_conditions=ARRAY['Unconscious'] where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(()=>sql(auth(dm,declare()))).toThrow(/cannot cast/);expect(character().spell_slots['3'].used).toBe(0);
 });

});
