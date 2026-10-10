import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
import {readFileSync} from 'node:fs';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Atomic Opportunity Attacks',()=>{
 gateDbSuite();let owner:string,dm:string,outsider:string,character:string,campaign:string,encounter:string,actor:string,target:string,offer:string;
 test.beforeEach(()=>{
  [owner,dm,outsider,character,campaign,encounter,actor,target,offer]=Array.from({length:9},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@oa.local','{}'),('${dm}','${dm}@oa.local','{}'),('${outsider}','${outsider}@oa.local','{}');
   insert into campaigns(id,owner_id,name) values('${campaign}','${dm}','OA test');
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${owner}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${character}','${owner}','${campaign}','Hero','Human','Fighter','Sage',5,20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,in_lair) values('${encounter}','${campaign}','active',1,1,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,ac) values
    ('${actor}','${encounter}','${campaign}','character','${character}','Hero',0,15),('${target}','${encounter}','${campaign}','creature','${target}','Enemy',1,13);
   update combatants set definition_id=p.entity_id,current_hp=20,max_hp=20 from combat_participants p where combatants.id=p.combatant_id and p.encounter_id='${encounter}';`);
  insertOffer(offer);
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id='${character}';delete from auth.users where id in('${owner}','${dm}','${outsider}');`));
 const insertOffer=(id:string,reactor=actor,mover=target,type='character')=>sql(`insert into pending_reactions(id,campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload) values('${id}','${campaign}','${reactor}','Reactor','${type}','opportunity_attack','Opportunity Attack','movement_out_of_reach',now()+interval '2 minutes','{"mover_participant_id":"${mover}"}');`);
 const query=(id=offer,bonus=3)=>`select accept_opportunity_attack('${id}','Longsword',${bonus},'1d8+2','slashing')`;
 const accept=(user=owner,id=offer,bonus=3)=>JSON.parse(sql(auth(user,query(id,bonus))));
 const assertUnspent=()=>{
  expect(sql(`select reaction_used from combat_participants where id='${actor}'`)).toBe('f');
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('0');
  expect(sql(`select state from pending_reactions where id='${offer}'`)).toBe('offered');
 };
 test('owner acceptance saves one attack, shared reaction claim, history and replay',()=>{
  const r=accept();expect(r).toMatchObject({offerId:offer,actorId:actor,targetId:target,replayed:false});
  expect(JSON.parse(sql(`select to_jsonb(a) from pending_attacks a where id='${r.attackId}'`))).toMatchObject({state:'declared',attack_name:'Longsword (OA)',attack_mode:'melee',attack_kind:'attack_roll',target_ac:13,damage_dice:'1d8+2'});
  expect(sql(`select reaction_used from combat_participants where id='${actor}'`)).toBe('t');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${offer}' and grant_id='normal:reaction'`)).toBe('1');
  expect(accept()).toEqual({...r,replayed:true});expect(()=>accept(owner,offer,4)).toThrow(/already saved/);
  expect(sql(`select count(*) from combat_events where campaign_id='${campaign}'`)).toBe('2');
  sql(`delete from pending_attacks where id='${r.attackId}'`);expect(accept().attackId).toBe(r.attackId);
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('0');
 });
 test('Disorient acquired after offering blocks without spending, then expiry allows acceptance',()=>{
  sql(`update combatants set active_buffs='[{"key":"telekinetic_disorient:test","name":"Telekinetic Disorient","technique":"disorient","preventsOpportunityAttacks":true}]' where id=(select combatant_id from combat_participants where id='${actor}')`);
  expect(()=>accept()).toThrow(/Disorient/);assertUnspent();
  sql(`update combatants set active_buffs='[]' where id=(select combatant_id from combat_participants where id='${actor}')`);expect(accept().replayed).toBe(false);
 });
 for(const kind of ['spent','dead','incapacitated','expired','turn','target','outsider','invalid weapon'])test(`rejects ${kind}`,()=>{
  if(kind==='spent')sql(`update combat_participants set reaction_used=true where id='${actor}'`);
  if(kind==='dead')sql(`update combatants set current_hp=0 where id=(select combatant_id from combat_participants where id='${actor}')`);
  if(kind==='incapacitated')sql(`update combatants set active_conditions=array['Stunned'] where id=(select combatant_id from combat_participants where id='${actor}')`);
  if(kind==='expired')sql(`update pending_reactions set state='expired' where id='${offer}'`);
  if(kind==='turn')sql(`update combat_encounters set round_number=2 where id='${encounter}'`);
  if(kind==='target')sql(`update combat_participants set entity_id='${randomUUID()}' where id='${target}'`);
  expect(()=>accept(kind==='outsider'?outsider:owner,offer,kind==='invalid weapon'?100:3)).toThrow();
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('0');
 });
 test('DM can accept a creature offer; a player cannot',()=>{
  const other=randomUUID();insertOffer(other,target,actor,'creature');expect(()=>accept(owner,other)).toThrow(/unavailable/);
  const r=accept(dm,other);expect(r).toMatchObject({actorId:target,targetId:actor});
 });
 test('cannot mutate the original target or accept through a loose offer update',()=>{
  expect(()=>sql(auth(owner,`update pending_reactions set state='accepted' where id='${offer}'`))).toThrow(/saved transaction/);
  expect(()=>sql(`update pending_reactions set decision_payload='{"mover_participant_id":"${actor}"}' where id='${offer}'`)).toThrow(/identity/);assertUnspent();
 });
 test('two simultaneous identical requests return one attack',async()=>{
  const send=()=>new Promise<{code:number|null;out:string;error:string}>(resolve=>{
   const child=spawn('docker',args);let out='',error='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>error+=d);child.on('close',code=>resolve({code,out,error}));child.stdin.end(auth(owner,query()));
  });
  const results=await Promise.all([send(),send()]);expect(results.map(r=>r.code)).toEqual([0,0]);
  expect(new Set(results.map(r=>JSON.parse(r.out).attackId)).size).toBe(1);
  expect(results.map(r=>JSON.parse(r.out).replayed).sort()).toEqual([false,true]);
 });
 test('different offers compete for the same reaction',()=>{
  const other=randomUUID();insertOffer(other);accept();expect(()=>accept(owner,other)).toThrow(/spent/);
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('1');
 });
 test('late history failure rolls attack, reaction, offer and receipt back together',()=>{
  sql(`create function public.oa_fail_${offer.replaceAll('-','')}() returns trigger language plpgsql as $$begin if new.campaign_id='${campaign}' then raise exception 'oa rollback probe';end if;return new;end;$$;
   create trigger oa_fail_${offer.replaceAll('-','')} before insert on combat_events for each row execute function public.oa_fail_${offer.replaceAll('-','')}();`);
  try{expect(()=>accept()).toThrow(/oa rollback probe/);assertUnspent();expect(sql(`select receipt is null from dndkeep_private.opportunity_attack_offers where offer_id='${offer}'`)).toBe('t');}
  finally{sql(`drop trigger oa_fail_${offer.replaceAll('-','')} on combat_events;drop function public.oa_fail_${offer.replaceAll('-','')}();`);}
  expect(accept().replayed).toBe(false);
 });

 test('an in-flight Disorient write is seen before acceptance commits',async()=>{
  let ready!:(value?:unknown)=>void;const locked=new Promise(resolve=>{ready=resolve;});
  const child=spawn('docker',args);let output='',error='';child.stdout.on('data',d=>{output+=d;if(output.includes('effect-written'))ready();});child.stderr.on('data',d=>error+=d);
  const finished=new Promise<number|null>(resolve=>child.on('close',resolve));
  child.stdin.end(`begin;update combatants set active_buffs='[{"key":"telekinetic_disorient:test","technique":"disorient","preventsOpportunityAttacks":true}]' where id=(select combatant_id from combat_participants where id='${actor}');select 'effect-written';select pg_sleep(1);commit;`);
  await locked;expect(()=>accept()).toThrow(/Disorient/);expect(await finished,error).toBe(0);assertUnspent();
 });
 test('a missing character cannot turn a null authorization predicate into receipt access',()=>{
  accept();sql(`update combat_participants set entity_id='${randomUUID()}' where id='${actor}'`);
  expect(()=>accept(outsider)).toThrow(/offer is unavailable/);
 });
 test('private bindings and helper execution are inaccessible to ordinary clients',()=>{
  expect(()=>sql(auth(owner,`select * from dndkeep_private.opportunity_attack_offers`))).toThrow(/permission denied/);
  expect(()=>sql(auth(owner,`select dndkeep_private.opportunity_binding('${actor}','${target}')`))).toThrow(/permission denied/);
  expect(sql(`select has_function_privilege('anon','public.accept_opportunity_attack(uuid,text,integer,text,text)','execute')`)).toBe('f');
 });
 test('live creature prompt blocks Disorient, then saves and rolls one attack',async({page},info)=>{
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}',jsonb_build_object('sub','${dm}','email','${dm}@oa.local'),'email',now(),now(),now());`);
  const creatureOffer=randomUUID();insertOffer(creatureOffer,target,actor,'creature');
  sql(`update combatants set active_buffs='[{"key":"telekinetic_disorient:test","name":"Telekinetic Disorient","technique":"disorient","preventsOpportunityAttacks":true}]' where id=(select combatant_id from combat_participants where id='${target}')`);
  const errors:string[]=[];let expectedRejections=0;page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('server responded with a status of 400'))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400){if(r.status()===400&&new URL(r.url()).pathname.endsWith('/rpc/accept_opportunity_attack'))expectedRejections++;else errors.push(`${r.status()} ${new URL(r.url()).pathname}`);}});
  await signInAsSeedDm(page,`${dm}@oa.local`);await page.goto(`/campaigns/${campaign}`);
  const button=page.getByRole('button',{name:/Make Attack/});await expect(button).toBeVisible();await button.click();
  await expect(page.getByRole('alert').filter({hasText:/Disorient/})).toBeVisible();
  expect(sql(`select reaction_used from combat_participants where id='${target}'`)).toBe('f');
  await page.screenshot({path:`.tmp/oa-disorient-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[data-oa-prompt], [data-oa-prompt] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  sql(`update combatants set active_buffs='[]' where id=(select combatant_id from combat_participants where id='${target}')`);await button.click();
  await expect.poll(()=>sql(`select state from pending_reactions where id='${creatureOffer}'`)).toBe('accepted');
  await expect.poll(()=>sql(`select state from pending_attacks where id=(select (receipt->>'attackId')::uuid from dndkeep_private.opportunity_attack_offers where offer_id='${creatureOffer}')`)).toBe('attack_rolled');
  expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('1');expect(errors).toEqual([]);expect(expectedRejections).toBe(1);
 });

});
