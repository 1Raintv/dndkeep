import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
const json=(v:unknown)=>"'"+JSON.stringify(v).replace(/'/g,"''")+"'::jsonb";
const parallel=(q:string)=>new Promise<{code:number|null,out:string,error:string}>(resolve=>{const p=spawn('docker',args);let out='',error='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>error+=v);p.on('close',code=>resolve({code,out,error}));p.stdin.end(q);});
test.describe('Atomic turn recharge batches',()=>{
 test.use({serviceWorkers:'block'});
 gateDbSuite();let dm:string,player:string,campaign:string,enc:string,participant:string,creature:string,monster:string,turn:string,request:string;
 const names=['Breath (Recharge 5–6)','Burst (Recharge 6)'];
 const actions=names.map(name=>({name,usage:'recharge on roll'}));
 const rolls=[{name:names[0],min:5,max:6,roll:5},{name:names[1],min:6,max:6,roll:5}];
 test.beforeEach(()=>{
  [dm,player,campaign,enc,participant,creature,monster,request]=Array.from({length:8},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@recharge.local','{}'),('${player}','${player}@recharge.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Recharge fixture');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into monsters(id,name,owner_id,source,visibility,type,cr,xp,size,hp,hp_formula,ac,speed,str,dex,con,int,wis,cha,actions)
   values('${monster}','Recharge creature','${dm}','homebrew','private','dragon','1',200,'Large',30,'4d10+8',14,30,14,10,14,10,10,10,${json(actions)});
   insert into homebrew_monsters(id,campaign_id,name,source_monster_id) values('${creature}','${campaign}','Recharge creature','${monster}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${campaign}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,expended_recharge,hidden_from_players)
   values('${participant}','${enc}','${campaign}','creature','${creature}','Recharge creature',0,array['${names[0]}','${names[1]}'],true);commit;`);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from homebrew_monsters where id='${creature}';delete from monsters where id='${monster}';delete from auth.users where id in('${dm}','${player}')`));
 const prepare=()=>`select get_turn_recharge_context('${participant}','${enc}','${turn}')`;
 const context=()=>JSON.parse(sql(auth(dm,prepare())));
 const call=(expected=context().expected,values:unknown=rolls,id=request)=>`select commit_turn_recharge_batch('${participant}','${turn}','${id}',${json(expected)},${json(values)})`;
 const read=()=>`select read_turn_recharge_batch('${participant}','${turn}')`;
 const spent=()=>JSON.parse(sql(`select to_jsonb(expended_recharge) from combat_participants where id='${participant}'`));
 const events=()=>JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('sequence',sequence,'payload',payload,'visibility',visibility) order by sequence),'[]') from combat_events where encounter_id='${enc}' and chain_id='${request}'`));
 test('authorized preparation returns exact catalog and spent resources without mutation',()=>{
  expect(context()).toEqual({userId:dm,participantId:participant,encounterId:enc,turnId:turn,expected:{entityId:creature,sourceId:monster,expended:names,actions}});
  expect(spent()).toEqual(names);expect(events()).toEqual([]);expect(sql(auth(dm,read()))).toBe('');
 });
 test('recharge state, dice, ordered hidden events and receipt commit together',()=>{
  const result=JSON.parse(sql(auth(dm,call())));
  expect(result).toEqual({requestId:request,participantId:participant,encounterId:enc,turnId:turn,remaining:[names[1]],rolls:rolls.map((r,n)=>({...r,recharged:n===0})),eventCount:2,replayed:false});
  expect(spent()).toEqual([names[1]]);expect(events()).toHaveLength(2);
  expect(events().map((e:{sequence:number;visibility:string})=>[e.sequence,e.visibility])).toEqual([[0,'hidden_from_players'],[1,'hidden_from_players']]);
  expect(JSON.parse(sql(auth(dm,read())))).toEqual({...result,replayed:true});
 });
 test('replay preserves later spending and works after combat ends',()=>{
  const q=call(),result=JSON.parse(sql(auth(dm,q)));
  sql(`update combat_participants set expended_recharge=array['${names[0]}','${names[1]}'] where id='${participant}';update combat_encounters set status='ended' where id='${enc}'`);
  expect(JSON.parse(sql(auth(dm,q)))).toEqual({...result,replayed:true});expect(spent()).toEqual(names);expect(events()).toHaveLength(2);
 });
 test('same request raced across clients commits once',async()=>{
  const q=auth(dm,call()),out=await Promise.all([parallel(q),parallel(q)]);
  expect(out.every(x=>x.code===0),JSON.stringify(out)).toBe(true);expect(out.map(x=>JSON.parse(x.out).replayed).sort()).toEqual([false,true]);expect(events()).toHaveLength(2);
 });
 test('different requests cannot reroll one participant turn',async()=>{
  const expected=context().expected;const out=await Promise.all([parallel(auth(dm,call(expected))),parallel(auth(dm,call(expected,rolls,randomUUID())))]);
  expect(out.filter(x=>x.code===0)).toHaveLength(1);expect(out.find(x=>x.code!==0)?.error).toContain('already recorded');
  expect(sql(`select count(*) from combat_events where encounter_id='${enc}'`)).toBe('2');
 });
 test('changed saved payload is rejected instead of changing the original rolls',()=>{
  const expected=context().expected;sql(auth(dm,call(expected)));
  expect(()=>sql(auth(dm,call(expected,[{...rolls[0],roll:1},rolls[1]])))).toThrow(/Saved recharge request changed/);expect(events()).toHaveLength(2);
 });
 test('stale resources and catalog edits cannot overwrite current data',()=>{
  const expected=context().expected;sql(`update combat_participants set expended_recharge=array['${names[0]}'] where id='${participant}'`);
  expect(()=>sql(auth(dm,call(expected)))).toThrow(/state changed/);expect(spent()).toEqual([names[0]]);
  sql(`update combat_participants set expended_recharge=array['${names[0]}','${names[1]}'] where id='${participant}';update monsters set actions='[]' where id='${monster}'`);
  expect(()=>sql(auth(dm,call(expected)))).toThrow(/state changed/);expect(events()).toEqual([]);
 });
 test('players and anonymous callers cannot read, prepare, commit or inspect the ledger',()=>{
  const q=call();for(const command of [prepare(),read(),q]){
   expect(()=>sql(auth(player,command))).toThrow(/current DM/);expect(()=>sql('set role anon;'+command)).toThrow(/permission denied/);
  }
  expect(()=>sql(auth(dm,'select * from dndkeep_private.turn_recharge_batches'))).toThrow(/permission denied/);expect(spent()).toEqual(names);
 });
 test('new owner can recover the old receipt but former owner cannot',()=>{
  const q=call();sql(auth(dm,q));sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);
  expect(()=>sql(auth(dm,read()))).toThrow(/current DM/);expect(()=>sql(auth(dm,q))).toThrow(/current DM/);
  expect(JSON.parse(sql(auth(player,read()))).replayed).toBe(true);
 });
 test('unavailable or private foreign catalog never leaks through the preparation API',()=>{
  sql(`update monsters set owner_id='${player}' where id='${monster}'`);expect(()=>context()).toThrow(/catalog is unavailable/);
  sql(`update monsters set source='ua',visibility='public' where id='${monster}'`);expect(()=>context()).toThrow(/catalog is unavailable/);
 });
 test('stale turns and ended turns cannot get fresh recharge rolls',()=>{
  const expected=context().expected;sql(`update combat_encounters set round_number=2 where id='${enc}'`);
  expect(()=>context()).toThrow(/Turn changed/);expect(()=>sql(auth(dm,call(expected)))).toThrow(/Turn changed/);
  turn=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);sql(`update combat_encounters set status='ended' where id='${enc}'`);
  expect(()=>context()).toThrow(/Turn changed/);expect(events()).toEqual([]);
 });
 test('closed end-effect phase cannot start fresh recharge work',()=>{
  const expected=context().expected;
  sql(`insert into dndkeep_private.turn_effect_batches(request_id,participant_id,turn_id,timing,request,result) values('${randomUUID()}','${participant}','${turn}','turn_end','{}','{}')`);
  expect(()=>context()).toThrow(/Turn changed/);expect(()=>sql(auth(dm,call(expected)))).toThrow(/Turn changed/);
 });
 test('event failure rolls back resources, earlier events and receipt',()=>{
  const expected=context().expected,fn='reject_recharge_'+request.replaceAll('-','');
  sql(`create function public.${fn}() returns trigger language plpgsql as $$ begin if new.chain_id='${request}' and new.sequence=1 then raise exception 'fixture recharge failure';end if;return new;end $$;create trigger ${fn} before insert on combat_events for each row execute function public.${fn}()`);
  try{expect(()=>sql(auth(dm,call(expected)))).toThrow(/fixture recharge failure/);expect(spent()).toEqual(names);expect(events()).toEqual([]);expect(sql(auth(dm,read()))).toBe('');}
  finally{sql(`drop trigger ${fn} on combat_events;drop function public.${fn}()`);}
  expect(JSON.parse(sql(auth(dm,call(expected)))).replayed).toBe(false);
 });
 test('invalid dice, ranges, names, count and caller-supplied outcomes are rejected',()=>{
  const expected=context().expected;
  for(const values of [[],[{...rolls[0],roll:0},rolls[1]],[{...rolls[0],roll:7},rolls[1]],[{...rolls[0],roll:2.5},rolls[1]],
   [{...rolls[0],min:6,max:5},rolls[1]],[{...rolls[0],name:'Other'},rolls[1]],[{...rolls[0],recharged:true},rolls[1]]])
   expect(()=>sql(auth(dm,call(expected,values)))).toThrow(/Invalid recharge|missing or ambiguous/);
  expect(spent()).toEqual(names);expect(events()).toEqual([]);
 });
 test('browser reload recovers lost recharge replies without rerolling or replacing later spending',async({page})=>{
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@recharge.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@recharge.local`);const identity={participantId:participant,encounterId:enc,turnId:turn};let commits=0,preparations=0;
  page.on('request',r=>{if(r.url().endsWith('/rpc/get_turn_recharge_context'))preparations++;});
  await page.route('**/rest/v1/rpc/commit_turn_recharge_batch',async route=>{await route.fetch();commits++;await route.abort('failed');});
  const first=await page.evaluate(async({user,identity})=>{
   const api=await import('/src/lib/api/turnRecharges.ts');
   try{await api.processSavedTurnRecharge(user,identity,()=>{});return {failed:false,saved:api.savedTurnRecharge(user,identity)};}
   catch{return {failed:true,saved:api.savedTurnRecharge(user,identity)};}
  },{user:dm,identity});
  expect(first.failed).toBe(true);expect(first.saved).not.toBeNull();expect(commits).toBe(2);expect(preparations).toBe(1);
  const original=JSON.parse(sql(auth(dm,read())));expect(original.rolls.map(({name,min,max,roll}:{name:string;min:number;max:number;roll:number})=>({name,min,max,roll}))).toEqual(first.saved!.rolls);
  sql(`update combat_participants set expended_recharge=array['${names[0]}','${names[1]}'] where id='${participant}';update combat_encounters set round_number=2 where id='${enc}'`);
  await page.reload();const recovered=await page.evaluate(async({user,identity})=>{
   const api=await import('/src/lib/api/turnRecharges.ts');const result=await api.processSavedTurnRecharge(user,identity,()=>{});return {result,saved:api.savedTurnRecharge(user,identity)};
  },{user:dm,identity});
  expect(recovered).toEqual({result:original,saved:null});expect(spent()).toEqual(names);expect(commits).toBe(2);expect(preparations).toBe(1);
  expect(sql(`select count(*) from combat_events where encounter_id='${enc}'`)).toBe('2');
 });
 test('empty recharge batch is recorded once without requiring catalog data',()=>{
  sql(`update combat_participants set expended_recharge='{}' where id='${participant}';update homebrew_monsters set source_monster_id=null where id='${creature}'`);
  const c=context();expect(c.expected).toMatchObject({sourceId:null,expended:[],actions:[]});
  const q=call(c.expected,[]);expect(JSON.parse(sql(auth(dm,q)))).toMatchObject({remaining:[],rolls:[],eventCount:0,replayed:false});
  expect(JSON.parse(sql(auth(dm,q))).replayed).toBe(true);expect(events()).toEqual([]);
 });
});
