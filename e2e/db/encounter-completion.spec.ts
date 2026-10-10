import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const args=['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(q:string)=>execFileSync('docker',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const auth=(u:string,q:string)=>`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('Atomic encounter completion',()=>{
 test.use({serviceWorkers:'block'});gateDbSuite();let dm:string,player:string,campaign:string,enc:string,a:string,b:string,ca:string,cb:string,pa:string,pb:string,request:string,turn:string;
 test.beforeEach(()=>{
  [dm,player,campaign,enc,a,b,ca,cb,pa,pb,request]=Array.from({length:11},()=>randomUUID());
  sql(`begin;insert into auth.users(id,email,raw_user_meta_data) values('${dm}','${dm}@turn.local','{}'),('${player}','${player}@turn.local','{}');
   insert into campaigns(id,owner_id,name,seconds_per_round) values('${campaign}','${dm}','Turn fixture',6);
   insert into campaign_members(campaign_id,user_id,role) values('${campaign}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background) values('${a}','${player}','${campaign}','A','Human','Psion','Sage'),('${b}','${dm}','${campaign}','B','Human','Fighter','Sage');
   insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp) values('${ca}','${campaign}','${player}','A','character','${a}',20,20),('${cb}','${campaign}','${dm}','B','character','${b}',20,20);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,lair_action_used_this_round) values('${enc}','${campaign}','active',1,0,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${pa}','${enc}','${campaign}','character','${a}','A',0,'${ca}'),('${pb}','${enc}','${campaign}','character','${b}','B',1,'${cb}');
   update combatants set active_buffs='[{"id":"timed","duration":3},{"id":"indefinite","duration":-1}]' where id in('${ca}','${cb}');commit;`);turn=JSON.parse(sql(`select to_jsonb(psionic_turn_id) from combat_encounters where id='${enc}'`));
 });
 test.afterEach(()=>sql(`delete from campaigns where id='${campaign}';delete from characters where id in('${a}','${b}');delete from auth.users where id in('${dm}','${player}')`));

 const finish=(user=dm,t=turn)=>JSON.parse(sql(auth(user,`select end_combat_encounter('${enc}','${t}')`)));
 const snapshot=()=>sql(`select jsonb_build_object('enc',(select to_jsonb(e) from combat_encounters e where id='${enc}'),
 'characters',(select jsonb_agg(to_jsonb(c) order by id) from characters c where id in('${a}','${b}')),
 'receipts',(select count(*) from dndkeep_private.encounter_completions where encounter_id='${enc}'),
 'events',(select count(*) from combat_events where encounter_id='${enc}' and event_type='combat_ended'))`);
 test('carries HP, conditions, buffs and stable death counters with one completion log',()=>{
  sql(`update combatants set current_hp=0,temp_hp=2,death_save_successes=2,death_save_failures=1,is_stable=true,active_conditions=array['Prone'] where id='${ca}'`);
  expect(finish()).toMatchObject({encounterId:enc,turnId:turn,characterCount:2,templateCount:0,replayed:false});
  const c=JSON.parse(sql(`select to_jsonb(c) from characters c where id='${a}'`));
  expect(c).toMatchObject({current_hp:0,temp_hp:2,death_saves_successes:0,death_saves_failures:0,is_stable:true,active_conditions:['Prone'],active_buffs:[{id:'timed',duration:3},{id:'indefinite',duration:-1}]});
  const state=JSON.parse(snapshot());expect(state.enc.status).toBe('ended');expect(state.receipts).toBe(1);expect(state.events).toBe(1);
 });
 test('unstable characters retain both death counters',()=>{
  sql(`update combatants set current_hp=0,death_save_successes=2,death_save_failures=1,is_stable=false where id='${ca}'`);finish();
  expect(JSON.parse(sql(`select jsonb_build_object('successes',death_saves_successes,'failures',death_saves_failures) from characters where id='${a}'`))).toEqual({successes:2,failures:1});
 });
 test('replay never overwrites healing after combat',()=>{
  const first=finish();sql(`update characters set current_hp=13 where id='${a}'`);const before=snapshot();
  expect(finish()).toEqual({...first,replayed:true});expect(snapshot()).toBe(before);
 });
 test('dead combatants carry the character death marker',()=>{
  sql(`update combatants set current_hp=0,is_dead=true,is_stable=false where id='${ca}'`);finish();
  expect(JSON.parse(sql(`select jsonb_build_object('failures',death_saves_failures,'stable',is_stable) from characters where id='${a}'`))).toEqual({failures:3,stable:false});
 });
 test('wrong turn and unauthorized users leave all state unchanged',()=>{
  const before=snapshot();expect(()=>finish(dm,randomUUID())).toThrow(/Combat changed/);expect(()=>finish(player)).toThrow(/only to its DM/);expect(snapshot()).toBe(before);
 });
 test('direct status changes and reopening completed combat are rejected',()=>{
  expect(()=>sql(auth(dm,`update combat_encounters set status='ended' where id='${enc}'`))).toThrow(/verified combat completion/);
  finish();expect(()=>sql(auth(dm,`update combat_encounters set status='active' where id='${enc}'`))).toThrow(/new encounter/);
 });
 test('pending movement blocks completion before character writes',()=>{
  sql(`insert into dndkeep_private.movement_aura_events(campaign_id,encounter_id,turn_id,placement_id,captured_by,context) values('${campaign}','${enc}','${turn}','${randomUUID()}','${dm}','{}')`);
  const before=snapshot();expect(()=>finish()).toThrow(/pending movement/);expect(snapshot()).toBe(before);
 });
 test('missing character identity blocks rather than dropping carry-over',()=>{
  sql(`update combat_participants set entity_id='${randomUUID()}' where id='${pa}'`);const before=snapshot();expect(()=>finish()).toThrow(/Repair character identity/);expect(snapshot()).toBe(before);
 });
 for(const table of ['characters','combat_events','combat_encounters'])test(`late ${table} failure rolls back the entire save`,()=>{
  const fn='reject_completion_'+randomUUID().replaceAll('-','');
  const predicate=table==='characters'?`new.id='${b}'`:table==='combat_events'?`new.encounter_id='${enc}' and new.event_type='combat_ended'`:`new.id='${enc}' and new.status='ended'`;
  sql(`create function public.${fn}() returns trigger language plpgsql as $$begin if ${predicate} then raise exception 'fixture completion failure';end if;return new;end$$;create trigger ${fn} before ${table==='combat_events'?'insert':'update'} on public.${table} for each row execute function public.${fn}()`);
  try{const before=snapshot();expect(()=>finish()).toThrow(/fixture completion failure/);expect(snapshot()).toBe(before);}
  finally{sql(`drop trigger ${fn} on public.${table};drop function public.${fn}()`);}
  expect(finish().replayed).toBe(false);
 });
 test('carries immunity snapshots in the same transaction',()=>{
  sql(`insert into campaign_condition_immunities(campaign_id,target_type,target_id,source_kind,source_id,granted_at_rounds,expires_at_rounds,encounter_id) values('${campaign}','character','${a}','spell','fixture',0,10,'${enc}')`);finish();
  expect(JSON.parse(sql(`select active_immunities from characters where id='${a}'`))).toEqual([{source_kind:'spell',source_id:'fixture',source_name:'',granted_at_rounds:0,expires_at_rounds:10,encounter_id:enc}]);
 });
 test('only owned creature templates receive buffs, never instance HP',()=>{
  const owned=randomUUID(),other=randomUUID(),x=randomUUID(),y=randomUUID();
  try{
   sql(`insert into homebrew_monsters(id,user_id,name,hp) values('${owned}','${dm}','Owned',40),('${other}','${player}','Player owned',50);
    insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,active_buffs) values('${x}','${campaign}','${dm}','Owned','homebrew_monster','${owned}',5,40,'[{"id":"buff"}]'),('${y}','${campaign}','${player}','Player owned','homebrew_monster','${other}',7,50,'[{"id":"buff"}]');
    insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${enc}','${campaign}','creature','${owned}','Owned',2,'${x}'),('${enc}','${campaign}','creature','${other}','Player owned',3,'${y}')`);
   expect(finish().templateCount).toBe(1);
   expect(JSON.parse(sql(`select jsonb_build_object('hp',hp,'buffs',active_buffs) from homebrew_monsters where id='${owned}'`))).toEqual({hp:40,buffs:[{id:'buff'}]});
   expect(JSON.parse(sql(`select jsonb_build_object('hp',hp,'buffs',active_buffs) from homebrew_monsters where id='${other}'`))).toEqual({hp:50,buffs:[]});
  }finally{sql(`delete from homebrew_monsters where id in('${owned}','${other}')`);}
 });
 test('unfinished incoming effects block completion',()=>{
  sql(`insert into dndkeep_private.combat_clock_transitions(request_id,encounter_id,request,result) values('${request}','${enc}','{}','{}');insert into dndkeep_private.live_turn_transitions(request_id,encounter_id,context) values('${request}','${enc}','{}')`);
  const before=snapshot();expect(()=>finish()).toThrow(/Finish incoming turn effects/);expect(snapshot()).toBe(before);
 });
 test('completion history stays DM-only and does not expose private tables',()=>{
  finish();expect(()=>sql(auth(player,`select read_combat_completion('${enc}')`))).toThrow(/only to its DM/);
  expect(()=>sql(auth(dm,'select * from dndkeep_private.encounter_completions'))).toThrow(/permission denied/);
  sql(`update campaigns set owner_id='${player}' where id='${campaign}'`);
  expect(()=>sql(auth(dm,`select read_combat_completion('${enc}')`))).toThrow(/only to its DM/);
  expect(JSON.parse(sql(auth(player,`select read_combat_completion('${enc}')`))).replayed).toBe(true);
 });
 test('conflicting creature instances cannot overwrite a shared template arbitrarily',()=>{
  const owned=randomUUID(),x=randomUUID(),y=randomUUID();
  try{
   sql(`insert into homebrew_monsters(id,user_id,name) values('${owned}','${dm}','Shared');
    insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp,active_buffs) values('${x}','${campaign}','${dm}','One','homebrew_monster','${owned}',5,40,'[{"id":"buff"}]'),('${y}','${campaign}','${dm}','Two','homebrew_monster','${owned}',7,40,'[]');
    insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id) values('${enc}','${campaign}','creature','${owned}','One',2,'${x}'),('${enc}','${campaign}','creature','${owned}','Two',3,'${y}')`);
   const before=snapshot();expect(()=>finish()).toThrow(/different buffs on instances/);expect(snapshot()).toBe(before);
  }finally{sql(`delete from homebrew_monsters where id='${owned}'`);}
 });

 const attack=(state='declared',lr=false)=>`insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_name,attack_kind,state,pending_lr_decision,chain_id) values('${request}','${campaign}','${enc}','${pa}','A','character','${pb}','B','character','Fixture','attack_roll','${state}',${lr},'${randomUUID()}')`;
 for(const state of ['declared','attack_rolled','damage_rolled'])test(`unfinished ${state} attack blocks completion without carry-over`,()=>{
  sql(attack(state));const before=snapshot();expect(()=>finish()).toThrow(/Resolve pending attacks/);expect(snapshot()).toBe(before);
  sql(`update pending_attacks set state='applied' where id='${request}'`);expect(finish().replayed).toBe(false);
 });
 for(const state of ['applied','canceled'])test(`terminal ${state} attack allows completion`,()=>{sql(attack(state));expect(finish().replayed).toBe(false);});
 test('a remaining Legendary Resistance choice blocks even a terminal attack',()=>{
  sql(attack('canceled',true));const before=snapshot();expect(()=>finish()).toThrow(/Legendary Resistance/);expect(snapshot()).toBe(before);
 });
 test('ended encounters reject new attacks and reopening historical attacks',()=>{
  sql(attack('applied'));finish();expect(()=>sql(`update pending_attacks set state='declared' where id='${request}'`)).toThrow(/no longer active/);
  expect(()=>sql(attack().replace(request,randomUUID()))).toThrow(/no longer active/);
 });
 test('an attack cannot evade completion review by removing its encounter',()=>{
  sql(attack());expect(()=>sql(auth(dm,`update pending_attacks set encounter_id=null where id='${request}'`))).toThrow(/cannot be moved/);
 });

 for(const first of ['attack','completion'])test(`${first} holds the encounter lock against the competing operation`,async()=>{
  const complete=`select end_combat_encounter('${enc}','${turn}')`;
  const held=spawn('docker',args);let output='',error='';held.stdout.on('data',v=>output+=v);held.stderr.on('data',v=>error+=v);
  const heldDone=new Promise<number|null>(resolve=>held.on('close',resolve));
  let waiting:ReturnType<typeof spawn>|undefined,done:Promise<number|null>|undefined,waitError='';
  try{
   held.stdin.write(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${dm}","role":"authenticated"}';${first==='attack'?attack():complete};\n\\echo DECLARED\n`);
   await expect.poll(()=>output.includes('DECLARED'),{timeout:5000}).toBe(true);
   const label=`propel-boundary-${enc}`;waiting=spawn('docker',args);waiting.stdout.resume();waiting.stderr.on('data',v=>waitError+=v);done=new Promise(resolve=>waiting!.on('close',resolve));
   waiting.stdin.end(`set application_name='${label}';${auth(dm,first==='attack'?complete:attack())}`);
   await expect.poll(()=>sql(`select count(*) from pg_stat_activity where application_name='${label}' and wait_event_type='Lock'`),{timeout:5000}).toBe('1');
   held.stdin.end('commit;\n');expect(await heldDone,error).toBe(0);expect(await done).not.toBe(0);expect(waitError).toContain(first==='attack'?'Resolve pending attacks':'no longer active');expect(JSON.parse(snapshot()).enc.status).toBe(first==='attack'?'active':'ended');
  }finally{
   if(held.exitCode===null){held.stdin.end('rollback;\n');await heldDone;}
   if(waiting&&waiting.exitCode===null){waiting.stdin.end();if(done)await done;}
  }
 });

 const saveBatch=(actor=pa,targets=[{participant_id:pb,name:'Spoofed',type:'creature',entity_id:'not-a-uuid'}])=>`select row_to_json(r) from declare_save_batch('${campaign}','${enc}','${request}','${actor}','Spoofed actor','creature','Batch fixture',15,'DEX','none','1d6','Bludgeoning',null,'${JSON.stringify(targets)}'::jsonb) r`;
 test('save batches use canonical actor and target identities',()=>{
  const r=JSON.parse(sql(auth(player,saveBatch())));expect(r.target_name).toBe('B');
  expect(JSON.parse(sql(`select jsonb_build_object('actor',attacker_name,'actorType',attacker_type,'target',target_name,'targetType',target_type) from pending_attacks where id='${r.pending_attack_id}'`))).toEqual({actor:'A',actorType:'character',target:'B',targetType:'character'});
 });
 test('save batches reject another players actor without writing attacks',()=>{
  expect(()=>sql(auth(player,saveBatch(pb)))).toThrow(/cannot declare saves/);
  expect(sql(`select count(*) from pending_attacks where encounter_id='${enc}'`)).toBe('0');
 });
 test('save batches reject repeated targets and roll back a later missing target',()=>{
  const target={participant_id:pb,name:'B',type:'character',entity_id:b};
  expect(()=>sql(auth(dm,saveBatch(pa,[target,target])))).toThrow(/only once/);
  expect(()=>sql(auth(dm,saveBatch(pa,[target,{...target,participant_id:randomUUID()}])))).toThrow(/no longer in this encounter/);
  expect(sql(`select count(*) from pending_attacks where encounter_id='${enc}'`)).toBe('0');
 });
 test('save batches require an active encounter and retain DM creature control',()=>{
  sql(`update combat_participants set participant_type='creature',entity_id='catalog-slug' where id='${pa}'`);
  expect(()=>sql(auth(player,saveBatch()))).toThrow(/cannot declare saves/);expect(JSON.parse(sql(auth(dm,saveBatch()))).target_name).toBe('B');
  sql(`update pending_attacks set state='canceled' where encounter_id='${enc}'`);finish();expect(()=>sql(auth(dm,saveBatch()))).toThrow(/encounter is unavailable/);
 });

 test('save batches reject a target in another encounter of the same campaign',()=>{
  const other=randomUUID();sql(`insert into combat_encounters(id,campaign_id,status) values('${other}','${campaign}','active');update combat_participants set encounter_id='${other}' where id='${pb}'`);
  expect(()=>sql(auth(dm,saveBatch()))).toThrow(/no longer in this encounter/);expect(sql(`select count(*) from pending_attacks where campaign_id='${campaign}'`)).toBe('0');
 });
 async function login(page:Page){
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}',jsonb_build_object('sub','${dm}','email','${dm}@turn.local'),'email',now(),now(),now())`);
  await signInAsSeedDm(page,`${dm}@turn.local`);
 }

 test('browser cancellation reports a resistance rejection and retries the same attack',async({page})=>{
  sql(attack('declared',true));await login(page);
  const cancel=()=>page.evaluate(async id=>{const path='/src/lib/api/attackCancellation.ts',api=await import(path);try{await api.cancelPendingAttack(id);return null;}catch(error){return String(error);}},request);
  expect(await cancel()).toContain('Decide Legendary Resistance');expect(sql(`select state from pending_attacks where id='${request}'`)).toBe('declared');
  sql(`update pending_attacks set pending_lr_decision=false where id='${request}'`);
  let replies=0;await page.route('**/rest/v1/pending_attacks?*',async route=>{if(route.request().method()!=='PATCH')return route.continue();await route.fetch();replies++;await route.abort('failed');});
  expect(await cancel()).toBeTruthy();expect(replies).toBe(1);expect(sql(`select state from pending_attacks where id='${request}'`)).toBe('canceled');
  await page.unroute('**/rest/v1/pending_attacks?*');expect(await cancel()).toBeNull();expect(finish().replayed).toBe(false);
 });
 test('browser retries a lost completion reply without overwriting later healing',async({page})=>{
  await login(page);let replies=0;
  await page.route('**/rest/v1/rpc/end_combat_encounter',async route=>{await route.fetch();replies++;await route.abort('failed');});
  const run=()=>page.evaluate(async enc=>{const path='/src/lib/api/endCombat.ts',api=await import(path);try{return {receipt:await api.completeCombat(enc)};}catch(error){return {error:String(error)};}},enc);
  expect((await run()).error).toBeTruthy();expect(replies).toBe(2);expect(JSON.parse(snapshot()).enc.status).toBe('ended');
  sql(`update characters set current_hp=11 where id='${a}'`);const before=snapshot();
  await page.unroute('**/rest/v1/rpc/end_combat_encounter');await page.reload();const recovered=await run();expect(recovered,JSON.stringify(recovered)).toMatchObject({receipt:{replayed:true}});expect(snapshot()).toBe(before);
 });
 test('End Combat shows a persistent failure and remains retryable',async({page},info)=>{
  await login(page);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const bad:string[]=[];page.on('response',r=>{if(r.status()>=400)bad.push(`${r.status()} ${r.url()}`);});
  // Malformed reply is a 200 transport success but cannot be presented as saved.
  await page.route('**/rest/v1/rpc/end_combat_encounter',route=>route.fulfill({status:200,contentType:'application/json',body:'null'}));
  await page.evaluate(async campaign=>{
   const react='/node_modules/.vite/deps/react.js',domPath='/node_modules/.vite/deps/react-dom_client.js',ctxPath='/src/context/CombatContext.tsx',modalPath='/src/components/shared/Modal.tsx',buttonPath='/src/components/Combat/StartCombatButton.tsx';
   const [React,dom,ctx,modal,button]=await Promise.all([import(react),import(domPath),import(ctxPath),import(modalPath),import(buttonPath)]);
   const host=document.createElement('section');host.setAttribute('aria-label','Combat completion controls');host.style.cssText='position:fixed;inset:80px 12px auto;z-index:1000;background:#151923;padding:16px;border-radius:8px';document.body.appendChild(host);
   dom.default.createRoot(host).render(React.default.createElement(modal.ModalProvider,null,React.default.createElement(ctx.CombatProvider,{campaignId:campaign},React.default.createElement(button.default,{campaignId:campaign}))));
  },campaign);
  const controls=page.getByRole('region',{name:'Combat completion controls'});
  await controls.getByRole('button',{name:'End Combat'}).click();await page.getByRole('dialog').getByRole('button',{name:'End Combat',exact:true}).click();
  await expect(controls.getByRole('alert')).toContainText('could not be confirmed');await expect(controls.getByRole('button',{name:'End Combat'})).toBeEnabled();
  await controls.screenshot({path:`.tmp/completion-error-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Combat completion controls\"], [aria-label=\"Combat completion controls\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);}
  expect(JSON.parse(snapshot()).enc.status).toBe('active');expect(errors).toEqual([]);expect(bad).toEqual([]);
  await page.unroute('**/rest/v1/rpc/end_combat_encounter');await controls.getByRole('button',{name:'End Combat'}).click();await page.getByRole('dialog').getByRole('button',{name:'End Combat',exact:true}).click();
  await expect.poll(()=>JSON.parse(snapshot()).enc.status).toBe('ended');
 });

});
