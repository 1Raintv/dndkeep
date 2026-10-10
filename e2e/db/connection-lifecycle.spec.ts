import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-q','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
// Private lifecycle is not exposed yet. Claims still exercise the real owner
// check; separate tests prove authenticated/anonymous cannot call it directly.
const asUser=(u:string,q:string)=>`begin;set local request.jwt.claims='{"sub":"${u}","role":"authenticated"}';${q};commit;`;
test.describe('saved Connection private lifecycle',()=>{
 gateDbSuite();let owner:string,other:string,character:string,id:string,turn:string;
 const invoke=(q:string,user=owner)=>JSON.parse(sql(asUser(user,`select ${q}`))||'null');
 const begin=(free=true,roll=2)=>invoke(`dndkeep_private.begin_connection('${character}','${id}','${turn}',${roll},${free})`);
 const read=()=>invoke(`dndkeep_private.read_connection('${character}','${id}')`);
 test.beforeEach(()=>{
  [owner,other,character,id]=Array.from({length:4},()=>randomUUID());
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@connection.local','{}'),('${other}','${other}@connection.local','{}');
   insert into characters(id,user_id,name,species,class_name,subclass,background,level,class_resources,hit_dice_spent) values('${character}','${owner}','Connection','Human','Psion','Telepath','Sage',7,'{"psionic-energy-dice":6}',0);`);
  turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;
 });
 test.afterEach(()=>{sql(`delete from characters where id='${character}';delete from auth.users where id in('${owner}','${other}')`);});
 test('saves a free use and Bonus Action once, rejects a changed replay',()=>{
  expect(begin()).toMatchObject({base_roll:2,base_range:60,psion_level:7,replayed:false});
  expect(begin()).toMatchObject({replayed:true});
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('6');
  expect(()=>begin(true,3)).toThrow();
  expect(read().remainingSeconds).toBe(3600);
 });
 test('a stale paid claim rolls the action back and another declaration cannot reuse the Bonus Action',()=>{
  expect(()=>begin(false)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.action_claims where request_id='${id}'`)).toBe('0');
  begin();id=randomUUID();expect(()=>begin(false)).toThrow();
  expect(sql(`select count(*) from dndkeep_private.connection_declarations where character_id='${character}'`)).toBe('1');
 });
 test('links Surge once and recovers a finalized roll',()=>{
  begin();const enhancement=randomUUID();
  const surge=()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${enhancement}','surge',null,6)`);
  expect(surge()).toMatchObject({total:4,hitDiceSpent:1});
  expect(surge()).toMatchObject({total:4,hitDiceSpent:1,replayed:true});
  const finalize=()=>invoke(`dndkeep_private.finalize_connection_roll('${character}','${id}')`);
  expect(finalize()).toMatchObject({total:4,originalRolls:[2],rolls:[4],usedSurge:true});
  expect(finalize()).toEqual(read().roll_result);
  expect(()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
 });
 test('expires at one hour of game time, not at finalization or reload',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3599 where character_id='${character}'`);
  expect(read().remainingSeconds).toBe(1);
  invoke(`dndkeep_private.finalize_connection_roll('${character}','${id}')`);
  expect(read().remainingSeconds).toBe(1);
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+1 where character_id='${character}'`);
  expect(read().remainingSeconds).toBe(0);
 });
 test('Restoration consumes one minute instead of ending the whole extension',()=>{
  begin();invoke(`public.settle_psionic_energy('${character}','${randomUUID()}','spend',1,'{}','Manual test')`);
  invoke(`public.settle_psionic_energy('${character}','${randomUUID()}','restore',0,'{}','Psionic Restoration')`);
  expect(read().remainingSeconds).toBe(3540);
 });
 test('ownership and private execution privileges are enforced',()=>{
  begin();expect(()=>invoke(`dndkeep_private.read_connection('${character}','${id}')`,other)).toThrow();
  expect(sql(`select has_function_privilege('anon','dndkeep_private.begin_connection(uuid,uuid,text,integer,boolean)','execute'),has_function_privilege('authenticated','dndkeep_private.begin_connection(uuid,uuid,text,integer,boolean)','execute')`)).toBe('f|f');
 });
 test('a later paid extension spends exactly one die',()=>{
  begin();const previous=id;
  const context=invoke(`public.psionic_turn_context_internal('${character}')`);
  invoke(`public.advance_psionic_solo_turn('${character}','${randomUUID()}',${context.soloTurn})`);
  turn=invoke(`dndkeep_private.action_turn_context('${character}')`).turnId;id=randomUUID();
  expect(begin(false)).toMatchObject({energy_receipt:{remaining:5}});
  expect(begin(false).replayed).toBe(true);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('5');
  expect(invoke(`dndkeep_private.read_connection('${character}','${previous}')`).remainingSeconds).toBe(3594);
 });
 test('Enkindled and Surge finalize their saved total without extra Energy Die spending',()=>{
  sql(`update characters set level=20,class_resources='{"psionic-energy-dice":12}' where id='${character}'`);
  begin();
  expect(invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','enkindled',array[6,9],null)`)).toMatchObject({hitDiceSpent:2,extraRolls:[6,9]});
  expect(invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toMatchObject({hitDiceSpent:3,total:19});
  expect(invoke(`dndkeep_private.finalize_connection_roll('${character}','${id}')`)).toMatchObject({total:19,originalRolls:[2,6,9],rolls:[4,6,9]});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('12');
 });
 test('a completed short rest expires the effect',()=>{
  begin();
  const row=JSON.parse(sql(`select to_jsonb(c) from characters c where id='${character}'`));
  const fields=['spell_slots','class_resources','feature_uses'];
  const expected=Object.fromEntries([...fields,'class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'].map(k=>[k,row[k]]));
  const updates=Object.fromEntries(fields.map(k=>[k,row[k]??{}]));
  invoke(`public.complete_psionic_rest('${character}','${randomUUID()}','short','${JSON.stringify(expected)}','${JSON.stringify(updates)}')`);
  expect(read().remainingSeconds).toBe(0);
 });
 test('expired declarations cannot spend new enhancement dice',()=>{
  begin();sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3600 where character_id='${character}'`);
  expect(()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });

 test('a missing game clock blocks enhancements and reports an unknown duration',()=>{
  begin();sql(`delete from dndkeep_private.psionic_duration_clocks where character_id='${character}'`);
  expect(read().remainingSeconds).toBeNull();
  expect(()=>invoke(`dndkeep_private.enhance_connection('${character}','${id}','${randomUUID()}','surge',null,6)`)).toThrow();
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('0');
 });

 test('authenticated dispatcher returns records accepted by the real client validator',async({page})=>{
  const payload=JSON.stringify({requestId:id,turnId:turn,roll:2,free:true});
  const call=(operation:string,body:string,user=owner)=>JSON.parse(sql(asUser(user,`set local role authenticated;select public.psionic_connection('${character}','${operation}','${body}')`)));
  const started=call('begin',payload);expect(started).toMatchObject({remainingSeconds:3600,replayed:false});
  expect(call('begin',payload).replayed).toBe(true);
  const result=call('finish',JSON.stringify({declarationId:id}));expect(result.roll_result.total).toBe(2);
  expect(call('list','{}')).toHaveLength(1);
  expect(()=>call('read',JSON.stringify({declarationId:id}),other)).toThrow();
  expect(()=>call('begin',JSON.stringify({...JSON.parse(payload),extra:'unexpected'}))).toThrow();
  expect(sql(`select has_function_privilege('anon','public.psionic_connection(uuid,text,jsonb)','execute')`)).toBe('f');
  await page.goto('/auth');
  const valid=await page.evaluate(async({row,characterId})=>{
   const api=await import('/src/lib/api/telepathicConnection.ts');
   return api.validConnectionRecord(row,characterId);
  },{row:result,characterId:character});
  expect(valid).toBe(true);
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3600 where character_id='${character}'`);
  expect(call('list','{}')).toEqual([]);
  expect(call('read',JSON.stringify({declarationId:id})).remainingSeconds).toBe(0);
 });

 test('lost Connection Surge replies recover after reload without a second Hit Die',async({page})=>{
  begin();const requestId=randomUUID();
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@connection.local'),'email',now(),now(),now());`);
  await signInAsSeedDm(page,`${owner}@connection.local`);
  let dropped=0;
  await page.route('**/rest/v1/rpc/psionic_connection',async route=>{
   if(route.request().postDataJSON()?.p_operation!=='enhance'){await route.continue();return;}
   const response=await route.fetch();expect(response.ok()).toBe(true);dropped++;await route.abort('failed');
  });
  const pending=await page.evaluate(async({characterId,connectionId,requestId})=>{
   const {settleSavedPsionicPayment}=await import('/src/lib/settleSavedPsionicPayment.ts');
   const {spendPsionicSurge}=await import('/src/lib/api/psionicTurns.ts');
   const {pendingPsionicPayments}=await import('/src/lib/psionicPaymentRecovery.ts');
   const payment={kind:'surge',request:{connectionId,requestId,sourceFeature:'Telepathic Connection',rolls:[2],hitDie:6}};
   try{await settleSavedPsionicPayment(characterId,payment,()=>spendPsionicSurge(characterId,payment.request));}catch{/* expected lost replies */}
   return pendingPsionicPayments(characterId);
  },{characterId:character,connectionId:id,requestId});
  expect(dropped).toBe(2);expect(pending).toHaveLength(1);expect(pending[0].request.connectionId).toBe(id);
  expect(sql(`select hit_dice_spent from characters where id='${character}'`)).toBe('1');
  await page.unroute('**/rest/v1/rpc/psionic_connection');await page.reload();
  const recovered=await page.evaluate(async characterId=>{
   const {settleSavedPsionicPayment}=await import('/src/lib/settleSavedPsionicPayment.ts');
   const {spendPsionicSurge}=await import('/src/lib/api/psionicTurns.ts');
   const {pendingPsionicPayments}=await import('/src/lib/psionicPaymentRecovery.ts');
   const payment=pendingPsionicPayments(characterId)[0];
   const receipt=await settleSavedPsionicPayment(characterId,payment,()=>spendPsionicSurge(characterId,payment.request));
   return {receipt,pending:pendingPsionicPayments(characterId)};
  },character);
  expect(recovered).toMatchObject({receipt:{total:4,hitDiceSpent:1,replayed:true},pending:[]});
  expect(sql(`select count(*) from psionic_surge_uses where request_id='${requestId}'`)).toBe('1');
 });

 test('Connection controls recover a lost declaration and display game-time range',async({page},info)=>{
  sql(`update characters set level=5 where id='${character}';
   update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@connection.local'),'email',now(),now(),now());`);
  await signInAsSeedDm(page,`${owner}@connection.local`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::ERR_FAILED'))errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`/e2e/fixtures/connection.html?character=${character}`);
  const panel=page.getByRole('region',{name:'Telepathic Connection controls'});
  await expect(panel).toContainText('Telepathy · 30 ft');
  let dropped=0;await page.route('**/rest/v1/rpc/psionic_connection',async route=>{
   if(route.request().postDataJSON()?.p_operation!=='begin'){await route.continue();return;}
   const response=await route.fetch();expect(response.ok()).toBe(true);dropped++;await route.abort('failed');
  });
  await panel.getByRole('button',{name:'Extend telepathy (free)',exact:true}).click();
  await page.getByRole('button',{name:'Roll and extend',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Confirm saved extension'})).toBeEnabled();
  expect(dropped).toBe(2);await page.unroute('**/rest/v1/rpc/psionic_connection');await page.reload();
  await panel.getByRole('button',{name:'Confirm saved extension'}).click();
  await expect(panel.getByRole('button',{name:'Confirm saved extension'})).toHaveCount(0);
  const declaration=JSON.parse(sql(`select to_jsonb(d) from dndkeep_private.connection_declarations d where character_id='${character}'`));
  await expect(panel).toContainText(`Telepathy · ${30+10*declaration.base_roll} ft`);
  await expect(panel).toContainText('60m 0s remaining');
  await expect(panel.getByRole('button',{name:'Extend telepathy (1 die)',exact:true})).toBeVisible();
  expect(sql(`select count(*) from psionic_energy_uses where character_id='${character}' and request->>'operation'='connection'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe('6');
  // A second click in the same turn must stop before any saved roll or begin request.
  let begins=0;page.on('request',r=>{if(r.url().endsWith('/rpc/psionic_connection')&&r.postDataJSON()?.p_operation==='begin')begins++;});
  await panel.getByRole('button',{name:'Extend telepathy (1 die)',exact:true}).click();
  await page.getByRole('button',{name:'Roll and extend',exact:true}).click();
  await expect(panel.getByRole('alert')).toContainText('Bonus Action is already used');
  expect(begins).toBe(0);
  expect(await page.evaluate(id=>localStorage.getItem(`dndkeep:connection:${id}`),character)).toBeNull();
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+60 where character_id='${character}'`);
  await panel.getByRole('button',{name:'Refresh range'}).click();await expect(panel).toContainText('59m 0s remaining');
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.connection-controls, .connection-controls *')");const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
  await page.screenshot({path:`.tmp/connection-controls-${info.project.name}.png`});
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+3540 where character_id='${character}'`);
  await panel.getByRole('button',{name:'Refresh range'}).click();await expect(panel).toContainText('Telepathy · 30 ft');await expect(panel).toContainText('Base range · always available');
  sql(`update profiles set show_ua_content=true where id='${owner}'`);
  await page.goto(`/character/${character}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telepathic Connection',{exact:true})});
  await ability.getByRole('button',{name:'Range / extend',exact:true}).click();
  await expect(panel).toContainText('Telepathy · 30 ft');
  await panel.screenshot({path:`.tmp/connection-sheet-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.connection-controls, .connection-controls *')");const report=await page.evaluate('('+scoped+'\n})()');expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);}
  expect(errors).toEqual([]);
 });

 for(const scenario of ['free','paid','fresh rejection'] as const)test(`Connection retry retains correct payment: ${scenario}`,async({page},info)=>{
  sql(`update characters set level=5,feature_uses='${scenario==='paid'?'{"Telepathic Connection":1}':'{}'}' where id='${character}';
   update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${owner}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${owner}@connection.local'),'email',now(),now(),now());`);
  await signInAsSeedDm(page,`${owner}@connection.local`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`/e2e/fixtures/connection.html?character=${character}`);
  const panel=page.getByRole('region',{name:'Telepathic Connection controls'});
  await expect(panel).toContainText('Telepathy · 30 ft');
  let behavior:'drop'|'deny'|'allow'=scenario==='fresh rejection'?'deny':'drop';const sent:{p_payload:{requestId:string}}[]=[];
  await page.route('**/rest/v1/rpc/psionic_connection',async route=>{
   const body=route.request().postDataJSON();if(body.p_operation!=='begin')return route.continue();sent.push(body);
   if(behavior==='drop'){const response=await route.fetch();expect(response.ok()).toBe(true);return route.abort();}
   if(behavior==='deny')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Extension permission rejected',details:null,hint:null})});
   return route.continue();
  });
  const extend=panel.getByRole('button',{name:scenario==='paid'?'Extend telepathy (1 die)':'Extend telepathy (free)',exact:true});
  await extend.click();await page.getByRole('button',{name:'Roll and extend',exact:true}).click();
  if(scenario==='fresh rejection'){
   await expect(panel.getByRole('alert')).toContainText('Extension permission rejected');
   await expect(panel.getByRole('button',{name:'Confirm saved extension'})).toHaveCount(0);
   expect(await page.evaluate(id=>localStorage.getItem(`dndkeep:connection:${id}`),character)).toBeNull();
   expect(sql(`select count(*) from dndkeep_private.connection_declarations where character_id='${character}'`)).toBe('0');
   expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('0');
   behavior='allow';await extend.click();await page.getByRole('button',{name:'Roll and extend',exact:true}).click();
  }else{
   await expect(panel.getByRole('button',{name:'Confirm saved extension'})).toBeEnabled();expect(sent).toHaveLength(2);
   const original=await page.evaluate(id=>localStorage.getItem(`dndkeep:connection:${id}`),character);
   expect(original).not.toBeNull();
   expect(sql(`select count(*) from dndkeep_private.connection_declarations where character_id='${character}'`)).toBe('1');
   behavior='deny';await page.reload();await panel.getByRole('button',{name:'Confirm saved extension'}).click();
   await expect(panel.getByRole('alert')).toContainText('Extension permission rejected');
   await expect(panel.getByRole('button',{name:'Confirm saved extension'})).toBeEnabled();
   expect(await page.evaluate(id=>localStorage.getItem(`dndkeep:connection:${id}`),character)).toBe(original);
   await expect(panel.getByRole('button',{name:/Extend telepathy/})).toBeDisabled();
   await page.screenshot({path:info.outputPath('connection-retry-retained.png')});
   behavior='allow';await page.reload();await panel.getByRole('button',{name:'Confirm saved extension'}).click();
  }
  await expect(panel).toContainText('60m 0s remaining');
  await expect(panel.getByRole('button',{name:'Confirm saved extension'})).toHaveCount(0);
  const declaration=JSON.parse(sql(`select to_jsonb(d) from dndkeep_private.connection_declarations d where character_id='${character}'`));
  await expect(panel).toContainText(`Telepathy · ${30+10*declaration.base_roll} ft`);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${character}'`)).toBe(scenario==='paid'?'5':'6');
  expect(sql(`select feature_uses->>'Telepathic Connection' from characters where id='${character}'`)).toBe(scenario==='paid'?'2':'1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${character}'`)).toBe('1');
  expect(sql(`select count(*) from psionic_energy_uses where character_id='${character}' and request->>'operation'='connection'`)).toBe('1');
  expect(await page.evaluate(id=>localStorage.getItem(`dndkeep:connection:${id}`),character)).toBeNull();
  if(scenario==='fresh rejection'){expect(sent).toHaveLength(2);expect(sent[0].p_payload.requestId).not.toBe(sent[1].p_payload.requestId);}
  else{expect(sent).toHaveLength(4);for(const request of sent)expect(request).toEqual(sent[0]);}
  await page.screenshot({path:info.outputPath('connection-retry-confirmed.png')});expect(errors).toEqual([]);
 });

});
