import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('Deferred Propel movement (private lifecycle)',()=>{
 gateDbSuite();let owner:string,other:string,character:string,id:string,campaign:string,encounter:string,actor:string,target:string;
 const auth=(q:string,user=owner)=>`begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${q};commit;`;
 const start=(mode='powered',roll=4)=>JSON.parse(sql(auth(`select dndkeep_private.begin_propel_movement_choice('${character}','${id}','solo:${character}:0','${mode}',${roll},'{"name":"Goblin","legalTargetConfirmed":true}')`)));
 const finish=(outcome='failed')=>{
  sql(auth(`select public.psionic_propel('${character}','finalize','{"declarationId":"${id}"}');select public.psionic_propel('${character}','finish','{"declarationId":"${id}","outcome":"${outcome}"}')`));
 };
 const choiceSql=(choice='warp')=>`select dndkeep_private.choose_propel_movement('${character}','${id}','${choice}')`;
 const choose=(choice='warp',user=owner)=>JSON.parse(sql(auth(choiceSql(choice),user)));
 const state=()=>sql(`select jsonb_build_object('pool',class_resources,'claims',(select jsonb_agg(to_jsonb(a)) from dndkeep_private.action_claims a where a.character_id=c.id),'uses',(select jsonb_agg(to_jsonb(u)) from public.psionic_energy_uses u where u.character_id=c.id)) from characters c where id='${character}'`);
 test.beforeEach(()=>{
  [owner,other,character,id,campaign,encounter,actor,target]=Array.from({length:8},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@movement.local','{}'),('${other}','${other}@movement.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,subclass,level,class_resources) values('${character}','${owner}','Psion','Human','Psion','Sage','Psi Warper',5,'{"psionic-energy-dice":2}');`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${campaign}';delete from action_logs where character_id='${character}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});
 test('chooses Warp after failure without changing dice, action or payment',()=>{
  const declared=start();expect(declared.movement_choice_required).toBe(true);expect(declared.movement_choice).toBeNull();finish();const before=state();
  expect(choose()).toMatchObject({declarationId:id,characterId:character,choice:'warp',feet:30,roll:{total:4},replayed:false});
  expect(state()).toBe(before);
  expect(sql(`select movement||':'||(result->>'feet') from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('push:20');
  expect(choose()).toMatchObject({feet:30,replayed:true});expect(state()).toBe(before);
  expect(()=>choose('push')).toThrow(/already saved/);
 });
 test('may retain the rolled push after failure',()=>{start();finish();expect(choose('push')).toMatchObject({feet:20,choice:'push'});});
 test('free Warp needs no Energy Die and retains the same Bonus Action',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);start('free',0);finish();const before=state();
  expect(choose()).toMatchObject({feet:30,roll:{total:0}});expect(state()).toBe(before);
 });
 for(const outcome of ['passed','cancelled'])test(`rejects movement after ${outcome}`,()=>{start();finish(outcome);const before=state();expect(()=>choose()).toThrow(/final failed save/);expect(state()).toBe(before);});
 test('cannot choose before the save or change the saved declaration',()=>{
  start();expect(()=>choose()).toThrow(/final failed save/);expect(start()).toMatchObject({replayed:true});expect(()=>start('powered',5)).toThrow(/identity changed/);
 });
 test('rejects non-Warp subclasses without blocking their ordinary push',()=>{
  sql(`update characters set subclass='Telepath' where id='${character}'`);start();finish();expect(()=>choose()).toThrow(/Psi Warper/);expect(choose('push')).toMatchObject({feet:20});
 });
 test('cannot add Warp by changing subclass after the roll',()=>{
  start();finish();sql(`update characters set subclass='Telepath' where id='${character}'`);expect(()=>choose()).toThrow(/progression changed/);
 });
 test('old declarations cannot be reinterpreted as unmoved targets',()=>{
  sql(auth(`select public.psionic_propel('${character}','begin','{"requestId":"${id}","turnId":"solo:${character}:0","mode":"powered","movement":"push","roll":4,"target":{"name":"Goblin","legalTargetConfirmed":true}}')`));
  finish();expect(()=>start()).toThrow(/cannot be converted/);expect(()=>choose()).toThrow(/no deferred movement/);
 });
 test('solo turns wait for movement and saved choices still recover later',()=>{
  start();finish();
  const advance=()=>sql(`insert into psionic_solo_turns(character_id,turn_number) values('${character}',1) on conflict(character_id) do update set turn_number=1`);
  expect(advance).toThrow(/Choose or close pending Propel movement/);choose();advance();expect(choose()).toMatchObject({replayed:true});
 });
 test('solo turn deletion cannot reopen the action while movement is pending',()=>{
  start();finish();sql(`insert into psionic_solo_turns(character_id,turn_number) values('${character}',0) on conflict(character_id) do nothing`);
  expect(()=>sql(`delete from psionic_solo_turns where character_id='${character}'`)).toThrow(/Choose or close pending Propel movement/);
  api('close',{declarationId:id});sql(`delete from psionic_solo_turns where character_id='${character}'`);
 });
 test('rejects another owner and keeps app execution disabled until UI recovery exists',()=>{
  start();finish();expect(()=>choose('warp',other)).toThrow();
  for(const signature of ['dndkeep_private.choose_propel_movement(uuid,uuid,text)','dndkeep_private.begin_propel_movement_choice(uuid,uuid,text,text,integer,jsonb)']){
   for(const role of ['anon','authenticated'])expect(sql(`select has_function_privilege('${role}','${signature}','execute')`)).toBe('f');
  }
 });
 const combatFailure=()=>{
  sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Movement fixture');
   update characters set campaign_id='${campaign}' where id='${character}';
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
    ('${actor}','${encounter}','${campaign}','character','${character}','Psion',0),('${target}','${encounter}','${campaign}','creature','${target}','Goblin',1);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}'`);
  const turn=JSON.parse(sql(auth(`select public.psionic_propel('${character}','context')`))).turnId;
  // Fixture settles only the movement prerequisite; the separate save suite
  // covers rolled saves, final outcomes and Legendary Resistance payment.
  sql(auth(`select dndkeep_private.begin_propel_movement_choice('${character}','${id}','${turn}','powered',4,'{"participantId":"${target}","legalTargetConfirmed":true}');
   select dndkeep_private.finalize_propel_roll('${character}','${id}');select dndkeep_private.finish_propel('${character}','${id}','failed')`));
 };
 test('combat movement remains attached to the original target',()=>{
  combatFailure();expect(choose()).toMatchObject({feet:30,target:{participantId:target}});
 });
 test('combat roster rebinding rejects a new decision without spending',()=>{
  combatFailure();const before=state();sql(`update combatants set definition_id='${randomUUID()}' where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(()=>choose()).toThrow(/participants changed/);expect(state()).toBe(before);
 });
 test('ending combat waits until the movement choice is closed',()=>{
  combatFailure();const end=()=>sql(`update combat_encounters set status='ended' where id='${encounter}'`);
  expect(end).toThrow(/Choose or close pending Propel movement/);api('close',{declarationId:id});end();
  expect(()=>choose()).toThrow(/already saved/);
 });
 test('combat clock preparation and direct initiative changes both wait for movement',()=>{
  combatFailure();const turn=sql(`select psionic_turn_id from combat_encounters where id='${encounter}'`);
  expect(()=>sql(auth(`select public.prepare_combat_turn_end('${encounter}','${turn}')`))).toThrow(/Choose or close pending Propel movement/);
  expect(()=>sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`)).toThrow(/Choose or close pending Propel movement/);
  choose();sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);expect(choose()).toMatchObject({replayed:true});
 });
 const api=(operation:string,payload:Record<string,unknown>={},user=owner)=>JSON.parse(sql(auth(`set local role authenticated;select public.propel_movement('${character}','${operation}','${JSON.stringify(payload)}')`,user)));
 test('authenticated recovery discovers and closes an old unresolved choice without spending',()=>{
  start();finish();const before=state();expect(api('list').items.map((r:{request_id:string})=>r.request_id)).toEqual([id]);
  sql(`update characters set level=6 where id='${character}'`);
  expect(api('list').items).toHaveLength(1);
  expect(api('close',{declarationId:id}).movement_choice).toMatchObject({choice:'none',feet:0});
  expect(api('list').items).toHaveLength(0);expect(state()).toBe(before);
  expect(()=>api('choose',{declarationId:id,choice:'warp'})).toThrow(/already saved/);
 });
 test('closing never erases a committed movement and point reads preserve the winner',()=>{
  start();finish();const saved=api('choose',{declarationId:id,choice:'warp'}).movement_choice;
  expect(api('close',{declarationId:id}).movement_choice).toEqual(saved);
  expect(api('read',{declarationId:id}).movement_choice).toEqual(saved);
 });
 test('recovery enforces owner scope and rejects malformed or unsupported operations',()=>{
  start();finish();expect(()=>api('read',{declarationId:id},other)).toThrow();expect(()=>api('list',{},other)).toThrow();
  expect(()=>api('list',{beforeId:id})).toThrow(/cursor/);
  expect(()=>api('begin',{declarationId:id})).toThrow(/Unknown movement operation/);
  expect(()=>api('choose',{declarationId:id,choice:'warp',feet:100})).toThrow(/Invalid movement request/);
 });
 test('closure cannot bypass an unresolved save',()=>{
  start();expect(()=>api('close',{declarationId:id})).toThrow(/final save/);expect(api('list').items).toHaveLength(0);
 });
 test('concurrent completion returns one saved choice without further spending',async()=>{
  start();finish();const before=state();
  const run=promisify(execFile);
  const results=await Promise.all([1,2].map(()=>run('docker',[...args,'-c',auth(choiceSql())])));
  const receipts=results.map(r=>JSON.parse(r.stdout.trim()));
  expect(receipts.filter(r=>r.replayed)).toHaveLength(1);expect(receipts.every(r=>r.feet===30)).toBe(true);expect(state()).toBe(before);
 });
});
