import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect,type Page} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic combat clock transitions',()=>{
 // Request holds must reach Playwright instead of the service worker's fetch.
 test.use({serviceWorkers:'block'});
 gateDbSuite();let dm:string,player:string,campaign:string,enc:string,a:string,b:string,ca:string,cb:string,pa:string,pb:string,request:string,turn:string;
 test.beforeEach(()=>{
  [dm,player,campaign,enc,a,b,ca,cb,pa,pb,request]=Array.from({length:11},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@turn.local','{}'),('${player}','${player}@turn.local','{}');
   insert into campaigns(id,owner_id,name,seconds_per_round) values('${campaign}','${dm}','Turn fixture',6);
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background) values('${a}','${player}','${campaign}','A','Human','Psion','Sage'),('${b}','${dm}','${campaign}','B','Human','Fighter','Sage');
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${ca}','${campaign}','${player}','A','character','${a}',20,20),('${cb}','${campaign}','${dm}','B','character','${b}',20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,lair_action_used_this_round) values('${enc}','${campaign}','active',1,0,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${pa}','${enc}','${campaign}','character','${a}','A',0,'${ca}'),('${pb}','${enc}','${campaign}','character','${b}','B',1,'${cb}');
   update combatants set active_buffs='[{"id":"timed","duration":3},{"id":"indefinite","duration":-1}]' where id in('${ca}','${cb}');commit;`);turn=state().turn;
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id in('${a}','${b}');delete from auth.users where id in('${dm}','${player}')`));
 const state=()=>JSON.parse(sql(`select jsonb_build_object('index',e.current_turn_index,'round',e.round_number,'turn',e.psionic_turn_id,'clock',c.combat_rounds_elapsed,'lair',e.lair_action_used_this_round) from combat_encounters e join campaigns c on c.id=e.campaign_id where e.id='${enc}'`));
 const call=(id=request,expected=turn,incoming=pb,index=1,round=1)=>`select commit_combat_clock_transition('${enc}','${id}','${expected}','${incoming}',${index},${round})`;
 const run=(q=call(),user=dm)=>JSON.parse(sql(auth(user,q)));
 const buffs=()=>JSON.parse(sql(`select active_buffs from combatants where id='${ca}'`));
 function wrapCall(){run();return call(randomUUID(),state().turn,pa,0,2);}
 function endEffects(actor:string,combatant:string,lethal=true){
  const current=state().turn;
  return sql(auth(dm,`select commit_turn_effect_batch('${actor}','${current}','turn_end','${randomUUID()}',
   dndkeep_private.turn_effect_state('${combatant}'),
   (dndkeep_private.turn_effect_state('${combatant}')-'max_hp')||'${JSON.stringify(lethal?{current_hp:0,is_dead:true,death_save_failures:3}:{})}'::jsonb,'[]')`)
   .replaceAll(`dndkeep_private.turn_effect_state('${combatant}')`,
    `'${sql(`select dndkeep_private.turn_effect_state('${combatant}')`).replaceAll("'","''")}'::jsonb`));
 }
 const prepare=()=>`select get_combat_clock_context('${enc}','${turn}')`;
 test('preparation and commit agree on the exact next actor without changing time',()=>{
  const before=state(),context=JSON.parse(sql(auth(dm,prepare())));
  expect(context).toEqual({userId:dm,encounterId:enc,expectedTurn:turn,outgoingId:pa,incomingId:pb,nextIndex:1,nextRound:1,roundWrapped:false,campaignRounds:0});expect(state()).toEqual(before);
  expect(run(call(request,context.expectedTurn,context.incomingId,context.nextIndex,context.nextRound))).toMatchObject({incomingId:pb,index:1,round:1});
 });
 test('preparation follows the saved outgoing actor after a lethal end effect',()=>{
  endEffects(pa,ca);expect(JSON.parse(sql(auth(dm,prepare())))).toMatchObject({outgoingId:pa,incomingId:pb,nextIndex:0,nextRound:1,roundWrapped:false});
 });
 test('preparation is DM-only and the internal selector is not client-callable',()=>{
  expect(()=>sql(auth(player,prepare()))).toThrow(/only to its DM/);expect(()=>sql('set role anon;'+prepare())).toThrow(/permission denied/);
  expect(()=>sql(auth(dm,`select dndkeep_private.combat_clock_context('${enc}','${turn}')`))).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);expect(()=>sql(auth(dm,prepare()))).toThrow(/only to its DM/);
 });
 test('stale prepared positions are rechecked at commit rather than silently retargeted',()=>{
  const context=JSON.parse(sql(auth(dm,prepare())));endEffects(pa,ca);
  expect(()=>run(call(request,context.expectedTurn,context.incomingId,context.nextIndex,context.nextRound))).toThrow(/Initiative roster changed/);expect(state().turn).toBe(turn);
  const refreshed=JSON.parse(sql(auth(dm,prepare())));expect(run(call(request,refreshed.expectedTurn,refreshed.incomingId,refreshed.nextIndex,refreshed.nextRound)).index).toBe(0);
 });
 test('preparation rejects stale and ended turns without changing the clock',()=>{
  run();expect(()=>sql(auth(dm,prepare()))).toThrow(/Combat turn changed/);
  turn=state().turn;sql(`update combat_encounters set status='ended' where id='${enc}'`);
  expect(()=>sql(auth(dm,prepare()))).toThrow(/Combat turn changed/);expect(state().clock).toBe(0);
 });
 async function signInFixtureDm(page:Page){
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@turn.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@turn.local`);
 }
 const readClock=()=>`select read_combat_clock_transition('${enc}','${turn}')`;
 test('clock lookup returns null before an advance and the historical winner afterwards',()=>{
  expect(sql(auth(dm,readClock()))).toBe('');const first=run();
  run(call(randomUUID(),state().turn,pa,0,2));const later=state();
  expect(JSON.parse(sql(auth(dm,readClock())))).toEqual({request:{requestId:request,encounterId:enc,expectedTurn:turn,incomingId:pb,nextIndex:1,nextRound:1},receipt:{...first,replayed:true}});expect(state()).toEqual(later);
 });
 test('clock lookup remains DM-only after combat ends and ownership changes',()=>{
  run();sql(`update combat_encounters set status='ended' where id='${enc}'`);
  expect(JSON.parse(sql(auth(dm,readClock()))).receipt.replayed).toBe(true);
  expect(()=>sql(auth(player,readClock()))).toThrow(/only to its DM/);expect(()=>sql('set role anon;'+readClock())).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);expect(()=>sql(auth(dm,readClock()))).toThrow(/only to its DM/);
  expect(JSON.parse(sql(auth(player,readClock()))).receipt.requestId).toBe(request);
 });
 test('ambiguous historical clock winners are not guessed',()=>{
  run();sql(`insert into dndkeep_private.combat_clock_transitions(request_id,encounter_id,request,result) select gen_random_uuid(),encounter_id,request,result from dndkeep_private.combat_clock_transitions where request_id='${request}'`);
  expect(()=>sql(auth(dm,readClock()))).toThrow(/Conflicting saved combat transitions/);
 });
 test('live turn handler coalesces overlapping controls into one database advance',async({page})=>{
  await signInFixtureDm(page);let reads=0,writes=0;let release!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(/\/rest\/v1\/combat_encounters(?:\?|$)/,async route=>{
   if(new URL(route.request().url()).searchParams.get('id')===`eq.${enc}`){
    if(route.request().method()==='GET'){reads++;if(reads===1)await held;}
    if(route.request().method()==='PATCH')writes++;
   }
   await route.continue();
  });
  const pending=page.evaluate(async encounter=>{
   const api=await import('/src/lib/combatEncounter.ts');
   const first=api.advanceTurn(encounter),second=api.advanceTurn(encounter);
   return {shared:first===second,results:await Promise.all([first,second])};
  },enc);
  try{await expect.poll(()=>reads).toBe(1);expect(writes).toBe(0);}finally{release();}
  expect(await pending).toEqual({shared:true,results:[{ok:true},{ok:true}]});
  expect(writes).toBe(1);expect(state()).toMatchObject({index:1,round:1,clock:0});expect(state().turn).not.toBe(turn);
 });
 test('browser recovery observes another request winner without advancing or rerunning its effects',async({page})=>{
  await signInFixtureDm(page);const loser={requestId:randomUUID(),encounterId:enc,expectedTurn:turn,incomingId:pb,nextIndex:1,nextRound:1};
  await page.evaluate(async({user,request})=>{const api=await import('/src/lib/api/combatTransitionRecovery.ts');api.saveCombatTransition(user,request);},{user:dm,request:loser});
  run();const before=state();let mutations=0;
  await page.route('**/rest/v1/rpc/commit_combat_clock_transition',async route=>{mutations++;await route.abort('failed');});
  const observed=await page.evaluate(async({user,encounter,requestId})=>{
   const api=await import('/src/lib/api/combatTransitionRecovery.ts');const result=await api.confirmCombatTransition(user,encounter);
   let blocked=false;try{api.beginCombatTransitionEffects(user,encounter,requestId);}catch{blocked=true;}
   return {result,blocked};
  },{user:dm,encounter:enc,requestId:loser.requestId});
  expect(observed).toMatchObject({blocked:true,result:{stage:'clock-observed',request:loser,receipt:{requestId:request,replayed:true}}});
  await page.reload();const recovered=await page.evaluate(async({user,encounter})=>{
   const api=await import('/src/lib/api/combatTransitionRecovery.ts');return api.confirmCombatTransition(user,encounter);
  },{user:dm,encounter:enc});
  expect(recovered).toEqual(observed.result);expect(mutations).toBe(0);expect(state()).toEqual(before);
 });
 test('browser preparation survives lost clock replies and does not advance a later turn',async({page})=>{
  endEffects(pa,ca);
  await signInFixtureDm(page);
  let commits=0;await page.route('**/rest/v1/rpc/commit_combat_clock_transition',async route=>{await route.fetch();commits++;await route.abort('failed');});
  const first=await page.evaluate(async({user,encounter,turn})=>{
   const api=await import('/src/lib/api/combatTransitionRecovery.ts');
   const prepared=await api.prepareCombatTransition(user,encounter,turn,()=>{});
   try{await api.confirmCombatTransition(user,encounter);return {failed:false,prepared,saved:null};}
   catch{return {failed:true,prepared,saved:api.savedCombatTransition(user,encounter)};}
  },{user:dm,encounter:enc,turn});
  expect(first.failed).toBe(true);expect(commits).toBe(2);expect(first.prepared.request).toMatchObject({nextIndex:0,nextRound:1,incomingId:pb});expect(first.saved?.stage).toBe('clock-pending');
  run(call(randomUUID(),state().turn,pb,0,2));const later=state();
  await page.unroute('**/rest/v1/rpc/commit_combat_clock_transition');await page.reload();
  let reads=0;await page.route('**/rest/v1/rpc/get_combat_clock_context',async route=>{reads++;await route.abort('failed');});
  const recovered=await page.evaluate(async({user,encounter,turn})=>{
   const api=await import('/src/lib/api/combatTransitionRecovery.ts');
   await api.prepareCombatTransition(user,encounter,turn,()=>{});
   return api.confirmCombatTransition(user,encounter);
  },{user:dm,encounter:enc,turn:later.turn});
  expect(recovered).toMatchObject({stage:'clock-confirmed',request:first.prepared.request,receipt:{replayed:true,index:0,round:1,roundWrapped:false}});
  expect(reads).toBe(0);expect(state()).toEqual(later);
 });
 test('a lethal first-actor effect hands slot zero to the next actor without ticking a round',()=>{
  endEffects(pa,ca);const first=run(call(request,turn,pb,0,1));
  expect(first).toMatchObject({incomingId:pb,index:0,round:1,roundWrapped:false,campaignRounds:0});
  expect(first.turnId).not.toBe(turn);expect(state().turn).toBe(first.turnId);expect(buffs()[0].duration).toBe(3);
  expect(run(call(request,turn,pb,0,1))).toEqual({...first,replayed:true});
 });
 test('the same-slot handoff does not allow old-turn abilities',()=>{
  endEffects(pa,ca);run(call(request,turn,pb,0,1));
  expect(()=>sql(auth(dm,`select get_turn_effect_context('${pb}','${enc}','${turn}','turn_start')`))).toThrow(/Turn changed/);
  expect(JSON.parse(sql(auth(dm,`select get_turn_effect_context('${pb}','${enc}','${state().turn}','turn_start')`))).participantId).toBe(pb);
 });
 test('a lethal last-actor effect wraps once using its saved outgoing identity',()=>{
  run();const outgoingTurn=state().turn;endEffects(pb,cb);const q=call(randomUUID(),outgoingTurn,pa,0,2);
  expect(run(q)).toMatchObject({incomingId:pa,index:0,round:2,roundWrapped:true,campaignRounds:1});
  expect(buffs()[0].duration).toBe(2);expect(run(q).replayed).toBe(true);expect(state().clock).toBe(1);
 });
 test('a surviving end-effect actor retains normal initiative order',()=>{
  endEffects(pa,ca,false);expect(run()).toMatchObject({incomingId:pb,index:1,round:1,roundWrapped:false});
 });
 test('completed end effects cannot be prepared or committed again for the shifted successor',()=>{
  endEffects(pa,ca);
  expect(()=>sql(auth(dm,`select get_turn_effect_context('${pb}','${enc}','${turn}','turn_start')`))).toThrow(/already ended/);
  expect(()=>endEffects(pb,cb)).toThrow(/already ended/);expect(state().turn).toBe(turn);
  expect(sql(`select is_dead from combatants where id='${cb}'`)).toBe('f');
 });
 test('ordinary authenticated writes cannot choose a new turn token',()=>{
  const forged=randomUUID();sql(auth(dm,`update combat_encounters set psionic_turn_id='${forged}' where id='${enc}'`));expect(state().turn).toBe(turn);
  sql(auth(dm,`update combat_encounters set round_number=2,psionic_turn_id='${forged}' where id='${enc}'`));
  expect(state().turn).not.toBe(forged);expect(state().turn).not.toBe(turn);
 });
 test('within-round transitions change actor identity without ticking time or buffs',()=>{
  const r=run();expect(r).toMatchObject({requestId:request,incomingId:pb,index:1,round:1,roundWrapped:false,campaignRounds:0,replayed:false});expect(r.turnId).not.toBe(turn);expect(state()).toMatchObject({index:1,round:1,clock:0,lair:true});expect(buffs()[0].duration).toBe(3);
 });
 test('round wrap commits the actor, campaign clock, lair reset and buff tick together',()=>{
  expect(run(wrapCall())).toMatchObject({incomingId:pa,index:0,round:2,roundWrapped:true,campaignRounds:1});expect(state()).toMatchObject({index:0,round:2,clock:1,lair:false});expect(buffs()).toEqual([{id:'timed',duration:2},{id:'indefinite',duration:-1}]);
  expect(sql(`select elapsed_seconds from dndkeep_private.psionic_duration_clocks where character_id='${a}'`)).toBe('6');
 });
 test('saved transition replay never reverts a later turn or ticks twice',()=>{
  const q=wrapCall(),first=run(q);run(call(randomUUID(),state().turn,pb,1,2));const latest=state();expect(run(q)).toEqual({...first,replayed:true});expect(state()).toEqual(latest);expect(buffs()[0].duration).toBe(2);
 });
 test('same request raced twice commits once',async()=>{
  const q=wrapCall();const results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,q))]);expect(results.every(r=>r.code===0),JSON.stringify(results)).toBe(true);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(state().clock).toBe(1);expect(buffs()[0].duration).toBe(2);
 });
 test('different requests for the same turn cannot both advance',async()=>{
  const results=await Promise.all([parallel(auth(dm,call())),parallel(auth(dm,call(randomUUID())))]);expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('Combat turn changed');expect(state().index).toBe(1);
 });
 test('manual time and round wrap preserve both increments',async()=>{
  const q=wrapCall();const manual=`select advance_campaign_time('${campaign}','${randomUUID()}','rounds',2,6)`;
  const results=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,manual))]);expect(results.every(r=>r.code===0),JSON.stringify(results)).toBe(true);expect(state().clock).toBe(3);expect(buffs()).toEqual([{id:'indefinite',duration:-1}]);
 });
 test('failed buff processing rolls back actor, clock, identity and receipt',()=>{
  const q=wrapCall(),before=state();sql(`update combatants set active_buffs='{}' where id='${cb}'`);expect(()=>run(q)).toThrow(/Check campaign buff data/);expect(state()).toEqual(before);expect(buffs()[0].duration).toBe(3);
  expect(sql(`select count(*) from dndkeep_private.combat_clock_transitions where encounter_id='${enc}'`)).toBe('1');
 });
 test('wrong incoming actor or round cannot spend a turn',()=>{
  expect(()=>run(call(request,turn,pa))).toThrow(/Initiative roster changed/);expect(()=>run(call(request,turn,pb,1,2))).toThrow(/Initiative roster changed/);expect(state().index).toBe(0);
 });
 test('dead actors are skipped and duplicate active initiative positions are rejected',()=>{
  sql(`update combatants set is_dead=true where id='${cb}'`);expect(run(call(request,turn,pa,0,2)).roundWrapped).toBe(true);
  sql(`update combatants set is_dead=false where id='${cb}';update combat_participants set turn_order=0 where id='${pb}'`);
  expect(()=>run(call(randomUUID(),state().turn,pb,1,2))).toThrow(/duplicate initiative/);
 });
 test('player membership grants no transition or receipt access',()=>{
  run();expect(()=>run(call(),player)).toThrow(/only to its DM/);expect(()=>sql(`begin;set local role anon;${call()};commit;`)).toThrow(/permission denied/);expect(()=>sql(auth(dm,'select * from dndkeep_private.combat_clock_transitions'))).toThrow(/permission denied/);
 });
 test('changed saved payload is rejected even after the encounter ends',()=>{
  const first=run();sql(`update combat_encounters set status='ended' where id='${enc}'`);expect(run()).toEqual({...first,replayed:true});expect(()=>run(call(request,turn,pa,0,2))).toThrow(/Saved combat transition changed/);expect(()=>run(call(randomUUID(),state().turn,pa,0,2))).toThrow(/Combat turn changed/);
 });
 test('missing combatant links fail before moving the turn or clock',()=>{
  sql(`update combat_participants set combatant_id=null where id='${pb}'`);const before=state();expect(()=>run(call(request,before.turn))).toThrow(/Repair the initiative roster/);expect(state()).toEqual(before);
 });
 test('an entirely dead roster cannot create a new round',()=>{
  sql(`update combatants set is_dead=true where id in('${ca}','${cb}')`);const before=state();expect(()=>run(call(request,before.turn))).toThrow(/No living participants/);expect(state()).toEqual(before);
 });
 test('clock overflow rolls back the entire wrapping transition',()=>{
  const q=wrapCall();sql(`update campaigns set combat_rounds_elapsed=2147483647 where id='${campaign}'`);const before=state();expect(()=>run(q)).toThrow(/clock limit reached/);expect(state()).toEqual(before);expect(buffs()[0].duration).toBe(3);
 });
 const effectClock=(caster=pa,castTurn:string|null=null)=>JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${enc}','${caster}',${castTurn?`'${castTurn}'`:'null'})`));
 test('next-save expiry uses caster turns, including the initial actor',()=>{
  expect(effectClock()).toMatchObject({castTurnOrdinal:1,lastEndedTurnOrdinal:0});
  const castTurn=turn;run();
  expect(effectClock(pa,castTurn)).toMatchObject({castTurnOrdinal:1,lastEndedTurnOrdinal:1});
  run(call(randomUUID(),state().turn,pa,0,2));
  expect(effectClock(pa,castTurn)).toMatchObject({castTurnOrdinal:2,lastEndedTurnOrdinal:1});
  run(call(randomUUID(),state().turn,pb,1,2));
  expect(effectClock(pa,castTurn)).toMatchObject({castTurnOrdinal:2,lastEndedTurnOrdinal:2});
 });
 test('pre-first-turn reaction casts expire after the first completed own turn',()=>{
  expect(effectClock(pb)).toMatchObject({castTurnOrdinal:1,lastEndedTurnOrdinal:1});
  const castTurn=turn;run();
  expect(effectClock(pb,castTurn)).toMatchObject({castTurnOrdinal:2,lastEndedTurnOrdinal:1});
  run(call(randomUUID(),state().turn,pa,0,2));
  expect(effectClock(pb,castTurn)).toMatchObject({castTurnOrdinal:2,lastEndedTurnOrdinal:2});
 });
 test('a replay does not increment an effect clock',()=>{
  run();const before=effectClock();run();expect(effectClock()).toEqual(before);
 });
 test('unrecorded turn jumps and disconnected history fail closed',()=>{
  run();sql(`update combat_encounters set round_number=2 where id='${enc}'`);
  expect(()=>effectClock()).toThrow(/history is incomplete/);
  run(call(randomUUID(),state().turn,pa,0,3));
  expect(()=>effectClock()).toThrow(/history is incomplete/);
 });
 test('a jump before the first receipt cannot validate an earlier casting turn',()=>{
  const castTurn=turn;sql(`update combat_encounters set round_number=2 where id='${enc}'`);
  run(call(randomUUID(),state().turn,pb,1,2));
  expect(()=>effectClock(pa,castTurn)).toThrow(/casting turn could not be verified/);
 });
 test('creature casters share the existing turn ledger',()=>{
  const creature=randomUUID();sql(`update combatants set definition_type='custom',definition_id='${creature}' where id='${cb}';update combat_participants set participant_type='creature',entity_id='${creature}' where id='${pb}'`);
  expect(effectClock(pb)).toMatchObject({castTurnOrdinal:1,lastEndedTurnOrdinal:1});run();
  expect(effectClock(pb)).toMatchObject({castTurnOrdinal:2,lastEndedTurnOrdinal:1});
 });
 test('inactive combat, foreign caster and unknown casting turn cannot prove expiry',()=>{
  expect(()=>effectClock(randomUUID())).toThrow(/Caster is not/);
  expect(()=>effectClock(pa,randomUUID())).toThrow(/casting turn/);
  sql(`update combat_encounters set status='ended' where id='${enc}'`);
  expect(()=>effectClock()).toThrow(/Active combat turn/);
 });
 test('the expiry helper is not a public or authenticated endpoint',()=>{
  expect(sql(`select has_function_privilege('authenticated','dndkeep_private.next_save_turn_context(uuid,uuid,uuid)','execute')::text||':'||has_function_privilege('anon','dndkeep_private.next_save_turn_context(uuid,uuid,uuid)','execute')::text`)).toBe('false:false');
 });
 test('roster changes cannot silently replace the recorded actor',()=>{
  run();sql(`update combat_participants set turn_order=case when id='${pa}' then 1 else 0 end where encounter_id='${enc}'`);
  expect(()=>effectClock()).toThrow(/history is incomplete/);
 });
 function seedPenalty(id=randomUUID(),caster=pa,victim=pb,status='active'){
  const clock=effectClock(caster);
  sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${id}','${enc}','${caster}','${victim}','${clock.turnId}',${clock.castTurnOrdinal},'${status}')`);return id;
 }
 const penaltyCall=(save=randomUUID(),kind='attack',die:number|null=3,victim=pb,automatic=false)=>`select dndkeep_private.consume_next_save_penalty('${kind}','${save}','${enc}','${victim}',${die===null?'null':die},${automatic})`;
 const consume=(save=randomUUID(),kind='attack',die:number|null=3,victim=pb,automatic=false)=>JSON.parse(sql(penaltyCall(save,kind,die,victim,automatic)));
 test('penalty consumption subtracts one die once and exact retries replay it',()=>{
  const origin=seedPenalty(),save=randomUUID(),first=consume(save);
  expect(first).toMatchObject({penalty:3,die:3,consumedIds:[origin],replayed:false});
  expect(consume(save)).toEqual({...first,replayed:true});expect(consume().penalty).toBe(0);
  expect(()=>consume(save,'attack',2)).toThrow(/Saved penalty request changed/);
 });
 test('penalty consumption does not stack overlapping copies',()=>{
  const ids=[seedPenalty(),seedPenalty()];const r=consume();expect(r.penalty).toBe(3);expect(r.consumedIds.sort()).toEqual(ids.sort());expect(consume().penalty).toBe(0);
 });
 test('penalty consumption serializes different save kinds on the same target',async()=>{
  seedPenalty();const result=await Promise.all([parallel(penaltyCall(randomUUID(),'attack')),parallel(penaltyCall(randomUUID(),'concentration'))]);
  expect(result.every(r=>r.code===0),JSON.stringify(result)).toBe(true);expect(result.map(r=>JSON.parse(r.out).penalty).sort()).toEqual([0,3]);
 });
 test('penalty consumption in two tabs preserves one receipt and one die',async()=>{
  seedPenalty();const save=randomUUID(),q=penaltyCall(save);const result=await Promise.all([parallel(q),parallel(q)]);
  expect(result.every(r=>r.code===0),JSON.stringify(result)).toBe(true);expect(result.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(consume().penalty).toBe(0);
 });
 test('penalty consumption rolls back with a failed save transaction',()=>{
  const origin=seedPenalty(),save=randomUUID();expect(()=>sql(`begin;${penaltyCall(save)};select 1/0;commit;`)).toThrow(/division by zero/);
  expect(sql(`select consumed_by is null from dndkeep_private.mind_sliver_effects where cast_id='${origin}'`)).toBe('t');expect(consume(save).replayed).toBe(false);
 });
 test('penalty consumption ignores expired caster effects',()=>{
  const origin=seedPenalty();run();run(call(randomUUID(),state().turn,pa,0,2));run(call(randomUUID(),state().turn,pb,1,2));
  expect(consume()).toMatchObject({penalty:0,die:null,consumedIds:[],expiredIds:[origin]});
 });
 test('penalty consumption respects target identity and inactive origins',()=>{
  seedPenalty();for(const status of ['waiting','resisted','countered','canceled'])seedPenalty(randomUUID(),pa,pa,status);
  expect(consume(randomUUID(),'feature',3,pa).penalty).toBe(0);expect(consume().penalty).toBe(3);
 });
 test('automatic failed saves consume the next-save trigger without rolling dice',()=>{
  const origin=seedPenalty();expect(consume(randomUUID(),'feature',null,pb,true)).toMatchObject({penalty:0,die:null,consumedIds:[origin]});expect(consume().penalty).toBe(0);
 });
 test('penalty receipts still replay after combat ends',()=>{
  seedPenalty();const save=randomUUID(),first=consume(save);sql(`update combat_encounters set status='ended' where id='${enc}'`);
  expect(consume(save)).toEqual({...first,replayed:true});expect(()=>consume()).toThrow(/Active encounter/);
 });
 test('a spell penalty cannot change its own original save',()=>{
  const origin=seedPenalty();expect(()=>consume(origin)).toThrow(/own original save/);expect(consume().penalty).toBe(3);
 });
 test('penalty consumption rejects invalid dice without spending the effect',()=>{
  seedPenalty();for(const die of [0,5,null])expect(()=>consume(randomUUID(),'attack',die)).toThrow(/Invalid next-save/);
  expect(consume().penalty).toBe(3);
 });
 test('penalty consumption is private and cannot be spent without an authorized save',()=>{
  expect(sql(`select has_function_privilege('authenticated','dndkeep_private.consume_next_save_penalty(text,uuid,uuid,uuid,integer,boolean)','execute')::text||':'||has_function_privilege('anon','dndkeep_private.consume_next_save_penalty(text,uuid,uuid,uuid,integer,boolean)','execute')::text`)).toBe('false:false');
 });
});
