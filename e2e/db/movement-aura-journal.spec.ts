import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${q};commit;`;
test.describe('Movement aura journal',()=>{
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
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${camp}';delete from characters where id in('${a}','${b}');delete from auth.users where id in('${dm}','${player}')`);});
 const move=(x=175,who=player)=>sql(auth(who,`update scene_token_placements set x=${x} where id='${target}'`));
 const read=(who=dm,before:string|null=null,limit=50)=>JSON.parse(sql(auth(who,`select read_movement_aura_events('${enc}',${before??'null'},${limit})`)));
 const count=()=>Number(sql(`select count(*) from dndkeep_private.movement_aura_events where encounter_id='${enc}'`));
 test('player movement atomically retains hidden aura evidence without applying effects',()=>{
  move();const [event]=read();expect(count()).toBe(1);expect(event).toMatchObject({encounterId:enc,campaignId:camp,turnId:turn,placementId:target,context:{version:1,geometryVerified:false,kind:'position',from:{x:105,y:35,combatantId:cb},to:{x:175,y:35,combatantId:cb}}});
  expect(event.context.participants.find((p:any)=>p.participant.id===pa)).toMatchObject({participant:{hidden:true,combatantId:ca},auras:[{aura:{name:'Hidden aura'}}],placements:[{id:origin,x:35,y:35,visible:false}]});
  expect(sql(`select current_hp from combatants where id='${cb}'`)).toBe('20');expect(sql(`select cardinality(once_per_turn_used) from combat_participants where id='${pb}'`)).toBe('0');
  expect(()=>read(player)).toThrow(/only to its DM/);
 });
 test('no-op saves and cosmetic writes do not create duplicate movement evidence',()=>{
  move();sql(auth(player,`update scene_token_placements set x=175,y=35 where id='${target}'`));sql(auth(dm,`update scene_token_placements set rotation=45 where id='${target}'`));expect(count()).toBe(1);
 });
 test('origin movement records its prior position and all target placements',()=>{
  sql(auth(dm,`update scene_token_placements set x=245 where id='${origin}'`));const [event]=read();expect(event.context.from.x).toBe(35);expect(event.context.to.x).toBe(245);
  expect(event.context.participants.find((p:any)=>p.participant.id===pb).placements).toEqual([expect.objectContaining({id:target,x:105})]);
  sql(`update combatants set active_buffs='[]' where id='${ca}'`);expect(read()).toEqual([event]);
 });
 test('inactive combat and absent auras produce no review history',()=>{
  sql(`update combat_encounters set status='ended' where id='${enc}'`);move();expect(count()).toBe(0);
  sql(`update combat_encounters set status='active' where id='${enc}';update combatants set active_buffs='[]' where id='${ca}'`);move(245);expect(count()).toBe(0);
 });
 test('unknown aura state is preserved for review rather than treated as empty',()=>{
  sql(`update combatants set active_buffs='{"unreadable":"aura state"}' where id='${ca}'`);move();expect(read()[0].context.participants.find((p:any)=>p.participant.id===pa)).toMatchObject({auraStateValid:false,unverifiedAuraState:{unreadable:'aura state'}});
 });
 test('token deletion and later turn changes do not erase or rewrite evidence',()=>{
  move();const [first]=read();sql(`update combat_encounters set current_turn_index=0 where id='${enc}'`);move(245);const events=read();expect(events).toHaveLength(2);expect(events[1]).toEqual(first);expect(events[0].turnId).not.toBe(turn);
  sql(`delete from scene_token_placements where id='${target}'`);expect(read()).toEqual(events);
 });
 test('a late journal failure rolls back the token position too',()=>{
  const fn='reject_move_'+randomUUID().replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$begin if new.encounter_id='${enc}' then raise exception 'fixture capture failed';end if;return new;end$$;create trigger ${fn} before insert on dndkeep_private.movement_aura_events for each row execute function public.${fn}()`);
  try{expect(()=>move()).toThrow(/fixture capture failed/);expect(sql(`select x from scene_token_placements where id='${target}'`)).toBe('105');expect(count()).toBe(0);}
  finally{sql(`drop trigger ${fn} on dndkeep_private.movement_aura_events;drop function public.${fn}()`);}
  move();expect(count()).toBe(1);
 });
 test('direct journal access and capture invocation are denied',()=>{
  expect(()=>sql(auth(player,'select * from dndkeep_private.movement_aura_events'))).toThrow(/permission denied/);
  expect(()=>sql(auth(dm,'delete from dndkeep_private.movement_aura_events'))).toThrow(/permission denied/);
  expect(()=>sql(auth(player,'select dndkeep_private.capture_movement_aura_event()'))).toThrow(/permission denied/);
  expect(()=>sql(`set role anon;select read_movement_aura_events('${enc}')`)).toThrow(/permission denied/);
 });
 test('revoked DM access is checked even for old history',()=>{
  move();const events=read();sql(`update campaigns set owner_id='${player}' where id='${camp}'`);expect(()=>read(dm)).toThrow(/only to its DM/);expect(read(player)).toEqual(events);
 });
 test('paging keeps a strict descending bigint cursor and rejects invalid limits',()=>{
  move();move(245);move(315);const all=read(),first=read(dm,null,1);expect(all).toHaveLength(3);expect(first).toEqual([all[0]]);expect(read(dm,first[0].sequence,1)).toEqual([all[1]]);expect(read(dm,all[2].sequence)).toEqual([]);
  expect(()=>read(dm,null,101)).toThrow(/Invalid movement history page/);expect(()=>read(dm,'0')).toThrow(/Invalid movement history page/);
 });
 test('an unauthorized player cannot move the hidden origin or enqueue a forged event',()=>{
  sql(auth(player,`update scene_token_placements set x=245 where id='${origin}'`));expect(sql(`select x from scene_token_placements where id='${origin}'`)).toBe('35');expect(count()).toBe(0);
 });
 test('legacy token movement is captured directly without duplicate bridge events',()=>{
  const legacy=randomUUID();sql(`update campaigns set use_combatants_for_battlemap=false where id='${camp}';insert into scene_tokens(id,scene_id,character_id,name,size,x,y,visible_to_all) values('${legacy}','${scene}','${b}','Target','medium',105,35,true)`);
  const before=count();sql(auth(dm,`update scene_tokens set x=175,light_radius_ft=15 where id='${legacy}'`));expect(count()-before).toBe(1);expect(read()[0].context).toMatchObject({source:'scene_tokens',to:{x:175,characterId:b},moverParticipantIds:[pb]});
 });
 test('scene transfers preserve both local grids without asserting an aura trigger',()=>{
  const next=randomUUID();sql(`insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published) values('${next}','${camp}','${dm}','Other map','square',35,12,8,'bright',true)`);
  sql(auth(dm,`update scene_token_placements set scene_id='${next}',x=70 where id='${target}'`));const [event]=read();expect(event.context).toMatchObject({kind:'scene_transfer',geometryVerified:false,from:{sceneId:scene,x:105},to:{sceneId:next,x:70}});expect(event.context.scenes).toHaveLength(2);
 });
 test('history does not expose a transfer destination in another campaign',()=>{
  const other=randomUUID(),next=randomUUID();
  try{
   sql(`insert into campaigns(id,owner_id,name) values('${other}','${player}','Other campaign');insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published) values('${next}','${other}','${player}','Private destination','square',70,12,8,'bright',true);update scene_token_placements set scene_id='${next}',x=245 where id='${target}'`);
   const [event]=read();expect(event.context.to).toBeNull();expect(event.context.from.sceneId).toBe(scene);expect(JSON.stringify(event.context)).not.toContain(next);expect(JSON.stringify(event.context)).not.toContain(other);
  }finally{sql(`delete from campaigns where id='${other}'`);}
 });
 test('the browser reader retrieves recorded movement through the authorized RPC',async({page})=>{
  move();sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@move-aura.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@move-aura.local`);
  const result=await page.evaluate(async(enc)=>{const path='/src/lib/api/movementAuraEvents.ts';return (await import(path)).readMovementAuraEvents(enc);},enc);
  expect(result).toEqual(read());expect(result[0].context.source).toBe('scene_token_placements');
 });

 test('the turn clock waits for a movement capture transaction to finish',async()=>{
  const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
  const writer=spawn('docker',args);let output='',errors='';
  const finished=new Promise<number|null>(resolve=>writer.on('close',resolve));writer.stdout.on('data',data=>output+=data);writer.stderr.on('data',data=>errors+=data);
  const name='aura_clock_'+randomUUID().replaceAll('-','');let clock:ReturnType<typeof spawn>|undefined;let clockFinished:Promise<number|null>|undefined;let clockErrors='';
  try{
   writer.stdin.write(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${player}","role":"authenticated"}';update scene_token_placements set x=175 where id='${target}';select 'CAPTURED';\n`);
   await expect.poll(()=>output,{timeout:10_000}).toContain('CAPTURED');
   clock=spawn('docker',args);clockFinished=new Promise(resolve=>clock!.on('close',resolve));clock.stderr!.on('data',data=>clockErrors+=data);
   clock.stdin!.end(`set application_name='${name}';update combat_encounters set current_turn_index=0 where id='${enc}';`);
   await expect.poll(()=>sql(`select coalesce(max(wait_event_type),'') from pg_stat_activity where application_name='${name}'`),{timeout:10_000}).toBe('Lock');
   writer.stdin.end('commit;\n');expect(await finished,errors).toBe(0);expect(await clockFinished,clockErrors).toBe(0);
   expect(read()[0].turnId).toBe(turn);expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).not.toBe(turn);
  }finally{
   if(!writer.stdin.writableEnded)writer.stdin.end('rollback;\n');await finished;if(clockFinished)await clockFinished;
  }
 });

});
