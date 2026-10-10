import {readFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(query:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('Telepath attack context',()=>{
 gateDbSuite();let owner:string,other:string,character:string,campaign:string,encounter:string,participant:string,enemy:string;
 test.beforeEach(()=>{
  [owner,other,character,campaign,encounter,participant,enemy]=Array.from({length:7},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@action.local','{}'),('${other}','${other}@action.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Telepath context');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${participant}','${encounter}','${campaign}','character','${character}','Psion',0),
   ('${enemy}','${encounter}','${campaign}','creature','${enemy}','Enemy',1);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}';`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`);});

 let attack:string;
 test.beforeEach(()=>{
  attack=randomUUID();
  sql(`update characters set subclass='Telepath',level=10,current_hp=20,max_hp=20,class_resources='{"psionic-energy-dice":8}' where id='${character}';
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${participant}','Telepath','character','Strike','attack_roll',5,15,'${randomUUID()}')`);
  const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:participant,d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'};
  sql(`update pending_attacks set state='attack_rolled',attack_d20=12,attack_total=17,hit_result='hit',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
 });
 const context=(feature='distraction',user?:string)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${user??owner}","role":"authenticated"}';set local role authenticated;select public.get_telepath_attack_context('${character}','${attack}','${feature}');rollback;`));
 test('returns a scoped current hit without spending and requires spatial review',()=>{
  expect(context()).toMatchObject({characterId:character,psionLevel:10,energyRemaining:8,telepathyRange:60,rangeVerified:true,reactionAvailable:true,spatialReviewRequired:true,subject:{participantId:enemy,self:false},attack:{id:attack,total:17,result:'hit'}});
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('0');
 });
 test('enforces ownership, subclass and level',()=>{
  expect(()=>context('distraction',other)).toThrow();
  sql(`update characters set subclass='Psi Warper' where id='${character}'`);expect(()=>context()).toThrow();
  sql(`update characters set subclass='Telepath',level=2 where id='${character}'`);expect(()=>context()).toThrow();
 });
 test('Bolstering uses the current miss and rejects a hit or low level',()=>{
  expect(()=>context('bolstering')).toThrow();
  sql(`update pending_attacks set target_ac=20,hit_result='miss' where id='${attack}'`);
  expect(context('bolstering')).toMatchObject({attack:{total:17,targetAC:20,result:'miss'}});expect(()=>context()).toThrow();
  sql(`update characters set level=9 where id='${character}'`);expect(()=>context('bolstering')).toThrow();
 });
 test('reports spent Reaction and incapacitation',()=>{
  sql(`update combat_participants set reaction_used=true where id='${participant}'`);expect(context().reactionAvailable).toBe(false);
  sql(`update combat_participants set reaction_used=false where id='${participant}';update combatants set active_conditions=array['Incapacitated'] where id=(select combatant_id from combat_participants where id='${participant}')`);expect(context().reactionAvailable).toBe(false);
 });
 test('rejects changed identities, terminal state and inconsistent outcomes',()=>{
  sql(`update pending_attacks set attacker_participant_id='${participant}' where id='${attack}'`);expect(()=>context()).toThrow();
  sql(`update pending_attacks set attacker_participant_id='${enemy}' where id='${attack}';
   begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';
   select public.attack_reaction_offers('${attack}','post_attack_roll',(select updated_at from pending_attacks where id='${attack}'),array[]::text[]);
   update pending_attacks set state='damage_rolled' where id='${attack}';commit;`);expect(()=>context()).toThrow();
  sql(`update pending_attacks set state='attack_rolled',hit_result='miss' where id='${attack}'`);expect(()=>context('bolstering')).toThrow();
 });
 test('rejects malformed energy pools',()=>{
  sql(`update characters set class_resources='{"psionic-energy-dice":9}' where id='${character}'`);expect(()=>context()).toThrow();
 });
 test('Connection range requires a finished roll and expires with game time',()=>{
  const request=randomUUID();sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select public.psionic_connection('${character}','begin',jsonb_build_object('requestId','${request}','turnId',dndkeep_private.action_turn_context('${character}')->>'turnId','roll',2,'free',true));commit;`);
  expect(context()).toMatchObject({rangeVerified:false,telepathyRange:null});
  sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select public.psionic_connection('${character}','finish',jsonb_build_object('declarationId','${request}'));commit;`);
  expect(context()).toMatchObject({rangeVerified:true,telepathyRange:80});
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3600 where character_id='${character}'`);expect(context().telepathyRange).toBe(60);
 });
 test('rejects an old unresolved attack after advancing, rewinding or leaving combat',()=>{
  sql(`update combat_encounters set current_turn_index=1 where id='${encounter}'`);expect(()=>context()).toThrow();
  sql(`update combat_encounters set current_turn_index=0 where id='${encounter}'`);expect(()=>context()).toThrow();
  sql(`update combat_encounters set status='setup' where id='${encounter}'`);expect(()=>context()).toThrow();
 });
 test('a fresh attack rolled on an enemy turn still permits the off-turn Reaction',()=>{
  sql(`update combat_encounters set current_turn_index=1 where id='${encounter}';delete from pending_attacks where id='${attack}';
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${participant}','Telepath','character','Strike','attack_roll',5,15,'${randomUUID()}')`);
  const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:participant,d20:12,total:17,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'};
  sql(`update pending_attacks set state='attack_rolled',attack_d20=12,attack_total=17,hit_result='hit',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
  const ctx=context();expect(ctx).toMatchObject({reactionAvailable:true,budget:{context:{isOwnTurn:false}}});expect(ctx.attack.triggerTurnId).toBe(ctx.budget.context.turnId);
  const d=beginSaved(3);expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,result:'miss'});
 });
 test('original participant/combatant identities cannot be rebound before reaction preparation',()=>{
  sql(`update combat_participants set entity_id='other' where id='${enemy}'`);expect(()=>context()).toThrow();
  sql(`update combat_participants set entity_id='${enemy}' where id='${enemy}';update combatants set definition_id='different' where id=(select combatant_id from combat_participants where id='${participant}')`);expect(()=>context()).toThrow();
 });
 test('does not invent original context for a legacy roll',()=>{
  sql(`delete from dndkeep_private.attack_reaction_origins where attack_id='${attack}'`);expect(()=>context()).toThrow();
  sql(`update pending_attacks set target_ac=16 where id='${attack}'`);expect(()=>context()).toThrow();
 });
 const beginSaved=(roll:number,feature='distraction',review:unknown={distanceFeet:30,visible:true,confirmed:true},request=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';
  select dndkeep_private.begin_telepath_reaction('${character}','${request}','${attack}','${feature}',dndkeep_private.telepath_attack_context('${character}','${attack}','${feature}'),${roll},'${JSON.stringify(review)}');commit;`));
 const finishSaved=(request:string,cancel=false)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.finish_telepath_reaction('${character}','${request}',${cancel});commit;`));

 const dispatch=(operation:string,payload:unknown,user=owner,actor=character)=>{
  const result=sql(`begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';set local role authenticated;select public.telepath_reaction('${actor}','${operation}','${JSON.stringify(payload).replace(/'/g,"''")}');commit;`);
  return JSON.parse(result);
 };
 const cancelByDm=(request:string,reason='Character left the campaign',user=owner)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';set local role authenticated;select public.cancel_telepath_reaction_by_dm('${request}','${reason.replace(/'/g,"''")}');commit;`));
 test('DM cancellation closes a departed character offer without changing dice or resources',()=>{
  const d=beginSaved(3);
  const before=sql(`select jsonb_build_object('resources',class_resources,'hitDice',hit_dice_spent) from characters where id='${character}'`);
  sql(`update characters set campaign_id=null,user_id='${other}' where id='${character}'`);
  expect(()=>dispatch('cancel',{declarationId:d.request_id})).toThrow();
  expect(()=>cancelByDm(d.request_id,'Owner cannot cancel',other)).toThrow();
  expect(cancelByDm(d.request_id)).toMatchObject({cancelled:true,reactionCost:1,energyCost:0,energy:null,replayed:false});
  expect(cancelByDm(d.request_id,'Different retry note')).toMatchObject({replayed:true,cancelReason:'Character left the campaign'});
  expect(sql(`select jsonb_build_object('resources',class_resources,'hitDice',hit_dice_spent) from characters where id='${character}'`)).toBe(before);
  expect(sql(`select attack_total||':'||hit_result from pending_attacks where id='${attack}'`)).toBe('17:hit');
  expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe('declined');
  expect(sql(`select count(*) from combat_events where payload->>'declaration_id'='${d.request_id}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${d.request_id}'`)).toBe('1');
 });
 test('DM cancellation rejects strangers and invalid reasons without deciding the offer',()=>{
  const d=beginSaved(3);
  expect(()=>cancelByDm(d.request_id,'Unauthorized',other)).toThrow();
  for(const reason of ['', '   ', 'x'.repeat(501)])expect(()=>cancelByDm(d.request_id,reason)).toThrow();
  expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe('offered');
  expect(sql(`select result is null from dndkeep_private.telepath_declarations where request_id='${d.request_id}'`)).toBe('t');
 });
 test('DM cancellation follows current ownership of the original campaign',()=>{
  const d=beginSaved(3);sql(`update campaigns set owner_id='${other}' where id='${campaign}'`);
  expect(()=>cancelByDm(d.request_id)).toThrow();
  expect(cancelByDm(d.request_id,'New DM cleanup',other)).toMatchObject({cancelled:true,canceledBy:other});
 });
 test('DM cancellation cannot undo a settled roll or duplicate a normal cancellation',()=>{
  const d=beginSaved(3);finishSaved(d.request_id);
  expect(()=>cancelByDm(d.request_id)).toThrow();
  expect(sql(`select attack_total from pending_attacks where id='${attack}'`)).toBe('14');
 });
 test('DM cancellation recovers a normal cancellation without adding history',()=>{
  const d=beginSaved(3);finishSaved(d.request_id,true);
  expect(cancelByDm(d.request_id)).toMatchObject({cancelled:true,replayed:true});
  expect(sql(`select count(*) from combat_events where payload->>'declaration_id'='${d.request_id}'`)).toBe('0');
 });
 test('DM cancellation keeps linked enhancement Hit Dice spent after departure',()=>{
  const d=beginSaved(2);enhanceSaved(d.request_id);
  sql(`update characters set campaign_id=null,user_id='${other}' where id='${character}'`);
  expect(cancelByDm(d.request_id)).toMatchObject({cancelled:true,energyCost:0});
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('8');
 });
 test('DM cancellation history failure rolls back the decision and offer together',()=>{
  const d=beginSaved(2),constraint='test_cancel_'+randomUUID().replace(/-/g,'');
  sql(`alter table public.combat_events add constraint ${constraint} check (payload->>'declaration_id' is distinct from '${d.request_id}') not valid`);
  try {
   expect(()=>cancelByDm(d.request_id)).toThrow();
   expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe('offered');
   expect(sql(`select result is null from dndkeep_private.telepath_declarations where request_id='${d.request_id}'`)).toBe('t');
  } finally {sql(`alter table public.combat_events drop constraint ${constraint}`);}
  expect(cancelByDm(d.request_id)).toMatchObject({cancelled:true,replayed:false});
  expect(sql(`select count(*) from combat_events where payload->>'declaration_id'='${d.request_id}'`)).toBe('1');
 });
 test('DM cancellation simultaneous requests create exactly one history event',async()=>{
  const d=beginSaved(2),query=`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;select public.cancel_telepath_reaction_by_dm('${d.request_id}','Concurrent cleanup');commit;`;
  const run=()=>new Promise<Record<string,unknown>>((resolve,reject)=>{
   const process=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';
   process.stdout.on('data',data=>out+=data);process.stderr.on('data',data=>err+=data);process.on('error',reject);
   process.on('close',code=>{if(code)reject(new Error(err));else{try{resolve(JSON.parse(out.trim()));}catch(error){reject(error);}}});process.stdin.end(query);
  });
  const results=await Promise.all([run(),run()]);expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
  expect(sql(`select count(*) from combat_events where payload->>'declaration_id'='${d.request_id}'`)).toBe('1');
 });
 const beginPayload=(roll=3)=>({requestId:randomUUID(),attackId:attack,feature:'distraction',expected:context(),roll,review:{distanceFeet:30,visible:true,confirmed:true}});
 test('authenticated dispatcher recovers the declaration and conditional payment without spending twice',()=>{
  const input=beginPayload();expect(dispatch('context',{attackId:attack,feature:'distraction'})).toEqual(context());expect(dispatch('list',{attackId:attack})).toEqual([]);
  const first=dispatch('begin',input);expect(first).toMatchObject({request_id:input.requestId,result:null,base_roll:3,enhancements:[]});
  expect(dispatch('begin',input).operationResult.replayed).toBe(true);
  expect(dispatch('read',{declarationId:input.requestId})).toMatchObject({request_id:input.requestId,result:null});
  expect(dispatch('list',{attackId:attack})).toHaveLength(1);
  expect(dispatch('finish',{declarationId:input.requestId})).toMatchObject({result:{energyCost:1,total:14,result:'miss'},operationResult:{replayed:false}});
  expect(dispatch('finish',{declarationId:input.requestId})).toMatchObject({operationResult:{replayed:true}});
  expect(dispatch('read',{declarationId:input.requestId}).result.energyCost).toBe(1);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('7');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${input.requestId}'`)).toBe('1');
 });
 test('only DM can begin; the owning member can recover and finish reviewed uses',()=>{
  sql(`update characters set user_id='${other}' where id='${character}';insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${other}','player')`);
  const input=beginPayload();expect(()=>dispatch('begin',input,other)).toThrow(/DM review/);
  dispatch('begin',input);expect(dispatch('list',{attackId:attack},other)).toHaveLength(1);
  expect(dispatch('finish',{declarationId:input.requestId},other).result.energyCost).toBe(1);
  sql(`delete from campaign_members where campaign_id='${campaign}' and user_id='${other}'`);
  for(const op of ['read','finish','cancel'])expect(()=>dispatch(op,{declarationId:input.requestId},other)).toThrow(/Campaign access/);
  expect(()=>dispatch('list',{attackId:attack},other)).toThrow(/Campaign access/);
 });
 test('dispatcher rejects strangers, malformed input and foreign declaration identities',()=>{
  const input=beginPayload();dispatch('begin',input);
  expect(()=>dispatch('read',{declarationId:input.requestId},other)).toThrow();
  expect(()=>dispatch('read',{declarationId:randomUUID()})).toThrow();
  expect(()=>dispatch('finish',{declarationId:input.requestId,energyCost:0})).toThrow(/Unexpected/);
  expect(()=>dispatch('begin',{...input,requestId:randomUUID(),roll:1.5})).toThrow(/Invalid/);
  expect(()=>dispatch('destroy',{})).toThrow(/Invalid/);
  expect(()=>dispatch('read',null)).toThrow(/Invalid/);
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${input.requestId}'`)).toBe('0');
 });
 test('moving a character removes old campaign recovery and attacks cannot move',()=>{
  const input=beginPayload(),next=randomUUID();dispatch('begin',input);
  sql(`insert into campaigns(id,owner_id,name) values('${next}','${other}','Another campaign');insert into campaign_members(campaign_id,user_id,role) values('${next}','${owner}','player')`);
  try{
   expect(()=>sql(`update pending_attacks set campaign_id='${next}' where id='${attack}'`)).toThrow(/cannot be moved/);
   sql(`update characters set campaign_id='${next}' where id='${character}'`);
   expect(()=>dispatch('begin',input)).toThrow(/unavailable/);expect(()=>dispatch('read',{declarationId:input.requestId})).toThrow(/unavailable/);
   expect(()=>dispatch('list',{attackId:attack})).toThrow(/unavailable/);
  }finally{sql(`update characters set campaign_id='${campaign}' where id='${character}';delete from campaigns where id='${next}'`);}
 });
 test('dispatcher recovers linked enhancements and canceled uses without new costs',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}',hit_dice_spent=0 where id='${character}'`);
  const input=beginPayload(1);dispatch('begin',input);
  const enkindled={declarationId:input.requestId,requestId:randomUUID(),kind:'enkindled',extraRolls:[2,3],hitDie:null};
  const surge={declarationId:input.requestId,requestId:randomUUID(),kind:'surge',extraRolls:null,hitDie:6};
  dispatch('enhance',enkindled);const enhanced=dispatch('enhance',surge);
  expect(enhanced.enhancements).toMatchObject([{kind:'enkindled',originalRolls:[1,2,3],extraRolls:[2,3]},{kind:'surge',originalRolls:[1,2,3],rolls:[4,4,4]}]);
  expect(()=>dispatch('enhance',{...surge,requestId:randomUUID(),hitDie:1.5})).toThrow(/Invalid/);
  expect(()=>dispatch('enhance',{...enkindled,requestId:randomUUID(),extraRolls:[1.5]})).toThrow(/Invalid/);
  const before=sql(`select hit_dice_spent||'|'||class_resources from characters where id='${character}'`);
  expect(dispatch('cancel',{declarationId:input.requestId}).result).toMatchObject({cancelled:true,energyCost:0,reactionCost:1});
  expect(dispatch('enhance',surge).operationResult.replayed).toBe(true);
  expect(dispatch('read',{declarationId:input.requestId}).enhancements).toEqual(enhanced.enhancements);
  expect(sql(`select hit_dice_spent||'|'||class_resources from characters where id='${character}'`)).toBe(before);
  expect(()=>dispatch('finish',{declarationId:input.requestId})).toThrow(/decision changed/);
 });
 test('dispatcher recovery does not require current subclass eligibility',()=>{
  const input=beginPayload();dispatch('begin',input);sql(`update characters set subclass='Psi Warper' where id='${character}'`);
  expect(dispatch('read',{declarationId:input.requestId}).result).toBeNull();expect(()=>dispatch('finish',{declarationId:input.requestId})).toThrow(/progression changed/);
  expect(dispatch('cancel',{declarationId:input.requestId}).result.cancelled).toBe(true);
 });

 test('browser dispatcher recovers lost begin and finish replies from saved records',async({page})=>{
  sql(`update auth.users set instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),created_at=now(),updated_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@action.local'),'email',now(),now(),now());`);
  await signInAsSeedDm(page,`${owner}@action.local`);const input=beginPayload();
  await page.evaluate(async({character,input})=>{const {prepareTelepath}=await import('/src/lib/telepathRecovery.ts');const {roll,...request}=input;await prepareTelepath(character,request,()=>roll);},{character,input});
  for(const operation of ['begin','finish']){
   let dropped=0;await page.route('**/rest/v1/rpc/telepath_reaction',async route=>{
    if(route.request().method()!=='POST'||route.request().postDataJSON().p_operation!==operation){await route.continue();return;}
    const response=await route.fetch();expect(response.ok()).toBe(true);dropped++;await route.abort('failed');
   });
   const failed=await page.evaluate(async({character,operation,payload})=>{
    const api=await import('/src/lib/telepathRecovery.ts');try{await api.sendTelepath(character,operation==='begin'?api.pendingTelepath(character)!:{kind:'finish',request:{declarationId:payload.declarationId}});return false;}catch{return true;}
   },{character,operation,payload:operation==='begin'?input:{declarationId:input.requestId}});
   expect(failed).toBe(true);expect(dropped).toBe(2);await page.unroute('**/rest/v1/rpc/telepath_reaction');await page.reload();
   const records=await page.evaluate(async({character,attack})=>{
    const {listTelepathReactions}=await import('/src/lib/api/telepathLifecycle.ts');return await listTelepathReactions(character,attack);
   },{character,attack});
   expect(records).toHaveLength(1);expect(records[0].request_id).toBe(input.requestId);
   if(operation==='begin')expect(records[0].result).toBeNull();else expect(records[0].result?.energyCost).toBe(1);
   const recovered=await page.evaluate(async character=>{const api=await import('/src/lib/telepathRecovery.ts');const draft=api.pendingTelepath(character);if(!draft)throw new Error('Draft lost');await api.sendTelepath(character,draft);return api.pendingTelepath(character);},character);expect(recovered).toBeNull();
  }
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${input.requestId}'`)).toBe('1');
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${input.requestId}'`)).toBe('1');
  await page.close();
 });
 test('browser cross-tab Telepath preparation rolls once',async({page})=>{
  sql(`update auth.users set instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),created_at=now(),updated_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@action.local'),'email',now(),now(),now());`);
  await signInAsSeedDm(page,`${owner}@action.local`);const input=beginPayload();
  const second=await page.context().newPage();await second.goto(page.url());
  const attempts=await Promise.all([page,second].map(tab=>tab.evaluate(async({character,input})=>{
   const api=await import('/src/lib/telepathRecovery.ts');const {roll,...request}=input;let rolls=0;
   try{await api.prepareTelepath(character,request,()=>{rolls++;return roll;});return {ok:true,rolls};}catch{return {ok:false,rolls};}
  },{character,input})));
  expect(attempts.filter(r=>r.ok)).toHaveLength(1);expect(attempts.reduce((sum,r)=>sum+r.rolls,0)).toBe(1);
  expect(sql(`select count(*) from dndkeep_private.telepath_declarations where character_id='${character}'`)).toBe('0');
  await second.close();await page.close();
 });
 for(const cancel of [false,true])test(`browser validates enhanced saved records (cancel=${cancel})`,async({page})=>{
  sql(`update auth.users set instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),created_at=now(),updated_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@action.local'),'email',now(),now(),now());`);
  await signInAsSeedDm(page,`${owner}@action.local`);
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}',hit_dice_spent=0 where id='${character}'`);
  const input=beginPayload(2);dispatch('begin',input);
  for(const enhancement of [{declarationId:input.requestId,requestId:randomUUID(),kind:'enkindled',extraRolls:[2,8],hitDie:null},{declarationId:input.requestId,requestId:randomUUID(),kind:'surge',extraRolls:null,hitDie:6}]){
   await page.evaluate(async({character,enhancement})=>{const api=await import('/src/lib/api/telepathLifecycle.ts');return api.enhanceTelepathReaction(character,enhancement);},{character,enhancement});
  }
  const pending=await page.evaluate(async({character,id})=>{const api=await import('/src/lib/api/telepathLifecycle.ts');return api.readTelepathReaction(character,id);},{character,id:input.requestId});
  expect(pending.enhancements).toHaveLength(2);
  const result=await page.evaluate(async({character,id,cancel})=>{const api=await import('/src/lib/api/telepathLifecycle.ts');return api.finishTelepathReaction(character,id,cancel);},{character,id:input.requestId,cancel});
  expect(result.result).toMatchObject({cancelled:cancel,energyCost:cancel?0:1,reactionCost:1});
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('3');
  await page.close();
 });
 for(const cancel of [false,true])test(`saved Telepath prompt settles enhancements without generic expiry (cancel=${cancel})`,async({page},info)=>{
  const login=cancel?other:owner;
  sql(`update auth.users set instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),created_at=now(),updated_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${login}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${login}','${login}',jsonb_build_object('sub','${login}','email','${login}@action.local'),'email',now(),now(),now());`);
  await signInAsSeedDm(page,`${login}@action.local`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  if(cancel)sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}',hit_dice_spent=0 where id='${character}'`);
  const d=beginSaved(2);if(cancel)sql(`update characters set user_id='${other}' where id='${character}';insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${other}','player')`);sql(`update pending_reactions set expires_at=now()-interval '1 minute' where id='${d.request_id}'`);
  await page.evaluate(async campaign=>{
   const React=await import('/node_modules/.vite/deps/react.js'),dom=await import('/node_modules/.vite/deps/react-dom_client.js'),component=await import('/src/components/Combat/ReactionPromptModal.tsx');
   const host=document.createElement('div');document.body.appendChild(host);dom.default.createRoot(host).render(React.default.createElement(component.default,{campaignId:campaign}));
  },campaign);
  const dialog=page.getByRole('dialog',{name:'Saved Telepath reaction'});await expect(dialog).toContainText('Saved dice: 2 = 2');
  await expect(dialog.getByText('DM cleanup',{exact:true})).toHaveCount(cancel?0:1);await expect(dialog).toContainText('Reaction already spent');await expect(dialog).toContainText('will not expire automatically');
  if(!cancel){await dialog.getByRole('button',{name:'Retry saved request',exact:true}).focus();await page.keyboard.press('Tab');await expect(dialog.locator('summary')).toBeFocused();}
  if(cancel){await dialog.getByRole('button',{name:'Use Enkindled',exact:true}).click();await expect.poll(()=>sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');}
  if(!cancel)await page.route('**/rest/v1/rpc/telepath_reaction',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().p_operation==='enhance'){const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');}else await route.continue();});
  await dialog.getByRole('button',{name:'Use Surge · raise 1–3 to 4',exact:true}).click();
  if(!cancel){await expect(dialog.getByRole('alert')).toBeVisible();await page.unroute('**/rest/v1/rpc/telepath_reaction');await dialog.getByRole('button',{name:'Retry saved request',exact:true}).click();}

  await expect.poll(()=>sql(`select hit_dice_spent from characters where id='${character}'`)).toBe(cancel?'2':'1');
  await expect(dialog.getByRole('button',{name:'Use Surge · raise 1–3 to 4',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('saved-telepath.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  await dialog.getByRole('button',{name:cancel?'Cancel saved use':'Apply saved reaction',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe(cancel?'declined':'accepted');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe(cancel?'12':'7');
  expect(errors).toEqual([]);await page.close();
 });
 test('dispatcher does not expose private records or helper functions directly',()=>{
  expect(sql(`select has_function_privilege('anon','public.telepath_reaction(uuid,text,jsonb)','execute') or has_function_privilege('authenticated','dndkeep_private.telepath_reaction_record(uuid,uuid)','execute') or has_table_privilege('authenticated','dndkeep_private.telepath_declarations','select')`)).toBe('f');
 });
 test('saved Distraction spends Reaction once and charges energy only when the hit becomes a miss',()=>{
  const d=beginSaved(3);expect(d).toMatchObject({base_roll:3,result:null});
  expect(sql(`select reaction_used from combat_participants where id='${participant}'`)).toBe('t');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('8');
  expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow();
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,reactionCost:1,originalTotal:17,total:14,result:'miss',changed:true,replayed:false});
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,total:14,replayed:true});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('7');
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${d.request_id}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${d.request_id}'`)).toBe('1');
  expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe('accepted');
 });
 test('an ineffective Distraction retains its Energy Die and still spends Reaction',()=>{
  const d=beginSaved(2);expect(finishSaved(d.request_id)).toMatchObject({energyCost:0,energy:null,reactionCost:1,total:15,result:'hit',changed:false});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('8');
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${d.request_id}'`)).toBe('0');
 });
 test('Bolstering turns a missed attack into a hit with one conditional payment',()=>{
  sql(`update pending_attacks set target_ac=20,hit_result='miss' where id='${attack}'`);const d=beginSaved(3,'bolstering');
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,total:20,result:'hit',changed:true});
 });

 test('saved Bolstering invalidates a prior empty check and permits the target Shield offer',()=>{
  const defender=randomUUID(),defenderParticipant=randomUUID();
  try{
   sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,known_spells,spell_slots) values('${defender}','${other}','${campaign}','Defender','Human','Wizard','Sage',5,array['shield'],'{"1":{"total":2,"used":0}}');
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${defenderParticipant}','${encounter}','${campaign}','character','${defender}','Defender',2);
    update combatants set definition_id='${defender}' where id=(select combatant_id from combat_participants where id='${defenderParticipant}');
    delete from pending_attacks where id='${attack}';
    insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
    values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${defenderParticipant}','Defender','character','Strike','attack_roll',5,20,'${randomUUID()}');`);
   const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:defenderParticipant,d20:12,total:17,targetAC:20,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'miss'};
   sql(`update pending_attacks set state='attack_rolled',attack_d20=12,attack_total=17,hit_result='miss',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
   const check=(keys:string[]|null)=>sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;
    select public.attack_reaction_offers('${attack}','post_attack_roll',(select updated_at from pending_attacks where id='${attack}'),${keys===null?'null':`array[${keys.map(k=>`'${k}'`).join(',')}]::text[]`});commit;`);
   expect(JSON.parse(check([])).offerCount).toBe(0);
   const d=beginSaved(3,'bolstering');expect(finishSaved(d.request_id)).toMatchObject({energyCost:1,result:'hit',total:20});
   const current=sql(`select revision from dndkeep_private.attack_reaction_revisions where attack_id='${attack}'`);
   expect(check(null)).toBe('');expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Recover the attack reaction check/);
   expect(finishSaved(d.request_id).replayed).toBe(true);expect(sql(`select revision from dndkeep_private.attack_reaction_revisions where attack_id='${attack}'`)).toBe(current);
   expect(JSON.parse(check(['shield'])).offerCount).toBe(1);
   expect(sql(`select reactor_participant_id from pending_reactions where pending_attack_id='${attack}' and reaction_key='shield'`)).toBe(defenderParticipant);
   expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${attack}'`)).toThrow(/Resolve offered reactions/);
  }finally{sql(`delete from characters where id='${defender}'`);}
 });
 test('saved declarations recover exactly and refuse changed rolls on the same identity',()=>{
  const d=beginSaved(3),expected=JSON.stringify(d.context),review=JSON.stringify(d.review);
  const replay=(roll:number)=>sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.begin_telepath_reaction('${character}','${d.request_id}','${attack}','distraction','${expected}',${roll},'${review}');commit;`);
  expect(JSON.parse(replay(3))).toMatchObject({replayed:true,base_roll:3});expect(()=>replay(4)).toThrow();
  expect(()=>beginSaved(3)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,reactionCost:1,energyCost:0});
  expect(()=>finishSaved(d.request_id)).toThrow();
 });
 test('range, visibility, resource and die validation happen before the Reaction claim',()=>{
  for(const review of [{distanceFeet:61,visible:true,confirmed:true},{distanceFeet:30,visible:false,confirmed:true},{distanceFeet:30,visible:true,confirmed:false}])expect(()=>beginSaved(3,'distraction',review)).toThrow();
  expect(()=>beginSaved(9)).toThrow();
  sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);expect(()=>beginSaved(3)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('0');
 });
 test('changed attack or depleted energy never partially settles the saved result',()=>{
  const d=beginSaved(3);sql(`update characters set class_resources='{"psionic-energy-dice":0}' where id='${character}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(sql(`select attack_total from pending_attacks where id='${attack}'`)).toBe('17');
  expect(sql(`select result is null from dndkeep_private.telepath_declarations where request_id='${d.request_id}'`)).toBe('t');
  sql(`update characters set class_resources='{"psionic-energy-dice":8}' where id='${character}';update pending_attacks set target_ac=16 where id='${attack}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0});
 });
 test('timer/decline/delete cannot erase a paid Reaction before explicit saved cancellation',()=>{
  const d=beginSaved(3);
  for(const state of ['expired','declined','accepted'])expect(()=>sql(`update pending_reactions set state='${state}' where id='${d.request_id}'`)).toThrow();
  expect(()=>sql(`delete from pending_reactions where id='${d.request_id}'`)).toThrow();
  expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true});
  expect(sql(`select state from pending_reactions where id='${d.request_id}'`)).toBe('declined');
  expect(()=>sql(`update pending_reactions set state='offered' where id='${d.request_id}'`)).toThrow();
 });
 test('rebound participants and changed turns require cancellation without spending energy',()=>{
  const d=beginSaved(3);sql(`update combat_participants set entity_id='other-creature' where id='${enemy}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(sql(`select attack_total from pending_attacks where id='${attack}'`)).toBe('17');
  sql(`update combat_participants set entity_id='${enemy}' where id='${enemy}';update combat_encounters set current_turn_index=1 where id='${encounter}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0});
 });
 test('changed Psion progression requires cancellation, and saved payments remain untouched',()=>{
  const d=beginSaved(3);sql(`update characters set subclass='Psi Warper' where id='${character}'`);
  expect(()=>finishSaved(d.request_id)).toThrow();expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0});
 });
 test('a natural 20 remains a critical hit even after Distraction lowers its total',()=>{
  // A new original roll, never a rewrite of immutable evidence.
  sql(`delete from pending_attacks where id='${attack}';insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${attack}','${campaign}','${encounter}','${enemy}','Enemy','monster','${participant}','Telepath','character','Strike','attack_roll',0,20,'${randomUUID()}')`);
  const snapshot={version:1,attackId:attack,campaignId:campaign,encounterId:encounter,attackerId:enemy,targetId:participant,d20:20,total:20,targetAC:20,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'crit'};
  sql(`update pending_attacks set state='attack_rolled',attack_d20=20,attack_total=20,hit_result='crit',attack_roll_snapshot='${JSON.stringify(snapshot)}' where id='${attack}'`);
  const d=beginSaved(8);expect(finishSaved(d.request_id)).toMatchObject({total:12,result:'crit',changed:false,energyCost:0});
 });
 test('simultaneous completion requests spend once and return the same attack result',async()=>{
  const d=beginSaved(3),query=`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.finish_telepath_reaction('${character}','${d.request_id}',false);commit;`;
  const run=()=>new Promise<Record<string,unknown>>((resolve,reject)=>{
   const process=spawn('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1']);let out='',err='';
   process.stdout.on('data',data=>out+=data);process.stderr.on('data',data=>err+=data);process.on('error',reject);
   process.on('close',code=>{if(code)reject(new Error(err));else{try{resolve(JSON.parse(out.trim()));}catch(error){reject(error);}}});process.stdin.end(query);
  });
  const results=await Promise.all([run(),run()]);expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
  for(const result of results)expect(result).toMatchObject({total:14,result:'miss',energyCost:1});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('7');
  expect(sql(`select count(*) from public.psionic_energy_uses where request_id='${d.request_id}'`)).toBe('1');
 });
 const enhanceSaved=(declaration:string,kind='surge',extra:number[]|null=null,die:number|null=6,request=randomUUID())=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';
  select dndkeep_private.enhance_telepath_reaction('${character}','${declaration}','${request}','${kind}',${extra?'array['+extra.join(',')+']':'null'},${die??'null'});commit;`));
 test('linked Surge is spent once and its adjusted roll survives completion/retry',()=>{
  const d=beginSaved(2),request=randomUUID();expect(enhanceSaved(d.request_id,'surge',null,6,request)).toMatchObject({total:4,hitDiceSpent:1});
  expect(enhanceSaved(d.request_id,'surge',null,6,request)).toMatchObject({replayed:true,total:4,hitDiceSpent:1});
  expect(finishSaved(d.request_id)).toMatchObject({roll:4,originalRolls:[2],rolls:[4],usedSurge:true,total:13,energyCost:1});
  expect(enhanceSaved(d.request_id,'surge',null,6,request)).toMatchObject({replayed:true});
  expect(()=>enhanceSaved(d.request_id)).toThrow();expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
 });
 test('Enkindled extra dice and Surge affect the saved total but cost only one conditional Energy Die',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}',hit_dice_spent=0 where id='${character}'`);
  const d=beginSaved(2);expect(enhanceSaved(d.request_id,'enkindled',[6,9],null)).toMatchObject({extraRolls:[6,9],hitDiceSpent:2});
  expect(enhanceSaved(d.request_id)).toMatchObject({total:19,hitDiceSpent:3});
  expect(finishSaved(d.request_id)).toMatchObject({roll:19,originalRolls:[2,6,9],enkindledRolls:[6,9],rolls:[4,6,9],usedSurge:true,total:-2,result:'miss',energyCost:1});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('11');
 });
 test('ineffective enhanced reactions retain Energy Dice while paid Hit Dice stay spent',()=>{
  sql(`update pending_attacks set target_ac=5 where id='${attack}'`);const d=beginSaved(2);enhanceSaved(d.request_id);
  expect(finishSaved(d.request_id)).toMatchObject({energyCost:0,usedSurge:true,changed:false,total:13});
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('8');
 });
 test('canceling an enhanced reaction keeps Hit Dice and Reaction spent, without an Energy Die charge',()=>{
  const d=beginSaved(2);enhanceSaved(d.request_id);expect(finishSaved(d.request_id,true)).toMatchObject({cancelled:true,energyCost:0,reactionCost:1});
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');expect(()=>enhanceSaved(d.request_id)).toThrow();
 });
 test('rejects unearned Enkindled, a wrong Hit Die pool, changed attack and changed roster before enhancement payment',()=>{
  const d=beginSaved(2);expect(()=>enhanceSaved(d.request_id,'enkindled',[2],null)).toThrow();expect(()=>enhanceSaved(d.request_id,'surge',null,8)).toThrow();
  sql(`update combat_participants set entity_id='changed' where id='${enemy}'`);expect(()=>enhanceSaved(d.request_id)).toThrow();
  sql(`update combat_participants set entity_id='${enemy}' where id='${enemy}';update pending_attacks set target_ac=16 where id='${attack}'`);expect(()=>enhanceSaved(d.request_id)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });
 test('Enkindled must precede Surge and each enhancement kind has one saved identity',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}' where id='${character}'`);
  const d=beginSaved(2);enhanceSaved(d.request_id);expect(()=>enhanceSaved(d.request_id,'enkindled',[2],null)).toThrow();expect(()=>enhanceSaved(d.request_id)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
 });

 test('low-level lifecycle functions remain private behind the dispatcher',()=>{
  for(const role of ['anon','authenticated']){
   expect(sql(`select has_function_privilege('${role}','dndkeep_private.begin_telepath_reaction(uuid,uuid,uuid,text,jsonb,integer,jsonb)','execute') or has_function_privilege('${role}','dndkeep_private.finish_telepath_reaction(uuid,uuid,boolean)','execute') or has_function_privilege('${role}','dndkeep_private.enhance_telepath_reaction(uuid,uuid,uuid,text,integer[],integer)','execute') or has_table_privilege('${role}','dndkeep_private.telepath_enhancements','select') or has_table_privilege('${role}','dndkeep_private.telepath_declarations','select') or has_table_privilege('${role}','dndkeep_private.attack_reaction_origins','select')`)).toBe('f');
  }
 });

 test('anonymous callers cannot invoke either context entry point',()=>{
  expect(sql(`select has_function_privilege('anon','public.get_telepath_attack_context(uuid,uuid,text)','execute') or has_function_privilege('anon','dndkeep_private.telepath_attack_context(uuid,uuid,text)','execute')`)).toBe('f');
 });

 test('browser validates real context and measures the exact placed subject',async({page})=>{
  const scene=randomUUID();
  sql(`update auth.users set instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data=jsonb_build_object('provider','email','providers',jsonb_build_array('email')),created_at=now(),updated_at=now(),confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@action.local'),'email',now(),now(),now());
   update campaigns set use_combatants_for_battlemap=true where id='${campaign}';
   insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published) values('${scene}','${campaign}','${owner}','Telepath range','square',70,20,20,'bright',true);
   insert into scene_token_placements(scene_id,combatant_id,x,y,size_override) select '${scene}',combatant_id,35,35,'medium' from combat_participants where id='${participant}';
   insert into scene_token_placements(scene_id,combatant_id,x,y,size_override) select '${scene}',combatant_id,455,35,'medium' from combat_participants where id='${enemy}';`);
  await signInAsSeedDm(page,`${owner}@action.local`);
  const result=await page.evaluate(async({character,attack,scene})=>{
   const {getTelepathAttackContext}=await import('/src/lib/api/telepathReactions.ts');
   const {loadTelepathSpatialEvidence}=await import('/src/lib/telepathSpatialEvidence.ts');
   const context=await getTelepathAttackContext(character,attack,'distraction');
   return {context,spatial:await loadTelepathSpatialEvidence(context,scene)};
  },{character,attack,scene});
  expect(result.context).toMatchObject({reactionAvailable:true,telepathyRange:60,spatialReviewRequired:true});
  expect(result.spatial).toMatchObject({status:'measured',distanceFeet:30,visibilityReviewRequired:true});
 });

});
