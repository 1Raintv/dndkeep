import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(query:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
function parallel(query:string){return new Promise<{code:number|null;out:string;error:string}>(resolve=>{
 const child=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1']);let out='',error='';
 child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(query);
});}
test.describe('Private action turn context' ,()=>{
 gateDbSuite();let owner:string,other:string,character:string,campaign:string,encounter:string,participant:string,enemy:string;
 test.beforeEach(()=>{
  [owner,other,character,campaign,encounter,participant,enemy]=Array.from({length:7},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@action.local','{}'),('${other}','${other}@action.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Action clock');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${participant}','${encounter}','${campaign}','character','${character}','Psion',0),
   ('${enemy}','${encounter}','${campaign}','creature','${enemy}','Enemy',1);`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});
 const context=(user?:string)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${user??owner}","role":"authenticated"}';select dndkeep_private.action_turn_context('${character}');commit;`));
 const next=(index:number,round=1)=>sql(`update combat_encounters set current_turn_index=${index},round_number=${round} where id='${encounter}'`);
 test('keeps the owner refresh clock across enemy turns and refreshes on its own turn',()=>{
  const first=context();expect(first).toMatchObject({actorId:character,encounterId:encounter,participantId:participant,isOwnTurn:true});
  expect(context()).toEqual(first);next(1);const enemyTurn=context();expect(enemyTurn.turnId).not.toBe(first.turnId);
  expect(enemyTurn.ownerTurnId).toBe(first.ownerTurnId);expect(enemyTurn.isOwnTurn).toBe(false);
  next(0,2);const own=context();expect(own.isOwnTurn).toBe(true);expect(own.ownerTurnId).toContain(encounter+':');expect(own.ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('records unseen own turns even when no client reads during them',()=>{
  const first=context();next(1);next(0,2);next(1,2);const after=context();
  expect(after.isOwnTurn).toBe(false);expect(after.ownerTurnId).not.toBe(first.ownerTurnId);expect(after.ownerTurnId).not.toBe(after.turnId);
 });
 test('unrelated encounter edits do not refill action clocks',()=>{
  const first=context();sql(`update combat_encounters set round_number=round_number where id='${encounter}'`);expect(context()).toEqual(first);
 });
 test('rewinding initiative gets a fresh own-turn identity',()=>{
  const first=context();next(1);next(0);expect(context().ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('initial off-turn context remains stable until the first own turn',()=>{
  // No own-turn read occurred: use the encounter-start epoch, not enemy turn.
  next(1);const first=context();next(1,2);const nextEnemy=context();
  expect(nextEnemy.turnId).not.toBe(first.turnId);expect(nextEnemy.ownerTurnId).toBe(first.ownerTurnId);
  next(0,3);expect(context().ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('solo context is stable and changes only on confirmed solo advancement',()=>{
  sql(`delete from combat_encounters where id='${encounter}'`);const first=context();
  expect(first).toMatchObject({isOwnTurn:true,encounterId:null,participantId:null});expect(context()).toEqual(first);
  sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select advance_psionic_solo_turn('${character}','${randomUUID()}',0);commit;`);
  expect(context().ownerTurnId).not.toBe(first.ownerTurnId);
 });
 test('rejects another owner, duplicate participation, tied positions and missing current actors',()=>{
  expect(()=>context(other)).toThrow(/unavailable/);
  const duplicate=randomUUID(),secondEncounter=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${secondEncounter}','${campaign}','active',0);insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${duplicate}','${secondEncounter}','${campaign}','character','${character}','Duplicate',2)`);
  expect(()=>context()).toThrow(/duplicate/);sql(`delete from combat_encounters where id='${secondEncounter}'`);
  sql(`update combat_participants set turn_order=0 where id='${enemy}'`);expect(()=>context()).toThrow(/tied/);
  sql(`update combat_participants set turn_order=1 where id='${enemy}'`);next(9);expect(()=>context()).toThrow(/current actor/);
 });
 test('reopening combat does not manufacture another off-turn reaction',()=>{
  const first=context();next(1);sql(`update combat_encounters set status='ended' where id='${encounter}';update combat_encounters set status='active' where id='${encounter}'`);
  const restarted=context();expect(restarted.isOwnTurn).toBe(false);expect(restarted.ownerTurnId).toBe(first.ownerTurnId);
 });
 test('skips dead participants using the same actor selection as Psion effect expiry',()=>{
  sql(`update combatants set is_dead=true where id=(select combatant_id from combat_participants where id='${enemy}');update combat_participants set turn_order=-1 where id='${enemy}'`);
  expect(context().isOwnTurn).toBe(true);
  expect(sql(`select dndkeep_private.current_psionic_character('${encounter}',0)`)).toBe(character);
 });
 test('effect expiry does not refund the action budget',()=>{
  const first=context();sql(`update dndkeep_private.psionic_turn_starts set token=gen_random_uuid() where character_id='${character}'`);
  expect(context().ownerTurnId).toBe(first.ownerTurnId);
 });
 const auth=(query:string)=>`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';${query};commit;`;
 const input=(patch:Record<string,unknown>={})=>({turnId:context().turnId,grantId:'normal:bonusAction',kind:'bonusAction',purpose:'feature',sourceId:'telekinetic-propel',...patch});
 const claimSql=(request:string,payload:ReturnType<typeof input>)=>`select dndkeep_private.claim_action('${character}','${request}','${JSON.stringify(payload)}')`;
 test('two tabs cannot spend the same Bonus Action, and exact retries return one claim',async()=>{
  const request=randomUUID(),payload=input(),q=auth(claimSql(request,payload));
  const retries=await Promise.all([parallel(q),parallel(q)]);expect(retries.map(r=>r.code)).toEqual([0,0]);
  expect(retries.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
  expect(()=>sql(auth(claimSql(randomUUID(),{...payload,sourceId:'warp-propel'})))).toThrow(/already spent/);
  expect(()=>sql(auth(claimSql(request,{...payload,purpose:'magic'})))).toThrow(/identity changed/);
 });
 test('different concurrent declarations have exactly one winner',async()=>{
  const payload=input();const results=await Promise.all([parallel(auth(claimSql(randomUUID(),payload))),parallel(auth(claimSql(randomUUID(),payload)))]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('already spent');
 });
 test('old retries do not consume a newer own-turn Bonus Action',()=>{
  const request=randomUUID(),payload=input();const first=JSON.parse(sql(auth(claimSql(request,payload))));next(1);next(0,2);
  expect(JSON.parse(sql(auth(claimSql(request,payload))))).toEqual({...first,replayed:true});
  expect(JSON.parse(sql(auth(claimSql(randomUUID(),input())))).replayed).toBe(false);
 });
 test('off-turn actions fail, but a reaction stays spent through subsequent enemy turns',()=>{
  next(1);const offTurn=input();expect(()=>sql(auth(claimSql(randomUUID(),offTurn)))).toThrow(/own turn/);
  const reaction=input({kind:'reaction',grantId:'normal:reaction',sourceId:'shield',purpose:'magic'});
  sql(auth(claimSql(randomUUID(),reaction)));next(1,2);
  expect(()=>sql(auth(claimSql(randomUUID(),{...reaction,turnId:context().turnId})))).toThrow(/already spent/);
  next(0,3);expect(JSON.parse(sql(auth(claimSql(randomUUID(),{...reaction,turnId:context().turnId})))).replayed).toBe(false);
 });
 test('action claim and a resource payment roll back together',()=>{
  const request=randomUUID(),payload=input();sql(`update characters set class_resources='{"psionic-energy-dice":2}' where id='${character}'`);
  const combined=claimSql(request,payload)+`;select settle_psionic_energy('${character}','${request}','spend',1,array[3],'Telekinetic Propel')`;
  expect(()=>sql(auth(combined+`;do $$begin raise exception 'injected completion failure';end$$`))).toThrow(/injected/);
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('0');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('2');
  sql(auth(combined));expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('1');
 });
 test('extra grants enforce Haste and Action Surge restrictions and immutable replay',()=>{
  for(const source of ['haste','action-surge']){
   const grant=randomUUID(),ownerTurn=context().ownerTurnId;
   sql(`insert into dndkeep_private.action_extra_grants(id,character_id,owner_turn_id,source) values('${grant}','${character}','${ownerTurn}','${source}')`);
   const payload=input({kind:'action',grantId:'extra:'+grant,purpose:'magic'});
   expect(()=>sql(auth(claimSql(randomUUID(),payload)))).toThrow(/cannot fund/);
   const request=randomUUID(),attack={...payload,purpose:'attack'};const first=JSON.parse(sql(auth(claimSql(request,attack))));
   expect(first.attackLimit).toBe(source==='haste'?1:null);
   sql(`update dndkeep_private.action_extra_grants set active=false where id='${grant}'`);
   expect(JSON.parse(sql(auth(claimSql(request,attack))))).toEqual({...first,replayed:true});
  }
 });
 test('blocks unknown grants, stale turns, incapacitation and existing combat flags',()=>{
  expect(()=>sql(auth(claimSql(randomUUID(),input({grantId:'invented'}))))).toThrow(/unavailable/);
  expect(()=>sql(auth(claimSql(randomUUID(),input({turnId:'old'}))))).toThrow(/turn changed/);
  sql(`update combat_participants set bonus_used=true where id='${participant}'`);
  expect(()=>sql(auth(claimSql(randomUUID(),input())))).toThrow(/marked spent/);
  sql(`update combat_participants set bonus_used=false where id='${participant}';update combatants set active_conditions=array['Incapacitated'] where id=(select combatant_id from combat_participants where id='${participant}')`);
  expect(()=>sql(auth(claimSql(randomUUID(),input())))).toThrow(/incapacitated/);
 });
 test('keeps all clock functions and tables inaccessible to direct app callers',()=>{
  for(const role of ['anon','authenticated']){
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.action_turn_context(uuid)','EXECUTE')`)).toBe('f');
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.observe_action_epoch()','EXECUTE')`)).toBe('f');
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.claim_action(uuid,uuid,jsonb)','EXECUTE')`)).toBe('f');
   for(const table of ['psionic_turn_starts','action_claims','action_extra_grants'])expect(sql(`select has_table_privilege('${role}','dndkeep_private.${table}','SELECT,INSERT,UPDATE,DELETE')`)).toBe('f');
  }
 });
});
