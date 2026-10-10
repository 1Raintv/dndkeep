import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${q};commit;`;
const literal=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
test.describe('Movement aura review decisions',()=>{
 gateDbSuite();let dm:string,player:string,camp:string,scene:string,enc:string,a:string,b:string,ca:string,cb:string,pa:string,pb:string,origin:string,target:string,turn:string;
 test.beforeEach(()=>{
  [dm,player,camp,scene,enc,a,b,ca,cb,pa,pb,origin,target]=Array.from({length:13},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@move-aura.local','{}'),('${player}','${player}@move-aura.local','{}');
   insert into campaigns(id,owner_id,name,use_combatants_for_battlemap) values('${camp}','${dm}','Movement aura fixture',true);
   insert into campaign_members(campaign_id,user_id,role) values('${camp}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,current_hp,max_hp) values('${a}','${dm}','${camp}','Origin','Human','Psion','Sage',20,20),('${b}','${player}','${camp}','Target','Human','Fighter','Sage',20,20);
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${ca}','${camp}','${dm}','Origin','character','${a}',20,20),('${cb}','${camp}','${dm}','Target','character','${b}',20,20);
   insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published) values('${scene}','${camp}','${dm}','Arena','square',70,12,8,'bright',true);
   insert into scene_token_placements(id,scene_id,combatant_id,x,y,visible_to_all) values('${origin}','${scene}','${ca}',35,35,false),('${target}','${scene}','${cb}',105,35,true);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,1);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id,hidden_from_players) values('${pa}','${enc}','${camp}','character','${a}','Origin',0,'${ca}',true),('${pb}','${enc}','${camp}','character','${b}','Target',1,'${cb}',false);
   update combatants set active_buffs='[{"key":"aura:fixture","aura":{"key":"fixture","name":"Hidden aura","radiusFt":15,"triggers":["creature_entered","emanation_entered","turn_end"]}}]' where id='${ca}';commit;`);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);
  sql(`update combatants set active_buffs=${literal([{key:'aura:fixture',name:'Aura',casterParticipantId:pa,aura:{key:'fixture',name:'Aura',radiusFt:15,saveAbility:'WIS',saveDC:14,damageDice:'1d4',damageType:'radiant',halfOnSave:true,triggers:['creature_entered','emanation_entered','turn_end'],exemptParticipantIds:[],speedInside:null,affects:'all'}}])} where id='${ca}'`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${camp}';delete from characters where id in('${a}','${b}');delete from auth.users where id in('${dm}','${player}')`);});
 const move=(x=175,who=player)=>sql(auth(who,`update scene_token_placements set x=${x} where id='${target}'`));
 const read=(who=dm,before:string|null=null,limit=50)=>JSON.parse(sql(auth(who,`select read_movement_aura_events('${enc}',${before??'null'},${limit})`)));
 const count=()=>Number(sql(`select count(*) from dndkeep_private.movement_aura_events where encounter_id='${enc}'`));
 const queue=(who=dm)=>JSON.parse(sql(auth(who,`select pending_movement_aura_reviews('${enc}')`)));
 const choices=(entry:any,status='not_triggered',receiptId:string|null=null)=>entry.plan.candidates.map((c:any)=>({candidateId:c.candidateId,status,receiptId,reason:status==='resolved'?null:'Reviewed the route at the table.'}));
 const finish=(entry:any,decisions=choices(entry),request=randomUUID(),note='Reviewed all movement effects.',who=dm)=>JSON.parse(sql(auth(who,`select finish_movement_aura_review('${enc}','${entry.event.id}','${request}',${literal(decisions)},'${note}')`)));
 const history=(event:string,who=dm)=>JSON.parse(sql(auth(who,`select coalesce(read_movement_aura_review('${enc}','${event}'),'null'::jsonb)`)));
 function settle(){
  const expected=JSON.parse(sql(auth(dm,`select get_aura_resolution_context('${enc}','${turn}','${pa}','${pb}','fixture','creature_entered')`))),request=randomUUID();
  const proposal={save:{baseBonus:0,dice:[1],effectRolls:[]},penaltyD4:1,damageRoll:{dice:[{die:4,value:4}],modifier:0,total:4},affinity:'normal',useResistance:false,concentrationId:randomUUID(),conModifier:0,geometryConfirmed:true,defensesReviewed:true};
  sql(auth(dm,`select commit_aura_resolution('${enc}','${request}',${literal(expected)},${literal(proposal)})`));return request;
 }
 test('frozen evidence produces a possible entry, not a geometry claim',()=>{
  move();const [entry]=queue();expect(entry.event).toEqual(read()[0]);expect(entry.plan.candidates).toEqual([expect.objectContaining({originId:pa,targetId:pb,auraKey:'fixture',trigger:'creature_entered'})]);expect(entry.event.context.geometryVerified).toBe(false);expect(entry.plan.warnings).toEqual([]);
  sql(`update combatants set active_buffs='[]' where id='${ca}'`);expect(queue()).toEqual([entry]);expect(count()).toBe(1);
 });
 test('a recorded ruling survives replay and leaves all HP unchanged',()=>{
  move();const [entry]=queue(),request=randomUUID(),decision=choices(entry);const result=finish(entry,decision,request);expect(result).toMatchObject({eventId:entry.event.id,requestId:request,decisions:decision,replayed:false});expect(queue()).toEqual([]);
  expect(finish(entry,decision,request)).toEqual({...result,replayed:true});expect(history(entry.event.id)).toEqual({...result,replayed:true});expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('20');
  expect(()=>finish(entry,choices(entry,'manual'),request)).toThrow(/different recorded review/);
 });
 test('every candidate and an explicit ruling are required',()=>{
  move();const [entry]=queue();expect(()=>finish(entry,[])).toThrow(/every candidate/);expect(()=>finish(entry,[{...choices(entry)[0],reason:''}])).toThrow(/DM ruling/);expect(()=>finish(entry,choices(entry),randomUUID(),'   ')).toThrow(/complete movement review/);expect(queue()).toHaveLength(1);
 });
 test('resolved decisions must reference the matching atomic aura receipt',()=>{
  move();const [entry]=queue();expect(()=>finish(entry,choices(entry,'resolved',randomUUID()))).toThrow(/saved aura receipt/);
  const receipt=settle();expect(finish(entry,choices(entry,'resolved',receipt)).decisions[0].receiptId).toBe(receipt);expect(sql(`select current_hp from characters where id='${b}'`)).toBe('16');
 });
 test('later moves cannot skip an older unresolved review',()=>{
  move();move(245);const entries=queue();expect(BigInt(entries[0].event.sequence)<BigInt(entries[1].event.sequence)).toBe(true);
  expect(()=>finish(entries[1])).toThrow(/earlier movement/);finish(entries[0]);expect(queue().map((v:any)=>v.event.id)).toEqual([entries[1].event.id]);finish(entries[1]);expect(queue()).toEqual([]);
 });
 test('unknown aura data remains pending with a manual-review warning',()=>{
  sql(`update combatants set active_buffs='{"unknown":true}' where id='${ca}'`);move();const [entry]=queue();expect(entry.plan.candidates).toEqual([]);expect(entry.plan.warnings.length).toBeGreaterThan(0);
  expect(()=>sql(`select dndkeep_private.assert_movement_aura_reviews_complete('${enc}')`)).toThrow(/pending movement/);finish(entry,[],randomUUID(),'Handled the unverified aura at the table.');expect(sql(`select dndkeep_private.assert_movement_aura_reviews_complete('${enc}')`)).toBe('');
 });
 test('current ownership protects pending and completed review history',()=>{
  move();const [entry]=queue();expect(()=>queue(player)).toThrow(/only to its DM/);expect(()=>finish(entry,choices(entry),randomUUID(),'A player cannot approve this.',player)).toThrow(/only to its DM/);
  const request=randomUUID();finish(entry,choices(entry),request);sql(`update campaigns set owner_id='${player}' where id='${camp}'`);expect(()=>history(entry.event.id,dm)).toThrow(/only to its DM/);expect(history(entry.event.id,player).requestId).toBe(request);
  expect(()=>sql(auth(player,'select * from dndkeep_private.movement_aura_reviews'))).toThrow(/permission denied/);
 });
 test('a failed completion does not discard the pending movement or repeat its damage',()=>{
  move();const [entry]=queue(),receipt=settle(),decision=choices(entry,'resolved',receipt),request=randomUUID(),fn='reject_review_'+randomUUID().replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$begin if new.event_id='${entry.event.id}' then raise exception 'fixture review failure';end if;return new;end$$;create trigger ${fn} before insert on dndkeep_private.movement_aura_reviews for each row execute function public.${fn}()`);
  try{expect(()=>finish(entry,decision,request)).toThrow(/fixture review failure/);expect(queue()).toHaveLength(1);expect(sql(`select current_hp from characters where id='${b}'`)).toBe('16');}
  finally{sql(`drop trigger ${fn} on dndkeep_private.movement_aura_reviews;drop function public.${fn}()`);}
  finish(entry,decision,request);expect(sql(`select count(*) from dndkeep_private.aura_resolutions where encounter_id='${enc}'`)).toBe('1');expect(sql(`select current_hp from characters where id='${b}'`)).toBe('16');
 });
 test('origin movement offers emanation entry and honors exemptions',()=>{
  sql(auth(dm,`update scene_token_placements set x=175 where id='${origin}'`));
  const [entry]=queue();expect(entry.plan.candidates[0]).toMatchObject({originId:pa,targetId:pb,trigger:'emanation_entered'});finish(entry);
  sql(`update combatants set active_buffs=jsonb_set(active_buffs,'{0,aura,exemptParticipantIds}',${literal([pb])}) where id='${ca}'`);
  move(245);expect(queue()[0].plan.candidates).toEqual([]);
 });
 test('enemies-only auras do not invent hostility between character participants',()=>{
  sql(`update combatants set active_buffs=jsonb_set(active_buffs,'{0,aura,affects}','"enemies"') where id='${ca}'`);
  move();expect(queue()[0].plan.candidates).toEqual([]);
 });
 test('invalid trigger data requires manual review',()=>{
  sql(`update combatants set active_buffs=jsonb_set(active_buffs,'{0,aura,triggers}','[null]') where id='${ca}'`);
  move();const [entry]=queue();expect(entry.plan.candidates).toEqual([]);expect(entry.plan.warnings).toContain('An aura has invalid trigger or exemption data. Review it manually.');
 });
 test('a request cannot be reassigned to another movement',()=>{
  move();move(245);const [first,second]=queue(),request=randomUUID();finish(first,choices(first),request);
  expect(()=>finish(second,choices(second),request)).toThrow(/another movement/);expect(queue()).toHaveLength(1);
 });
 test('an aura receipt from another turn cannot resolve this movement',()=>{
  move();const [entry]=queue(),receipt=settle();
  sql(`update dndkeep_private.aura_resolutions set turn_id='${randomUUID()}' where request_id='${receipt}'`);
  expect(()=>finish(entry,choices(entry,'resolved',receipt))).toThrow(/saved aura receipt/);expect(queue()).toHaveLength(1);
 });

});
