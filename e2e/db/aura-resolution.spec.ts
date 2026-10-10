import {readFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect,type Page} from '@playwright/test';
import {auraReviewPreview} from '../../src/rules/auraReviewPreview';
import {verifyAuraResolutionReceipt} from '../../src/lib/auraResolutionReceipt';
import {validAuraDamagePools} from '../../src/rules/auraDamageEvidence';
import {validAuraSaveEvidence} from '../../src/rules/auraSaveEvidence';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
test.describe('Atomic aura resolution',()=>{
 gateDbSuite();let dm:string,player:string,campaign:string,enc:string,a:string,b:string,ca:string,cb:string,pa:string,pb:string,turn:string;
 test.beforeEach(()=>{
  [dm,player,campaign,enc,a,b,ca,cb,pa,pb]=Array.from({length:10},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@aura.local','{}'),('${player}','${player}@aura.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Aura fixture');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,current_hp,max_hp) values('${a}','${player}','${campaign}','A','Human','Psion','Sage',20,20),('${b}','${dm}','${campaign}','B','Human','Fighter','Sage',20,20);
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${ca}','${campaign}','${player}','A','character','${a}',20,20),('${cb}','${campaign}','${dm}','B','character','${b}',20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,1);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${pa}','${enc}','${campaign}','character','${a}','A',0,'${ca}'),('${pb}','${enc}','${campaign}','character','${b}','B',1,'${cb}');commit;`);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);writeAura();
 });
 test.afterEach(()=>{
  try{
   const receipts=JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('request',request,'result',result)),'[]') from dndkeep_private.aura_resolutions where encounter_id='${enc}'`));
   for(const receipt of receipts){
    const {expected,proposal}=receipt.request,result=receipt.result;
    expect(validAuraSaveEvidence(expected,proposal.save,result.penalty.penalty,result.save)).toBe(true);
    expect(validAuraDamagePools(expected,proposal,result.penalty.penalty,result)).toBe(true);
    expect(verifyAuraResolutionReceipt(expected,proposal,result.requestId,result)).toEqual(result);
   }
  }finally{sql(`delete from campaigns where id='${campaign}';delete from characters where id in('${a}','${b}');delete from homebrew_monsters where id='${b}';delete from monsters where id='${b}';delete from auth.users where id in('${dm}','${player}')`);}
 });
 function aura(){return {key:'aura:fixture',name:'Aura',casterParticipantId:pa,aura:{key:'fixture',name:'Aura',radiusFt:15,saveAbility:'WIS',saveDC:14,damageDice:'3d8',damageType:'radiant',halfOnSave:true,triggers:['turn_end','creature_entered','emanation_entered'],exemptParticipantIds:[],speedInside:'half',affects:'all'}};}
 function writeAura(value:unknown=[aura()]){sql(`update combatants set active_buffs='${JSON.stringify(value).replaceAll("'","''")}' where id='${ca}'`);}
 const call=(trigger='turn_end',expected=turn,origin=pa,target=pb)=>`select get_aura_resolution_context('${enc}','${expected}','${origin}','${target}','fixture','${trigger}')`;
 const read=()=>JSON.parse(sql(auth(dm,call())));
 const state=()=>sql(`select jsonb_build_object('characters',(select jsonb_agg(to_jsonb(c) order by id) from characters c where id in('${a}','${b}')),'combatants',(select jsonb_agg(to_jsonb(c) order by id) from combatants c where id in('${ca}','${cb}')),'participants',(select jsonb_agg(to_jsonb(p) order by id) from combat_participants p where encounter_id='${enc}'),'encounter',(select to_jsonb(e) from combat_encounters e where id='${enc}'))`);

 const proposal=()=>({save:{baseBonus:0,dice:[1],effectRolls:[]},penaltyD4:2 as number|null,damageRoll:{dice:[{die:8,value:5},{die:8,value:5},{die:8,value:5}],modifier:0,total:15},affinity:'normal',useResistance:false,concentrationId:randomUUID(),conModifier:0,geometryConfirmed:true,defensesReviewed:true});
 const commit=(expected:unknown,p=proposal(),id=randomUUID())=>`select commit_aura_resolution('${enc}','${id}',${literal(expected)},${literal(p)})`;
 const run=(q:string,user=dm)=>JSON.parse(sql(auth(user,q)));
 const lookup=()=>`select read_aura_resolution('${enc}','${turn}','${pa}','${pb}','fixture')`;
 const counts=()=>JSON.parse(sql(`select jsonb_build_object('receipt',(select count(*) from dndkeep_private.aura_resolutions where encounter_id='${enc}'),'penalty',(select count(*) from dndkeep_private.next_save_penalty_receipts where encounter_id='${enc}'),'events',(select count(*) from combat_events where encounter_id='${enc}'),'marker',(select cardinality(once_per_turn_used) from combat_participants where id='${pb}'))`));
 test('save, character HP, history and marker commit together and retry preserves later healing',()=>{
  const expected=read(),p=proposal(),id=randomUUID(),q=commit(expected,p,id);const result=run(q);
  expect(result).toMatchObject({requestId:id,passed:false,damage:15,damageResult:{beforeHP:20,afterHP:5},replayed:false});
  expect(sql(`select current_hp from characters where id='${b}'`)).toBe('5');expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('5');
  expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
  sql(`update characters set current_hp=18 where id='${b}';update combatants set current_hp=18 where id='${cb}';update combat_encounters set status='ended' where id='${enc}'`);
  expect(run(q)).toEqual({...result,replayed:true});expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('18');expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
  expect(run(lookup())).toMatchObject({requestId:id,result:{damage:15,replayed:true}});
  expect(()=>run(commit(expected,{...p,affinity:'immune'},id))).toThrow(/Saved aura request changed/);
 });
 test('save half precedes resistance rounding and vulnerability',()=>{
  const p=proposal();p.save.dice=[20];p.affinity='resistant-vulnerable';const result=run(commit(read(),p));
  expect(result).toMatchObject({passed:true,damage:6,damageResult:{afterHP:14}});
 });
 test('immunity still records the save once without HP or concentration writes',()=>{
  const p=proposal();p.affinity='immune';const result=run(commit(read(),p));expect(result).toMatchObject({damage:0,damageResult:null});expect(counts()).toEqual({receipt:1,penalty:1,events:1,marker:1});
  expect(sql(`select current_hp from characters where id='${b}'`)).toBe('20');expect(sql(`select count(*) from character_history where character_id='${b}'`)).toBe('0');
 });
 test('a lost-response retry in two clients commits once',async()=>{
  const q=auth(dm,commit(read()));const results=await Promise.all([parallel(q),parallel(q)]);expect(results.map(r=>r.code)).toEqual([0,0]);
  expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
 });
 test('different request IDs cannot bypass the once-per-turn identity',async()=>{
  const expected=read(),p=proposal();const results=await Promise.all([parallel(auth(dm,commit(expected,p))),parallel(auth(dm,commit(expected,p)))]);
  expect(results.map(r=>r.code).sort()).toEqual([0,3]);expect(results.find(r=>r.code!==0)?.error).toContain('already resolved');expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});expect(run(lookup()).result.damage).toBe(15);
 });
 test('a late receipt failure rolls back HP, history, penalty, events and marker',()=>{
  const effect=seedPenalty(),before=state(),q=commit(read()),fn='reject_aura_'+randomUUID().replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.encounter_id='${enc}' then raise exception 'fixture aura failure';end if;return new;end $$;create trigger ${fn} before insert on dndkeep_private.aura_resolutions for each row execute function public.${fn}()`);
  try{expect(()=>run(q)).toThrow(/fixture aura failure/);expect(state()).toBe(before);expect(sql(`select consumed_by is null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});expect(sql(`select count(*) from character_history where character_id='${b}'`)).toBe('0');}
  finally{sql(`drop trigger ${fn} on dndkeep_private.aura_resolutions;drop function public.${fn}()`);}
  expect(run(q).damage).toBe(15);
 });
 test('current DM authorization applies to new writes, historical replay and receipts',()=>{
  const q=commit(read());expect(()=>run(q,player)).toThrow(/only to its DM/);expect(()=>sql('set role anon;'+q)).toThrow(/permission denied/);run(q);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);expect(()=>run(q)).toThrow(/only to its DM/);expect(()=>run(lookup())).toThrow(/only to its DM/);expect(run(q,player).replayed).toBe(true);
  expect(()=>sql(auth(player,'select * from dndkeep_private.aura_resolutions'))).toThrow(/permission denied/);
 });
 test('stale state and unreviewed geometry or defenses cannot spend the aura',()=>{
  const expected=read();sql(`update combatants set current_hp=19 where id='${cb}'`);expect(()=>run(commit(expected))).toThrow(/Aura state changed/);
  for(const field of ['geometryConfirmed','defensesReviewed'])expect(()=>run(commit(read(),{...proposal(),[field]:false}))).toThrow(/Review aura/);
  expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});
 });
 test('invalid damage evidence rolls back the already evaluated save penalty',()=>{
  const p=proposal();p.damageRoll.total=16;expect(()=>run(commit(read(),p))).toThrow(/Saved dice total changed/);expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});
 });
 test('surviving character damage creates exactly one concentration offer',()=>{
  sql(`update characters set concentration_spell='Bless' where id='${b}'`);const p=proposal(),q=commit(read(),p),result=run(q);
  expect(result.damageResult.checkId).toBe(p.concentrationId);run(q);expect(sql(`select count(*) from pending_concentration_saves where character_id='${b}'`)).toBe('1');
 });
 test('massive damage at zero through temporary HP updates dying state and clears concentration',()=>{
  sql(`update characters set current_hp=0,max_hp=10,temp_hp=20,concentration_spell='Bless' where id='${b}';update combatants set current_hp=0,max_hp=10,temp_hp=20,is_stable=true where id='${cb}'`);
  const result=run(commit(read()));expect(result.damageResult).toMatchObject({afterHP:0,afterTempHP:5,concentrationBroken:true,checkId:null});
  expect(sql(`select death_save_failures||','||is_dead||','||is_stable from combatants where id='${cb}'`)).toBe('3,true,false');expect(sql(`select concentration_spell from characters where id='${b}'`)).toBe('');
  expect(counts()).toEqual({receipt:1,penalty:1,events:4,marker:1});
 });
 function monster(){sql(`insert into homebrew_monsters(id,campaign_id,owner_id,name,ability_scores) values('${b}','${campaign}','${dm}','Aura creature','{"wis":10}');update combatants set definition_type='homebrew_monster' where id='${cb}';update combat_participants set participant_type='monster',legendary_resistance=1,legendary_resistance_used=0 where id='${pb}'`);}
 test('creature Legendary Resistance changes damage after the original failed save and spends once',()=>{
  monster();const p=proposal();p.useResistance=true;const q=commit(read(),p),result=run(q);expect(result).toMatchObject({save:{passed:false},passed:true,acceptedResistance:true,damage:7,damageResult:{afterHP:13}});
  run(q);expect(sql(`select legendary_resistance_used from combat_participants where id='${pb}'`)).toBe('1');expect(counts()).toEqual({receipt:1,penalty:1,events:3,marker:1});
 });
 test('creature damage kills at zero and hidden targets keep all events private',()=>{
  monster();sql(`update combatants set current_hp=5 where id='${cb}';update combat_participants set hidden_from_players=true where id='${pb}'`);run(commit(read()));
  expect(sql(`select is_dead from combatants where id='${cb}'`)).toBe('t');expect(sql(`select count(*) from combat_events where encounter_id='${enc}' and visibility<>'hidden_from_players'`)).toBe('0');
 });
 function seedPenalty(){
  const id=randomUUID(),clock=JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${enc}','${pa}')`));
  sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${id}','${enc}','${pa}','${pb}','${clock.turnId}',${clock.castTurnOrdinal},'active')`);return id;
 }
 test('overlapping next-save penalties consume together but subtract only one saved d4',()=>{
  const ids=[seedPenalty(),seedPenalty()],p=proposal();p.save.dice=[15];const q=commit(read(),p),result=run(q);
  expect(result).toMatchObject({save:{total:13,passed:false},penalty:{penalty:2},damage:15});expect(result.penalty.consumedIds.sort()).toEqual(ids.sort());
  run(q);expect(sql(`select count(*) from dndkeep_private.mind_sliver_effects where encounter_id='${enc}' and consumed_by is not null`)).toBe('2');expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
 });
 test('automatic failure consumes next-save effects with no saving dice',()=>{
  const id=seedPenalty();sql(`update combatants set active_conditions=array['Unconscious'] where id='${cb}'`);writeAura([{...aura(),aura:{...aura().aura,saveAbility:'STR'}}]);
  const p=proposal();p.save.dice=[];p.penaltyD4=null;
  expect(run(commit(read(),p))).toMatchObject({save:{automaticFailure:true,d20:null,total:null,passed:false},penalty:{penalty:0,die:null,consumedIds:[id]},damage:15});
 });
 test('a changed resistance charge invalidates a prepared decision',()=>{
  monster();const expected=read(),p=proposal();p.useResistance=true;sql(`update combat_participants set legendary_resistance_used=1 where id='${pb}'`);
  expect(()=>run(commit(expected,p))).toThrow(/Aura state changed/);expect(()=>run(commit(read(),p))).toThrow(/cannot be used/);expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});
 });

 test('a newly applied next-save penalty invalidates the reviewed save and resistance decision',()=>{
  const expected=read(),effect=seedPenalty();expect(()=>run(commit(expected))).toThrow(/Aura state changed/);
  expect(sql(`select consumed_by is null from dndkeep_private.mind_sliver_effects where cast_id='${effect}'`)).toBe('t');expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});
 });

 async function signInFixtureDm(page:Page){
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@aura.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@aura.local`);
 }
 test('browser reload recovers a committed aura after lost responses without changing later HP',async({page})=>{
  await signInFixtureDm(page);
  let committed=false;
  await page.route('**/rest/v1/rpc/commit_aura_resolution',async route=>{
   const response=await route.fetch();expect(response.status()).toBe(200);committed=true;await route.abort();
  });
  await page.route('**/rest/v1/rpc/read_aura_resolution',async route=>{if(committed)await route.abort();else await route.continue();});
  const identity={encounterId:enc,turnId:turn,originId:pa,targetId:pb,auraKey:'fixture'};
  const interrupted=await page.evaluate(async({user,identity,proposal})=>{
   const path='/src/lib/api/auraResolution.ts',api=await import(/* @vite-ignore */ path);let preparations=0,error='';
   try{await api.processSavedAuraResolution(user,identity,'turn_end',()=>{preparations++;return proposal;},()=>{});}catch(e){error=String(e);}
   return {preparations,error,saved:!!api.savedAuraResolution(user,identity)};
  },{user:dm,identity,proposal:proposal()});
  expect(interrupted).toMatchObject({preparations:1,saved:true});expect(interrupted.error).not.toBe('');expect(committed).toBe(true);
  expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
  sql(`update characters set current_hp=18 where id='${b}';update combatants set current_hp=18 where id='${cb}';update combat_encounters set status='ended' where id='${enc}'`);
  await page.unroute('**/rest/v1/rpc/commit_aura_resolution');await page.unroute('**/rest/v1/rpc/read_aura_resolution');await page.reload();
  const recovered=await page.evaluate(async({user,identity})=>{
   const path='/src/lib/api/auraResolution.ts',api=await import(/* @vite-ignore */ path);
   const result=await api.processSavedAuraResolution(user,identity,'creature_entered',()=>{throw new Error('Unexpected replacement roll');},()=>{});
   return {result,saved:api.savedAuraResolution(user,identity)};
  },{user:dm,identity});
  expect(recovered).toMatchObject({result:{damage:15,replayed:true},saved:null});
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('18');expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
 });

 for(const kind of ['srd_monster','custom','homebrew_monster'])test(`live aura defenses follow the linked ${kind} source`,async({page})=>{
  const defenses={damage_resistances:['radiant'],damage_immunities:[],damage_vulnerabilities:['fire']};
  if(kind==='srd_monster')sql(`insert into monsters(id,name,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha,damage_resistances,damage_immunities,damage_vulnerabilities) values('${b}','Fixture creature','Beast','1',200,'Medium',20,'3d8',10,30,10,10,10,10,10,10,array['radiant'],array[]::text[],array['fire'])`);
  if(kind==='homebrew_monster')sql(`insert into homebrew_monsters(id,owner_id,user_id,name,damage_resistances,damage_immunities,damage_vulnerabilities) values('${b}','${dm}','${dm}','Personal creature',array['radiant'],array[]::text[],array['fire'])`);
  sql(`update combatants set definition_type='${kind}',stat_block_snapshot=${literal(defenses)} where id='${cb}';update combat_participants set participant_type='monster' where id='${pb}'`);
  await signInFixtureDm(page);
  const result=await page.evaluate(async({campaign,enc,target})=>{
   const path='/src/lib/api/auraDamageDefenses.ts',api=await import(/* @vite-ignore */ path);
   return {radiant:await api.readAuraDamageDefenses(campaign,enc,target,'radiant'),fire:await api.readAuraDamageDefenses(campaign,enc,target,'fire')};
  },{campaign,enc,target:pb});
  expect(result).toEqual({radiant:{resistant:true,immune:false,vulnerable:false},fire:{resistant:false,immune:false,vulnerable:true}});
 });

 test('a postponed resistance decision survives reload with the original save and damage dice',async({page})=>{
  monster();await signInFixtureDm(page);
  const identity={encounterId:enc,turnId:turn,originId:pa,targetId:pb,auraKey:'fixture'};
  const pending=await page.evaluate(async({user,identity,proposal})=>{
   const path='/src/lib/api/auraResolution.ts',api=await import(/* @vite-ignore */ path);let error='';
   try{await api.processSavedAuraResolution(user,identity,'turn_end',()=>proposal,()=>{},async()=>null);}catch(e){error=String(e);}
   return {error,saved:api.savedAuraResolution(user,identity)};
  },{user:dm,identity,proposal:proposal()});
  expect(pending.error).toContain('postponed');expect(pending.saved.phase).toBe('review');
  expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('20');
  await page.reload();
  const result=await page.evaluate(async({user,identity})=>{
   const path='/src/lib/api/auraResolution.ts',api=await import(/* @vite-ignore */ path);
   return api.processSavedAuraResolution(user,identity,'turn_end',()=>{throw new Error('Unexpected replacement roll');},()=>{},async()=>({useResistance:true}));
  },{user:dm,identity});
  expect(result).toMatchObject({requestId:pending.saved.requestId,save:{dice:[1],passed:false},passed:true,acceptedResistance:true,damage:7,damageResult:{afterHP:13}});
  expect(run(lookup()).request.proposal.damageRoll).toEqual(pending.saved.proposal.damageRoll);
  expect(sql(`select legendary_resistance_used from combat_participants where id='${pb}'`)).toBe('1');
  expect(counts()).toEqual({receipt:1,penalty:1,events:3,marker:1});
 });

 test('review expiry matches atomic settlement after the caster next turn ends',()=>{
  const expired=seedPenalty();
  let moved=run(`select commit_combat_clock_transition('${enc}','${randomUUID()}','${turn}','${pa}',0,2)`);turn=moved.turnId;
  moved=run(`select commit_combat_clock_transition('${enc}','${randomUUID()}','${turn}','${pb}',1,2)`);turn=moved.turnId;
  const expected=read(),p=proposal();p.save.dice=[15];
  expect(expected.nextSaveEffects).toEqual([expect.objectContaining({id:expired,expired:true})]);
  expect(auraReviewPreview(expected,p)).toMatchObject({penalty:0,normal:{save:{passed:true},damage:7}});
  const result=run(commit(expected,p));expect(result).toMatchObject({penalty:{expiredIds:[expired],consumedIds:[],penalty:0},save:{passed:true},damage:7});
 });
 test('mixed expired and active effects preview the same single penalty as settlement',()=>{
  const expired=seedPenalty();
  let moved=run(`select commit_combat_clock_transition('${enc}','${randomUUID()}','${turn}','${pa}',0,2)`);turn=moved.turnId;
  moved=run(`select commit_combat_clock_transition('${enc}','${randomUUID()}','${turn}','${pb}',1,2)`);turn=moved.turnId;
  const active=seedPenalty(),expected=read(),p=proposal();p.save.dice=[15];
  expect(auraReviewPreview(expected,p)).toMatchObject({penalty:2,normal:{save:{passed:false},damage:15}});
  expect(run(commit(expected,p))).toMatchObject({penalty:{expiredIds:[expired],consumedIds:[active],penalty:2},save:{passed:false},damage:15});
 });

 test('aura review controls display saved outcomes and postpone without spending',async({page},info)=>{
  monster();writeAura([{...aura(),aura:{...aura().aura,name:'Spirit Guardians'}}]);
  sql(`update combatants set name='Young Red Dragon',temp_hp=2 where id='${cb}'`);
  await signInFixtureDm(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.evaluate(async({user,identity,proposal})=>{
   const reactPath='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',modalPath='/src/components/shared/Modal.tsx',reviewPath='/src/components/Combat/reviewAuraResolution.ts',apiPath='/src/lib/api/auraResolution.ts';
   const [React,dom,modal,review,api]=await Promise.all([import(reactPath),import(domPath),import(modalPath),import(reviewPath),import(apiPath)]);
   function Harness(){const controls=modal.useModal();return React.default.createElement('button',{onClick:async()=>{
    delete document.body.dataset.auraReviewOutcome;delete document.body.dataset.auraReviewError;
    try{const result=await api.processSavedAuraResolution(user,identity,'turn_end',()=>proposal,()=>{},(request:unknown)=>review.reviewAuraResolution(controls,request));document.body.dataset.auraReviewOutcome=JSON.stringify(result);}
    catch(error){document.body.dataset.auraReviewError=String(error);}
   }},'Review saved aura');}
   const host=document.createElement('div');host.style.cssText='position:fixed;top:80px;left:12px;z-index:1000';document.body.appendChild(host);dom.default.createRoot(host).render(React.default.createElement(modal.ModalProvider,null,React.default.createElement(Harness)));
  },{user:dm,identity:{encounterId:enc,turnId:turn,originId:pa,targetId:pb,auraKey:'fixture'},proposal:proposal()});
  await page.getByRole('button',{name:'Review saved aura',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Spirit Guardians: review save'});await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Young Red Dragon');await expect(dialog).toContainText('Total 1.');await expect(dialog).toContainText('15 radiant damage');await expect(dialog).toContainText('7 radiant damage');
  await dialog.getByRole('button',{name:'Use resistance',exact:true}).click({trial:true});
  await dialog.screenshot({path:`.tmp/aura-review-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.body.dataset.auraReviewError??'')).toContain('postponed');expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});
  await page.getByRole('button',{name:'Review saved aura',exact:true}).click();await expect(dialog).toContainText('Total 1.');
  await dialog.getByRole('button',{name:'Use resistance',exact:true}).click();await expect(dialog).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>document.body.dataset.auraReviewOutcome??'')).not.toBe('');
  const result=await page.evaluate(()=>JSON.parse(document.body.dataset.auraReviewOutcome!));expect(result).toMatchObject({acceptedResistance:true,damage:7,damageResult:{afterHP:15,afterTempHP:0}});
  expect(sql(`select legendary_resistance_used from combat_participants where id='${pb}'`)).toBe('1');expect(errors).toEqual([]);
 });

 test('live creature save bonuses recognize stored proficiency names and require a known CR',async({page})=>{
  monster();sql(`update homebrew_monsters set ability_scores='{"int":18,"wis":10}',save_proficiencies=${literal(['Intelligence'])},cr='9' where id='${b}'`);
  await signInFixtureDm(page);
  const readBonus=()=>page.evaluate(async target=>{const path='/src/lib/pendingAttack.ts',api=await import(/* @vite-ignore */ path);return api.getTargetSaveBonus(target,'INT');},pb);
  expect(await readBonus()).toMatchObject({bonus:8,confidence:'high'});
  sql(`update homebrew_monsters set cr=null where id='${b}'`);expect(await readBonus()).toMatchObject({confidence:'low'});
  sql(`update homebrew_monsters set cr='9',save_proficiencies=null where id='${b}'`);expect(await readBonus()).toMatchObject({confidence:'low'});
 });

 for(const kind of ['srd_monster','custom'])test(`live creature saving throws follow the linked ${kind} totals`,async({page})=>{
  const snapshot={int:18,wis:10,saving_throws:{Intelligence:9}};
  if(kind==='srd_monster')sql(`insert into monsters(id,name,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha,saving_throws) values('${b}','Save fixture','Beast','9',5000,'Medium',20,'3d8',10,30,10,10,10,18,10,10,${literal(snapshot.saving_throws)})`);
  sql(`update combatants set definition_type='${kind}',stat_block_snapshot=${literal(snapshot)} where id='${cb}';update combat_participants set participant_type='monster' where id='${pb}'`);
  await signInFixtureDm(page);
  const read=()=>page.evaluate(async target=>{const path='/src/lib/pendingAttack.ts',api=await import(/* @vite-ignore */ path);return {int:await api.getTargetSaveBonus(target,'INT'),wis:await api.getTargetSaveBonus(target,'WIS')};},pb);
  expect(await read()).toMatchObject({int:{bonus:9,confidence:'high'},wis:{bonus:0,confidence:'high'}});
  if(kind==='srd_monster')sql(`update monsters set saving_throws=null where id='${b}'`);
  else sql(`update combatants set stat_block_snapshot=${literal({...snapshot,saving_throws:null})} where id='${cb}'`);
  expect(await read()).toMatchObject({int:{confidence:'low'},wis:{confidence:'low'}});
 });

});
