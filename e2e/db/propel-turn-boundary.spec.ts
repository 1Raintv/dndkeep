import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Pending Propel turn boundary',()=>{
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

 const declare=(character=a,user=player,target=pb)=>{
  const context=JSON.parse(sql(auth(user,`select psionic_propel('${character}','context')`))),id=randomUUID();
  sql(auth(user,`select psionic_propel('${character}','begin','${JSON.stringify({requestId:id,turnId:context.turnId,mode:'powered',movement:'push',roll:3,target:{participantId:target,legalTargetConfirmed:true}})}')`));return id;
 };
 const cancel=(id:string)=>sql(auth(player,`select psionic_propel('${a}','finish','{"declarationId":"${id}","outcome":"cancelled"}')`));
 const advance=()=>JSON.parse(sql(auth(dm,`select commit_combat_clock_transition('${enc}','${request}','${turn}','${pb}',1,1)`)));
 const allState=()=>sql(`select jsonb_build_object('enc',(select to_jsonb(e) from combat_encounters e where id='${enc}'),
  'clock',(select combat_rounds_elapsed from campaigns where id='${campaign}'),
  'combatants',(select jsonb_agg(to_jsonb(c) order by id) from combatants c where campaign_id='${campaign}'),
  'characters',(select jsonb_agg(to_jsonb(c) order by id) from characters c where id in('${a}','${b}')),
  'effects',(select count(*) from dndkeep_private.turn_effect_batches where participant_id in('${pa}','${pb}')),
  'clocks',(select count(*) from dndkeep_private.combat_clock_transitions where encounter_id='${enc}'))`);
 const effects=()=>{
  const expected=JSON.parse(sql(`select dndkeep_private.turn_effect_state('${ca}')`)),updates={...expected,current_hp:19};delete updates.max_hp;
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
 test('a boundary waiting on a declaration sees it after that transaction commits',async()=>{
  const context=JSON.parse(sql(auth(player,`select psionic_propel('${a}','context')`))),id=randomUUID();
  const payload=JSON.stringify({requestId:id,turnId:context.turnId,mode:'powered',movement:'push',roll:3,target:{participantId:pb,legalTargetConfirmed:true}});
  const held=spawn('docker',args);let output='',error='';held.stdout.on('data',v=>output+=v);held.stderr.on('data',v=>error+=v);
  const heldDone=new Promise<number|null>(resolve=>held.on('close',resolve));
  let waiting:ReturnType<typeof spawn>|undefined,done:Promise<number|null>|undefined,waitError='';
  try{
   held.stdin.write(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${player}","role":"authenticated"}';select psionic_propel('${a}','begin','${payload}');\n\\echo DECLARED\n`);
   await expect.poll(()=>output.includes('DECLARED'),{timeout:5000}).toBe(true);
   const label=`propel-boundary-${enc}`;waiting=spawn('docker',args);waiting.stdout.resume();waiting.stderr.on('data',v=>waitError+=v);done=new Promise(resolve=>waiting!.on('close',resolve));
   waiting.stdin.end(`set application_name='${label}';${auth(dm,`update combat_encounters set current_turn_index=1 where id='${enc}'`)}`);
   await expect.poll(()=>sql(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event_type='Lock'`),{timeout:5000}).toBe('1');
   held.stdin.end('commit;\n');expect(await heldDone,error).toBe(0);expect(await done).not.toBe(0);expect(waitError).toContain('Resolve pending Telekinetic or Warp Propel');expect(state().turn).toBe(turn);
  }finally{
   if(held.exitCode===null){held.stdin.end('rollback;\n');await heldDone;}
   if(waiting&&waiting.exitCode===null){waiting.stdin.end();if(done)await done;}
  }
 });

});
