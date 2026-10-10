import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic ordinary movement actions',()=>{
 test.use({serviceWorkers:'block'});gateDbSuite();let dm:string,player:string,campaign:string,enc:string,a:string,b:string,ca:string,cb:string,pa:string,pb:string,request:string,turn:string;
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


 const command=(kind='dash',t=turn,actor=pa)=>`select take_movement_action('${enc}','${actor}','${t}','${kind}')`;
 const run=(kind='dash',user=player,t=turn,actor=pa)=>JSON.parse(sql(auth(user,command(kind,t,actor))));
 const flags=(actor=pa)=>JSON.parse(sql(`select jsonb_build_object('action',action_used,'dash',dash_used_this_turn,'disengage',disengaged_this_turn) from combat_participants where id='${actor}'`));
 const count=()=>sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type in('dash','disengage')`);
 for(const kind of ['dash','disengage'])test(`${kind} spends once, logs once, and replays once`,()=>{
  const first=run(kind);expect(flags()).toEqual({action:true,dash:kind==='dash',disengage:kind==='disengage'});expect(run(kind)).toEqual({...first,replayed:true});expect(count()).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${a}'`)).toBe('1');
 });
 test('Dash and Disengage compete for the same normal Action',async()=>{
  const results=await Promise.all([parallel(auth(player,command('dash'))),parallel(auth(player,command('disengage')))]);expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(count()).toBe('1');
 });
 test('identical concurrent requests return one receipt and event',async()=>{
  const results=await Promise.all([parallel(auth(player,command())),parallel(auth(player,command()))]);expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(count()).toBe('1');
 });
 for(const field of ['action_used=true','attacks_remaining=0'])test(`rejects an already spent Action: ${field}`,()=>{
  sql(`update combat_participants set ${field} where id='${pa}'`);expect(()=>run()).toThrow(/Action is already spent/);expect(flags().dash).toBe(false);expect(count()).toBe('0');
 });
 test('rejects stale turns, other owners, and off-turn actors',()=>{
  expect(()=>run('dash',player,randomUUID())).toThrow(/turn changed/);expect(()=>run('dash',player,turn,pb)).toThrow(/unavailable/);expect(()=>run('dash',dm,turn,pb)).toThrow(/own turn/);expect(count()).toBe('0');
 });
 test('closing reservations block both actions without spending',()=>{
  sql(auth(dm,`select prepare_combat_turn_end('${enc}','${turn}')`));for(const kind of ['dash','disengage'])expect(()=>run(kind)).toThrow(/turn is already ending/);expect(flags().action).toBe(false);expect(count()).toBe('0');
 });
 test('Stunned actors cannot take either action',()=>{
  sql(`update combatants set active_conditions=array['Stunned'] where id='${ca}'`);expect(()=>run()).toThrow(/incapacitated/);expect(()=>run('disengage')).toThrow(/incapacitated/);expect(flags().action).toBe(false);
 });
 test('historical replay cannot spend a later turn',()=>{
  const first=run();sql(`update combat_encounters set current_turn_index=1 where id='${enc}';update combat_encounters set current_turn_index=0,round_number=2 where id='${enc}'`);expect(flags().action).toBe(false);
  expect(run()).toEqual({...first,replayed:true});expect(flags().action).toBe(false);expect(count()).toBe('1');
 });
 test('DM creature actions use the same normal Action checks',()=>{
  sql(`update combat_participants set participant_type='creature',hidden_from_players=true where id='${pa}'`);expect(()=>run()).toThrow(/Only the DM/);run('dash',dm);expect(()=>run('disengage',dm)).toThrow(/Action is already spent/);
  expect(sql(`select visibility from combat_events where encounter_id='${enc}' and event_type='dash'`)).toBe('hidden_from_players');
 });
 test('a failed event write rolls back flags, shared claim and receipt',()=>{
  const fn='reject_movement_'+randomUUID().replaceAll('-','');sql(`create function public.${fn}() returns trigger language plpgsql as $$begin if new.encounter_id='${enc}' and new.event_type='dash' then raise exception 'fixture movement failure';end if;return new;end$$;create trigger ${fn} before insert on combat_events for each row execute function public.${fn}()`);
  try{expect(()=>run()).toThrow(/fixture movement failure/);expect(flags().action).toBe(false);expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${a}'`)).toBe('0');expect(sql(`select count(*) from dndkeep_private.movement_action_receipts where encounter_id='${enc}'`)).toBe('0');}
  finally{sql(`drop trigger ${fn} on combat_events;drop function public.${fn}()`);}
  expect(run().replayed).toBe(false);expect(count()).toBe('1');
 });
 test('reset movement cannot silently reapply a paid action',()=>{
  run();sql(`update combat_participants set dash_used_this_turn=false,movement_used_ft=0 where id='${pa}'`);
  expect(()=>run()).toThrow(/Action remains spent/);expect(flags()).toMatchObject({action:true,dash:false});expect(count()).toBe('1');
 });
 test('mismatched character combatants cannot spend or log movement actions',()=>{
  sql(`update combatants set definition_id='${b}' where id='${ca}'`);expect(()=>run()).toThrow(/combatant link/);expect(count()).toBe('0');
 });
 test('browser retry after a lost reply uses the original turn without a second action',async({page})=>{
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}',jsonb_build_object('sub','${dm}','email','${dm}@turn.local'),'email',now(),now(),now())`);
  await signInAsSeedDm(page,`${dm}@turn.local`);let replies=0;
  await page.route('**/rest/v1/rpc/take_movement_action',async route=>{await route.fetch();replies++;await route.abort('failed');});
  const click=()=>page.evaluate(async({enc,pa,turn})=>{const path='/src/lib/api/movementActions.ts',api=await import(path);try{return {result:await api.commitMovementAction(enc,pa,turn,'dash')};}catch(error){return {error:String(error)};}},{enc,pa,turn});
  expect((await click()).error).toBeTruthy();expect(replies).toBe(2);expect(count()).toBe('1');
  sql(`update combat_encounters set current_turn_index=1 where id='${enc}';update combat_encounters set current_turn_index=0,round_number=2 where id='${enc}'`);
  await page.unroute('**/rest/v1/rpc/take_movement_action');expect((await click()).result).toMatchObject({replayed:true,turnId:turn});expect(flags().action).toBe(false);expect(count()).toBe('1');
 });

});
