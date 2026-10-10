import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Pending Propel turn boundary',()=>{
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

 const declare=(character=a,user=player,target=pb)=>{
  const context=JSON.parse(sql(auth(user,`select psionic_propel('${character}','context')`))),id=randomUUID();
  sql(auth(user,`select psionic_propel('${character}','begin','${JSON.stringify({requestId:id,turnId:context.turnId,mode:'powered',movement:'push',roll:3,target:{participantId:target,legalTargetConfirmed:true}})}')`));return id;
 };
 const cancel=(id:string)=>sql(auth(player,`select psionic_propel('${a}','finish','{"declarationId":"${id}","outcome":"cancelled"}')`));
 const advance=(index=1)=>JSON.parse(sql(auth(dm,`select commit_combat_clock_transition('${enc}','${request}','${turn}','${pb}',${index},1)`)));
 const allState=()=>sql(`select jsonb_build_object('enc',(select to_jsonb(e) from combat_encounters e where id='${enc}'),
  'clock',(select combat_rounds_elapsed from campaigns where id='${campaign}'),
  'combatants',(select jsonb_agg(to_jsonb(c) order by id) from combatants c where campaign_id='${campaign}'),
  'characters',(select jsonb_agg(to_jsonb(c) order by id) from characters c where id in('${a}','${b}')),
  'effects',(select count(*) from dndkeep_private.turn_effect_batches where participant_id in('${pa}','${pb}')),
  'clocks',(select count(*) from dndkeep_private.combat_clock_transitions where encounter_id='${enc}'))`);
 const effects=(hp=19)=>{
  const expected=JSON.parse(sql(`select dndkeep_private.turn_effect_state('${ca}')`)),updates={...expected,current_hp:hp};delete updates.max_hp;
  return sql(auth(dm,`select commit_turn_effect_batch('${pa}','${turn}','turn_end','${randomUUID()}','${JSON.stringify(expected)}','${JSON.stringify(updates)}','[]')`));
 };
 test('clock preparation rejects pending Propel without changing state',()=>{
  declare();const before=allState();expect(()=>sql(auth(dm,`select get_combat_clock_context('${enc}','${turn}')`))).toThrow(/Resolve pending Telekinetic or Warp Propel/);expect(allState()).toBe(before);
  expect(()=>sql(auth(player,`select get_combat_clock_context('${enc}','${turn}')`))).toThrow(/only to its DM/);
 });
 test('clock commit cannot skip a pending declaration or spend round resources',()=>{
  declare();const before=allState();expect(()=>advance()).toThrow(/Resolve pending Telekinetic or Warp Propel/);expect(allState()).toBe(before);
 });
 for(const change of ['current_turn_index=1','round_number=2'])test(`direct boundary ${change} cannot bypass pending Propel`,()=>{
  declare();const before=allState();expect(()=>sql(auth(dm,`update combat_encounters set ${change} where id='${enc}'`))).toThrow(/Resolve pending Telekinetic or Warp Propel/);expect(allState()).toBe(before);
 });
 test('pending Propel rolls back an attempted outgoing damage batch',()=>{
  declare();const before=allState();expect(()=>effects()).toThrow(/Resolve pending Telekinetic or Warp Propel/);expect(allState()).toBe(before);
 });
 test('explicit cancellation releases the boundary without refunding the action',()=>{
  const id=declare();cancel(id);expect(sql(`select bonus_used from combat_participants where id='${pa}'`)).toBe('t');effects();expect(advance().incomingId).toBe(pb);
 });
 test('a fresh declaration after outgoing effects is rejected without spending its Bonus Action',()=>{
  effects();const before=allState();expect(()=>declare()).toThrow(/turn is already ending/);expect(allState()).toBe(before);
  expect(sql(`select bonus_used from combat_participants where id='${pa}'`)).toBe('f');expect(sql(`select count(*) from dndkeep_private.propel_declarations where character_id='${a}'`)).toBe('0');
 });
 test('replaying a committed clock still works when the incoming actor has pending Propel',()=>{
  sql(`update characters set class_name='Psion' where id='${b}'`);const first=advance();declare(b,dm,pa);const before=allState();
  expect(advance()).toEqual({...first,replayed:true});expect(allState()).toBe(before);
 });
 test('turn identity spoofing stays a no-op while Propel is pending',()=>{
  declare();const before=JSON.parse(allState());sql(auth(dm,`update combat_encounters set psionic_turn_id=gen_random_uuid() where id='${enc}'`));const after=JSON.parse(allState());
  // An ignored ID edit still touches the generic update timestamp.
  delete before.enc.updated_at;delete after.enc.updated_at;expect(after).toEqual(before);
 });
 for(const mode of ['boundary','reservation'])test(`${mode} waiting on a declaration sees it after that transaction commits`,async()=>{
  const context=JSON.parse(sql(auth(player,`select psionic_propel('${a}','context')`))),id=randomUUID();
  const payload=JSON.stringify({requestId:id,turnId:context.turnId,mode:'powered',movement:'push',roll:3,target:{participantId:pb,legalTargetConfirmed:true}});
  const held=spawn('docker',args);let output='',error='';held.stdout.on('data',v=>output+=v);held.stderr.on('data',v=>error+=v);
  const heldDone=new Promise<number|null>(resolve=>held.on('close',resolve));
  let waiting:ReturnType<typeof spawn>|undefined,done:Promise<number|null>|undefined,waitError='';
  try{
   held.stdin.write(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${player}","role":"authenticated"}';select psionic_propel('${a}','begin','${payload}');\n\\echo DECLARED\n`);
   await expect.poll(()=>output.includes('DECLARED'),{timeout:5000}).toBe(true);
   const label=`propel-boundary-${enc}`;waiting=spawn('docker',args);waiting.stdout.resume();waiting.stderr.on('data',v=>waitError+=v);done=new Promise(resolve=>waiting!.on('close',resolve));
   waiting.stdin.end(`set application_name='${label}';${auth(dm,mode==='boundary'?`update combat_encounters set current_turn_index=1 where id='${enc}'`:`select prepare_combat_turn_end('${enc}','${turn}')`)}`);
   await expect.poll(()=>sql(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event_type='Lock'`),{timeout:5000}).toBe('1');
   held.stdin.end('commit;\n');expect(await heldDone,error).toBe(0);expect(await done).not.toBe(0);expect(waitError).toContain('Resolve pending Telekinetic or Warp Propel');expect(state().turn).toBe(turn);
  }finally{
   if(held.exitCode===null){held.stdin.end('rollback;\n');await heldDone;}
   if(waiting&&waiting.exitCode===null){waiting.stdin.end();if(done)await done;}
  }
 });

 const reserve=(user=dm,t=turn)=>JSON.parse(sql(auth(user,`select prepare_combat_turn_end('${enc}','${t}')`)));
 const reservations=()=>sql(`select count(*) from dndkeep_private.outgoing_turn_reservations where encounter_id='${enc}'`);
 test('reservation blocks a new Propel before any outgoing effects have run',()=>{
  const before=allState(),r=reserve();expect(r.outgoingId).toBe(pa);expect(reserve()).toEqual(r);expect(reservations()).toBe('1');expect(allState()).toBe(before);
  expect(()=>declare()).toThrow(/turn is already ending/);expect(allState()).toBe(before);
  expect(sql(`select bonus_used from combat_participants where id='${pa}'`)).toBe('f');
 });
 test('pending Propel cannot create an outgoing reservation',()=>{
  declare();expect(()=>reserve()).toThrow(/Resolve pending Telekinetic or Warp Propel/);expect(reservations()).toBe('0');
 });
 test('wrong turn and non-DM cannot reserve or read the private table',()=>{
  expect(()=>reserve(dm,randomUUID())).toThrow(/Combat turn changed/);expect(()=>reserve(player)).toThrow(/only to its DM/);expect(reservations()).toBe('0');
  expect(()=>sql(auth(dm,'select * from dndkeep_private.outgoing_turn_reservations'))).toThrow(/permission denied/);
 });
 test('a reservation preserves its outgoing actor if the roster changes before retry',()=>{
  const first=reserve();sql(`update combatants set is_dead=true where id='${ca}'`);expect(reserve()).toEqual(first);
 });
 test('old reservations do not block the next actor or authorize stale preparation',()=>{
  reserve();advance();sql(`update characters set class_name='Psion' where id='${b}'`);expect(()=>declare(b,dm,pa)).not.toThrow();
  expect(()=>reserve()).toThrow(/Combat turn changed/);
 });
 test('current campaign ownership governs reservation recovery',()=>{
  reserve();sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);
  expect(()=>reserve()).toThrow(/only to its DM/);expect(reserve(player).userId).toBe(player);
 });
 test('browser reload recovers the same outgoing reservation after both replies are lost',async({page})=>{
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}',jsonb_build_object('sub','${dm}','email','${dm}@turn.local'),'email',now(),now(),now())`);
  await signInAsSeedDm(page,`${dm}@turn.local`);let replies=0;const before=allState();
  await page.route('**/rest/v1/rpc/prepare_combat_turn_end',async route=>{await route.fetch();replies++;await route.abort('failed');});
  const run=()=>page.evaluate(async({dm,enc,turn})=>{const path='/src/lib/api/combatClock.ts',api=await import(path);try{return {result:await api.prepareCombatTurnEnd(dm,enc,turn)};}catch(error){return {error:String(error)};}},{dm,enc,turn});
  expect((await run()).error).toBeTruthy();expect(replies).toBe(2);expect(reservations()).toBe('1');expect(allState()).toBe(before);expect(()=>declare()).toThrow(/turn is already ending/);
  await page.unroute('**/rest/v1/rpc/prepare_combat_turn_end');await page.reload();expect((await run()).result).toMatchObject({outgoingId:pa,expectedTurn:turn});expect(reservations()).toBe('1');expect(allState()).toBe(before);
 });

 test('a reserved actor dying before saved ticks still advances to the living successor',()=>{
  reserve();sql(`update combatants set current_hp=0,is_dead=true where id='${ca}'`);effects(0);
  expect(advance(0)).toMatchObject({incomingId:pb,index:0,round:1,roundWrapped:false});
  expect(sql(`select participant_id from dndkeep_private.turn_effect_batches where turn_id='${turn}' and timing='turn_end'`)).toBe(pa);
 });
 test('a declaration waiting on a closing reservation cannot spend its Bonus Action',async()=>{
  const context=JSON.parse(sql(auth(player,`select psionic_propel('${a}','context')`))),id=randomUUID();
  const payload=JSON.stringify({requestId:id,turnId:context.turnId,mode:'powered',movement:'push',roll:3,target:{participantId:pb,legalTargetConfirmed:true}});
  const held=spawn('docker',args);let output='',heldError='';held.stdout.on('data',v=>output+=v);held.stderr.on('data',v=>heldError+=v);const heldDone=new Promise<number|null>(resolve=>held.on('close',resolve));
  let pending:ReturnType<typeof spawn>|undefined,done:Promise<number|null>|undefined,error='';
  try{
   held.stdin.write(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';select prepare_combat_turn_end('${enc}','${turn}');\n\\echo RESERVED\n`);
   await expect.poll(()=>output.includes('RESERVED')).toBe(true);
   pending=spawn('docker',args);pending.stdout.resume();pending.stderr.on('data',v=>error+=v);done=new Promise(resolve=>pending!.on('close',resolve));
   const label=`propel-declaration-${enc}`;pending.stdin.end(`set application_name='${label}';${auth(player,`select psionic_propel('${a}','begin','${payload}')`)}`);
   await expect.poll(()=>sql(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event_type='Lock'`)).toBe('1');
   held.stdin.end('commit;\n');expect(await heldDone,heldError).toBe(0);expect(await done).not.toBe(0);expect(error).toContain('turn is already ending');
   expect(sql(`select bonus_used from combat_participants where id='${pa}'`)).toBe('f');expect(sql(`select count(*) from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('0');
  }finally{
   if(held.exitCode===null){held.stdin.end('rollback;\n');await heldDone;}
   if(pending&&pending.exitCode===null){pending.stdin.end();if(done)await done;}
  }
 });

});
