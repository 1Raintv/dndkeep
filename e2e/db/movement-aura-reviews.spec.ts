import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {test,expect,type Page} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
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

 test('the server refuses a new clock boundary until movement is reviewed',()=>{
  move();const [entry]=queue();
  const clock=JSON.parse(sql(auth(dm,`select get_combat_clock_context('${enc}','${turn}')`)));
  const request=randomUUID(),q=`select commit_combat_clock_transition('${enc}','${request}','${turn}','${clock.incomingId}',${clock.nextIndex},${clock.nextRound})`;
  expect(()=>sql(auth(dm,q))).toThrow(/pending movement/);expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).toBe(turn);
  expect(sql(`select count(*) from dndkeep_private.combat_clock_transitions where request_id='${request}'`)).toBe('0');
  finish(entry);sql(auth(dm,q));expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).not.toBe(turn);
 });
 async function mountReview(page:Page){
  sql(`update auth.users set created_at=now(),updated_at=now(),instance_id='00000000-0000-0000-0000-000000000000',aud='authenticated',role='authenticated',encrypted_password=extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),email_confirmed_at=now(),raw_app_meta_data='{"provider":"email","providers":["email"]}',confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id='${dm}';
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${dm}','${dm}','{"sub":"${dm}","email":"${dm}@move-aura.local"}','email',now(),now(),now());`);
  await signInAsSeedDm(page,`${dm}@move-aura.local`);
  await page.evaluate(async({enc})=>{
   const rp='/node_modules/.vite/deps/react.js',dp='/node_modules/.vite/deps/react-dom_client.js',mp='/src/components/shared/Modal.tsx',hp='/src/components/Combat/useAuraTurnReview.tsx',cp='/src/lib/combatEncounter.ts';
   const [React,dom,modal,hook,combat]=await Promise.all([import(rp),import(dp),import(mp),import(hp),import(cp)]);
   function Harness(){const aura=hook.useAuraTurnReview(enc);return React.default.createElement(React.default.Fragment,null,aura.dialog,React.default.createElement('button',{onClick:async()=>{
    delete document.body.dataset.turnResult;document.body.dataset.turnResult=JSON.stringify(await combat.advanceTurn(enc,aura.resolve,aura.reviewMovement));
   }},'Finish reviewed turn'));}
   const host=document.createElement('div');host.style.cssText='position:fixed;top:80px;left:12px;z-index:1000';document.body.appendChild(host);
   dom.default.createRoot(host).render(React.default.createElement(modal.ModalProvider,null,React.default.createElement(Harness)));
  },{enc});
 }
 test('DM can postpone and record a movement ruling before End Turn',async({page},info)=>{
  move();await mountReview(page);const errors:string[]=[],bad:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)bad.push(`${r.status()} ${r.url()}`);});
  const end=page.getByRole('button',{name:'Finish reviewed turn'}),dialog=page.getByRole('dialog',{name:'Review movement effects'});
  await end.click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Confirm movement review'})).toBeDisabled();
  await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>document.body.dataset.turnResult??'')).toContain('postponed');expect(queue()).toHaveLength(1);expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).toBe(turn);
  // End-of-turn aura excluded here so the manual movement ruling is isolated.
  sql(`update combatants set active_buffs='[]' where id='${ca}'`);
  await end.click();await expect(dialog).toBeVisible();await dialog.getByLabel('Ruling for Target').selectOption('not_triggered');await dialog.getByLabel('Reason for Target').fill('The route stayed outside the aura.');await dialog.getByLabel('Movement review note').fill('Confirmed the route with the player.');
  await dialog.screenshot({path:`.tmp/movement-review-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[role=dialog], [role=dialog] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  await dialog.getByRole('button',{name:'Confirm movement review'}).click();await expect.poll(()=>page.evaluate(()=>document.body.dataset.turnResult??'')).toBe('{"ok":true}');expect(queue()).toEqual([]);expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).not.toBe(turn);expect(errors).toEqual([]);expect(bad).toEqual([]);
 });
 test('movement save review reuses its receipt for the outgoing aura',async({page})=>{
  move();await mountReview(page);await page.getByRole('button',{name:'Finish reviewed turn'}).click();
  const movement=page.getByRole('dialog',{name:'Review movement effects'});await movement.getByRole('button',{name:'Resolve or resume save'}).click();
  const input=page.getByRole('dialog',{name:'Review aura inputs'});await expect(input).toBeVisible();
  await input.getByLabel('Base saving throw modifier',{exact:true}).fill('0');await input.getByLabel('Concentration save modifier',{exact:true}).fill('0');await input.getByLabel('Damage defense',{exact:true}).selectOption('normal');for(const checkbox of await input.getByRole('checkbox').all())await checkbox.check();await input.getByRole('button',{name:'Roll and review'}).click();
  const result=page.getByRole('dialog',{name:'Aura: review save'});await expect(result).toBeVisible();const saved=await result.innerText();await page.keyboard.press('Escape');await expect(movement).toBeVisible();await expect(movement.getByRole('alert')).toContainText('postponed');
  await movement.getByRole('button',{name:'Resolve or resume save'}).click();await expect(result).toBeVisible();expect(await result.innerText()).toBe(saved);await expect(input).toBeHidden();
  await result.getByRole('button',{name:'Apply result',exact:true}).click();await expect(movement.getByRole('status')).toHaveText('Saved result verified.');await movement.getByLabel('Movement review note').fill('Confirmed the movement and saved effect.');await movement.getByRole('button',{name:'Confirm movement review'}).click();
  await expect.poll(()=>page.evaluate(()=>document.body.dataset.turnResult??'')).toBe('{"ok":true}');expect(queue()).toEqual([]);expect(sql(`select count(*) from dndkeep_private.aura_resolutions where encounter_id='${enc}'`)).toBe('1');
 });

 test('map DM controls can review movement without advancing combat',async({page},info)=>{
  move();await mountReview(page);const errors:string[]=[],bad:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)bad.push(`${r.status()} ${r.url()}`);});await page.goto('/campaigns');await page.getByText('Movement aura fixture',{exact:true}).locator('visible=true').first().click();
  const controls=page.getByRole('group',{name:'Combat controls'});await expect(controls).toBeVisible();
  await controls.screenshot({path:`.tmp/movement-controls-${info.project.name}.png`});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('.initiative-strip, .initiative-strip *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped,JSON.stringify(layout)).toEqual([]);expect(layout.pastEdge,JSON.stringify(layout)).toEqual([]);}
  await controls.getByRole('button',{name:'Review movement',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Review movement effects'});await expect(dialog).toBeVisible();
  await dialog.getByLabel('Ruling for Target').selectOption('not_triggered');await dialog.getByLabel('Reason for Target').fill('Reviewed the route at the table.');await dialog.getByLabel('Movement review note').fill('No movement effect triggered.');await dialog.getByRole('button',{name:'Confirm movement review'}).scrollIntoViewIfNeeded();
  await dialog.screenshot({path:`.tmp/movement-review-footer-${info.project.name}.png`});
  await dialog.getByRole('button',{name:'Confirm movement review'}).click();await expect(dialog).toBeHidden();await expect.poll(()=>queue().length).toBe(0);expect(sql(`select psionic_turn_id from combat_encounters where id='${enc}'`)).toBe(turn);expect(errors).toEqual([]);expect(bad).toEqual([]);
 });

});
