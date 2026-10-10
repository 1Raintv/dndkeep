import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect,type Page} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Live turn proposal reconciliation',()=>{
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
 async function signInFixtureDm(page:Page){
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@turn.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@turn.local`);
 }
 const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
 const original=()=>({requestId:request,encounterId:enc,expectedTurn:turn,incomingId:pb,nextIndex:1,nextRound:1});
 const reconcile=(body=original(),who=dm)=>JSON.parse(sql(auth(who,`select reconcile_live_turn_request('${enc}',${literal(body)})`)));
 const retire=()=>{sql(`update combatants set is_dead=true where id='${cb}'`);return reconcile();};
 const begin=(r:any)=>JSON.parse(sql(auth(dm,`select begin_live_turn_transition('${enc}','${r.requestId}','${r.expectedTurn}','${r.incomingId}',${r.nextIndex},${r.nextRound})`)));
 test('a still-current request is retained without creating a retirement record',()=>{
  const before=state();expect(reconcile()).toEqual({status:'ready',request:original()});expect(state()).toEqual(before);expect(sql(`select count(*) from dndkeep_private.retired_live_turn_requests where encounter_id='${enc}'`)).toBe('0');
 });
 test('inspection does not retire a request before pending movement can be reviewed',()=>{
  sql(`update combatants set is_dead=true where id='${cb}'`);
  expect(JSON.parse(sql(auth(dm,`select reconcile_live_turn_request('${enc}',${literal(original())},false)`)))).toEqual({status:'uncommitted'});
  expect(sql(`select count(*) from dndkeep_private.retired_live_turn_requests where encounter_id='${enc}'`)).toBe('0');
 });
 test('a removed next actor receives one durable replacement without moving the clock',()=>{
  const before=state(),result=retire();expect(result).toMatchObject({status:'replaced',original:original(),request:{encounterId:enc,expectedTurn:turn,incomingId:pa,nextIndex:0,nextRound:2}});expect(result.request.requestId).not.toBe(request);expect(state()).toEqual(before);expect(reconcile()).toEqual(result);
 });
 test('old tabs cannot revive a retired request when the roster returns',()=>{
  retire();sql(`update combatants set is_dead=false where id='${cb}'`);const before=state();expect(()=>run()).toThrow(/proposal was replaced/);expect(state()).toEqual(before);expect(sql(`select count(*) from dndkeep_private.combat_clock_transitions where request_id='${request}'`)).toBe('0');
 });
 test('repeated roster changes create recoverable replacements, never overwrite them',()=>{
  const first=retire();sql(`update combatants set is_dead=false where id='${cb}'`);const second=reconcile(first.request);expect(second).toMatchObject({status:'replaced',original:first.request,request:{incomingId:pb,nextIndex:1,nextRound:1}});expect(reconcile()).toEqual(first);expect(reconcile(first.request)).toEqual(second);
 });
 test('a committed replacement wins recovery of its stale predecessor',()=>{
  endEffects(pa,ca,false);const result=retire(),winner=begin(result.request),after=state();expect(reconcile()).toEqual({status:'committed',transition:winner});expect(state()).toEqual(after);expect(winner.incoming.id).toBe(pa);
 });
 test('a mutated original cannot access a different retirement or receipt',()=>{
  retire();expect(()=>reconcile({...original(),nextIndex:0})).toThrow(/Original turn proposal changed/);
 });
 test('committed request identity cannot be changed during reconciliation',()=>{
  endEffects(pa,ca,false);begin(original());expect(()=>reconcile({...original(),nextIndex:0})).toThrow(/Original turn proposal changed/);expect(reconcile().status).toBe('committed');
 });
 test('pending movement blocks replacement but not read-only inspection',()=>{
  sql(`insert into dndkeep_private.movement_aura_events(campaign_id,encounter_id,turn_id,placement_id,captured_by,context) values('${campaign}','${enc}','${turn}','${randomUUID()}','${dm}','{}')`);
  expect(()=>retire()).toThrow(/pending movement/);expect(JSON.parse(sql(auth(dm,`select reconcile_live_turn_request('${enc}',${literal(original())},false)`)))).toEqual({status:'uncommitted'});expect(sql(`select count(*) from dndkeep_private.retired_live_turn_requests where encounter_id='${enc}'`)).toBe('0');
 });
 test('current DM authorization protects retired proposals and their replay',()=>{
  retire();expect(()=>reconcile(original(),player)).toThrow(/only to its DM/);expect(()=>sql(auth(player,'select * from dndkeep_private.retired_live_turn_requests'))).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);expect(()=>reconcile()).toThrow(/only to its DM/);expect(reconcile(original(),player).status).toBe('replaced');
 });
 test('concurrent retirement returns exactly one replacement',async()=>{
  sql(`update combatants set is_dead=true where id='${cb}'`);const q=auth(dm,`select reconcile_live_turn_request('${enc}',${literal(original())})`);
  const results=await Promise.all([parallel(q),parallel(q)]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(JSON.parse(results[0].out)).toEqual(JSON.parse(results[1].out));expect(sql(`select count(*) from dndkeep_private.retired_live_turn_requests where encounter_id='${enc}'`)).toBe('1');
 });
 test('late retirement failure leaves no false tombstone',()=>{
  const fn='reject_retirement_'+randomUUID().replaceAll('-','');sql(`create function public.${fn}() returns trigger language plpgsql as $$begin if new.encounter_id='${enc}' then raise exception 'fixture retirement failure';end if;return new;end$$;create trigger ${fn} before insert on dndkeep_private.retired_live_turn_requests for each row execute function public.${fn}()`);
  try{expect(()=>retire()).toThrow(/fixture retirement failure/);expect(sql(`select count(*) from dndkeep_private.retired_live_turn_requests where encounter_id='${enc}'`)).toBe('0');}
  finally{sql(`drop trigger ${fn} on dndkeep_private.retired_live_turn_requests;drop function public.${fn}()`);}
  sql(`update combatants set is_dead=false where id='${cb}'`);expect(run().incomingId).toBe(pb);
 });
 test('browser reload recovers a replacement after losing both reconciliation responses',async({page})=>{
  endEffects(pa,ca,false);sql(`update combatants set is_dead=true where id='${cb}'`);await signInFixtureDm(page);
  const body=original(),key=`dndkeep:live-turn:${dm}:${enc}`;
  await page.evaluate(({body,key})=>localStorage.setItem(key,JSON.stringify(body)),{body,key});
  let replies=0;await page.route('**/rest/v1/rpc/reconcile_live_turn_request',async route=>{if(route.request().postDataJSON().p_prepare===false){await route.continue();return;}await route.fetch();replies++;await route.abort('failed');});
  const failed=await page.evaluate(async({dm,enc,key})=>{const path='/src/lib/api/liveTurnTransitions.ts',api=await import(path);try{await api.recoverLiveTurnTransition(dm,enc,()=>{});return null;}catch{return JSON.parse(localStorage.getItem(key)!);}},{dm,enc,key});
  expect(failed).toEqual(body);expect(replies).toBe(2);expect(state().turn).toBe(turn);await page.unroute('**/rest/v1/rpc/reconcile_live_turn_request');await page.reload();
  const result=await page.evaluate(async({dm,enc,key})=>{const path='/src/lib/api/liveTurnTransitions.ts',api=await import(path);return {recovered:await api.recoverLiveTurnTransition(dm,enc,()=>{}),saved:localStorage.getItem(key)};},{dm,enc,key});
  expect(result).toEqual({recovered:true,saved:null});expect(state()).toMatchObject({index:0,round:2,clock:1});expect(sql(`select count(*) from dndkeep_private.live_turn_transitions where encounter_id='${enc}' and complete`)).toBe('1');
 });
});
