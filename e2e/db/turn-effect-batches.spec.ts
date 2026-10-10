import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const json=(v:unknown)=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic turn effect batches',()=>{
 gateDbSuite();let owner:string,dm:string,char:string,campaign:string,encounter:string,participant:string,turn:string,request:string,combatant:string;
 test.beforeEach(()=>{
  [owner,dm,char,campaign,encounter,participant,request]=Array.from({length:7},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@tick.local','{}'),('${dm}','${dm}@tick.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Turn ticks');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${char}','${owner}','${campaign}','Tick fixture','Human','Psion','Sage',5,40,50);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${char}','Tick fixture',0);commit;`);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`);combatant=sql(`select combatant_id from combat_participants where id='${participant}'`);
  sql(`update combatants set current_hp=40,max_hp=50,temp_hp=6,active_buffs='[{"key":"acid","name":"Delayed acid","turnTick":{"kind":"damage","timing":"turn_end","flat":10,"oneShot":true}}]' where id='${combatant}'`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where user_id='${owner}';delete from auth.users where id in('${owner}','${dm}')`));
 const context=()=>JSON.parse(sql(`select dndkeep_private.turn_effect_state('${combatant}')`));
 const updates=()=>({current_hp:36,temp_hp:0,death_save_failures:0,death_save_successes:0,is_stable:false,is_dead:false,active_buffs:[]});
 const events=[{eventType:'damage_applied',payload:{amount:10,tick:true}},{eventType:'spell_effect_removed',payload:{source_buff:'Delayed acid'}}];
 const call=(ctx=context(),patch:unknown=updates(),id=request,ev:unknown=events)=>`select commit_turn_effect_batch('${participant}','${turn}','turn_end','${id}',${json(ctx)},${json(patch)},${json(ev)})`;
 const read=()=>`select read_turn_effect_batch('${participant}','${turn}','turn_end')`;
 const count=()=>sql(`select count(*) from combat_events where encounter_id='${encounter}' and chain_id='${request}'`);
 const prepare=()=>`select get_turn_effect_context('${participant}','${encounter}','${turn}','turn_end')`;
 test('preparation returns the current DM snapshot and no mutation',()=>{
  expect(JSON.parse(sql(auth(dm,prepare())))).toEqual({userId:dm,participantId:participant,encounterId:encounter,turnId:turn,timing:'turn_end',combatantId:combatant,isCharacter:true,state:context()});
  expect(count()).toBe('0');expect(context().current_hp).toBe(40);
 });
 test('preparation rejects players, anonymous callers and a former DM',()=>{
  expect(()=>sql(auth(owner,prepare()))).toThrow(/current DM/);
  expect(()=>sql('set role anon;'+prepare())).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${owner}' where id='${campaign}'`);
  expect(()=>sql(auth(dm,prepare()))).toThrow(/current DM/);
  expect(JSON.parse(sql(auth(owner,prepare()))).userId).toBe(owner);
 });
 test('preparation rejects a stale turn, mismatched encounter and invalid timing',()=>{
  expect(()=>sql(auth(dm,prepare().replace(turn,randomUUID())))).toThrow(/Turn changed/);
  expect(()=>sql(auth(dm,prepare().replace(encounter,randomUUID())))).toThrow(/Turn changed/);
  expect(()=>sql(auth(dm,prepare().replace('turn_end','invalid')))).toThrow(/Invalid turn effect/);
  sql(`update combat_encounters set status='ended' where id='${encounter}'`);
  expect(()=>sql(auth(dm,prepare()))).toThrow(/Turn changed/);
 });
 test('preparation refuses a dead actor after the active initiative roster shifts',()=>{
  sql(`update combatants set is_dead=true where id='${combatant}'`);
  expect(()=>sql(auth(dm,prepare()))).toThrow(/Turn changed/);
 });
 test('HP, one-shot removal and ordered events commit together',()=>{
  const r=JSON.parse(sql(auth(dm,call())));expect(r).toMatchObject({requestId:request,participantId:participant,turnId:turn,eventCount:2,replayed:false,state:updates()});expect(count()).toBe('2');
  expect(sql(`select string_agg(sequence::text,',' order by sequence) from combat_events where chain_id='${request}'`)).toBe('0,1');
  expect(JSON.parse(sql(auth(dm,read())))).toMatchObject({...r,replayed:true});
 });
 test('replay preserves later HP and does not emit duplicate events',()=>{
  const ctx=context(),q=call(ctx);sql(auth(dm,q));sql(`update combatants set current_hp=49 where id='${combatant}'`);
  expect(JSON.parse(sql(auth(dm,q))).replayed).toBe(true);expect(context().current_hp).toBe(49);expect(count()).toBe('2');
 });
 test('same request raced across clients applies once',async()=>{
  const q=auth(dm,call()),r=await Promise.all([parallel(q),parallel(q)]);expect(r.map(x=>({code:x.code,error:x.error}))).toEqual([{code:0,error:''},{code:0,error:''}]);
  expect(r.map(x=>JSON.parse(x.out).replayed).sort()).toEqual([false,true]);expect(context().current_hp).toBe(36);expect(count()).toBe('2');
 });
 test('different IDs cannot repeat the same participant turn and timing',()=>{
  const ctx=context();sql(auth(dm,call(ctx)));expect(()=>sql(auth(dm,call(ctx,updates(),randomUUID())))).toThrow(/already recorded/);expect(count()).toBe('2');
 });
 test('changing a saved request is refused',()=>{
  const ctx=context();sql(auth(dm,call(ctx)));expect(()=>sql(auth(dm,call(ctx,{...updates(),current_hp:35})))).toThrow(/request changed/);expect(context().current_hp).toBe(36);
 });
 test('stale HP or changed buffs cannot be overwritten',()=>{
  const ctx=context();sql(`update combatants set current_hp=39 where id='${combatant}'`);expect(()=>sql(auth(dm,call(ctx)))).toThrow(/state changed/);expect(context().current_hp).toBe(39);expect(count()).toBe('0');
  sql(`update combatants set current_hp=40,active_buffs=active_buffs||'{"key":"new","name":"New buff"}'::jsonb where id='${combatant}'`);expect(()=>sql(auth(dm,call(ctx)))).toThrow(/state changed/);expect(context().active_buffs).toHaveLength(2);
 });
 test('old-turn fresh applications fail while committed receipts remain readable',()=>{
  const ctx=context();sql(auth(dm,call(ctx)));sql(`update combat_encounters set round_number=2 where id='${encounter}'`);
  expect(JSON.parse(sql(auth(dm,read()))).replayed).toBe(true);expect(JSON.parse(sql(auth(dm,call(ctx)))).replayed).toBe(true);
  expect(()=>sql(auth(dm,call(ctx,updates(),randomUUID()).replace("'turn_end'","'turn_start'")))).toThrow(/Turn changed/);
 });
 test('players and anonymous callers cannot write, read receipts or inspect the ledger',()=>{
  const q=call();expect(()=>sql(auth(owner,q))).toThrow(/current DM/);expect(()=>sql(auth(owner,read()))).toThrow(/current DM/);
  expect(()=>sql('set role anon;'+q)).toThrow(/permission denied/);expect(()=>sql('set role anon;'+read())).toThrow(/permission denied/);
  expect(()=>sql(auth(owner,'select * from dndkeep_private.turn_effect_batches'))).toThrow(/permission denied/);expect(context().current_hp).toBe(40);
 });
 test('ownership changes revoke receipt recovery for the former DM',()=>{
  const q=call();sql(auth(dm,q));sql(`update campaigns set owner_id='${owner}' where id='${campaign}'`);
  expect(()=>sql(auth(dm,q))).toThrow(/current DM/);expect(()=>sql(auth(dm,read()))).toThrow(/current DM/);expect(JSON.parse(sql(auth(owner,read()))).replayed).toBe(true);
 });
 test('an event failure rolls back HP, removals, earlier events and receipt',()=>{
  const fn='reject_tick_'+request.replaceAll('-',''),ctx=context();
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.chain_id='${request}' and new.sequence=1 then raise exception 'fixture event failure';end if;return new;end $$;create trigger ${fn} before insert on combat_events for each row execute function public.${fn}()`);
  try{expect(()=>sql(auth(dm,call(ctx)))).toThrow(/fixture event failure/);expect(context()).toEqual(ctx);expect(count()).toBe('0');expect(sql(auth(dm,read()))).toBe('');}
  finally{sql(`drop trigger ${fn} on combat_events;drop function public.${fn}()`);}
  expect(JSON.parse(sql(auth(dm,call(ctx)))).replayed).toBe(false);
 });
 test('malformed fields, pools and event types fail before writing',()=>{
  for(const patch of [{...updates(),user_id:owner},{...updates(),current_hp:51},{...updates(),temp_hp:-1},{...updates(),death_save_failures:4},{...updates(),is_dead:'false'},{...updates(),active_buffs:null}])
   expect(()=>sql(auth(dm,call(context(),patch)))).toThrow(/Invalid turn effect/);
  expect(()=>sql(auth(dm,call(context(),updates(),request,[{eventType:'spell_cast',payload:{}}])))).toThrow(/Invalid turn effect/);expect(context().current_hp).toBe(40);expect(count()).toBe('0');
 });
 test('persisted browser recovery reads the original batch after a lost reply without applying again',async({page})=>{
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@tick.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@tick.local`);
  const identity={participantId:participant,encounterId:encounter,turnId:turn,timing:'turn_end' as const};
  const plan={combatantId:combatant,expected:context(),updates:updates(),events};let commits=0;
  await page.route('**/rest/v1/rpc/commit_turn_effect_batch',async route=>{await route.fetch();commits++;await route.abort('failed');});
  const first=await page.evaluate(async({user,identity})=>{
   const api=await import('/src/lib/api/turnEffects.ts');
   try{await api.processSavedTurnEffects(user,identity,()=>{});return {failed:false,saved:null};}
   catch{return {failed:true,saved:api.savedTurnEffect(user,identity)};}
  },{user:dm,identity});
  expect(first.failed).toBe(true);expect(first.saved).toMatchObject({expected:plan.expected,updates:plan.updates});expect(commits).toBe(2);expect(context().current_hp).toBe(36);
  sql(`update combatants set current_hp=49 where id='${combatant}'`);
  await page.unroute('**/rest/v1/rpc/commit_turn_effect_batch');await page.reload();
  let repeatedPreparation=0;await page.route('**/rest/v1/rpc/get_turn_effect_context',async route=>{repeatedPreparation++;await route.abort('failed');});
  const recovered=await page.evaluate(async({user,identity})=>{
   const api=await import('/src/lib/api/turnEffects.ts');
   const receipt=await api.processSavedTurnEffects(user,identity,()=>{});
   return {receipt,saved:api.savedTurnEffect(user,identity)};
  },{user:dm,identity});
  expect(recovered.receipt).toMatchObject({requestId:first.saved!.requestId,replayed:true,state:{current_hp:36}});expect(recovered.saved).toBeNull();expect(context().current_hp).toBe(49);expect(repeatedPreparation).toBe(0);
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type in('damage_applied','spell_effect_removed')`)).toBe('2');
 });

 for(const lethal of [false,true])test(`live advance preserves the original outgoing effects across reload (lethal ${lethal})`,async({page})=>{
  if(lethal){
   const survivor=randomUUID(),survivorParticipant=randomUUID();
   sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${survivor}','${owner}','${campaign}','Survivor','Human','Fighter','Sage',5,30,30);
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${survivorParticipant}','${encounter}','${campaign}','character','${survivor}','Survivor',1);
    update combatants set active_buffs='[{"key":"acid","name":"Delayed acid","turnTick":{"kind":"damage","timing":"turn_end","flat":100,"oneShot":true}}]' where id='${combatant}';`);
  }
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@tick.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@tick.local`);
  let commits=0;await page.route('**/rest/v1/rpc/commit_turn_effect_batch',async route=>{await route.fetch();commits++;await route.abort('failed');});
  const advance=()=>page.evaluate(async encounterId=>{const {advanceTurn}=await import('/src/lib/combatEncounter.ts');return advanceTurn(encounterId);},encounter);
  const before=sql(`select jsonb_build_object('turn',psionic_turn_id,'round',round_number,'index',current_turn_index) from combat_encounters where id='${encounter}'`);
  expect((await advance()).ok).toBe(false);expect(commits).toBe(2);expect(context().current_hp).toBe(lethal?0:36);
  expect(sql(`select jsonb_build_object('turn',psionic_turn_id,'round',round_number,'index',current_turn_index) from combat_encounters where id='${encounter}'`)).toBe(before);
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type in('turn_ended','turn_started')`)).toBe('0');
  await page.unroute('**/rest/v1/rpc/commit_turn_effect_batch');await page.reload();
  let preparation=0;await page.route('**/rest/v1/rpc/get_turn_effect_context',async route=>{if(route.request().postDataJSON().p_timing==='turn_end'){preparation++;await route.abort('failed');}else await route.continue();});
  const resumed=await advance();
  expect(resumed).toEqual({ok:true});
  expect(preparation).toBe(0);expect(context().current_hp).toBe(lethal?0:36);
  expect(sql(`select round_number from combat_encounters where id='${encounter}'`)).toBe(lethal?'1':'2');
  if(lethal){expect(context().is_dead).toBe(true);expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type in('turn_ended','turn_started')`)).toBe('2');}
  expect(sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`)).not.toBe(turn);
  expect(sql(`select count(*) from dndkeep_private.turn_effect_batches where participant_id='${participant}'`)).toBe(lethal?'1':'2');
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type in('damage_applied','spell_effect_removed')`)).toBe('2');
 });

 test('live journal authorizes the DM and rejects incomplete incoming work and another advance',()=>{
  const next=JSON.parse(sql(auth(dm,`select get_combat_clock_context('${encounter}','${turn}')`)));
  const begin=`select begin_live_turn_transition('${encounter}','${request}','${turn}','${next.incomingId}',${next.nextIndex},${next.nextRound})`;
  expect(()=>sql(auth(dm,begin))).toThrow(/Finish outgoing/);
  sql(auth(dm,call()));
  expect(()=>sql(auth(owner,begin))).toThrow(/only to its DM/);
  expect(()=>sql('set role anon;'+begin)).toThrow(/permission denied/);
  // Clock and effect request IDs are separate ledger namespaces.
  const started=JSON.parse(sql(auth(dm,begin)));expect(started.complete).toBe(false);
  expect(()=>sql(auth(dm,`select finish_live_turn_transition('${encounter}','${request}')`))).toThrow(/have not finished/);
  const current=started.clock.turnId;
  expect(()=>sql(auth(dm,`select begin_live_turn_transition('${encounter}','${randomUUID()}','${current}','${participant}',0,3)`))).toThrow(/Finish incoming/);
  expect(()=>sql(auth(owner,`select read_live_turn_transition('${encounter}',null)`))).toThrow(/only to its DM/);
  sql(`update campaigns set owner_id='${owner}' where id='${campaign}'`);
  expect(()=>sql(auth(dm,`select read_live_turn_transition('${encounter}',null)`))).toThrow(/only to its DM/);
  expect(JSON.parse(sql(auth(owner,`select read_live_turn_transition('${encounter}',null)`))).requestId).toBe(request);
 });
 for(const stage of ['begin_live_turn_transition','mark_live_turn_death_complete','commit_turn_effect_batch','finish_live_turn_transition'])test(`live incoming work recovers a lost ${stage} reply`,async({page})=>{
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@tick.local"}','email',now(),now(),now());
   update combatants set active_buffs=active_buffs||'[{"key":"regen","name":"Regeneration","turnTick":{"kind":"heal","timing":"turn_start","flat":3}}]'::jsonb where id='${combatant}';`);
  await signInAsSeedDm(page,`${dm}@tick.local`);
  let dropped=0;await page.route(`**/rest/v1/rpc/${stage}`,async route=>{
   if(stage==='commit_turn_effect_batch'&&route.request().postDataJSON().p_timing!=='turn_start'){await route.continue();return;}
   await route.fetch();dropped++;await route.abort('failed');
  });
  const advance=()=>page.evaluate(async id=>{const api=await import('/src/lib/combatEncounter.ts');return api.advanceTurn(id);},encounter);
  expect((await advance()).ok).toBe(false);expect(dropped).toBe(2);
  const clock=sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`);expect(clock).not.toBe(turn);
  await page.unroute(`**/rest/v1/rpc/${stage}`);await page.reload();expect(await advance()).toEqual({ok:true});
  expect(sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`)).toBe(clock);expect(context().current_hp).toBe(39);
  expect(sql(`select count(*) from dndkeep_private.turn_effect_batches where participant_id='${participant}'`)).toBe('2');
  expect(sql(`select count(*) from dndkeep_private.turn_recharge_batches where participant_id='${participant}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.live_turn_transitions where encounter_id='${encounter}' and complete`)).toBe('1');
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type in('turn_ended','turn_started')`)).toBe('2');
  expect(sql(`select count(*) from combat_events where encounter_id='${encounter}' and event_type='healing_applied'`)).toBe('1');
 });

 for(const mode of ['auto','prompt','off','lethal-auto'])test(`live incoming ${mode} death saves precede healing and recover safely`,async({page})=>{
  const downed=randomUUID(),downedParticipant=randomUUID();const lethal=mode==='lethal-auto';
  sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${downed}','${owner}','${campaign}','Downed','Human','Fighter','Sage',5,0,30);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${downedParticipant}','${encounter}','${campaign}','character','${downed}','Downed',1);
   update campaigns set automation_defaults=jsonb_build_object('death_save_on_turn_start','${lethal?'auto':mode}') where id='${campaign}';
   update combatants set current_hp=0,death_save_failures=${lethal?1:0},active_buffs='[{"key":"regen","name":"Regeneration","turnTick":{"kind":"heal","timing":"turn_start","flat":3}}]' where id=(select combatant_id from combat_participants where id='${downedParticipant}');
   update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@tick.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@tick.local`);
  if(lethal)await page.route('**/rest/v1/rpc/settle_pending_death_save',async route=>{await route.fetch();await route.abort('failed');});
  const advance=()=>page.evaluate(async id=>{const original=Math.random;Math.random=()=>0;try{const {advanceTurn}=await import('/src/lib/combatEncounter.ts');return await advanceTurn(id);}finally{Math.random=original;}},encounter);
  const first=await advance();
  if(lethal){expect(first.ok).toBe(false);await page.unroute('**/rest/v1/rpc/settle_pending_death_save');await page.reload();expect(await advance()).toEqual({ok:true});}else expect(first).toEqual({ok:true});
  const offers=JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('d20',d20,'state',state)),'[]') from pending_death_saves where participant_id='${downedParticipant}'`));
  expect(offers).toHaveLength(mode==='off'?0:1);
  if(mode==='auto'||lethal)expect(offers[0]).toMatchObject({d20:1,state:'rolled'});
  const hp=()=>JSON.parse(sql(`select jsonb_build_object('hp',current_hp,'dead',is_dead) from combatants where id=(select combatant_id from combat_participants where id='${downedParticipant}')`));
  expect(hp()).toEqual({hp:lethal?0:3,dead:lethal});
  if(lethal){expect(await advance()).toEqual({ok:true});expect(hp()).toEqual({hp:0,dead:true});expect(sql(`select round_number from combat_encounters where id='${encounter}'`)).toBe('2');}
 });

 test('live completion rolls back its earlier logs on a late event failure',()=>{
  sql(auth(dm,call()));const transition=randomUUID();
  const next=JSON.parse(sql(auth(dm,`select get_combat_clock_context('${encounter}','${turn}')`)));
  const started=JSON.parse(sql(auth(dm,`select begin_live_turn_transition('${encounter}','${transition}','${turn}','${participant}',${next.nextIndex},${next.nextRound})`)));
  const newTurn=started.clock.turnId;
  expect(()=>sql(auth(dm,`select get_turn_effect_context('${participant}','${encounter}','${newTurn}','turn_start')`))).toThrow(/Death saves must/);
  sql(auth(dm,`select mark_live_turn_death_complete('${encounter}','${transition}')`));
  const fresh=context(),patch={...fresh};delete patch.max_hp;
  sql(auth(dm,`select commit_turn_effect_batch('${participant}','${newTurn}','turn_start','${randomUUID()}',${json(fresh)},${json(patch)},'[]')`));
  const recharge=JSON.parse(sql(auth(dm,`select get_turn_recharge_context('${participant}','${encounter}','${newTurn}')`)));
  sql(auth(dm,`select commit_turn_recharge_batch('${participant}','${newTurn}','${randomUUID()}',${json(recharge.expected)},'[]')`));
  const fn='reject_live_'+transition.replaceAll('-',''),finish=`select finish_live_turn_transition('${encounter}','${transition}')`;
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.chain_id='${transition}' and new.event_type='turn_started' then raise exception 'fixture completion failure';end if;return new;end $$;create trigger ${fn} before insert on combat_events for each row execute function public.${fn}()`);
  try{
   expect(()=>sql(auth(dm,finish))).toThrow(/fixture completion failure/);
   expect(sql(`select count(*) from combat_events where chain_id='${transition}' and event_type in('turn_ended','turn_started')`)).toBe('0');
   expect(JSON.parse(sql(auth(dm,`select read_live_turn_transition('${encounter}','${transition}')`))).complete).toBe(false);
  }finally{sql(`drop trigger ${fn} on combat_events;drop function public.${fn}()`);}
  expect(JSON.parse(sql(auth(dm,finish))).complete).toBe(true);expect(JSON.parse(sql(auth(dm,finish))).complete).toBe(true);
  expect(sql(`select count(*) from combat_events where chain_id='${transition}' and event_type in('turn_ended','turn_started')`)).toBe('2');
 });

});
