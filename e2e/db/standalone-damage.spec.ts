import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(query:string)=>execFileSync('docker',args,{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(user:string,query:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${user}","role":"authenticated"}';${query};commit;`;
function parallel(query:string){return new Promise<{code:number|null;out:string;error:string}>(resolve=>{const child=spawn('docker',args);let out='',error='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>error+=v);child.on('close',code=>resolve({code,out,error}));child.stdin.end(query);});}
test.describe('Atomic standalone damage and concentration',()=>{
 gateDbSuite();let owner:string,other:string,character:string,request:string,campaign:string;
 test.beforeEach(()=>{
  [owner,other,character,request,campaign]=Array.from({length:5},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@save.local','{}'),('${other}','${other}@save.local','{}');
   insert into characters(id,user_id,name,species,class_name,background,level,secondary_class,secondary_level,constitution,
    saving_throw_proficiencies,concentration_spell,concentration_rounds_remaining,concentration_slot_level,current_hp,max_hp,nat_1_20_saves)
   values('${character}','${owner}','Solo Psion','Human','Psion','Sage',3,'Fighter',2,14,array['constitution'],'Fly',10,3,20,20,false);`);
 });
 test.afterEach(()=>sql(`delete from action_logs where character_id='${character}';delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}');`));
 const snapshot=()=>sql(`select jsonb_build_object('concentration_spell',concentration_spell,'concentration_revision',concentration_revision,
  'constitution',constitution,'inventory',inventory,'level',level,'secondary_class',secondary_class,'secondary_level',secondary_level,
  'saving_throw_proficiencies',saving_throw_proficiencies,'gained_feats',gained_feats,'nat_1_20_saves',nat_1_20_saves) from characters where id='${character}'`);
 const queue=(id=request,damage=5,expected=snapshot())=>`select queue_standalone_concentration_save('${character}','${id}',${damage},2,'${expected}'::jsonb)`;
 const settle=(dice='array[3]',id=request)=>`select settle_standalone_concentration_save('${character}','${id}',${dice})`;
 const run=(q:string,user=owner)=>JSON.parse(sql(auth(user,q)));
 const spell=()=>sql(`select concentration_spell from characters where id='${character}'`);
 const hpRevision=()=>sql(`select hit_point_revision from characters where id='${character}'`);
 const damage=(amount=6,saveId=randomUUID(),hp=hpRevision(),expected=snapshot(),damageId=request)=>
  `select apply_standalone_damage('${character}','${damageId}','${saveId}',${amount},${hp},2,'${expected}'::jsonb)`;
 const pending=()=>run(`select get_standalone_concentration_saves('${character}')`).pending;
 test('damage consumes temp HP and creates one damage-bound check in the same transaction',()=>{
  sql(`update characters set temp_hp=4 where id='${character}'`);const r=run(damage());
  expect(r.hp).toMatchObject({amount:6,beforeHP:20,beforeTempHP:4,afterHP:18,afterTempHP:0});
  expect(r.check).toMatchObject({damage:6,dc:10,save_bonus:5,automation_mode:'prompt'});expect(r.character.current_hp).toBe(18);expect(r.character.last_standalone_damage_id).toBe(request);expect(pending()).toHaveLength(1);
  expect(sql(`select count(*) from character_history where id='${request}'`)).toBe('1');
 });
 test('damage entirely absorbed by temp HP still creates a save',()=>{
  sql(`update characters set temp_hp=10 where id='${character}'`);const r=run(damage(3));
  expect(r.character).toMatchObject({current_hp:20,temp_hp:7});expect(r.check.damage).toBe(3);
 });
 test('exact retry preserves new HP and a newer casting without adding another check',()=>{
  const q=damage();const first=run(q);sql(`update characters set current_hp=19,concentration_spell='Invisibility' where id='${character}'`);
  const replay=run(q);expect(replay).toMatchObject({hp:first.hp,replayed:true,character:{current_hp:19,concentration_spell:'Invisibility'}});expect(pending()).toHaveLength(1);
 });
 test('zero HP ends concentration atomically and preserves full damage for the capped DC',()=>{
  const r=run(damage(80));expect(r.character).toMatchObject({current_hp:0,concentration_spell:''});
  expect(r).toMatchObject({check:null,resolution:{outcome:'failed',reason:'incapacitated',dc:30,rolls:null}});expect(pending()).toEqual([]);
  expect(sql(`select count(*) from character_history where character_id='${character}'`)).toBe('2');
 });
 for(const mode of ['off','auto','prompt'])test(`respects unlocked ${mode} automation`,()=>{
  sql(`update characters set advanced_automations_unlocked=true,automation_overrides='{"concentration_on_damage":"${mode}"}' where id='${character}'`);
  const r=run(damage());expect(r.automation).toBe(mode);expect(pending()).toHaveLength(mode==='off'?0:1);
  if(mode!=='off')expect(r.check.automation_mode).toBe(mode);else expect(r.check).toBeNull();
 });
 test('locked character overrides cannot disable the default prompt',()=>{
  sql(`update characters set advanced_automations_unlocked=false,automation_overrides='{"concentration_on_damage":"off"}' where id='${character}'`);
  expect(run(damage()).automation).toBe('prompt');expect(pending()).toHaveLength(1);
 });
 test('automation off does not preserve concentration at zero HP',()=>{
  sql(`update characters set advanced_automations_unlocked=true,automation_overrides='{"concentration_on_damage":"off"}' where id='${character}'`);
  expect(run(damage(30))).toMatchObject({check:null,character:{concentration_spell:''},resolution:{reason:'incapacitated'}});
 });
 test('a non-concentrating character loses HP without creating a check',()=>{
  sql(`update characters set concentration_spell='' where id='${character}'`);expect(run(damage())).toMatchObject({check:null,character:{current_hp:14}});expect(pending()).toEqual([]);
 });
 test('stale HP rejects the entire operation, including its provisional check',()=>{
  const q=damage();sql(`update characters set current_hp=19 where id='${character}'`);
  expect(()=>run(q)).toThrow(/HP changed/);expect(pending()).toEqual([]);expect(sql(`select current_hp from characters where id='${character}'`)).toBe('19');
 });
 test('changed casting inputs reject damage instead of rebasing',()=>{
  const q=damage();sql(`update characters set concentration_spell='Invisibility' where id='${character}'`);
  expect(()=>run(q)).toThrow(/Character changed/);expect(pending()).toEqual([]);expect(sql(`select current_hp from characters where id='${character}'`)).toBe('20');
 });
 test('duplicate clients pay one hit and create one check',async()=>{
  const q=damage();const results=await Promise.all([parallel(auth(owner,q)),parallel(auth(owner,q))]);expect(results.map(r=>r.code)).toEqual([0,0]);
  expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);expect(pending()).toHaveLength(1);expect(sql(`select current_hp from characters where id='${character}'`)).toBe('14');
 });
 test('cancellation seals both the late combined request and its component identities',()=>{
  const saveId=randomUUID(),expected=snapshot(),revision=hpRevision(),q=damage(6,saveId,revision,expected);
  const cancel=q.replace('apply_standalone_damage','cancel_standalone_damage');expect(run(cancel)).toMatchObject({canceled:true});expect(run(cancel)).toMatchObject({canceled:true,replayed:true});
  expect(()=>run(q)).toThrow(/was canceled/);
  expect(()=>run(`select adjust_character_hit_points_atomic('${character}','${request}','damage',6,${revision})`)).toThrow(/was canceled/);
  expect(()=>run(queue(saveId,6,expected))).toThrow(/was canceled/);expect(pending()).toEqual([]);
 });
 test('paid damage cannot be canceled or repeated with a different save ID',()=>{
  const q=damage();run(q);expect(run(q.replace('apply_standalone_damage','cancel_standalone_damage'))).toMatchObject({canceled:false});
  expect(()=>run(damage())).toThrow(/Damage request changed/);expect(pending()).toHaveLength(1);
 });
 test('the same save identity cannot be reused by another damage request',()=>{
  const saveId=randomUUID();run(damage(6,saveId));expect(()=>run(damage(6,saveId,hpRevision(),snapshot(),randomUUID()))).toThrow(/already in use/);
  expect(sql(`select current_hp from characters where id='${character}'`)).toBe('14');
 });
 test('HP history failure rolls back damage, queue and receipt',()=>{
  const q=damage(),trigger='test_damage_'+request.replaceAll('-','');
  try{
   sql(`create function public.${trigger}() returns trigger language plpgsql as $$begin if new.id='${request}' then raise exception 'injected HP history failure';end if;return new;end;$$;
    create trigger ${trigger} before insert on character_history for each row execute function public.${trigger}();`);
   expect(()=>run(q)).toThrow(/injected HP history failure/);expect(pending()).toEqual([]);expect(sql(`select current_hp from characters where id='${character}'`)).toBe('20');
  }finally{sql(`drop trigger if exists ${trigger} on character_history;drop function if exists public.${trigger}();`);}
  expect(run(q).replayed).toBe(false);
 });
 test('other owners and campaign characters cannot use standalone damage',()=>{
  const q=damage();expect(()=>run(q,other)).toThrow(/unavailable/);
  sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${owner}','Campaign');update characters set campaign_id='${campaign}' where id='${character}'`);
  expect(()=>run(q)).toThrow(/Use campaign/);
 });
 test('zero-HP concentration history failure rolls back the whole damage event',()=>{
  const saveId=randomUUID(),q=damage(30,saveId),trigger='test_zero_'+request.replaceAll('-','');
  try{
   sql(`create function public.${trigger}() returns trigger language plpgsql as $$begin if new.id='${saveId}' then raise exception 'injected concentration log failure';end if;return new;end;$$;
    create trigger ${trigger} before insert on action_logs for each row execute function public.${trigger}();`);
   expect(()=>run(q)).toThrow(/injected concentration log failure/);expect(spell()).toBe('Fly');expect(pending()).toEqual([]);
   expect(sql(`select current_hp from characters where id='${character}'`)).toBe('20');expect(sql(`select count(*) from character_history where id='${request}'`)).toBe('0');
  }finally{sql(`drop trigger if exists ${trigger} on action_logs;drop function if exists public.${trigger}();`);}
  expect(run(q)).toMatchObject({replayed:false,character:{current_hp:0,concentration_spell:''}});
 });
 test('unused save identity remains reserved even when the character was not concentrating',()=>{
  sql(`update characters set concentration_spell='' where id='${character}'`);const saveId=randomUUID();run(damage(6,saveId));
  expect(()=>run(damage(6,saveId,hpRevision(),snapshot(),randomUUID()))).toThrow(/duplicate key/);
  expect(sql(`select current_hp from characters where id='${character}'`)).toBe('14');
 });
 test('racing cancellation and damage yield either one paid hit or one sealed cancellation',async()=>{
  const q=damage(),cancel=q.replace('apply_standalone_damage','cancel_standalone_damage');
  const [applied,canceled]=await Promise.all([parallel(auth(owner,q)),parallel(auth(owner,cancel))]);expect(canceled.code).toBe(0);
  const proof=JSON.parse(canceled.out);expect(applied.code).toBe(proof.canceled?3:0);if(proof.canceled)expect(applied.error).toContain('was canceled');
  expect(sql(`select current_hp from characters where id='${character}'`)).toBe(proof.canceled?'20':'14');expect(pending()).toHaveLength(proof.canceled?0:1);
 });
 test('anonymous execution and direct damage ledger access are denied',()=>{
  expect(()=>sql(`set role anon;${damage()}`)).toThrow(/permission denied/);
  expect(()=>sql(auth(owner,'select * from dndkeep_private.standalone_damage_events'))).toThrow(/permission denied/);
 });

 test('ordinary later HP changes clear the standalone marker',()=>{
  run(damage());sql(`update characters set current_hp=13 where id='${character}'`);
  expect(sql(`select last_standalone_damage_id is null from characters where id='${character}'`)).toBe('t');
 });

 const exhaustedSnapshot=()=>JSON.stringify({...JSON.parse(snapshot()),exhaustion_level:Number(sql(`select coalesce(exhaustion_level,0) from characters where id='${character}'`))});
 test('exhaustion is captured with damage and survives a later recovery',()=>{
  sql(`update characters set exhaustion_level=2 where id='${character}'`);const saveId=randomUUID(),q=damage(6,saveId,hpRevision(),exhaustedSnapshot());
  const first=run(q);expect(first.check.save_bonus).toBe(1);
  sql(`update characters set exhaustion_level=0 where id='${character}'`);
  expect(run(q)).toMatchObject({replayed:true,check:{save_bonus:1}});
  expect(run(settle('array[8]',saveId))).toMatchObject({outcome:'failed',bonus:1,total:9});
 });
 test('stale exhaustion rejects damage atomically before losing HP',()=>{
  const expected=exhaustedSnapshot();sql(`update characters set exhaustion_level=1 where id='${character}'`);
  expect(()=>run(damage(6,randomUUID(),hpRevision(),expected))).toThrow(/Character changed/);
  expect(sql(`select current_hp from characters where id='${character}'`)).toBe('20');expect(pending()).toEqual([]);
 });
 test('legacy requests without exhaustion cannot start a new exhausted save',()=>{
  sql(`update characters set exhaustion_level=1 where id='${character}'`);
  expect(()=>run(queue())).toThrow(/Reload to include exhaustion/);expect(()=>run(damage())).toThrow(/Reload to include exhaustion/);
  expect(sql(`select current_hp from characters where id='${character}'`)).toBe('20');expect(pending()).toEqual([]);
 });
 test('committed legacy requests replay even after gaining exhaustion',()=>{
  const q=damage();const first=run(q);sql(`update characters set exhaustion_level=2 where id='${character}'`);
  expect(run(q)).toMatchObject({replayed:true,check:{save_bonus:first.check.save_bonus}});
  expect(sql(`select current_hp from characters where id='${character}'`)).toBe('14');
 });
 test('standalone save creation includes exhaustion without a damage wrapper',()=>{
  sql(`update characters set exhaustion_level=5 where id='${character}'`);
  expect(run(queue(request,5,exhaustedSnapshot()))).toMatchObject({save_bonus:-5});
  expect(run(settle('array[14]'))).toMatchObject({outcome:'failed',bonus:-5,total:9});
 });

 const effectSnapshot=()=>JSON.stringify({...JSON.parse(exhaustedSnapshot()),active_buffs:JSON.parse(sql(`select coalesce(active_buffs,'[]') from characters where id='${character}'`))});
 test('changed temporary effects reject damage before changing HP',()=>{
  const expected=effectSnapshot();sql(`update characters set active_buffs='[{"name":"Bless","saveBonus":0}]' where id='${character}'`);
  expect(()=>run(damage(6,randomUUID(),hpRevision(),expected))).toThrow(/Character changed/);expect(sql(`select current_hp from characters where id='${character}'`)).toBe('20');
 });
 test('a legacy new hit must reload rather than ignore active effects',()=>{
  sql(`update characters set active_buffs='[{"name":"Bane"}]' where id='${character}'`);
  expect(()=>run(damage())).toThrow(/Reload to include active effects/);expect(pending()).toEqual([]);
 });
 test('recorded modifier stays fixed after effects change and the hit is retried',()=>{
  sql(`update characters set active_buffs='[{"name":"Bless","saveBonus":0}]' where id='${character}'`);
  const q=damage(6,randomUUID(),hpRevision(),effectSnapshot());const first=run(q);
  sql(`update characters set active_buffs='[]' where id='${character}'`);expect(run(q)).toMatchObject({replayed:true,check:{save_bonus:first.check.save_bonus}});
 });

});
