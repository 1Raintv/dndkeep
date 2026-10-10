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

 test('End Turn reviews aura inputs and resumes saved rolls after postponing',async({page},info)=>{
  const scene=randomUUID();sql(`update campaigns set use_combatants_for_battlemap=true where id='${campaign}';
   insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
   values('${scene}','${campaign}','${dm}','Aura map','square',70,12,8,'bright',true);
   insert into scene_token_placements(id,scene_id,combatant_id,x,y) values('${randomUUID()}','${scene}','${ca}',35,35),('${randomUUID()}','${scene}','${cb}',105,35);`);
  await signInFixtureDm(page);const errors:string[]=[],badResponses:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('response',response=>{if(response.status()>=400)badResponses.push(`${response.status()} ${response.url()}`);});
  await page.evaluate(async({enc})=>{
   const rp='/node_modules/.vite/deps/react.js',dp='/node_modules/.vite/deps/react-dom_client.js',mp='/src/components/shared/Modal.tsx',hp='/src/components/Combat/useAuraTurnReview.tsx',cp='/src/lib/combatEncounter.ts';
   const [React,dom,modal,hook,combat]=await Promise.all([import(rp),import(dp),import(mp),import(hp),import(cp)]);
   function Harness(){const aura=hook.useAuraTurnReview(enc);return React.default.createElement(React.default.Fragment,null,aura.dialog,React.default.createElement('button',{onClick:async()=>{
    delete document.body.dataset.turnResult;document.body.dataset.turnResult=JSON.stringify(await combat.advanceTurn(enc,aura.resolve));
   }},'Finish reviewed turn'));}
   const host=document.createElement('div');host.style.cssText='position:fixed;top:80px;left:12px;z-index:1000';document.body.appendChild(host);
   dom.default.createRoot(host).render(React.default.createElement(modal.ModalProvider,null,React.default.createElement(Harness)));
  },{enc});
  const end=page.getByRole('button',{name:'Finish reviewed turn'}),input=page.getByRole('dialog',{name:'Review aura inputs'});
  await end.click();await expect(input).toBeVisible();await expect(input.getByRole('button',{name:'Roll and review'})).toBeDisabled();
  await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>document.body.dataset.turnResult??'')).toContain('postponed');
  expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).toBe(turn);expect(counts().receipt).toBe(0);
  await end.click();await expect(input).toBeVisible();
  await input.getByLabel('Base saving throw modifier',{exact:true}).fill('0');await input.getByLabel('Concentration save modifier',{exact:true}).fill('0');
  await input.getByLabel('Damage defense',{exact:true}).selectOption('normal');for(const checkbox of await input.getByRole('checkbox').all())await checkbox.check();
  await input.screenshot({path:`.tmp/aura-input-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  await input.getByRole('button',{name:'Roll and review'}).click();
  const result=page.getByRole('dialog',{name:'Aura: review save'});await expect(result).toBeVisible();const saved=await result.innerText();
  await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>document.body.dataset.turnResult??'')).toContain('postponed');
  expect(counts().receipt).toBe(0);expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).toBe(turn);
  await end.click();await expect(result).toBeVisible();expect(await result.innerText()).toBe(saved);await expect(input).toBeHidden();
  await result.getByRole('button',{name:'Apply result'}).click();await expect.poll(()=>page.evaluate(()=>document.body.dataset.turnResult??'')).toBe('{"ok":true}');
  expect(counts().receipt).toBe(1);expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).not.toBe(turn);
  expect(sql(`select count(*) from dndkeep_private.live_turn_transitions where encounter_id='${enc}' and complete`)).toBe('1');
  expect(errors).toEqual([]);expect(badResponses).toEqual([]);
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

 test('catalog import preserves exact and unknown saving throws through the live reader',async({page})=>{
  sql(`insert into monsters(id,name,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha,saving_throws) values('${b}','Import fixture','Beast','9',5000,'Medium',20,'3d8',10,30,10,10,10,18,9,10,${literal({Intelligence:9})})`);
  await signInFixtureDm(page);
  const imported=await page.evaluate(async({id,campaign})=>{const path='/src/lib/api/creatures.ts',api=await import(/* @vite-ignore */ path);return api.importFromCatalog({catalogMonsterId:id,campaignId:campaign});},{id:b,campaign});
  // Assign the fixture's cleanup ID before assertions so failures cannot leave a copy.
  sql(`update homebrew_monsters set id='${b}' where id='${imported.id}';update combatants set definition_type='homebrew_monster' where id='${cb}';update combat_participants set participant_type='monster' where id='${pb}'`);
  expect(imported).toMatchObject({saving_throws:{Intelligence:9},save_proficiencies:null,ability_scores:{int:18,wis:9}});
  const read=()=>page.evaluate(async target=>{const path='/src/lib/pendingAttack.ts',api=await import(/* @vite-ignore */ path);return {int:await api.getTargetSaveBonus(target,'INT'),wis:await api.getTargetSaveBonus(target,'WIS')};},pb);
  expect(await read()).toMatchObject({int:{bonus:9,confidence:'high'},wis:{bonus:-1,confidence:'high'}});
  sql(`update homebrew_monsters set saving_throws=null where id='${b}'`);expect(await read()).toMatchObject({int:{confidence:'low'},wis:{confidence:'low'}});
  sql(`update homebrew_monsters set saving_throws='{}',int=null where id='${b}'`);expect(await read()).toMatchObject({int:{confidence:'low'},wis:{bonus:-1,confidence:'high'}});
 });

 test('legendary saves require verified target bonuses before any writes',async({page},info)=>{
  monster();await signInFixtureDm(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const before=state();
  await page.evaluate(async({campaign,enc,actor,entity,combatant})=>{
   const reactPath='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',modalPath='/src/components/Combat/LegendaryActionResolverModal.tsx',toastPath='/src/components/shared/Toast.tsx';
   const [React,dom,modal,toast]=await Promise.all([import(reactPath),import(domPath),import(modalPath),import(toastPath)]);
   const host=document.createElement('div');document.body.appendChild(host);
   dom.default.createRoot(host).render(React.default.createElement(toast.ToastProvider,null,React.default.createElement(modal.default,{participant:{id:actor,name:'Dragon',participant_type:'creature',entity_id:entity,combatant_id:combatant},campaignId:campaign,encounterId:enc,laOption:{name:'Wing Attack',desc:'Each creature within 15 feet must succeed on a DC 20 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage.',cost:2},cost:2,onClose:()=>{}})));
  },{campaign,enc,actor:pa,entity:a,combatant:ca});
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await dialog.locator('button[data-target-group]').first().click();await dialog.getByRole('button',{name:'Resolve 1 target & spend 2'}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Review B’s DEX saving throw bonus before resolving.');
  await page.screenshot({path:`.tmp/unverified-save-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *, .toast, .toast *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  expect(state()).toBe(before);expect(sql(`select count(*) from pending_attacks where encounter_id='${enc}'`)).toBe('0');expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});expect(errors).toEqual([]);
 });

 test('legendary save conditions wait for a resistance decision',async({page},info)=>{
  monster();sql(`update homebrew_monsters set dex=10,saving_throws='{}' where id='${b}';update combat_participants set legendary_actions_total=3,legendary_actions_remaining=3 where id='${pa}'`);await signInFixtureDm(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});

  await page.evaluate(async({campaign,enc,actor,entity,combatant})=>{
   Math.random=()=>0.01;
   const reactPath='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',modalPath='/src/components/Combat/LegendaryActionResolverModal.tsx',toastPath='/src/components/shared/Toast.tsx';
   const [React,dom,modal,toast]=await Promise.all([import(reactPath),import(domPath),import(modalPath),import(toastPath)]);
   const host=document.createElement('div');document.body.appendChild(host);
   const root=dom.default.createRoot(host);root.render(React.default.createElement(toast.ToastProvider,null,React.default.createElement(modal.default,{participant:{id:actor,name:'Dragon',participant_type:'creature',entity_id:entity,combatant_id:combatant},campaignId:campaign,encounterId:enc,laOption:{name:'Wing Attack',desc:'Each creature within 15 feet must succeed on a DC 20 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage and be knocked prone.',cost:2},cost:2,onClose:()=>root.render(React.default.createElement(toast.ToastProvider))})));
  },{campaign,enc,actor:pa,entity:a,combatant:ca});
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await dialog.locator('button[data-target-group]').first().click();await dialog.getByRole('button',{name:'Resolve 1 target & spend 2'}).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/1 awaiting Legendary Resistance; finish pending attacks after deciding/)).toBeVisible();
  await page.screenshot({path:`.tmp/legendary-save-wait-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *, .toast, .toast *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  expect(JSON.parse(sql(`select jsonb_build_object('state',state,'pending',pending_lr_decision,'damage',damage_final) from pending_attacks where encounter_id='${enc}'`))).toMatchObject({state:'declared',pending:true,damage:null});
  expect(JSON.parse(sql(`select recipe from dndkeep_private.attack_condition_intents where encounter_id='${enc}'`))).toMatchObject({conditionName:'Prone',sourcePrefix:'legendary_action',durationRounds:null,saveToEnd:null});
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('20');expect(sql(`select coalesce(active_conditions,'{}'::text[]) @> array['Prone'] from combatants where id='${cb}'`)).toBe('f');expect(sql(`select legendary_actions_remaining from combat_participants where id='${pa}'`)).toBe('1');expect(errors).toEqual([]);
  await page.evaluate(async campaign=>{
   const r='/node_modules/.vite/deps/react.js',d='/node_modules/.vite/deps/react-dom_client.js',m='/src/components/Combat/LegendaryResistancePromptModal.tsx';
   const [React,dom,modal]=await Promise.all([import(r),import(d),import(m)]);const host=document.createElement('div');document.body.appendChild(host);dom.default.createRoot(host).render(React.default.createElement(modal.default,{campaignId:campaign,isDM:true}));
  },campaign);
  await page.getByRole('button',{name:'Decline',exact:true}).click();
  await expect.poll(()=>sql(`select coalesce(active_conditions,'{}'::text[]) @> array['Prone'] from combatants where id='${cb}'`)).toBe('t');
  expect(sql(`select count(*) from dndkeep_private.attack_condition_resolutions r join pending_attacks a on a.id=r.attack_id where a.encounter_id='${enc}'`)).toBe('1');
  expect(sql(`select legendary_actions_remaining from combat_participants where id='${pa}'`)).toBe('1');expect(errors).toEqual([]);
 });

 for(const damage of [false,true]) test(`single-target monster save retains its condition ${damage?'with damage':'without damage'}`,async({page},info)=>{
  monster();
  const action={name:'Toppling Gaze',desc:'One creature must succeed on a DC 20 Strength saving throw or be knocked prone.',dc_type:'STR',dc_value:20,dc_success:'none',...(damage?{damage_dice:'1d4',damage_type:'bludgeoning'}:{})};
  sql(`insert into monsters(id,name,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha,actions) values('${b}','Save actor','Beast','1',200,'Medium',20,'3d8',10,30,10,10,10,10,10,10,${literal([action])});update homebrew_monsters set source_monster_id='${b}' where id='${b}';update combat_participants set participant_type='creature',attacks_remaining=1 where id='${pb}';update combatants set active_buffs='[]' where id='${ca}'`);
  await signInFixtureDm(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.evaluate(async campaign=>{
   Math.random=()=>0.01;localStorage.setItem('dndkeep:fastCombatRolls','1');
   const paths=['/node_modules/.vite/deps/react.js','/node_modules/.vite/deps/react-dom_client.js','/src/components/Combat/MonsterActionPanel.tsx','/src/components/shared/Toast.tsx','/src/context/CombatContext.tsx'];
   const [React,dom,panel,toast,combat]=await Promise.all(paths.map(path=>import(path)));
   const host=document.createElement('div');host.id='single-save-fixture';document.getElementById('root')!.style.display='none';document.body.appendChild(host);
   dom.default.createRoot(host).render(React.default.createElement(toast.ToastProvider,null,React.default.createElement(combat.CombatProvider,{campaignId:campaign},React.default.createElement(panel.default,{isDM:true}))));
  },campaign);
  await page.getByRole('button',{name:/Toppling Gaze/}).click();
  await page.locator('button[data-target-group]').first().click();
  await expect.poll(()=>sql(`select count(*) from dndkeep_private.attack_condition_resolutions r join pending_attacks p on p.id=r.attack_id where p.encounter_id='${enc}'`)).toBe('1');
  await expect.poll(()=>sql(`select state from pending_attacks where encounter_id='${enc}'`)).toBe(damage?'applied':'canceled');
  expect(sql(`select coalesce(active_conditions,'{}'::text[]) @> array['Prone'] from combatants where id='${ca}'`)).toBe('t');
  expect(JSON.parse(sql(`select recipe from dndkeep_private.attack_condition_intents where encounter_id='${enc}'`))).toMatchObject({conditionName:'Prone',sourcePrefix:'monster_action'});
  expect(Number(sql(`select current_hp from combatants where id='${ca}'`))).toBe(damage?19:20);
  await page.screenshot({path:`.tmp/single-save-${damage}-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('#single-save-fixture, #single-save-fixture *, .toast, .toast *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}

  expect(errors).toEqual([]);
 });

 for(const mode of ['none','retry','reload','finished','damage'] as const) test('legendary save recovery '+mode,async({page},info)=>{
  const lostReply=mode!=='none';
  monster();sql(`update homebrew_monsters set dex=10,saving_throws='{}' where id='${b}';update combat_participants set legendary_actions_total=3,legendary_actions_remaining=3 where id='${pa}';update combat_participants set legendary_resistance=0 where id='${pb}'`);await signInFixtureDm(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error' && !(lostReply && message.text().includes('503')))errors.push(message.text());});

  const requests:string[]=[];
  await page.route('**/rest/v1/rpc/declare_paid_legendary_saves',async route=>{
   requests.push(JSON.stringify(route.request().postDataJSON()));const response=await route.fetch();
   if((mode==='retry'&&requests.length===1)||(mode==='reload'&&requests.length<=2)){expect(response.ok()).toBe(true);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Simulated lost payment reply'})});}
   else await route.fulfill({response});
  });
  if(mode==='finished')await page.route('**/rest/v1/pending_attacks?*',async route=>{
   if(route.request().method()==='PATCH' && route.request().postDataJSON()?.state==='canceled'){const response=await route.fetch();expect(response.ok()).toBe(true);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Simulated lost completion reply'})});}
   else await route.continue();
  });
  if(mode==='damage'){
   let replies=0;
   await page.route('**/rest/v1/rpc/apply_saved_save_damage',async route=>{
    const response=await route.fetch();const request=route.request().postDataJSON();
    if(request.p_expected&&++replies<=2){expect(response.ok()).toBe(true);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Simulated lost damage reply'})});}
    else await route.fulfill({response});
   });
  }
  const mount=(popover=false)=>page.evaluate(async({campaign,enc,actor,entity,combatant,popover,damage})=>{
   Math.random=()=>0.01;
   const reactPath='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',modalPath=popover?'/src/components/Combat/LegendaryActionPopover.tsx':'/src/components/Combat/LegendaryActionResolverModal.tsx',toastPath='/src/components/shared/Toast.tsx';
   const [React,dom,modal,toast]=await Promise.all([import(reactPath),import(domPath),import(modalPath),import(toastPath)]);
   const host=document.createElement('div');document.body.appendChild(host);
   const root=dom.default.createRoot(host),option={name:'Wing Attack',desc:damage?'Each creature within 15 feet must succeed on a DC 20 Dexterity saving throw or take 1 (1d4) bludgeoning damage and be knocked prone.':'Each creature within 15 feet must succeed on a DC 20 Dexterity saving throw or be knocked prone.',cost:2};
   const part={id:actor,name:'Dragon',participant_type:'creature',entity_id:entity,combatant_id:combatant,legendary_actions_total:3,legendary_actions_remaining:popover?1:3,legendary_actions_config:[option]};
   root.render(React.default.createElement(toast.ToastProvider,null,React.default.createElement(modal.default,{participant:part,campaignId:campaign,encounterId:enc,laOption:option,cost:2,anchor:{x:12,y:60},onClose:()=>root.render(React.default.createElement(toast.ToastProvider))})));
  },{campaign,enc,actor:pa,entity:a,combatant:ca,popover,damage:mode==='damage'});
  await mount();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  await dialog.locator('button[data-target-group]').first().click();await dialog.getByRole('button',{name:'Resolve 1 target & spend 2'}).click();
  if(mode==='reload'||mode==='finished'||mode==='damage'){
   await expect(dialog.getByRole('alert')).toBeVisible();
   const original=sql(`select id from pending_attacks where encounter_id='${enc}'`);
   if(mode==='finished')sql(`update combatants set active_conditions='{}',condition_sources='{}' where id='${cb}';update characters set active_conditions='{}',condition_sources='{}' where id='${b}'`);
   await page.reload();await mount(true);await page.getByRole('button',{name:'Resume Wing Attack Saved'}).click();await expect(dialog.getByRole('button',{name:'Resume saved action'})).toBeEnabled();
   await expect(dialog.getByRole('status')).toContainText('Its original rolls and payment will be reused.');
   await page.screenshot({path:`.tmp/legendary-save-resume-${mode}-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *, .toast, .toast *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
   await dialog.getByRole('button',{name:'Resume saved action'}).click();
   expect(sql(`select id from pending_attacks where encounter_id='${enc}'`)).toBe(original);
  }
  await expect(dialog).toBeHidden();
  await expect(page.getByText((mode==='finished'||mode==='damage')?/Wing Attack: 0 saved · 0 failed · 1 already finished/:/Wing Attack: 0 saved · 1 failed · Prone ×1/)).toBeVisible();
  await page.screenshot({path:`.tmp/legendary-save-settled-${mode}-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *, .toast, .toast *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  expect(JSON.parse(sql(`select jsonb_build_object('state',state,'pending',pending_lr_decision,'damage',damage_final) from pending_attacks where encounter_id='${enc}'`))).toMatchObject(mode==='damage'?{state:'applied',pending:false,damage:1}:{state:'canceled',pending:false,damage:null});
  if(mode==='damage')expect(sql(`select count(*) from combat_events where encounter_id='${enc}' and event_type='damage_applied'`)).toBe('1');
  expect(JSON.parse(sql(`select recipe from dndkeep_private.attack_condition_intents where encounter_id='${enc}'`))).toMatchObject({conditionName:'Prone',sourcePrefix:'legendary_action',durationRounds:null,saveToEnd:null});
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe(mode==='damage'?'19':'20');expect(sql(`select coalesce(active_conditions,'{}'::text[]) @> array['Prone'] from combatants where id='${cb}'`)).toBe(mode==='finished'?'f':'t');expect(sql(`select legendary_actions_remaining from combat_participants where id='${pa}'`)).toBe('1');expect(sql(`select count(*) from dndkeep_private.attack_condition_resolutions r join pending_attacks a on a.id=r.attack_id where a.encounter_id='${enc}'`)).toBe('1');expect(requests).toHaveLength(mode==='none'?1:mode==='reload'?3:2);expect(new Set(requests).size).toBe(1);expect(sql(`select count(*) from dndkeep_private.legendary_save_payments p join dndkeep_private.save_batch_declarations d using(chain_id) where d.encounter_id='${enc}'`)).toBe('1');expect(errors).toEqual([]);
 });

 test('creature save summaries match live automation and mark unknown data',async({page},info)=>{
  monster();sql(`update homebrew_monsters set str=null,int=18,wis=9,saving_throws=${literal({Intelligence:9})} where id='${b}'`);await signInFixtureDm(page);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.evaluate(async({campaign,participant,entity,combatant})=>{
   const reactPath='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',viewPath='/src/components/Combat/CreatureSaveSummary.tsx',apiPath='/src/lib/api/creatureSaveDefinition.ts';
   const [React,dom,view,api]=await Promise.all([import(reactPath),import(domPath),import(viewPath),import(apiPath)]);
   const part={id:participant,campaign_id:campaign,entity_id:entity,combatant_id:combatant},definition=await api.readCreatureSaveDefinition(part);
   const host=document.createElement('div');host.id='save-summary-fixture';host.style.cssText='position:fixed;top:90px;left:12px;width:min(420px,calc(100vw - 24px));padding:16px;box-sizing:border-box;background:var(--c-raised);z-index:1000;border:1px solid var(--c-border);border-radius:8px';document.body.appendChild(host);
   dom.default.createRoot(host).render(React.default.createElement(React.default.Fragment,null,React.default.createElement('h3',null,'Combat saves'),React.default.createElement(view.ParticipantSaveSummary,{participant:part}),React.default.createElement('h3',null,'Creature sheet'),React.default.createElement(view.CreatureSaveSummary,{definition})));
  },{campaign,participant:pb,entity:b,combatant:cb});
  const host=page.locator('#save-summary-fixture');await expect(host.getByLabel('INT +9')).toHaveCount(2);await expect(host.getByLabel('WIS -1')).toHaveCount(2);await expect(host.getByLabel('STR review needed')).toHaveCount(2);
  const bonuses=await page.evaluate(async id=>{const path='/src/lib/pendingAttack.ts',api=await import(path);return [await api.getTargetSaveBonus(id,'INT'),await api.getTargetSaveBonus(id,'WIS')];},pb);expect(bonuses).toMatchObject([{bonus:9,confidence:'high'},{bonus:-1,confidence:'high'}]);
  await host.screenshot({path:`.tmp/save-summary-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('#save-summary-fixture, #save-summary-fixture *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  // Exercise the actual NPC panel's SELECT as well as the shared renderer.
  await page.evaluate(async({entity,combatant})=>{
   const reactPath='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',panelPath='/src/components/Campaign/NpcTokenQuickPanel.tsx',contextPath='/src/context/CombatContext.tsx';
   const [React,dom,panel,context]=await Promise.all([import(reactPath),import(domPath),import(panelPath),import(contextPath)]);
   const host=document.createElement('div');document.body.appendChild(host);dom.default.createRoot(host).render(React.default.createElement(context.CombatProvider,{campaignId:null},React.default.createElement(panel.default,{npcId:entity,tokenId:combatant,anchorX:16,anchorY:100,isDM:false,onClose:()=>{}})));
  },{entity:b,combatant:cb});
  const npc=page.getByRole('dialog',{name:/Creature token:/});await expect(npc.getByLabel('INT +9')).toBeVisible();await expect(npc.getByLabel('WIS -1')).toBeVisible();await expect(npc.getByLabel('STR review needed')).toBeVisible();
  await npc.screenshot({path:`.tmp/npc-save-summary-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  expect(errors).toEqual([]);
 });

 for(const effects of [false,true])test(`real aura preparation survives reload and settles its original reviewed dice (effects ${effects})`,async({page})=>{
  monster();const penaltyIds=effects?[seedPenalty(),seedPenalty()]:[];
  if(effects)sql(`update combatants set exhaustion_level=1,active_buffs=${literal([{key:'bless',name:'Bless'},{key:'bane',name:'Bane'},{key:'ward',name:'Ward',saveBonus:2}])} where id='${cb}'`);
  await signInFixtureDm(page);const before=state();
  const saved=await page.evaluate(async({user,identity})=>{
   const path='/src/lib/api/auraResolution.ts',previewPath='/src/rules/auraReviewPreview.ts',api=await import(path),rules=await import(previewPath);
   try{await api.processReviewedAuraResolution(user,identity,'turn_end',{baseBonus:0,conModifier:0,affinity:'normal',geometryConfirmed:true,defensesReviewed:true},()=>{},async()=>null);}catch(error){if(!String(error).includes('postponed'))throw error;}
   const request=api.savedAuraResolution(user,identity);return {request,preview:rules.auraReviewPreview(request.expected,request.proposal)};
  },{user:dm,identity:{encounterId:enc,turnId:turn,originId:pa,targetId:pb,auraKey:'fixture'}});
  expect(saved.request).toMatchObject({phase:'review',proposal:{save:{baseBonus:0},useResistance:false}});expect(saved.request.proposal.save.dice).toHaveLength(1);expect(saved.request.proposal.damageRoll.dice).toHaveLength(3);
  expect(state()).toBe(before);expect(counts()).toEqual({receipt:0,penalty:0,events:0,marker:0});
  await page.reload();
  const result=await page.evaluate(async({user,identity,original})=>{
   const path='/src/lib/api/auraResolution.ts',api=await import(path);
   return api.processReviewedAuraResolution(user,identity,'creature_entered',{baseBonus:99,conModifier:99,affinity:'immune',geometryConfirmed:true,defensesReviewed:true},()=>{},async(request:unknown)=>{
    if(JSON.stringify(request)!==JSON.stringify(original))throw new Error('Saved aura proposal changed');return {useResistance:false};
   });
  },{user:dm,identity:{encounterId:enc,turnId:turn,originId:pa,targetId:pb,auraKey:'fixture'},original:saved.request});
  expect(result).toMatchObject({requestId:saved.request.requestId,save:saved.preview.normal.save,damage:saved.preview.normal.damage,damageResult:saved.preview.normal.pools});
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe(String(saved.preview.normal.pools.afterHP));expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
  expect(result.penalty.consumedIds.sort()).toEqual(penaltyIds.sort());
  if(effects){expect(result.save.exhaustion).toBe(1);expect(result.save.effectRolls).toHaveLength(3);expect(result.penalty.penalty).toBe(saved.request.proposal.penaltyD4);}
  const replay=await page.evaluate(async({user,identity})=>{const path='/src/lib/api/auraResolution.ts',api=await import(path);return api.processReviewedAuraResolution(user,identity,'turn_end',{baseBonus:0,conModifier:0,affinity:'normal',geometryConfirmed:true,defensesReviewed:true},()=>{},async()=>{throw new Error('Committed result must not reopen review');});},{user:dm,identity:{encounterId:enc,turnId:turn,originId:pa,targetId:pb,auraKey:'fixture'}});
  expect(replay).toEqual({...result,replayed:true});expect(counts()).toEqual({receipt:1,penalty:1,events:2,marker:1});
 });

});
