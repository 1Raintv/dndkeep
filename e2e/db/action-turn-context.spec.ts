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
 const powerSql=(id:string,mode='powered',movement='push',roll=4,target={participantId:enemy,legalTargetConfirmed:true})=>
  `select dndkeep_private.begin_propel('${character}','${id}','${context().turnId}','${mode}','${movement}',${roll},'${JSON.stringify(target)}')`;
 const finalizePower=(id:string)=>sql(auth(`select dndkeep_private.finalize_propel_roll('${character}','${id}')`));
 const finishPower=(id:string,outcome:string)=>`select dndkeep_private.finish_propel('${character}','${id}','${outcome}')`;
 const energy=()=>Number(sql(`select coalesce(class_resources->>'psionic-energy-dice','6') from characters where id='${character}'`));
 test('Propel commits its action before the save and spends the Energy Die only on failure',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":2}' where id='${character}'`);
  const first=randomUUID();sql(auth(powerSql(first)));expect(energy()).toBe(2);
  expect(()=>sql(auth(finishPower(first,'failed')))).toThrow(/Finalize the roll/);
  expect(()=>sql(auth(powerSql(randomUUID())))).toThrow(/already spent/);
  finalizePower(first);expect(JSON.parse(sql(auth(finishPower(first,'passed'))))).toMatchObject({energyCost:0,feet:0});expect(energy()).toBe(2);
  next(1);next(0,2);const second=randomUUID();sql(auth(powerSql(second)));finalizePower(second);
  expect(JSON.parse(sql(auth(finishPower(second,'failed'))))).toMatchObject({energyCost:1,feet:20});expect(energy()).toBe(1);
  expect(JSON.parse(sql(auth(finishPower(second,'failed')))).replayed).toBe(true);expect(energy()).toBe(1);
  expect(()=>sql(auth(finishPower(second,'passed')))).toThrow(/already saved/);
 });
 test('Propel fixes the declaration identity and rejects caster/foreign/unconfirmed targets before charging',()=>{
  for(const target of [{participantId:participant,legalTargetConfirmed:true},{participantId:randomUUID(),legalTargetConfirmed:true},{participantId:enemy,legalTargetConfirmed:false}])
   expect(()=>sql(auth(powerSql(randomUUID(),'powered','push',4,target)))).toThrow();
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('0');
  const id=randomUUID(),request=powerSql(id);sql(auth(request));expect(JSON.parse(sql(auth(request))).replayed).toBe(true);
  expect(()=>sql(auth(powerSql(id,'powered','push',5)))).toThrow(/identity changed/);
 });
 test('free Warp and Psykinetic d4 require their subclass and do not spend Energy Dice',()=>{
  expect(()=>sql(auth(powerSql(randomUUID(),'free','warp',0)))).toThrow(/Psi Warper/);
  sql(`update characters set subclass='Psi Warper',class_resources='{"psionic-energy-dice":0}' where id='${character}'`);
  const warp=randomUUID();sql(auth(powerSql(warp,'free','warp',0)));finalizePower(warp);
  expect(JSON.parse(sql(auth(finishPower(warp,'failed'))))).toMatchObject({movement:'warp',feet:30,energyCost:0});
  next(1);next(0,2);sql(`update characters set subclass='Psykinetic' where id='${character}'`);
  const technique=randomUUID();sql(auth(powerSql(technique,'technique','push',4)));finalizePower(technique);
  expect(JSON.parse(sql(auth(finishPower(technique,'failed'))))).toMatchObject({feet:20,energyCost:0});expect(energy()).toBe(0);
 });
 test('Propel enhancement payments are linked, replay-safe, and frozen before the save',()=>{
  sql(`update characters set level=20,hit_dice_spent=0,class_resources='{"psionic-energy-dice":2}' where id='${character}'`);
  const id=randomUUID(),extra=randomUUID(),surge=randomUUID();sql(auth(powerSql(id,'powered','push',1)));
  const enhance=(request:string,kind:string,rolls:string,hitDie:string)=>`select dndkeep_private.enhance_propel('${character}','${id}','${request}','${kind}',${rolls},${hitDie})`;
  const extraSql=enhance(extra,'enkindled','array[2,6]','null');sql(auth(extraSql));sql(auth(extraSql));
  const surgeSql=enhance(surge,'surge','null','6');sql(auth(surgeSql));sql(auth(surgeSql));
  const saved=JSON.parse(finalizePower(id));expect(saved).toMatchObject({total:14,usedSurge:true,originalRolls:[1,2,6],rolls:[4,4,6]});
  expect(()=>sql(auth(enhance(randomUUID(),'surge','null','6')))).toThrow(/already closed/);
  expect(JSON.parse(sql(auth(finishPower(id,'failed'))))).toMatchObject({feet:70,energyCost:1});
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('3');expect(energy()).toBe(1);
 });
 test('cancellation keeps the action and paid enhancements but spends no Energy Die',()=>{
  sql(`update characters set level=7,hit_dice_spent=0,class_resources='{"psionic-energy-dice":2}' where id='${character}'`);
  const id=randomUUID();sql(auth(powerSql(id,'powered','push',1)));
  sql(auth(`select dndkeep_private.enhance_propel('${character}','${id}','${randomUUID()}','surge',null,6)`));
  expect(JSON.parse(sql(auth(finishPower(id,'cancelled'))))).toMatchObject({energyCost:0,feet:0});expect(energy()).toBe(2);
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
  expect(()=>sql(auth(powerSql(randomUUID())))).toThrow(/already spent/);
 });
 test('failed Propel payment preserves the unresolved result for the same saved roll',()=>{
  const id=randomUUID();sql(auth(powerSql(id)));finalizePower(id);sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);
  expect(()=>sql(auth(finishPower(id,'failed')))).toThrow(/Not enough/);
  expect(sql(`select outcome is null from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('t');
  sql(`update characters set class_resources='{"psionic-energy-dice":1}' where id='${character}'`);
  expect(JSON.parse(sql(auth(finishPower(id,'failed'))))).toMatchObject({energyCost:1,feet:20});
 });
 test('concurrent failed-save acknowledgements charge only one Energy Die',async()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":2}' where id='${character}'`);const id=randomUUID();sql(auth(powerSql(id)));finalizePower(id);
  const q=auth(finishPower(id,'failed'));const results=await Promise.all([parallel(q),parallel(q)]);
  expect(results.map(r=>r.code)).toEqual([0,0]);expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(energy()).toBe(1);
 });
 test('saved Propel declarations remain discoverable across cursor pages without browser state',()=>{
  const ids=Array.from({length:27},()=>randomUUID());
  const statements=ids.map((id,i)=>`update combat_encounters set round_number=${i+2} where id='${encounter}';select dndkeep_private.begin_propel('${character}','${id}',(select psionic_turn_id::text from combat_encounters where id='${encounter}'),'free','push',0,'{"participantId":"${enemy}","legalTargetConfirmed":true}')`);
  sql(auth(statements.join(';')));
  const first=JSON.parse(sql(auth(`select dndkeep_private.list_propel('${character}')`)));expect(first.items).toHaveLength(25);
  const cursor=first.nextCursor;
  const second=JSON.parse(sql(auth(`select dndkeep_private.list_propel('${character}','${cursor.createdAt}','${cursor.requestId}')`)));expect(second.items).toHaveLength(2);expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items,...second.items].map(d=>d.request_id))).toEqual(new Set(ids));
  expect(JSON.parse(sql(auth(`select dndkeep_private.read_propel('${character}','${ids[0]}')`))).caster_snapshot.id).toBe(character);
 });
 test('secondary Psion levels determine the saved Propel die and Warp eligibility',()=>{
  sql(`update characters set class_name='Fighter',level=5,subclass='Champion',secondary_class='Psion',secondary_level=3,secondary_subclass='Psi Warper',class_resources='{"psionic-energy-dice":2}' where id='${character}'`);
  expect(()=>sql(auth(powerSql(randomUUID(),'powered','warp',7)))).toThrow(/base roll/);
  const id=randomUUID();expect(JSON.parse(sql(auth(powerSql(id,'powered','warp',6)))).psion_level).toBe(3);
  finalizePower(id);expect(JSON.parse(sql(auth(finishPower(id,'failed'))))).toMatchObject({feet:30,energyCost:1,movement:'warp'});
 });
 test('powered Warp keeps its fixed teleport limit even with an enhanced roll',()=>{
  sql(`update characters set level=7,subclass='Psi Warper',hit_dice_spent=0,class_resources='{"psionic-energy-dice":2}' where id='${character}'`);
  const id=randomUUID();sql(auth(powerSql(id,'powered','warp',1)));
  sql(auth(`select dndkeep_private.enhance_propel('${character}','${id}','${randomUUID()}','surge',null,6)`));finalizePower(id);
  expect(JSON.parse(sql(auth(finishPower(id,'failed'))))).toMatchObject({feet:30,energyCost:1,movement:'warp',roll:{total:4}});
 });
 test('authenticated Propel facade checks ownership and preserves the saved flow',()=>{
  const asUser=(who:string,operation:string,payload:Record<string,unknown>={})=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${who}","role":"authenticated"}';select public.psionic_propel('${character}','${operation}','${JSON.stringify(payload)}');commit;`;
  const ctx=JSON.parse(sql(asUser(owner,'context')));expect(ctx.bonusAvailable).toBe(true);
  expect(()=>sql(asUser(other,'context'))).toThrow(/unavailable/);
  const id=randomUUID();const begun=JSON.parse(sql(asUser(owner,'begin',{requestId:id,turnId:ctx.turnId,mode:'free',movement:'push',roll:0,target:{participantId:enemy,legalTargetConfirmed:true}})));
  expect(begun.request_id).toBe(id);expect(JSON.parse(sql(asUser(owner,'context'))).bonusAvailable).toBe(false);
  expect(JSON.parse(sql(asUser(owner,'list'))).items[0].request_id).toBe(id);
  sql(asUser(owner,'finalize',{declarationId:id}));expect(JSON.parse(sql(asUser(owner,'finish',{declarationId:id,outcome:'passed'}))).result.energyCost).toBe(0);
  expect(sql(`select has_function_privilege('anon','public.psionic_propel(uuid,text,jsonb)','EXECUTE')`)).toBe('f');
 });
 test('recovery reads paid Propel extras and Surge before finalization',()=>{
  sql(`update characters set level=20,subclass='Psi Warper',hit_dice_spent=0,class_resources='{"psionic-energy-dice":12}' where id='${character}'`);
  const id=randomUUID();sql(auth(powerSql(id,'powered','warp',1)));
  const read=()=>JSON.parse(sql(auth(`select public.psionic_propel('${character}','enhancements','{"declarationId":"${id}"}')`)));
  expect(read()).toEqual({declarationId:id,extraRolls:[],usedSurge:false});
  sql(auth(`select dndkeep_private.enhance_propel('${character}','${id}','${randomUUID()}','enkindled',array[2,6],null)`));
  expect(read()).toEqual({declarationId:id,extraRolls:[2,6],usedSurge:false});
  sql(auth(`select dndkeep_private.enhance_propel('${character}','${id}','${randomUUID()}','surge',null,6)`));
  expect(read()).toEqual({declarationId:id,extraRolls:[2,6],usedSurge:true});
  expect(JSON.parse(sql(auth(`select dndkeep_private.read_propel('${character}','${id}')`))).roll_result).toBeNull();
  expect(()=>sql(auth(`select public.psionic_propel('${character}','enhancements','{"declarationId":"${randomUUID()}"}')`))).toThrow(/unavailable/);
 });
 test('Propel resolution retains save evidence and exactly one history entry on replay',()=>{
  const id=randomUUID();sql(auth(powerSql(id,'powered','push',4)));finalizePower(id);
  const save={participantId:enemy,outcome:'failed',dc:15,d20:3,bonus:2,total:5,rolls:[3],advantage:false,naturalExtremes:false};
  const resolve=`select public.psionic_propel('${character}','finish','${JSON.stringify({declarationId:id,outcome:'failed',save})}')`;
  const first=JSON.parse(sql(auth(resolve)));expect(first.save_details).toEqual(save);expect(first.result.energyCost).toBe(1);
  const remaining=sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`);
  expect(JSON.parse(sql(auth(resolve))).replayed).toBe(true);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe(remaining);
  expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('1');
  expect(sql(`select notes from action_logs where id='${id}'`)).toContain('kept 3 + bonus 2 = 5');
  expect(()=>sql(auth(`select public.psionic_propel('${character}','finish','${JSON.stringify({declarationId:id,outcome:'failed',save:{...save,dc:16}})}')`))).toThrow(/already saved/);
 });
 test('invalid Propel save details cannot finish or charge the declaration',()=>{
  const id=randomUUID();sql(auth(powerSql(id,'powered','push',4)));finalizePower(id);
  const before=sql(`select class_resources from characters where id='${character}'`);
  const save={participantId:enemy,outcome:'failed',dc:15,d20:3,bonus:2,total:5,rolls:[3],advantage:false,naturalExtremes:false};
  for(const patch of [{participantId:participant},{total:6},{rolls:[2]},{advantage:true},{dc:1},{d20:3.5}]){
   expect(()=>sql(auth(`select public.psionic_propel('${character}','finish','${JSON.stringify({declarationId:id,outcome:'failed',save:{...save,...patch}})}')`))).toThrow(/invalid/i);
  }
  expect(sql(`select class_resources from characters where id='${character}'`)).toBe(before);
  expect(sql(`select outcome is null from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('t');
  expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('0');
 });
 test('a Propel history failure rolls back the outcome and Energy Die charge',()=>{
  const id=randomUUID();sql(auth(powerSql(id,'powered','push',4)));finalizePower(id);
  const before=sql(`select class_resources from characters where id='${character}'`);
  sql(`insert into action_logs(id,character_id,action_name) values('${id}','${character}','Collision fixture')`);
  expect(()=>sql(auth(`select public.psionic_propel('${character}','finish','{"declarationId":"${id}","outcome":"failed"}')`))).toThrow(/duplicate key/);
  expect(sql(`select class_resources from characters where id='${character}'`)).toBe(before);
  expect(sql(`select outcome is null from dndkeep_private.propel_declarations where request_id='${id}'`)).toBe('t');
  sql(`delete from action_logs where id='${id}'`);
 });
 test('concurrent Propel confirmations share one history entry and one die cost',async()=>{
  const id=randomUUID();sql(auth(powerSql(id,'powered','push',4)));finalizePower(id);
  const query=auth(`select public.psionic_propel('${character}','finish','{"declarationId":"${id}","outcome":"failed"}')`);
  const results=await Promise.all([parallel(query),parallel(query)]);expect(results.map(r=>r.code)).toEqual([0,0]);
  expect(sql(`select count(*) from action_logs where id='${id}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('5');
 });
 test('shared budget read combines claims and combat flags without refunding off-turn use',()=>{
  const read=(user=owner)=>JSON.parse(sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';select public.get_action_budget('${character}');commit;`));
  const id=randomUUID();sql(auth(powerSql(id,'free','push',0)));
  expect(read().spent).toEqual({action:false,bonusAction:true,reaction:false});expect(read().claimed.bonusAction).toBe(true);
  sql(`update combat_participants set reaction_used=true where id='${participant}'`);next(1);
  expect(read().spent).toEqual({action:false,bonusAction:true,reaction:true});
  next(0,2);sql(`update combat_participants set reaction_used=false where id='${participant}'`);
  expect(read().spent).toEqual({action:false,bonusAction:false,reaction:false});
  expect(()=>read(other)).toThrow(/unavailable/);
  expect(sql(`select has_function_privilege('anon','public.get_action_budget(uuid)','EXECUTE')`)).toBe('f');
 });
 const flags=()=>JSON.parse(sql(`select jsonb_build_object('action',action_used,'bonus',bonus_used,'reaction',reaction_used,'attacks',attacks_remaining) from combat_participants where id='${participant}'`));
 test('Propel mirrors its Bonus Action and stale resets cannot refund it',()=>{
  const id=randomUUID(),query=powerSql(id,'free','push',0);sql(auth(query));
  expect(flags().bonus).toBe(true);
  sql(`update combat_participants set bonus_used=false where id='${participant}'`);expect(flags().bonus).toBe(true);
  finalizePower(id);sql(auth(finishPower(id,'cancelled')));expect(flags().bonus).toBe(true);
  next(1);expect(flags().bonus).toBe(true);next(0,2);expect(flags().bonus).toBe(false);
  sql(auth(query));expect(flags().bonus).toBe(false);
 });
 test('mirrored reactions reset only on the next own turn and token expiry cannot refund them',()=>{
  next(1);sql(auth(claimSql(randomUUID(),input({kind:'reaction',grantId:'normal:reaction',purpose:'magic'}))));
  expect(flags().reaction).toBe(true);
  sql(`update dndkeep_private.psionic_turn_starts set token=gen_random_uuid() where character_id='${character}';update combat_participants set reaction_used=false where id='${participant}'`);
  expect(flags().reaction).toBe(true);next(1,2);expect(flags().reaction).toBe(true);
  next(0,3);expect(flags().reaction).toBe(false);
 });
 test('a reaction before the first observed own turn refreshes on that first turn',()=>{
  next(1);sql(`update dndkeep_private.psionic_turn_starts set context='{}' where character_id='${character}'`);
  sql(auth(claimSql(randomUUID(),input({kind:'reaction',grantId:'normal:reaction',purpose:'magic'}))));
  expect(flags().reaction).toBe(true);next(0,2);expect(flags().reaction).toBe(false);
 });
 test('failed declarations roll back mirrored combat spending',()=>{
  expect(()=>sql(auth(claimSql(randomUUID(),input())+`;do $$begin raise exception 'forced failure';end$$`))).toThrow(/forced failure/);
  expect(flags().bonus).toBe(false);
 });
 test('normal non-Attack actions mirror without exhausting unrelated attacks or extra grants',()=>{
  sql(`update combat_participants set attacks_per_action=2,attacks_remaining=2 where id='${participant}'`);
  sql(auth(claimSql(randomUUID(),input({kind:'action',grantId:'normal:action',purpose:'magic'}))));
  expect(flags()).toMatchObject({action:true,bonus:false,reaction:false,attacks:2});
  next(1);next(0,2);expect(flags().action).toBe(false);
  sql(auth(claimSql(randomUUID(),input({kind:'action',grantId:'normal:action',purpose:'attack'}))));
  expect(flags()).toMatchObject({action:false,attacks:2});
  const grant=randomUUID();sql(`insert into dndkeep_private.action_extra_grants(id,character_id,owner_turn_id,source) values('${grant}','${character}','${context().ownerTurnId}','haste')`);
  sql(auth(claimSql(randomUUID(),input({kind:'action',grantId:'extra:'+grant,purpose:'dash'}))));
  expect(flags().action).toBe(false);
 });
 const prepareSpells=()=>sql(`update characters set current_hp=20,max_hp=20,spell_sources='{"misty-step":["class:Psion"],"light":["class:Psion"]}',spell_preparation_sources='{"misty-step":["class:Psion"]}',prepared_spells=array['misty-step'],spell_slots='{"2":{"total":3,"used":0}}' where id='${character}';update combatants set current_hp=20 where id=(select combatant_id from combat_participants where id='${participant}')`);
 const spellQuery=(id:string,kind='bonusAction',slot=2)=>`select public.declare_spell_cast_atomic('${id}','${character}','${participant}','${slot?'misty-step':'light'}','Spell',${slot},${slot?"'"+sql(`select spell_slots->'2' from characters where id='${character}'`)+"'":'null'},'${JSON.stringify({source:'class:Psion',spellLevel:slot,isBonusAction:kind==='bonusAction',actionKind:kind})}')`;
 test('Propel and a Bonus Action spell compete before a slot or declaration is spent',()=>{
  prepareSpells();sql(auth(powerSql(randomUUID(),'free','push',0)));
  expect(()=>sql(auth(spellQuery(randomUUID())))).toThrow(/already spent/);
  expect(sql(`select spell_slots->'2'->>'used' from characters where id='${character}'`)).toBe('0');
  expect(sql(`select count(*) from pending_spell_casts where caster_character_id='${character}'`)).toBe('0');
  next(1);next(0,2);sql(auth(spellQuery(randomUUID())));
  expect(flags().bonus).toBe(true);expect(()=>sql(auth(powerSql(randomUUID(),'free','push',0)))).toThrow(/already spent/);
 });
 test('cantrip action claims and paid Bonus Action spells share budgets without conflating slot limits',()=>{
  prepareSpells();const id=randomUUID(),q=spellQuery(id,'action',0);sql(auth(q));
  expect(flags().action).toBe(true);sql(auth(spellQuery(randomUUID())));
  expect(()=>sql(auth(spellQuery(randomUUID(),'action',0)))).toThrow(/already spent/);
  next(1);next(0,2);sql(auth(q));expect(flags().action).toBe(false);
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('1');
 });
 test('spell action validation rejects missing actions and off-turn actions without payment',()=>{
  prepareSpells();expect(()=>sql(auth(spellQuery(randomUUID(),'unknown')))).toThrow(/action context/);
  expect(()=>sql(auth(spellQuery(randomUUID()).replace(',\"actionKind\":\"bonusAction\"','')))).toThrow(/action context/);
  next(1);expect(()=>sql(auth(spellQuery(randomUUID())))).toThrow(/own turn/);
  expect(sql(`select spell_slots->'2'->>'used' from characters where id='${character}'`)).toBe('0');
 });
 test('concurrent Propel and spell declarations have exactly one Bonus Action winner',async()=>{
  prepareSpells();const outcomes=await Promise.all([parallel(auth(powerSql(randomUUID(),'free','push',0))),parallel(auth(spellQuery(randomUUID())))]);
  expect(outcomes.filter(o=>o.code===0)).toHaveLength(1);expect(outcomes.find(o=>o.code!==0)?.error).toMatch(/already spent/);
  expect(flags().bonus).toBe(true);expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('1');
 });
 test('keeps all clock functions and tables inaccessible to direct app callers',()=>{
  for(const role of ['anon','authenticated']){
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.action_turn_context(uuid)','EXECUTE')`)).toBe('f');
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.observe_action_epoch()','EXECUTE')`)).toBe('f');
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.claim_action(uuid,uuid,jsonb)','EXECUTE')`)).toBe('f');
   for(const fn of ['mirror_action_claim','retain_claimed_combat_flags','refresh_claimed_combat_flags'])expect(sql(`select has_function_privilege('${role}','dndkeep_private.${fn}()','EXECUTE')`)).toBe('f');
   for(const signature of ['begin_propel(uuid,uuid,text,text,text,integer,jsonb)','enhance_propel(uuid,uuid,uuid,text,integer[],integer)','finalize_propel_roll(uuid,uuid)','finish_propel(uuid,uuid,text)','read_propel(uuid,uuid)','list_propel(uuid,timestamp with time zone,uuid)','resolve_propel(uuid,uuid,text,jsonb)'])expect(sql(`select has_function_privilege('${role}','dndkeep_private.${signature}','EXECUTE')`)).toBe('f');
   for(const table of ['psionic_turn_starts','action_claims','action_extra_grants','propel_declarations','propel_enhancements'])expect(sql(`select has_table_privilege('${role}','dndkeep_private.${table}','SELECT,INSERT,UPDATE,DELETE')`)).toBe('f');
  }
 });
});
