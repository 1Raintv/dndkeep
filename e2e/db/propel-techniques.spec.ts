import {readFileSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Telekinetic Technique choices',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,character:string,campaign:string,encounter:string,caster:string,target:string,id:string;
 test.beforeEach(({},testInfo)=>{
  [owner,dm,outsider,character,campaign,encounter,caster,target,id]=Array.from({length:9},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@propelsave.local','{}'),('${dm}','${dm}@propelsave.local','{}'),('${outsider}','${outsider}@propelsave.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','Propel saves');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,class_resources) values('${character}','${owner}','${campaign}','Psion','Human','Psion','Sage',5,'{"psionic-energy-dice":2}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,in_lair) values('${encounter}','${campaign}','active',1,0,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
    ('${caster}','${encounter}','${campaign}','character','${character}','Psion',0),('${target}','${encounter}','${campaign}','creature','${target}','Target',1);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}';`);
  sql(`update characters set subclass='Psykinetic' where id='${character}'`);
  if(testInfo.title.includes('secondary Psion'))sql(`update characters set class_name='Fighter',level=1,subclass='Champion',secondary_class='Psion',secondary_level=5,secondary_subclass='Psykinetic' where id='${character}'`);
  const mode=testInfo.title.includes('no-die')?'free':testInfo.title.includes('free d4')?'technique':'powered';
  const turn=JSON.parse(sql(auth(owner,`select psionic_propel('${character}','context')`))).turnId;
  const payload=JSON.stringify({requestId:id,turnId:turn,mode,movement:'push',roll:mode==='free'?0:3,target:{participantId:target,legalTargetConfirmed:true}});
  sql(auth(owner,`select psionic_propel('${character}','begin','${payload}');select psionic_propel('${character}','finalize','{"declarationId":"${id}"}')`));
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));
 const context=()=>JSON.parse(sql(auth(owner,`select get_propel_save_context('${character}','${id}')`)));
 const settle=(dice=2)=>JSON.parse(sql(auth(owner,`select settle_propel_save('${character}','${id}','${JSON.stringify(context())}',10,array[${dice}],0,0,'[]',3)`)));
 const choose=(choice:string,user=owner)=>JSON.parse(sql(auth(user,`select choose_propel_technique('${character}','${id}','${choice}')`)));
 const read=()=>JSON.parse(sql(auth(owner,`select choose_propel_technique('${character}','${id}')`))||'null');
 const buffs=()=>JSON.parse(sql(`select active_buffs from combatants where id=(select combatant_id from combat_participants where id='${target}')`));
 for(const choice of ['boost','disorient'])test(`${choice} persists one timed effect and does not spend another die`,()=>{
  settle();const result=choose(choice);expect(result).toMatchObject({choice,actorId:caster,targetId:target,declarationId:id,replayed:false,buff:{expiresAtStartOfTurnOf:choice==='boost'?caster:target}});
  expect(result.buff).toMatchObject(choice==='boost'?{speedBonus:10}:{preventsOpportunityAttacks:true});
  expect(buffs().filter((b:{key:string})=>b.key===result.buff.key)).toHaveLength(1);
  expect(choose(choice)).toMatchObject({...result,replayed:true});expect(buffs()).toHaveLength(1);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('1');
  expect(read()).toEqual(result);
  expect(JSON.parse(sql(`select payload from combat_events where payload->>'declaration_id'='${id}'`))).toMatchObject({name:result.buff.name,key:result.buff.key,choice});
 });
 test('Bolt queues the saved Force total once, without applying unreviewed HP damage',()=>{
  settle();const before=sql(`select current_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`);
  const result=choose('bolt');expect(result).toMatchObject({choice:'bolt',attackId:id,damage:3,roll:{total:3}});
  expect(JSON.parse(sql(`select to_jsonb(a) from pending_attacks a where id='${id}'`))).toMatchObject({attack_kind:'auto_hit',attack_source:'ability',attack_name:'Telekinetic Bolt',damage_dice:'3',damage_type:'Force',state:'declared',target_participant_id:target});
  expect(choose('bolt').replayed).toBe(true);expect(sql(`select count(*) from pending_attacks where id='${id}'`)).toBe('1');
  expect(sql(`select current_hp from combatants where id=(select combatant_id from combat_participants where id='${target}')`)).toBe(before);
  sql(`delete from pending_attacks where id='${id}'`);expect(choose('bolt').replayed).toBe(true);expect(sql(`select count(*) from pending_attacks where id='${id}'`)).toBe('0');
 });
 test('skip is a saved choice with no effect and cannot become Bolt later',()=>{
  settle();expect(choose('none')).toMatchObject({choice:'none',attackId:null,buff:null,damage:null});
  expect(()=>choose('bolt')).toThrow(/already saved/);expect(buffs()).toEqual([]);
 });
 for(const outcome of ['unresolved','passed','cancelled'])test(`does not apply a technique after ${outcome}`,()=>{
  if(outcome==='passed')settle(20);
  if(outcome==='cancelled')sql(auth(owner,`select psionic_propel('${character}','finish','{"declarationId":"${id}","outcome":"cancelled","save":null}')`));
  expect(()=>choose('boost')).toThrow(/failed Propel/);expect(read()).toBeNull();
 });
 test('outsiders cannot read or apply another character technique',()=>{
  settle();expect(()=>choose('boost',outsider)).toThrow();
  expect(()=>sql(auth(outsider,`select choose_propel_technique('${character}','${id}')`))).toThrow();expect(read()).toBeNull();
 });
 for(const change of ['subclass','level','identity','turn'])test(`rejects changed ${change} before effect writes`,()=>{
  settle();
  if(change==='subclass')sql(`update characters set subclass='Telepath' where id='${character}'`);
  if(change==='level')sql(`update characters set level=6 where id='${character}'`);
  if(change==='identity'){const entity=randomUUID();sql(`update combat_participants set entity_id='${entity}' where id='${target}';update combatants set definition_id='${entity}' where id=(select combatant_id from combat_participants where id='${target}')`);}
  if(change==='turn')sql(`update combat_encounters set round_number=round_number+1 where id='${encounter}'`);
  expect(()=>choose('boost')).toThrow(/original/);expect(read()).toBeNull();expect(buffs()).toEqual([]);
 });
 test('replay does not resurrect a removed or expired buff',()=>{
  settle();const result=choose('boost');sql(`update combatants set active_buffs='[]' where id=(select combatant_id from combat_participants where id='${target}')`);
  expect(choose('boost')).toMatchObject({...result,replayed:true});expect(buffs()).toEqual([]);
 });
 test('free d4 Bolt uses the substitute roll and spends no Energy Die',()=>{
  settle();expect(choose('bolt')).toMatchObject({damage:3,roll:{total:3,originalRolls:[3]}});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('2');
 });
 test('no-die Propel cannot invent Bolt damage but still permits Boost',()=>{
  settle();expect(()=>choose('bolt')).toThrow(/saved Propel die roll/);expect(read()).toBeNull();
  expect(choose('boost')).toMatchObject({choice:'boost'});
 });
 test('secondary Psion grants the same technique using its own level and subclass',()=>{
  settle();expect(choose('disorient')).toMatchObject({choice:'disorient',buff:{expiresAtStartOfTurnOf:target}});
 });
 test('competing choices commit exactly one effect and one receipt',async()=>{
  settle();
  const send=(choice:string)=>new Promise<{code:number|null;out:string;error:string}>(resolve=>{
   const child=spawn('docker',args);let out='',error='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>error+=d);
   child.on('close',code=>resolve({code,out,error}));child.stdin.end(auth(owner,`select choose_propel_technique('${character}','${id}','${choice}')`));
  });
  const results=await Promise.all([send('boost'),send('disorient')]);
  expect(results.filter(r=>r.code===0)).toHaveLength(1);expect(results.find(r=>r.code!==0)?.error).toContain('already saved');
  expect(buffs()).toHaveLength(1);expect(read().choice).toBe(JSON.parse(results.find(r=>r.code===0)!.out).choice);
 });
 test('Boost changes the live movement display, Dash and next-caster-turn expiry',async({page},info)=>{
  settle();choose('boost');
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}',jsonb_build_object('sub','${dm}','email','${dm}@propelsave.local'),'email',now(),now(),now());
   update combat_encounters set current_turn_index=1 where id='${encounter}';update combat_participants set max_speed_ft=30,movement_used_ft=0 where id='${target}';update combatants set current_hp=20,max_hp=20 where campaign_id='${campaign}';`);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${new URL(response.url()).pathname}`);});
  await signInAsSeedDm(page,`${dm}@propelsave.local`);await page.goto(`/campaigns/${campaign}`);
  const savedTechnique=await page.evaluate(async({character,id})=>{const records='/src/lib/api/psionicPropel.ts',techniques='/src/lib/api/propelTechniques.ts';const row=await(await import(/* @vite-ignore */ records)).readPropel(character,id);return(await import(/* @vite-ignore */ techniques)).choosePropelTechnique(row);},{character,id});
  expect(savedTechnique).toMatchObject({declarationId:id,choice:'boost',actorId:caster,targetId:target,buff:{speedBonus:10}});
  const recovered=await page.evaluate(async({character,id})=>{const records='/src/lib/api/psionicPropel.ts',storage='/src/lib/propelTechniqueRecovery.ts',recovery='/src/lib/confirmPropelTechnique.ts';const saved=await import(/* @vite-ignore */ storage);saved.rememberPropelTechnique(character,{declarationId:id,choice:'disorient'});const row=await(await import(/* @vite-ignore */ records)).readPropel(character,id);const result=await(await import(/* @vite-ignore */ recovery)).resumePropelTechnique(row);return {result,pending:saved.pendingPropelTechniques(character)};},{character,id});
  expect(recovered).toMatchObject({result:{choice:'boost',declarationId:id},pending:[]});

  const strip=page.getByRole('region',{name:'Combat initiative'});
  await expect(strip.getByText('40/40 ft',{exact:true})).toBeVisible();
  const validate=()=>page.evaluate(async id=>{const path='/src/lib/movement.ts';return (await import(/* @vite-ignore */ path)).canMove(id,40);},target);
  expect(await validate()).toMatchObject({allowed:true,maxSpeed:40});
  await strip.getByRole('button',{name:'Dash',exact:true}).click();
  await expect(strip.getByText('80/80 ft',{exact:true})).toBeVisible();
  expect(await validate()).toMatchObject({allowed:true,maxSpeed:80});
  const movePill=page.getByRole('region',{name:'Monster actions'}).getByTitle('Movement — 0/80 ft used');
  await expect(movePill).toHaveText('Move80ft');await movePill.scrollIntoViewIfNeeded();await expect(movePill).toBeVisible();
  await page.screenshot({path:`.tmp/boost-movement-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.initiative-strip, .initiative-strip *, .monster-action-rail, .monster-action-rail *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  await strip.getByRole('button',{name:'End Turn',exact:true}).click();
  await expect.poll(()=>buffs()).toEqual([]);
  await expect(strip.getByText('30/30 ft',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 });
 test('a late history failure rolls back the effect and its saved choice',()=>{
  settle();expect(()=>sql(`begin;create function pg_temp.reject_technique_history() returns trigger language plpgsql as $$begin raise exception 'injected history failure';end;$$;
   create trigger test_reject_technique_history before insert on combat_events for each row execute function pg_temp.reject_technique_history();
   set local role authenticated;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select choose_propel_technique('${character}','${id}','boost');commit;`)).toThrow(/injected history failure/);
  expect(read()).toBeNull();expect(buffs()).toEqual([]);expect(choose('boost').replayed).toBe(false);
 });
});
