import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const json=(v:unknown)=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic party damage',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,char:string,campaign:string,request:string,save:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,char,campaign,request,save]=Array.from({length:7},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@damage.local','{}'),('${dm}','${dm}@damage.local','{}'),('${outsider}','${outsider}@damage.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Atomic damage');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp,temp_hp,constitution,concentration_spell,nat_1_20_saves)
   values('${char}','${owner}','${campaign}','Damage fixture','Human','Psion','Sage',5,50,50,8,14,'detect-magic',false);commit;`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${char}';delete from auth.users where id in('${owner}','${dm}','${outsider}')`));
 const context=()=>JSON.parse(sql(auth(dm,`select get_party_damage_context('${campaign}','${char}')`)));
 const call=(ctx:unknown,damage=10,id=request,saveId=save)=>`select apply_party_damage('${campaign}','${char}','${id}','${saveId}',${damage},'psychic',2,${json(ctx)})`;
 const apply=(ctx=context(),damage=10)=>JSON.parse(sql(auth(dm,call(ctx,damage))));
 const state=()=>JSON.parse(sql(`select jsonb_build_object('hp',current_hp,'temp',temp_hp,'spell',concentration_spell,'marker',last_campaign_damage_id,'failures',death_saves_failures,'conditions',active_conditions) from characters where id='${char}'`));
 const count=(table:string)=>sql(`select count(*) from ${table} where character_id='${char}'`);
 test('stable-state changes invalidate a preview even with unchanged counters',()=>{
  sql(`update characters set current_hp=0,temp_hp=0,concentration_spell='' where id='${char}'`);
  const ctx=context();expect(ctx.character.is_stable).toBe(false);
  sql(`update characters set is_stable=true where id='${char}'`);
  expect(()=>apply(ctx,1)).toThrow();expect(state().failures).toBe(0);
  apply(context(),1);
  expect(sql(`select is_stable::text||':'||death_saves_failures from characters where id='${char}'`)).toBe('false:1');
 });
 test('captures species choices and rejects a legacy changed after preview',()=>{
  sql(`update characters set species='Tiefling',species_choices='{"tieflingLegacy":"abyssal"}' where id='${char}'`);
  const ctx=context();expect(ctx.character.species_choices).toEqual({tieflingLegacy:'abyssal'});
  sql(`update characters set species_choices='{"tieflingLegacy":"infernal"}' where id='${char}'`);
  expect(()=>apply(ctx)).toThrow(/Party state changed/);expect(state().hp).toBe(50);expect(count('dndkeep_private.party_damage_events')).toBe('0');
 });
 test('temporary HP is consumed first and full damage determines one concentration check',()=>{
  const r=apply(undefined,23);expect(r).toMatchObject({beforeHP:50,beforeTempHP:8,afterHP:35,afterTempHP:0,checkId:save,concentrationBroken:false,replayed:false});
  expect(state()).toMatchObject({hp:35,temp:0,spell:'detect-magic',marker:request});
  expect(JSON.parse(sql(`select jsonb_build_object('damage',damage,'dc',dc,'bonus',con_bonus,'participant',participant_id,'encounter',encounter_id) from pending_concentration_saves where id='${save}'`))).toEqual({damage:23,dc:11,bonus:2,participant:null,encounter:null});
  expect(count('pending_concentration_saves')).toBe('1');
 });
 test('fully absorbed damage still creates a save',()=>{
  expect(apply(undefined,5)).toMatchObject({afterHP:50,afterTempHP:3,checkId:save});expect(state().spell).toBe('detect-magic');
 });
 test('replay keeps original damage and does not overwrite later HP or casting',()=>{
  const ctx=context(),first=apply(ctx);sql(`update characters set current_hp=49,concentration_spell='invisibility' where id='${char}'`);
  const replay=apply(ctx);expect(replay).toMatchObject({...first,character:expect.anything(),replayed:true});
  expect(state()).toMatchObject({hp:49,temp:0,spell:'invisibility',marker:null});expect(count('pending_concentration_saves')).toBe('1');expect(count('dndkeep_private.party_damage_events')).toBe('1');
 });
 test('same request raced twice damages once and stores one receipt',async()=>{
  const q=auth(dm,call(context()));const rows=await Promise.all([parallel(q),parallel(q)]);
  expect(rows.map(r=>({code:r.code,error:r.error}))).toEqual([{code:0,error:''},{code:0,error:''}]);
  expect(rows.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(state().hp).toBe(48);expect(count('character_history')).toBe('1');
 });
 test('different requests from one preview cannot both spend the same HP snapshot',async()=>{
  const ctx=context();const rows=await Promise.all([parallel(auth(dm,call(ctx))),parallel(auth(dm,call(ctx,10,randomUUID(),randomUUID())))]);
  expect(rows.filter(r=>r.code===0)).toHaveLength(1);expect(rows.filter(r=>r.code!==0)[0].error).toContain('Party state changed');expect(state().hp).toBe(48);
 });
 test('owner previews and applies their own damage; the DM replays the same receipt',()=>{
  const ctx=JSON.parse(sql(auth(owner,`select get_party_damage_context('${campaign}','${char}')`)));
  expect(ctx).toEqual(context());
  expect(JSON.parse(sql(auth(owner,call(ctx))))).toMatchObject({afterHP:48,afterTempHP:0,checkId:save,replayed:false});
  expect(apply(ctx)).toMatchObject({afterHP:48,checkId:save,replayed:true});
  expect(count('pending_concentration_saves')).toBe('1');expect(count('character_history')).toBe('1');
 });
 test('owner cancellation fences a late DM application',()=>{
  const ctx=context();
  expect(JSON.parse(sql(auth(owner,call(ctx).replace('apply_party_damage','cancel_party_damage'))))).toMatchObject({canceled:true});
  expect(()=>apply(ctx)).toThrow(/was canceled/);expect(state().hp).toBe(50);
 });
 test('permissions reject another campaign member, outsiders and anonymous clients on every entry point',()=>{
  const ctx=context();
  const queries=[`select get_party_damage_context('${campaign}','${char}')`,call(ctx),call(ctx).replace('apply_party_damage','cancel_party_damage')];
  for(const q of queries){
   expect(()=>sql(auth(outsider,q))).toThrow(/character owner or current DM/);
   expect(()=>sql('set role anon;'+q)).toThrow(/permission denied/);
  }
  sql(`insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${outsider}','player')`);
  for(const q of queries)expect(()=>sql(auth(outsider,q))).toThrow(/character owner or current DM/);
  expect(()=>sql(auth(owner,`select * from dndkeep_private.party_damage_events`))).toThrow(/permission denied/);
  expect(state().hp).toBe(50);expect(count('dndkeep_private.party_damage_events')).toBe('0');
 });
 test('a previous owner cannot replay or cancel after ownership changes',()=>{
  const ctx=context();sql(auth(owner,call(ctx)));
  sql(`update characters set user_id='${outsider}' where id='${char}'`);
  for(const q of [`select get_party_damage_context('${campaign}','${char}')`,call(ctx),call(ctx).replace('apply_party_damage','cancel_party_damage')])
   expect(()=>sql(auth(owner,q))).toThrow(/character owner or current DM/);
  expect(apply(ctx).replayed).toBe(true);expect(state().hp).toBe(48);
 });
 test('campaign removal blocks old campaign requests even for the character owner and former DM',()=>{
  const ctx=context();sql(`update characters set campaign_id=null where id='${char}'`);
  for(const user of [owner,dm])for(const q of [`select get_party_damage_context('${campaign}','${char}')`,call(ctx),call(ctx).replace('apply_party_damage','cancel_party_damage')])
   expect(()=>sql(auth(user,q))).toThrow(/character owner or current DM/);
  expect(state().hp).toBe(50);expect(count('dndkeep_private.party_damage_events')).toBe('0');
 });
 test('changed snapshots and malformed damage fail before writing',()=>{
  const ctx=context();sql(`update characters set temp_hp=9 where id='${char}'`);expect(()=>apply(ctx)).toThrow(/Party state changed/);
  expect(()=>apply(context(),-1)).toThrow(/Invalid party damage/);expect(count('dndkeep_private.party_damage_events')).toBe('0');expect(state().hp).toBe(50);
 });
 test('a failed concentration insert rolls back HP, marker, ledger and history',()=>{
  const fn='reject_party_'+request.replaceAll('-','');const ctx=context();
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.id='${save}' then raise exception 'fixture offer failure';end if;return new;end $$;create trigger ${fn} before insert on pending_concentration_saves for each row execute function public.${fn}()`);
  try{expect(()=>apply(ctx)).toThrow(/fixture offer failure/);expect(state()).toMatchObject({hp:50,temp:8,marker:null});expect(count('character_history')).toBe('0');expect(count('dndkeep_private.party_damage_events')).toBe('0');}
  finally{sql(`drop trigger ${fn} on pending_concentration_saves;drop function public.${fn}()`);}
  expect(apply(ctx)).toMatchObject({afterHP:48,replayed:false});
 });
 test('zero damage changes no HP and triggers no concentration check',()=>{
  expect(apply(undefined,0)).toMatchObject({afterHP:50,afterTempHP:8,checkId:null,concentrationBroken:false});expect(state().marker).toBeNull();expect(count('pending_concentration_saves')).toBe('0');
 });
 test('zero HP ends concentration without a roll even when automation is off',()=>{
  sql(`update campaigns set automation_defaults='{"concentration_on_damage":"off"}' where id='${campaign}'`);
  expect(apply(undefined,58)).toMatchObject({afterHP:0,checkId:null,concentrationBroken:true});expect(state()).toMatchObject({hp:0,temp:0,spell:'',failures:0});
  expect(state().conditions).toEqual(expect.arrayContaining(['Unconscious','Prone','Incapacitated']));expect(count('pending_concentration_saves')).toBe('0');
 });
 test('damage at zero HP and massive damage update death failures',()=>{
  sql(`update characters set current_hp=0,temp_hp=8,death_saves_failures=1 where id='${char}'`);
  apply(undefined,1);expect(state()).toMatchObject({hp:0,temp:7,failures:2});
 });
 for(const combat of [false,true])for(const damage of [49,50])test(`zero-HP massive threshold ignores temp HP (${combat}/${damage})`,()=>{
  sql(`update characters set current_hp=0,temp_hp=80,death_saves_failures=0,is_stable=true where id='${char}'`);
  let participant:string|null=null;
  if(combat){const encounter=randomUUID();participant=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${char}','Damage fixture',0);
   update combatants set current_hp=0,max_hp=50,temp_hp=80,death_save_failures=0,is_stable=true where id=(select combatant_id from combat_participants where id='${participant}')`);}
  const ctx=context();apply(ctx,damage);expect(state()).toMatchObject({hp:0,temp:80-damage,failures:damage===50?3:1,spell:''});
  if(participant)expect(sql(`select is_dead::text||':'||is_stable::text from combatants where id=(select combatant_id from combat_participants where id='${participant}')`)).toBe(`${damage===50}:false`);
  const after=state();expect(apply(ctx,damage).replayed).toBe(true);expect(state()).toEqual(after);expect(count('dndkeep_private.party_damage_events')).toBe('1');
 });
 for(const damage of [62,63])test(`positive-HP massive threshold still subtracts temp HP (${damage})`,()=>{
  sql(`update characters set current_hp=5,temp_hp=8 where id='${char}'`);apply(undefined,damage);expect(state()).toMatchObject({hp:0,temp:0,failures:damage===63?3:0});
 });
 test('massive zero-HP history failure rolls back death state and concentration',()=>{
  sql(`update characters set current_hp=0,temp_hp=80,death_saves_failures=0 where id='${char}'`);const before=state(),ctx=context(),fn='reject_massive_'+request.replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.id='${request}' then raise exception 'fixture history failure';end if;return new;end $$;create trigger ${fn} before insert on character_history for each row execute function public.${fn}()`);
  try{expect(()=>apply(ctx,50)).toThrow(/fixture history failure/);expect(state()).toEqual(before);expect(count('dndkeep_private.party_damage_events')).toBe('0');}
  finally{sql(`drop trigger ${fn} on character_history;drop function public.${fn}()`);}
  apply(ctx,50);expect(state().failures).toBe(3);
 });
 test('massive excess damage records death',()=>{
  apply(undefined,108);expect(state()).toMatchObject({hp:0,temp:0,failures:3});
 });
 test('automation settings suppress or immediately offer a save without clearing the spell',()=>{
  sql(`update campaigns set automation_defaults='{"concentration_on_damage":"off"}' where id='${campaign}'`);
  expect(apply()).toMatchObject({checkId:null,automation:'off'});expect(state().spell).toBe('detect-magic');
 });
 test('an unlocked character override captures automatic mode and War Caster',()=>{
  sql(`update characters set advanced_automations_unlocked=true,automation_overrides='{"concentration_on_damage":"auto"}',gained_feats=array['War Caster'] where id='${char}'`);
  expect(apply()).toMatchObject({checkId:save,automation:'auto'});
  expect(sql(`select has_advantage and expires_at<=now() from pending_concentration_saves where id='${save}'`)).toBe('t');
 });
 test('active combat HP is authoritative and both HP records update together',()=>{
  const encounter=randomUUID(),participant=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${char}','Damage fixture',0);
   update combatants set current_hp=40,max_hp=50,temp_hp=6 where id=(select combatant_id from combat_participants where id='${participant}')`);
  const ctx=context();expect(ctx.pools).toEqual({current_hp:40,max_hp:50,temp_hp:6});expect(apply(ctx)).toMatchObject({beforeHP:40,beforeTempHP:6,afterHP:36,afterTempHP:0,participantId:participant});
  expect(state()).toMatchObject({hp:36,temp:0});expect(sql(`select current_hp||':'||temp_hp from combatants where id=(select combatant_id from combat_participants where id='${participant}')`)).toBe('36:0');
  expect(sql(`select participant_id from pending_concentration_saves where id='${save}'`)).toBe(participant);
 });
 test('cancellation prevents a late damage request and cannot change identity',()=>{
  const ctx=context(),q=call(ctx),cancel=q.replace('apply_party_damage','cancel_party_damage');
  expect(JSON.parse(sql(auth(dm,cancel)))).toMatchObject({canceled:true,replayed:false});
  expect(()=>apply(ctx)).toThrow(/was canceled/);expect(()=>sql(auth(dm,call(ctx,11).replace('apply_party_damage','cancel_party_damage')))).toThrow(/request changed/);
  expect(state()).toMatchObject({hp:50,temp:8});expect(count('pending_concentration_saves')).toBe('0');
 });
 test('cancel after a successful write reports applied and preserves its receipt',()=>{
  const ctx=context();apply(ctx);expect(JSON.parse(sql(auth(dm,call(ctx).replace('apply_party_damage','cancel_party_damage'))))).toMatchObject({canceled:false,replayed:true});expect(apply(ctx).replayed).toBe(true);expect(state().hp).toBe(48);
 });
 test('racing cancellation and damage has one final outcome',async()=>{
  const ctx=context(),q=call(ctx);const rows=await Promise.all([parallel(auth(dm,q)),parallel(auth(dm,q.replace('apply_party_damage','cancel_party_damage')))]);
  expect(rows[1].code).toBe(0);const canceled=JSON.parse(rows[1].out).canceled;
  if(canceled){expect(state().hp).toBe(50);expect(rows[0].error).toContain('was canceled');}
  else{expect(state().hp).toBe(48);expect(rows[0].code).toBe(0);}
  expect(count('dndkeep_private.party_damage_events')).toBe('1');
 });

 test('changed combat HP rejects the previous preview even when sheet HP did not change',()=>{
  const encounter=randomUUID(),participant=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${char}','Damage fixture',0)`);
  const ctx=context();sql(`update combatants set current_hp=30 where id=(select combatant_id from combat_participants where id='${participant}')`);
  expect(()=>apply(ctx)).toThrow(/Party state changed/);expect(state().hp).toBe(50);expect(count('dndkeep_private.party_damage_events')).toBe('0');
 });
 test('combat zero HP clears owned spell effects and records massive damage death',()=>{
  const encounter=randomUUID(),participant=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${char}','Damage fixture',0);
   update combatants set current_hp=5,max_hp=50,temp_hp=0,active_buffs=jsonb_build_array(jsonb_build_object('key','owned','source','spell:detect-magic','casterParticipantId','${participant}'),jsonb_build_object('key','other','source','spell:detect-magic','casterParticipantId','someone-else')) where id=(select combatant_id from combat_participants where id='${participant}')`);
  expect(apply(undefined,55)).toMatchObject({afterHP:0,concentrationBroken:true,checkId:null});
  const combat=JSON.parse(sql(`select jsonb_build_object('dead',is_dead,'failures',death_save_failures,'buffs',active_buffs) from combatants where id=(select combatant_id from combat_participants where id='${participant}')`));
  expect(combat).toEqual({dead:true,failures:3,buffs:[{key:'other',source:'spell:detect-magic',casterParticipantId:'someone-else'}]});expect(state().spell).toBe('');
 });

 test('party concentration captures exhaustion and retains it after later recovery',()=>{
  sql(`update characters set exhaustion_level=2,saving_throw_proficiencies=array['constitution'] where id='${char}'`);
  const ctx=context();expect(ctx.character.exhaustion_level).toBe(2);apply(ctx);
  expect(sql(`select con_bonus from pending_concentration_saves where id='${save}'`)).toBe('1');
  sql(`update characters set exhaustion_level=0 where id='${char}'`);expect(apply(ctx).replayed).toBe(true);
  expect(sql(`select con_bonus from pending_concentration_saves where id='${save}'`)).toBe('1');
 });
 test('stale temporary effects reject before HP or a concentration offer changes',()=>{
  const ctx=context();sql(`update characters set active_buffs='[{"name":"Bless","saveBonus":0}]' where id='${char}'`);
  expect(()=>apply(ctx)).toThrow(/Party state changed/);expect(state().hp).toBe(50);expect(count('pending_concentration_saves')).toBe('0');
 });
 test('active combat exhaustion overrides stale sheet exhaustion',()=>{
  const encounter=randomUUID(),participant=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${participant}','${encounter}','${campaign}','character','${char}','Damage fixture',0);
   update combatants set exhaustion_level=2,active_buffs='[{"name":"Bane"}]' where id=(select combatant_id from combat_participants where id='${participant}')`);
  const ctx=context();expect(ctx.combatant.exhaustion_level).toBe(2);expect(ctx.combatant.active_buffs).toEqual([{name:'Bane'}]);
  apply(ctx);expect(sql(`select con_bonus from pending_concentration_saves where id='${save}'`)).toBe('-2');
 });

});
