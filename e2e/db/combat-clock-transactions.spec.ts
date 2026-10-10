import {advanceMasteryExpiry} from '../../src/rules/masteryExpiry';
import {readFileSync} from 'node:fs';
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
 test('map End Turn shows pending work and retains failure feedback',async({page},info)=>{
  // Clock fixtures use minimal duration-only buffs; a rendered strip needs
  // displayable buff metadata. This view tests controls, so keep its buffs empty.
  sql(`update combatants set active_buffs='[]' where id in('${ca}','${cb}');
   insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
   values('${randomUUID()}','${campaign}','${dm}','Turn controls','square',70,12,8,'bright',true);`);
  const errors:string[]=[],badResponses:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('status of 409')&&!m.text().includes('[advanceTurn] encounter fetch failed'))errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400&&!(r.status()===409&&r.url().includes('/rest/v1/combat_encounters?')))badResponses.push(`${r.status()} ${r.url()}`);});
  await signInFixtureDm(page);await page.goto('/campaigns');
  await page.getByText('Turn fixture',{exact:true}).locator('visible=true').first().click();
  const strip=page.getByRole('region',{name:'Combat initiative'});
  const end=strip.getByRole('button',{name:'End Turn',exact:true});await expect(end).toBeVisible();
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let requests=0;
  await page.route(/\/rest\/v1\/combat_encounters(?:\?|$)/,async route=>{
   if(route.request().method()==='GET'&&new URL(route.request().url()).searchParams.get('id')===`eq.${enc}`){
    requests++;await held;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({message:'Turn state changed'})});return;
   }
   await route.continue();
  });
  try{
   await end.click();const pending=strip.getByRole('button',{name:'Ending…',exact:true});
   await expect(pending).toBeDisabled();await expect(pending).toHaveAttribute('aria-busy','true');
   await pending.dispatchEvent('click');await expect.poll(()=>requests).toBe(1);
   await strip.screenshot({path:info.outputPath('turn-pending.png')});
  }finally{release();}
  const failure=page.getByRole('alert').filter({hasText:"Couldn't end turn: Turn state changed"});
  await expect(failure).toBeVisible();await expect(end).toBeEnabled();
  await page.waitForTimeout(4200);await expect(failure).toBeVisible();
  await failure.screenshot({path:info.outputPath('turn-failure.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.initiative-controls, .initiative-controls *, .toast-container, .toast-container *')");
   const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
  }
  expect(state()).toMatchObject({index:0,round:1,clock:0});expect(requests).toBe(1);expect(errors).toEqual([]);expect(badResponses).toEqual([]);
  await failure.getByRole('button',{name:'Dismiss',exact:true}).click();await expect(failure).toHaveCount(0);
 });
 test('live turn handler coalesces overlapping controls into one database advance',async({page})=>{
  sql(`update combat_encounters set in_lair=true where id='${enc}';update combat_participants set legendary_actions_total=3,legendary_actions_remaining=1 where id='${pb}'`);
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
  expect(sql(`select legendary_actions_remaining from combat_participants where id='${pb}'`)).toBe('4');
  await expect.poll(()=>JSON.parse(sql(`select coalesce(jsonb_agg(payload),'[]') from combat_events where encounter_id='${enc}' and event_type='legendary_actions_refilled'`))).toEqual([{refilled_from:1,refilled_to:4}]);
 });
 for(const ownTurn of [true,false])test(`live Vex expires at the next own end (hit on own turn=${ownTurn})`,async({page})=>{
  const vex={key:'mastery_vexed',name:'Vexed',source:'mastery:Rapier',onlyVsTargetParticipantId:pb,expiresAtEndOfTurnOf:pa,expiresAfterNextTurnStarts:true};
  sql(`update combatants set active_buffs='[]' where id in('${ca}','${cb}');update combatants set active_buffs='${JSON.stringify([{key:'bless',name:'Bless',source:'spell',duration:8},vex])}' where id='${ca}';
   update combat_encounters set current_turn_index=${ownTurn?0:1} where id='${enc}'`);
  await signInFixtureDm(page);
  const advance=async()=>expect(await page.evaluate(async id=>{const api=await import('/src/lib/combatEncounter.ts');return api.advanceTurn(id);},enc)).toEqual({ok:true});
  const current=()=>JSON.parse(sql(`select active_buffs from combatants where id='${ca}'`));
  if(ownTurn){await advance();expect(current().find((b:{key:string})=>b.key==='mastery_vexed')).toMatchObject({expiresAfterNextTurnStarts:true});}
  await advance();expect(current().find((b:{key:string})=>b.key==='mastery_vexed')).toMatchObject({expiresAfterNextTurnStarts:false});
  expect(await page.evaluate(async({buffs,target})=>{const api=await import('/src/lib/masteryRiders.ts');return api.surveyMasteryMarkers(buffs,target).adv;},{buffs:current(),target:pb})).toBe(true);
  await advance();expect(current().some((b:{key:string})=>b.key==='mastery_vexed')).toBe(false);
  expect(await page.evaluate(async({buffs,target})=>{const api=await import('/src/lib/masteryRiders.ts');return api.surveyMasteryMarkers(buffs,target).adv;},{buffs:current(),target:pb})).toBe(false);
  await advance();expect(current()).toEqual([{key:'bless',name:'Bless',source:'spell',duration:6}]);
 });
 test('live single-actor round wrap cannot resurrect expired Vex',async({page})=>{
  sql(`update combatants set is_dead=true,active_buffs='[]' where id='${cb}';update combatants set active_buffs='${JSON.stringify([
   {key:'bless',name:'Bless',source:'spell',duration:8},
   {key:'mastery_vexed',name:'Vexed',source:'mastery:Rapier',onlyVsTargetParticipantId:pb,expiresAtEndOfTurnOf:pa,expiresAfterNextTurnStarts:true}
  ])}' where id='${ca}'`);
  await signInFixtureDm(page);const advance=()=>page.evaluate(async id=>{const api=await import('/src/lib/combatEncounter.ts');return api.advanceTurn(id);},enc);
  expect(await advance()).toEqual({ok:true});expect(JSON.parse(sql(`select active_buffs from combatants where id='${ca}'`))).toContainEqual(expect.objectContaining({key:'mastery_vexed',expiresAfterNextTurnStarts:false}));
  expect(await advance()).toEqual({ok:true});expect(JSON.parse(sql(`select active_buffs from combatants where id='${ca}'`))).toEqual([{key:'bless',name:'Bless',source:'spell',duration:6}]);
  expect(state()).toMatchObject({index:0,round:3,clock:2});
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
 const budgets=(id:string)=>JSON.parse(sql(`select jsonb_build_object('action',action_used,'bonus',bonus_used,'reaction',reaction_used,
  'movement',movement_used_ft,'spell',leveled_spell_cast,'dash',dash_used_this_turn,'disengaged',disengaged_this_turn,
  'attacks',attacks_remaining,'markers',once_per_turn_used) from combat_participants where id='${id}'`));
 const spent={action:true,bonus:true,reaction:true,movement:25,spell:true,dash:true,disengaged:true,attacks:0,markers:['cleave']};
 function spendBudgets(){sql(`update combat_participants set action_used=true,bonus_used=true,reaction_used=true,movement_used_ft=25,
  leveled_spell_cast=true,dash_used_this_turn=true,disengaged_this_turn=true,attacks_remaining=0,attacks_per_action=2,
  once_per_turn_used=array['cleave'] where encounter_id='${enc}'`);}
 test('clock atomically resets only incoming budgets and every participant turn marker',()=>{
  spendBudgets();const otherEnc=randomUUID(),otherActor=randomUUID();
  sql(`insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${otherEnc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id,action_used,once_per_turn_used)
   values('${otherActor}','${otherEnc}','${campaign}','character','${b}','Other',0,'${cb}',true,array['cleave']);`);
  const otherBefore=budgets(otherActor);run();
  expect(budgets(pb)).toEqual({action:false,bonus:false,reaction:false,movement:0,spell:false,dash:false,disengaged:false,attacks:2,markers:[]});
  expect(budgets(pa)).toEqual({...spent,markers:[]});expect(budgets(otherActor)).toEqual(otherBefore);
 });
 test('clock receipt replay preserves budgets spent after the original advance',()=>{
  spendBudgets();const first=run();spendBudgets();
  expect(run()).toEqual({...first,replayed:true});expect(budgets(pa)).toEqual(spent);expect(budgets(pb)).toEqual(spent);
 });
 test('clock budget resets roll back with a later buff failure',()=>{
  const q=wrapCall();spendBudgets();const before=state();
  sql(`update combatants set active_buffs='{}' where id='${cb}'`);
  expect(()=>run(q)).toThrow(/Check campaign buff data/);expect(state()).toEqual(before);
  expect(budgets(pa)).toEqual(spent);expect(budgets(pb)).toEqual(spent);
 });
 test('rejected clock requests cannot clear budgets or turn markers',()=>{
  spendBudgets();expect(()=>run(call(request,turn,pa))).toThrow(/Initiative roster changed/);
  expect(()=>run(call(),player)).toThrow(/only to its DM/);
  expect(budgets(pa)).toEqual(spent);expect(budgets(pb)).toEqual(spent);
 });
 for(const massive of [false,true])test(`live aura damage updates dying state (massive=${massive})`,async({page})=>{
  sql(`update characters set nat_1_20_saves=false where id='${a}';update combatants set current_hp=${massive?5:0},temp_hp=3,is_stable=${massive?'false':'true'},death_save_failures=0,active_buffs='[]' where id='${ca}'`);
  await signInFixtureDm(page);
  expect(await page.evaluate(async({campaign,enc,pa,pb,damage})=>{
   const api=await import('/src/lib/auras.ts');return api.resolveAuraSave({campaignId:campaign,encounterId:enc,targetParticipantId:pa,targetName:'A',targetType:'character',trigger:'turn_end',
    aura:{originParticipantId:pb,originName:'B',originSize:1,originRow:0,originCol:0,spec:{key:'fixture',name:'Fixture aura',radiusFt:15,saveAbility:'WIS',saveDC:100,damageDice:String(damage),damageType:'radiant',halfOnSave:true,triggers:['turn_end'],exemptParticipantIds:[],speedInside:'half',affects:'all'}}});
  },{campaign,enc,pa,pb,damage:massive?28:1})).toBe(true);
  expect(JSON.parse(sql(`select jsonb_build_object('hp',current_hp,'temp',temp_hp,'stable',is_stable,'dead',is_dead,'failures',death_save_failures) from combatants where id='${ca}'`))).toEqual({hp:0,temp:massive?0:2,stable:false,dead:massive,failures:massive?3:1});
  await expect.poll(()=>sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='${massive?'died':'damage_at_0_hp_failure_added'}'`)).toBe('1');
 });
 for(const mode of ['buffs','restrained','automatic'] as const)test(`live aura save applies ${mode} rules`,async({page})=>{
  const conditions=mode==='automatic'?['Unconscious']:mode==='restrained'?['Restrained']:[];
  sql(`update characters set nat_1_20_saves=false,wisdom=10,dexterity=10,strength=10,saving_throw_proficiencies='{}',inventory='[]' where id='${a}';
   update combatants set active_conditions=ARRAY[${conditions.map(c=>"'"+c+"'").join(',')}]::text[],exhaustion_level=2,active_buffs='[{"key":"bless","name":"Bless"},{"key":"bane","name":"Bane"}]' where id='${ca}'`);
  await signInFixtureDm(page);
  await page.evaluate(async({campaign,enc,pa,pb,mode})=>{
   const api=await import('/src/lib/auras.ts');await api.resolveAuraSave({campaignId:campaign,encounterId:enc,targetParticipantId:pa,targetName:'A',targetType:'character',trigger:'turn_end',
    aura:{originParticipantId:pb,originName:'B',originSize:1,originRow:0,originCol:0,spec:{key:'save-fixture',name:'Save fixture',radiusFt:15,saveAbility:mode==='automatic'?'STR':mode==='restrained'?'DEX':'WIS',saveDC:15,damageDice:null,damageType:null,halfOnSave:true,triggers:['turn_end'],exemptParticipantIds:[],speedInside:null,affects:'all'}}});
  },{campaign,enc,pa,pb,mode});
  await expect.poll(()=>sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='save_rolled'`)).toBe('1');
  const result=JSON.parse(sql(`select payload from combat_events where encounter_id='${enc}' and event_type='save_rolled'`));
  if(mode==='automatic')expect(result).toMatchObject({rolls:[],d20:null,total:null,automatic_failure:true,success:false,effect_rolls:[]});
  else{expect(result.rolls).toHaveLength(mode==='restrained'?2:1);expect(result.effect_rolls).toHaveLength(2);
   expect(result.bonus).toBe(result.effect_rolls[0].total+result.effect_rolls[1].total-4);expect(result.total).toBe(result.d20+result.bonus);
   expect(result.success).toBe(result.total>=15);if(mode==='restrained')expect(result.d20).toBe(Math.min(...result.rolls));}
 });
 test('live aura Intelligence saves use active Guards and stop using it at the next own turn',async({page})=>{
  sql(`update characters set level=5,intelligence=18,class_resources='{"psionic-energy-dice":6,"psion-disciplines":["psionic-guards"]}' where id='${a}'`);
  const guardTurn=JSON.parse(sql(auth(player,`select get_psionic_discipline_turn('${a}')`))).turn;
  const expected=sql(`select jsonb_build_object('class_name',class_name,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,'intelligence',intelligence,'inventory',inventory,'disciplines',class_resources->'psion-disciplines') from characters where id='${a}'`);
  sql(auth(player,`select begin_psionic_discipline('${a}','${randomUUID()}','${JSON.stringify(guardTurn)}','psionic-guards',array[]::integer[],1,4,'${expected}')`));
  await signInFixtureDm(page);
  const invoke=(key:string)=>page.evaluate(async({campaign,enc,pa,pb,key})=>{
   const api=await import('/src/lib/auras.ts');try{return {ok:await api.resolveAuraSave({campaignId:campaign,encounterId:enc,targetParticipantId:pa,targetName:'A',targetType:'character',trigger:'turn_end',
    aura:{originParticipantId:pb,originName:'B',originSize:1,originRow:0,originCol:0,spec:{key,name:key,radiusFt:15,saveAbility:'INT',saveDC:15,damageDice:null,damageType:null,halfOnSave:true,triggers:['turn_end'],exemptParticipantIds:[],speedInside:null,affects:'all'}}})};}catch(e){return {error:String(e)};}
  },{campaign,enc,pa,pb,key});
  await page.route('**/rest/v1/rpc/get_psionic_guards_active',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Protection unavailable',code:'42501'})}));
  expect(await invoke('guards-active')).toHaveProperty('error');expect(sql(`select cardinality(once_per_turn_used) from combat_participants where id='${pa}'`)).toBe('0');
  expect(sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='save_rolled'`)).toBe('0');
  await page.unroute('**/rest/v1/rpc/get_psionic_guards_active');
  const evidence=(key:string)=>JSON.parse(sql(`select payload from combat_events where encounter_id='${enc}' and event_type='save_rolled' and payload->>'aura'='${key}'`));
  expect(await invoke('guards-active')).toEqual({ok:true});await expect.poll(()=>sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='save_rolled'`)).toBe('1');
  const active=evidence('guards-active');expect(active.advantage).toBe(true);expect(active.rolls).toHaveLength(2);expect(active.d20).toBe(Math.max(...active.rolls));
  run();run(call(randomUUID(),state().turn,pa,0,2));
  expect(await invoke('guards-expired')).toEqual({ok:true});await expect.poll(()=>sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='save_rolled'`)).toBe('2');
  const expired=evidence('guards-expired');expect(expired.advantage).toBe(false);expect(expired.rolls).toHaveLength(1);
 });
 test('live aura rejects invalid dice without spending its use and records mixed damage dice',async({page})=>{
  sql(`update characters set nat_1_20_saves=false,inventory='[]' where id='${a}';update combatants set active_buffs='[]' where id='${ca}'`);
  await signInFixtureDm(page);
  const invoke=(expression:string)=>page.evaluate(async({campaign,enc,pa,pb,expression})=>{
   const api=await import('/src/lib/auras.ts');const random=Math.random;Math.random=()=>0;
   try{return {ok:await api.resolveAuraSave({campaignId:campaign,encounterId:enc,targetParticipantId:pa,targetName:'A',targetType:'character',trigger:'turn_end',
    aura:{originParticipantId:pb,originName:'B',originSize:1,originRow:0,originCol:0,spec:{key:'dice-fixture',name:'Dice fixture',radiusFt:15,saveAbility:'WIS',saveDC:100,damageDice:expression,damageType:'radiant',halfOnSave:true,triggers:['turn_end'],exemptParticipantIds:[],speedInside:null,affects:'all'}}})};}
   catch(e){return {error:String(e)};}finally{Math.random=random;}
  },{campaign,enc,pa,pb,expression});
  expect(await invoke('1d6+special')).toMatchObject({error:expect.stringContaining('damage expression')});
  expect(sql(`select cardinality(once_per_turn_used) from combat_participants where id='${pa}'`)).toBe('0');
  expect(sql(`select count(*) from combat_events where encounter_id='${enc}'`)).toBe('0');
  expect(sql(`select current_hp from combatants where id='${ca}'`)).toBe('20');
  expect(await invoke('1d4+1d6+2')).toEqual({ok:true});
  expect(sql(`select current_hp from combatants where id='${ca}'`)).toBe('16');
  await expect.poll(()=>sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='save_rolled'`)).toBe('1');
  expect(JSON.parse(sql(`select payload from combat_events where encounter_id='${enc}' and event_type='save_rolled'`))).toMatchObject({damage:4,damage_rolled:4,damage_rolls:[{die:4,value:1},{die:6,value:1}],damage_flat_modifier:2});
 });
 for(const immune of [false,true])test(`live aura damage applies typed defenses (immune=${immune})`,async({page})=>{
  sql(`update characters set nat_1_20_saves=false,wisdom=10,saving_throw_proficiencies='{}',inventory='[]',damage_resistances=array['fire'],damage_vulnerabilities=array['fire'],damage_immunities=${immune?"array['fire']":"array[]::text[]"} where id='${a}';update combatants set active_buffs='[]' where id='${ca}'`);
  await signInFixtureDm(page);
  await page.evaluate(async({campaign,enc,pa,pb})=>{
   const api=await import('/src/lib/auras.ts');await api.resolveAuraSave({campaignId:campaign,encounterId:enc,targetParticipantId:pa,targetName:'A',targetType:'character',trigger:'turn_end',
    aura:{originParticipantId:pb,originName:'B',originSize:1,originRow:0,originCol:0,spec:{key:'defense-fixture',name:'Defense fixture',radiusFt:15,saveAbility:'WIS',saveDC:0,damageDice:'15',damageType:'fire',halfOnSave:true,triggers:['turn_end'],exemptParticipantIds:[],speedInside:null,affects:'all'}}});
  },{campaign,enc,pa,pb});
  expect(sql(`select current_hp from combatants where id='${ca}'`)).toBe(immune?'20':'14');
  await expect.poll(()=>sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='save_rolled'`)).toBe('1');
  expect(JSON.parse(sql(`select payload from combat_events where encounter_id='${enc}' and event_type='save_rolled'`))).toMatchObject({damage_rolled:15,damage_after_save:7,damage:immune?0:6,damage_modifier:immune?'immune':'resistant-vulnerable'});
 });
 const recoverMovement=()=>`select recover_turn_movement_features('${pa}','${turn}')`;
 const featureUses=()=>JSON.parse(sql(`select feature_uses from characters where id='${a}'`));
 const movementFixture=()=>{sql(`update characters set feature_uses='{"Feline Agility":1,"species:Feline Agility":1,"Psionic Restoration":1,"custom":4}' where id='${a}'`);endEffects(pa,ca,false);};
 test('saved movement recovery clears only its two keys and preserves current Psion resources',()=>{
  movementFixture();sql(`update characters set feature_uses=feature_uses||'{"custom":5}' where id='${a}'`);
  expect(run(recoverMovement())).toEqual({participantId:pa,encounterId:enc,turnId:turn,characterId:a,recovered:['Feline Agility','species:Feline Agility'],replayed:false});
  expect(featureUses()).toEqual({'Feline Agility':0,'species:Feline Agility':0,'Psionic Restoration':1,custom:5});
 });
 test('saved movement recovery replays without erasing a subsequent use even after combat ends',()=>{
  movementFixture();const first=run(recoverMovement());sql(`update characters set feature_uses=feature_uses||'{"Feline Agility":1}' where id='${a}';update combat_encounters set status='ended' where id='${enc}'`);
  expect(run(recoverMovement())).toEqual({...first,replayed:true});expect(featureUses()['Feline Agility']).toBe(1);
 });
 test('saved movement recovery records a moved turn without restoring uses on retry',()=>{
  movementFixture();sql(`update combat_participants set movement_used_ft=5 where id='${pa}'`);expect(run(recoverMovement()).recovered).toEqual([]);
  sql(`update combat_participants set movement_used_ft=0 where id='${pa}'`);expect(run(recoverMovement()).replayed).toBe(true);expect(featureUses()['Feline Agility']).toBe(1);
 });
 test('saved movement recovery requires confirmed outgoing effects and rejects a stale turn',()=>{
  expect(()=>run(recoverMovement())).toThrow(/Confirm outgoing turn effects/);movementFixture();run();expect(()=>run(recoverMovement())).toThrow(/Combat turn changed/);
 });
 test('saved movement recovery authorizes the current DM before replay and keeps its ledger private',()=>{
  movementFixture();run(recoverMovement());expect(()=>run(recoverMovement(),player)).toThrow(/only to/);expect(()=>sql('set role anon;'+recoverMovement())).toThrow(/permission denied/);
  expect(()=>sql(auth(dm,'select * from dndkeep_private.turn_movement_recoveries'))).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);expect(()=>run(recoverMovement())).toThrow(/only to/);expect(run(recoverMovement(),player).replayed).toBe(true);
 });
 test('saved movement recovery follows a lethal outgoing effect without giving the next actor its recovery',()=>{
  sql(`update characters set feature_uses='{"Feline Agility":1}' where id='${a}'`);endEffects(pa,ca);expect(run(recoverMovement()).recovered).toEqual(['Feline Agility']);expect(featureUses()['Feline Agility']).toBe(0);
 });
 test('saved movement recovery concurrent retries change resources once',async()=>{
  movementFixture();const results=await Promise.all([parallel(auth(dm,recoverMovement())),parallel(auth(dm,recoverMovement()))]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
  expect(sql(`select count(*) from dndkeep_private.turn_movement_recoveries where participant_id='${pa}'`)).toBe('1');
 });
 test('saved movement recovery receipt failure rolls back resource changes',()=>{
  movementFixture();const original=featureUses(),fn='reject_movement_'+request.replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.participant_id='${pa}' then raise exception 'fixture movement failure';end if;return new;end $$;create trigger ${fn} before insert on dndkeep_private.turn_movement_recoveries for each row execute function public.${fn}()`);
  try{expect(()=>run(recoverMovement())).toThrow(/fixture movement failure/);expect(featureUses()).toEqual(original);
  }finally{sql(`drop trigger ${fn} on dndkeep_private.turn_movement_recoveries;drop function public.${fn}()`);}
  expect(run(recoverMovement()).replayed).toBe(false);
 });
 test('saved movement recovery browser retry recovers a lost response without refilling later uses',async({page})=>{
  movementFixture();await signInFixtureDm(page);let writes=0;
  await page.route('**/rest/v1/rpc/recover_turn_movement_features',async route=>{writes++;await route.fetch();await route.abort('failed');});
  const invoke=()=>page.evaluate(async i=>{const api=await import('/src/lib/api/turnMovementRecovery.ts');try{return {receipt:await api.recoverTurnMovementFeatures(i)};}catch(e){return {error:String(e)};}},{participantId:pa,encounterId:enc,turnId:turn});
  expect(await invoke()).toHaveProperty('error');expect(writes).toBe(2);expect(featureUses()['Feline Agility']).toBe(0);
  sql(`update characters set feature_uses=feature_uses||'{"Feline Agility":1}' where id='${a}'`);
  await page.unroute('**/rest/v1/rpc/recover_turn_movement_features');await page.reload();
  expect(await invoke()).toMatchObject({receipt:{replayed:true,recovered:['Feline Agility','species:Feline Agility']}});expect(featureUses()['Feline Agility']).toBe(1);
 });
 test('saved movement recovery rejects malformed counters without touching other keys',()=>{
  movementFixture();sql(`update characters set feature_uses=feature_uses||'{"species:Feline Agility":"spent"}' where id='${a}'`);const before=featureUses();
  expect(()=>run(recoverMovement())).toThrow(/Review movement feature uses/);expect(featureUses()).toEqual(before);
 });
 const setMastery=(items:unknown[])=>sql(`update combatants set active_buffs='${JSON.stringify(items).replaceAll("'","''")}' where id='${ca}'`);
 const expiryEvents=()=>JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('payload',payload,'visibility',visibility,'sequence',sequence) order by sequence),'[]') from combat_events where encounter_id='${enc}' and event_type='buff_removed'`));
 test('saved mastery expiry matches the pure planner for start, end and legacy markers',()=>{
  const items=[{key:'mastery_vexed',expiresAtEndOfTurnOf:pa,expiresAfterNextTurnStarts:true},
   {key:'mastery_vexed',expiresAtEndOfTurnOf:pa,expiresAfterNextTurnStarts:false},
   {key:'mastery_vexed',expiresAtStartOfTurnOf:pa,expiresSkipFirst:true},
   {key:'mastery_vexed',expiresAtStartOfTurnOf:pa},
   {key:'sap',expiresAtStartOfTurnOf:pa,expiresSkipFirst:true},
   {key:'slow',expiresAtStartOfTurnOf:pa},{key:'other',expiresAtStartOfTurnOf:pb},
   {key:'bless',duration:7,metadata:{note:"A's blessing"}}];
  for(const timing of ['turn_start','turn_end'] as const){
   const expected=advanceMasteryExpiry(items,pa,timing);
   const actual=JSON.parse(sql(`select dndkeep_private.advance_mastery_expiry('${JSON.stringify(items).replaceAll("'","''")}', '${pa}', '${timing}')`));
   expect(actual).toEqual({next:expected.next,removed:expected.removed});
  }
  expect(sql(`select dndkeep_private.advance_mastery_expiry(null,'${pa}','turn_start')->'next'`)).toBe('null');
  expect(()=>sql(auth(dm,`select dndkeep_private.advance_mastery_expiry('[]','${pa}','turn_start')`))).toThrow(/permission denied/);
 });
 test('saved mastery expiry arms Vex at next start and removes it at next end without restoring it on wrap',()=>{
  const vex={key:'mastery_vexed',name:'Vexed',expiresAtEndOfTurnOf:pa,expiresAfterNextTurnStarts:true};
  setMastery([{key:'bless',duration:8},vex]);run();expect(buffs()[1]).toEqual(vex);
  run(call(randomUUID(),state().turn,pa,0,2));expect(buffs()[1]).toMatchObject({expiresAfterNextTurnStarts:false});
  run(call(randomUUID(),state().turn,pb,1,2));expect(buffs()).toEqual([{key:'bless',duration:7}]);expect(expiryEvents()).toHaveLength(1);
  run(call(randomUUID(),state().turn,pa,0,3));expect(buffs()).toEqual([{key:'bless',duration:6}]);
 });
 test('saved mastery expiry handles same-actor end before start and replay preserves later buffs',()=>{
  sql(`update combatants set is_dead=true where id='${cb}'`);
  setMastery([{key:'mastery_vexed',name:'Vexed',expiresAtEndOfTurnOf:pa,expiresAfterNextTurnStarts:true}]);
  run(call(request,turn,pa,0,2));expect(buffs()[0].expiresAfterNextTurnStarts).toBe(false);
  const next=state().turn,id=randomUUID();run(call(id,next,pa,0,3));expect(buffs()).toEqual([]);
  setMastery([{key:'later',duration:5}]);run(call(id,next,pa,0,3));expect(buffs()).toEqual([{key:'later',duration:5}]);expect(expiryEvents()).toHaveLength(1);
 });
 test('saved mastery expiry logs hidden effects with distinct sequences after a legendary refill',()=>{
  sql(`update combat_participants set hidden_from_players=true where id='${pa}';update combat_participants set legendary_actions_total=3,legendary_actions_remaining=1 where id='${pb}'`);
  setMastery([{key:'sap',name:'Sapped',expiresAtStartOfTurnOf:pb},{key:'slow',name:'Slowed',expiresAtStartOfTurnOf:pb}]);run();
  expect(expiryEvents()).toEqual(['sap','slow'].map((key,i)=>({payload:{key,name:i?'Slowed':'Sapped',reason:'mastery_marker_expired'},visibility:'hidden_from_players',sequence:i+1})));
 });
 test('saved mastery expiry log failure rolls back buffs, budgets, clock and receipt',()=>{
  setMastery([{key:'slow',name:'Slowed',expiresAtStartOfTurnOf:pb}]);spendBudgets();const before=state(),original=buffs(),fn='reject_expiry_'+request.replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.chain_id='${request}' and new.event_type='buff_removed' then raise exception 'fixture expiry failure';end if;return new;end $$;create trigger ${fn} before insert on combat_events for each row execute function public.${fn}()`);
  try{expect(()=>run()).toThrow(/fixture expiry failure/);expect(state()).toEqual(before);expect(buffs()).toEqual(original);expect(budgets(pb)).toEqual(spent);expect(expiryEvents()).toEqual([]);
   expect(sql(`select count(*) from dndkeep_private.combat_clock_transitions where request_id='${request}'`)).toBe('0');
  }finally{sql(`drop trigger ${fn} on combat_events;drop function public.${fn}()`);}
  run();expect(buffs()).toEqual([]);expect(expiryEvents()).toHaveLength(1);
 });
 const legendaryEvents=()=>JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('payload',payload,'visibility',visibility)),'[]') from combat_events where encounter_id='${enc}' and event_type='legendary_actions_refilled'`));
 for(const inLair of [false,true])test(`clock refills and logs the incoming legendary pool (lair=${inLair})`,()=>{
  sql(`update combat_encounters set in_lair=${inLair} where id='${enc}';update combat_participants set legendary_actions_total=3,legendary_actions_remaining=1,hidden_from_players=true where encounter_id='${enc}'`);
  run();expect(sql(`select legendary_actions_remaining from combat_participants where id='${pb}'`)).toBe(inLair?'4':'3');
  expect(sql(`select legendary_actions_remaining from combat_participants where id='${pa}'`)).toBe('1');
  expect(legendaryEvents()).toEqual([{payload:{refilled_from:1,refilled_to:inLair?4:3},visibility:'hidden_from_players'}]);
 });
 test('clock refill replay preserves legendary uses spent after the turn starts',()=>{
  sql(`update combat_participants set legendary_actions_total=3,legendary_actions_remaining=1 where id='${pb}'`);
  const first=run();sql(`update combat_participants set legendary_actions_remaining=0 where id='${pb}'`);
  expect(run()).toEqual({...first,replayed:true});expect(sql(`select legendary_actions_remaining from combat_participants where id='${pb}'`)).toBe('0');expect(legendaryEvents()).toHaveLength(1);
 });
 for(const [total,remaining] of [[3,3],[3,4],[0,0]])test(`clock does not reduce or announce an unchanged legendary pool (${total}/${remaining})`,()=>{
  sql(`update combat_participants set legendary_actions_total=${total},legendary_actions_remaining=${remaining} where id='${pb}'`);run();
  expect(sql(`select legendary_actions_remaining from combat_participants where id='${pb}'`)).toBe(String(remaining));expect(legendaryEvents()).toEqual([]);
 });
 test('legendary pool bounds allow one lair use but reject larger or nonexistent pools',()=>{
  expect(()=>sql(`update combat_participants set legendary_actions_total=3,legendary_actions_remaining=5 where id='${pb}'`)).toThrow(/legendary_remaining_le_lair_cap/);
  expect(()=>sql(`update combat_participants set legendary_actions_total=0,legendary_actions_remaining=1 where id='${pb}'`)).toThrow(/legendary_remaining_le_lair_cap/);
  sql(`update combat_participants set legendary_actions_total=3,legendary_actions_remaining=4 where id='${pb}'`);
  expect(sql(`select legendary_actions_remaining from combat_participants where id='${pb}'`)).toBe('4');
 });
 test('a legendary log failure rolls back refill, other budgets, clock and receipt',()=>{
  spendBudgets();sql(`update combat_participants set legendary_actions_total=3,legendary_actions_remaining=1 where id='${pb}'`);
  const before=state(),fn='reject_legendary_'+request.replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.chain_id='${request}' and new.event_type='legendary_actions_refilled' then raise exception 'fixture legendary failure';end if;return new;end $$;create trigger ${fn} before insert on combat_events for each row execute function public.${fn}()`);
  try{expect(()=>run()).toThrow(/fixture legendary failure/);expect(state()).toEqual(before);expect(budgets(pb)).toEqual(spent);
   expect(sql(`select legendary_actions_remaining from combat_participants where id='${pb}'`)).toBe('1');expect(legendaryEvents()).toEqual([]);
   expect(sql(`select count(*) from dndkeep_private.combat_clock_transitions where encounter_id='${enc}'`)).toBe('0');
  }finally{sql(`drop trigger ${fn} on combat_events;drop function public.${fn}()`);}
  expect(run().replayed).toBe(false);expect(legendaryEvents()).toHaveLength(1);
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
