import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
test.describe('saved attack outcome rules',()=>{
 gateDbSuite();
 let owner:string,camp:string,email:string;
 test.beforeEach(()=>{
  owner=randomUUID();camp=randomUUID();email=`attack-outcome-${owner}@dndkeep.local`;
  sql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${owner}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email')),'{}',now(),now(),'','','','');`);
  sql(`insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${owner}','${owner}',jsonb_build_object('sub','${owner}','email','${email}'),'email',now(),now(),now());
   insert into campaigns(id,owner_id,name) values('${camp}','${owner}','Attack outcome fixture');`);
 });
 test.afterEach(()=>{sql(`delete from campaigns where id='${camp}';delete from auth.users where id='${owner}'`);});
 for(const baseReach of [5,10])test(`Mutable Form weapon picker extends ${baseReach}-foot reach and rejects expiry`,async({page},info)=>{
  const hero=randomUUID(),target=randomUUID(),scene=randomUUID(),enc=randomUUID(),declaration=randomUUID();
  sql(`begin;
   alter table characters disable trigger check_character_limit;
   insert into characters(id,user_id,campaign_id,name,species,class_name,subclass,background,level,intelligence,class_resources,weapons) values
    ('${hero}','${owner}','${camp}','Reach Metamorph','Human','Psion','Metamorph','Sage',7,16,'{"psionic-energy-dice":6}','[{"id":"spear","name":"Reach Fixture Weapon","attackBonus":5,"damageDice":"1d6","damageBonus":3,"damageType":"piercing","range":"Melee","properties":"${baseReach===10?'Reach':''}"}]'),
    ('${target}','${owner}','${camp}','Boundary Target','Human','Fighter',null,'Soldier',1,10,'{}','[]');
   alter table characters enable trigger check_character_limit;
   set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';
   select dndkeep_private.begin_mutable_form('${hero}','${declaration}',dndkeep_private.action_turn_context('${hero}')->>'turnId',2,false,'null');
   insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published)
    values('${scene}','${camp}','${owner}','Reach Arena','square',70,15,12,'bright',true);
   insert into scene_tokens(id,scene_id,character_id,name,size,x,y,visible_to_all) values
    ('${randomUUID()}','${scene}','${hero}','Reach Metamorph','medium',35,35,true),
    ('${randomUUID()}','${scene}','${target}','Boundary Target','medium',${35+(baseReach+5)/5*70},35,true);
   insert into combat_encounters(id,campaign_id,status,current_turn_index) values('${enc}','${camp}','active',0);
   insert into combat_participants(encounter_id,campaign_id,participant_type,entity_id,name,turn_order,combatant_id)
    select '${enc}','${camp}','character',c.definition_id::uuid,c.name,case when c.definition_id='${hero}' then 0 else 1 end,c.id
    from scene_token_placements p join combatants c on c.id=p.combatant_id where p.scene_id='${scene}';
   commit;`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
  await signInAsSeedDm(page,email);await page.goto(`/character/${hero}`);
  await page.getByRole('button',{name:'Actions',exact:true}).locator('visible=true').first().click();
  const attack=page.getByTitle('Attack a target with Reach Fixture Weapon — runs full combat resolution',{exact:true});
  await attack.click();const row=page.getByRole('button',{name:/Boundary Target/});
  await expect(row).toBeEnabled();await expect(row).toContainText(`${baseReach+5} ft`);
  await expect(row).toBeInViewport({ratio:1});
  const preview=()=>page.evaluate(async()=>{const {useBattleMapStore}=await import('/src/lib/stores/battleMapStore.ts');return useBattleMapStore.getState().reachPreview;});
  await expect.poll(preview).toMatchObject({sceneId:scene,centerWorldX:35,centerWorldY:35,footprintCells:1,reachFt:baseReach+5});
  await page.screenshot({path:info.outputPath('mutable-form-reach.png')});
  sql(`update campaigns set combat_rounds_elapsed=combat_rounds_elapsed+10 where id='${camp}'`);
  await row.click();await expect(page.getByRole('alert')).toContainText('Reach changed');
  expect(sql(`select count(*) from pending_attacks where campaign_id='${camp}'`)).toBe('0');
  await expect.poll(preview).toBeNull();
  await attack.click();await expect(row).toBeDisabled();await expect(row).toContainText('out of range');
  await expect(row).toHaveAttribute('title',`Out of range — ${baseReach+5} ft (max ${baseReach} ft)`);
  await expect.poll(preview).toMatchObject({sceneId:scene,reachFt:baseReach});
  await page.screenshot({path:info.outputPath('mutable-form-reach-expired.png')});
  expect(errors).toEqual([]);
 });
 test('Mutable Form refreshes the combat movement preview and live move check on activation, Dash and expiry',async({page})=>{
  const character=randomUUID(),target=randomUUID(),enc=randomUUID(),declaration=randomUUID();
  sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,subclass,background,level,intelligence,class_resources) values('${character}','${owner}','${camp}','Moving Metamorph','Human','Psion','Metamorph','Sage',7,16,'{"psionic-energy-dice":6}');
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,movement_used_ft,max_speed_ft) values('${target}','${enc}','${camp}','character','${character}','Moving Metamorph',0,5,30)`);
  await signInAsSeedDm(page,email);
  await page.evaluate(async({camp,target})=>{
   const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
   const {CombatProvider,useCombatSelector}=await import('/src/context/CombatContext.tsx');const {movementAllowanceForParticipant}=await import('/src/lib/movement.ts');
   function Probe(){const row=useCombatSelector(s=>s.participants.find(p=>p.id===target));return React.createElement('output',{'data-testid':'movement-probe'},row?String(movementAllowanceForParticipant(row)):'loading');}
   const host=document.createElement('div');document.body.appendChild(host);(window as any).__movementRoot=createRoot(host);(window as any).__movementRoot.render(React.createElement(CombatProvider,{campaignId:camp},React.createElement(Probe)));
  },{camp,target});
  const probe=page.getByTestId('movement-probe');await expect(probe).toHaveText('30');
  // Wait for the real provider subscription, not a fixed sleep.
  await expect.poll(()=>page.evaluate(async camp=>{const {supabase}=await import('/src/lib/supabase.ts');return supabase.getChannels().some(c=>c.topic===`realtime:combat:${camp}`&&c.state==='joined');},camp)).toBe(true);
  sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.begin_mutable_form('${character}','${declaration}',dndkeep_private.action_turn_context('${character}')->>'turnId',2,false,'null');commit;`);
  await expect(probe).toHaveText('35');
  const check=(distance:number)=>page.evaluate(async({target,distance})=>{const {canMove}=await import('/src/lib/movement.ts');return canMove(target,distance);},{target,distance});
  expect(await check(30)).toMatchObject({allowed:true,maxSpeed:35,remaining:30});expect(await check(31)).toMatchObject({allowed:false});
  sql(`update combat_participants set dash_used_this_turn=true where id='${target}'`);await expect(probe).toHaveText('70');
  expect(await check(65)).toMatchObject({allowed:true,maxSpeed:70,remaining:65});
  sql(`update campaigns set combat_rounds_elapsed=combat_rounds_elapsed+10 where id='${camp}'`);await expect(probe).toHaveText('60');
  expect(await check(65)).toMatchObject({allowed:false,maxSpeed:60,remaining:55});
  expect(sql(`select max_speed_ft from combat_participants where id='${target}'`)).toBe('30');
  await page.evaluate(()=>{(window as any).__movementRoot.unmount();delete (window as any).__movementRoot;});
 });
 for(const bonus of [1,2,3])test(`live attacks include Mutable Form AC +${bonus}, cover and other buffs`,async({page})=>{
  const character=randomUUID(),declaration=randomUUID(),target=randomUUID(),enc=randomUUID(),id=randomUUID();
  const level=bonus===2?7:10,choice=bonus===2?null:{kind:'flexibility'};
  sql(`insert into characters(id,user_id,campaign_id,name,species,class_name,subclass,background,level,intelligence,class_resources) values('${character}','${owner}','${camp}','Metamorph','Human','Psion','Metamorph','Sage',${level},16,'{"psionic-energy-dice":6}');
   begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select dndkeep_private.begin_mutable_form('${character}','${declaration}',dndkeep_private.action_turn_context('${character}')->>'turnId',2,${bonus!==1},'${JSON.stringify(choice)}');commit;
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values('${target}','${enc}','${camp}','character','${character}','Metamorph',0);
   update combatants set active_buffs='[{"key":"ward","name":"Ward","acBonus":1}]' where id=(select combatant_id from combat_participants where id='${target}');
   insert into pending_attacks(id,campaign_id,encounter_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,cover_level,chain_id)
    values('${id}','${camp}','${enc}','${target}','Fixture attacker','system','Metamorph','character','Strike','attack_roll',8,15,'half','${randomUUID()}')`);
  await signInAsSeedDm(page,email);
  const roll=async(attackId:string)=>page.evaluate(async id=>{const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');const random=Math.random;Math.random=()=>9.5/20;try{return await rollAttackRoll(id);}finally{Math.random=random;}},attackId);
  expect(await roll(id)).toMatchObject({target_ac:18+bonus,hit_result:'miss',attack_total:18});
  // An expired form must not change the original recorded result on replay.
  sql(`update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+600 where character_id='${character}'`);
  expect(await roll(id)).toMatchObject({target_ac:18+bonus,hit_result:'miss'});
  const next=randomUUID();sql(`insert into pending_attacks(id,campaign_id,encounter_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,cover_level,chain_id)
    values('${next}','${camp}','${enc}','${target}','Fixture attacker','system','Metamorph','character','Strike','attack_roll',8,15,'half','${randomUUID()}')`);
  const snapshot={version:1,attackId:next,campaignId:camp,encounterId:enc,attackerId:null,targetId:target,d20:10,total:18,targetAC:18+bonus,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'miss'};
  const revision=sql(`select updated_at from pending_attacks where id='${next}'`);
  expect(()=>sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';select public.record_pending_attack_roll('${next}','${revision}','${JSON.stringify(snapshot)}',null);commit;`)).toThrow();
  expect(sql(`select state from pending_attacks where id='${next}'`)).toBe('declared');
  expect(await roll(next)).toMatchObject({target_ac:18,hit_result:'hit',attack_total:18});
 });
 test('declared ability contribution survives retries and rejects later rewrites',async({page})=>{
  await signInAsSeedDm(page,email);
  for(const modifier of [4,0,-2,null]){
   const id=randomUUID();
   const result=await page.evaluate(async({id,camp,modifier})=>{
    const {declareAttack}=await import('/src/lib/pendingAttack.ts');
    const {supabase}=await import('/src/lib/supabase.ts');
    const input={requestId:id,campaignId:camp,attackerName:'Fixture attacker',attackerType:'system' as const,targetName:'Fixture target',targetType:'object' as const,
     attackName:'Greatsword',attackKind:'attack_roll' as const,attackBonus:9,attackAbilityModifier:modifier,damageDice:'2d6+6',damageType:'slashing'};
    const first=await declareAttack(input),retry=await declareAttack(input);
    const rewrite=await supabase.from('pending_attacks').update({attack_ability_modifier:7}).eq('id',id).select();
    const clear=await supabase.from('pending_attacks').update({attack_ability_modifier:modifier===null?0:null}).eq('id',id).select();
    const same=await supabase.from('pending_attacks').update({attack_ability_modifier:modifier}).eq('id',id).select();
    return {first,retry,rewrite:rewrite.error?.message,clear:clear.error?.message,same:same.error};
   },{id,camp,modifier});
   expect(result.first).toMatchObject({id,attack_bonus:9,attack_ability_modifier:modifier});
   expect(result.retry).toMatchObject({id,attack_bonus:9,attack_ability_modifier:modifier});
   expect(result.rewrite).toContain('cannot be rewritten');expect(result.clear).toContain('cannot be rewritten');expect(result.same).toBeNull();
   expect(JSON.parse(sql(`select to_json(attack_ability_modifier) from pending_attacks where id='${id}'`)||'null')).toBe(modifier);
  }
  expect(sql(`select has_function_privilege('authenticated','dndkeep_private.guard_attack_ability_modifier()','execute')`)).toBe('f');
 });
 test('live attack recording preserves cover, natural extremes and the selected house rule',async({page})=>{
  await signInAsSeedDm(page,email);
  const cases=[{die:20,bonus:-10,ac:30,cover:'none',nat1:true,result:'crit'},
   {die:20,bonus:0,ac:10,cover:'total',nat1:true,result:'miss'},
   {die:1,bonus:20,ac:10,cover:'none',nat1:true,result:'fumble'},
   {die:1,bonus:20,ac:10,cover:'none',nat1:false,result:'hit'},
   {die:10,bonus:5,ac:13,cover:'half',nat1:true,result:'hit'},
   {die:10,bonus:4,ac:13,cover:'half',nat1:true,result:'miss'}];
  for(const entry of cases){
   const id=randomUUID();
   sql(`insert into pending_attacks(id,campaign_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,cover_level,chain_id)
    values('${id}','${camp}','Fixture attacker','system','Fixture target','object','Fixture strike','attack_roll',${entry.bonus},${entry.ac},'${entry.cover}','${randomUUID()}')`);
   const result=await page.evaluate(async({id,die,nat1})=>{
    const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');
    localStorage.setItem('dndkeep:houseRules',JSON.stringify({nat1AutoFails:nat1}));
    const random=Math.random;Math.random=()=> (die-0.5)/20;
    try{return await rollAttackRoll(id);}finally{Math.random=random;}
   },{id,die:entry.die,nat1:entry.nat1});
   expect(result).toMatchObject({state:'attack_rolled',attack_d20:entry.die,attack_total:entry.die+entry.bonus,hit_result:entry.result,target_ac:entry.ac+(entry.cover==='half'?2:0)});
   expect(JSON.parse(sql(`select jsonb_build_object('hit',hit_result,'total',attack_total) from pending_attacks where id='${id}'`))).toEqual({hit:entry.result,total:entry.die+entry.bonus});
   const snapshot=JSON.parse(sql(`select attack_roll_snapshot from pending_attacks where id='${id}'`));
   expect(snapshot).toMatchObject({version:1,attackId:id,campaignId:camp,d20:entry.die,total:entry.die+entry.bonus,targetAC:entry.ac+(entry.cover==='half'?2:0),naturalOneAutoFails:entry.nat1,criticalOnHit:false,result:entry.result,automatic:entry.cover==='total'?'failure':'none'});
   expect(await page.evaluate(async value=>{const {readAttackRollSnapshot}=await import('/src/rules/attackRollSnapshot.ts');return readAttackRollSnapshot(value);},snapshot)).toEqual(snapshot);
   // A reaction may change current AC/result; original evidence stays intact.
   sql(`update pending_attacks set target_ac=target_ac+5 where id='${id}'`);
   expect(JSON.parse(sql(`select attack_roll_snapshot from pending_attacks where id='${id}'`))).toEqual(snapshot);
   expect(()=>sql(`update pending_attacks set attack_roll_snapshot=null where id='${id}'`)).toThrow();
   expect(()=>sql(`update pending_attacks set attack_roll_snapshot=jsonb_set(attack_roll_snapshot,'{naturalOneAutoFails}','${entry.nat1?'false':'true'}') where id='${id}'`)).toThrow();

  }
 });
 test('refuses inconsistent evidence and later backfilling of a legacy roll',()=>{
  const id=randomUUID();
  sql(`insert into pending_attacks(id,campaign_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${id}','${camp}','Fixture attacker','system','Fixture target','object','Fixture strike','attack_roll',5,15,'${randomUUID()}')`);
  const snapshot={version:1,attackId:id,campaignId:camp,encounterId:null,attackerId:null,targetId:null,d20:10,total:15,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'};
  const record=(value:unknown)=>`update pending_attacks set attack_d20=10,attack_total=15,hit_result='hit',state='attack_rolled',attack_roll_snapshot='${JSON.stringify(value)}' where id='${id}'`;
  expect(()=>sql(record({...snapshot,total:16}))).toThrow();
  expect(sql(`select state from pending_attacks where id='${id}'`)).toBe('declared');
  sql(`update pending_attacks set attack_d20=10,attack_total=15,hit_result='hit',state='attack_rolled' where id='${id}'`);
  expect(()=>sql(record(snapshot))).toThrow();
  expect(sql(`select attack_roll_snapshot is null from pending_attacks where id='${id}'`)).toBe('t');
 });
 test('a lost save response keeps the original dice and evidence on refresh',async({page})=>{
  await signInAsSeedDm(page,email);const id=randomUUID();
  sql(`insert into pending_attacks(id,campaign_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${id}','${camp}','Fixture attacker','system','Fixture target','object','Fixture strike','attack_roll',5,15,'${randomUUID()}')`);
  let dropped=0;await page.route('**/rest/v1/rpc/record_pending_attack_roll_with_history',async route=>{
   if(route.request().method()!=='POST'){await route.continue();return;}
   const response=await route.fetch();expect(response.ok()).toBe(true);dropped++;await route.abort('failed');
  });
  const error=await page.evaluate(async id=>{
   const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');const random=Math.random;Math.random=()=>0.475;
   try{await rollAttackRoll(id);return null;}catch(cause){return String(cause);}finally{Math.random=random;}
  },id);
  expect(error).not.toBeNull();expect(dropped).toBe(2);
  const saved=JSON.parse(sql(`select attack_roll_snapshot from pending_attacks where id='${id}'`));
  expect(saved).toMatchObject({d20:10,total:15,result:'hit'});
  await page.unroute('**/rest/v1/rpc/record_pending_attack_roll_with_history');await page.reload();
  const recovered=await page.evaluate(async id=>{
   const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');const random=Math.random;let rolls=0;Math.random=()=>{rolls++;return 0.975;};
   try{return {attack:await rollAttackRoll(id),rolls};}finally{Math.random=random;}
  },id);
  expect(recovered.rolls).toBe(0);expect(recovered.attack?.attack_roll_snapshot).toEqual(saved);
  const events=JSON.parse(sql(`select coalesce(jsonb_agg(payload),'[]') from combat_events where chain_id=(select chain_id from pending_attacks where id='${id}') and event_type='attack_roll'`));
  expect(events).toHaveLength(1);expect(events[0]).toMatchObject({individual_results:[10],total:15,hit_result:'hit'});
 });

 function masteryFixture(){
  const actor=randomUUID(),target=randomUUID(),enc=randomUUID(),id=randomUUID();
  sql(`insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
    ('${actor}','${enc}','${camp}','creature','${actor}','Attacker',0),('${target}','${enc}','${camp}','creature','${target}','Target',1);
   insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
    values('${id}','${camp}','${enc}','${actor}','${target}','Attacker','monster','Target','monster','Strike','attack_roll',5,15,'${randomUUID()}')`);
  const buffs=[{key:'mastery_sapped'},{key:'mastery_vexed',onlyVsTargetParticipantId:target},{key:'mastery_vexed',onlyVsTargetParticipantId:actor},{key:'mastery_vexed'},{key:'unrelated',name:'Retained'}];
  const setBuffs=(value:unknown)=>sql(`update combatants set active_buffs='${JSON.stringify(value)}' where id=(select combatant_id from combat_participants where id='${actor}')`);
  setBuffs(buffs);
  const snapshot={version:1,attackId:id,campaignId:camp,encounterId:enc,attackerId:actor,targetId:target,d20:10,total:15,targetAC:15,naturalOneAutoFails:true,criticalOnHit:false,automatic:'none',result:'hit'};
  const updatedAt=sql(`select updated_at from pending_attacks where id='${id}'`);
  const call=(snap:unknown=snapshot,expected:unknown=buffs,revision=updatedAt)=>JSON.parse(sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;
   select public.record_pending_attack_roll('${id}','${revision}','${JSON.stringify(snap)}','${JSON.stringify(expected)}');commit;`));
  const readBuffs=()=>JSON.parse(sql(`select active_buffs from combatants where id=(select combatant_id from combat_participants where id='${actor}')`));
  return {id,actor,target,enc,buffs,snapshot,call,readBuffs,setBuffs};
 }

 const history={advantageState:'normal',d20Alt:null,exhaustionLevel:0,buffContributions:[]};
 function historyCall(f:ReturnType<typeof masteryFixture>,h:unknown=history,snap:unknown=f.snapshot){
  return `select public.record_pending_attack_roll_with_history('${f.id}',(select updated_at from pending_attacks where id='${f.id}'),'${JSON.stringify(snap)}','${JSON.stringify(f.buffs)}','${JSON.stringify(h)}')`;
 }
 const asOwner=(q:string)=>`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;${q};commit;`;
 function historyEvents(id:string){return JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('type',event_type,'payload',payload) order by sequence),'[]') from combat_events where chain_id=(select chain_id from pending_attacks where id='${id}')`));}
 test('atomic history preserves advantage, cover, buff dice and exhaustion exactly once',()=>{
  const f=masteryFixture();sql(`update pending_attacks set cover_level='half' where id='${f.id}'`);
  const h={advantageState:'advantage',d20Alt:7,exhaustionLevel:1,buffContributions:[{key:'bless',name:'Bless',source:'spell:bless',dice:'1d4',rolls:[4],total:4}]};
  const snap={...f.snapshot,total:17,targetAC:17};
  expect(JSON.parse(sql(asOwner(historyCall(f,h,snap))))).toMatchObject({replayed:false});
  const events=historyEvents(f.id);expect(events.map((e:{type:string})=>e.type)).toEqual(['cover_applied','attack_roll','buff_contributed']);
  expect(events[0].payload).toMatchObject({base_ac:15,effective_ac:17,ac_bonus:2});
  expect(events[1].payload).toMatchObject({individual_results:[10,7],total:17,target_ac:15,buff_total:4,exhaustion_penalty:-2,advantage_state:'advantage'});
  expect(events[2].payload).toMatchObject({source:'spell:bless',rolls:[4],total:4});
  expect(JSON.parse(sql(asOwner(historyCall(f))))).toMatchObject({replayed:true});expect(historyEvents(f.id)).toEqual(events);
 });

 test('buff history validates flat bonuses, die bounds and signed modifiers',()=>{
  for(const [dice,rolls,total] of [['1d4+2',[4],6],['3',[],3],['1d4-6',[4],-2]] as const){
   const f=masteryFixture(),h={...history,buffContributions:[{key:'bonus',name:'Bonus',source:'fixture',dice,rolls,total}]};
   const snap={...f.snapshot,total:15+total,result:total<0?'miss':'hit'};
   expect(JSON.parse(sql(asOwner(historyCall(f,h,snap))))).toMatchObject({replayed:false});expect(historyEvents(f.id)[0].payload.buff_total).toBe(total);
  }
  for(const [dice,rolls,total] of [['1d4',[5],5],['1d4',[3],4],['1d4',[],0]] as const){
   const f=masteryFixture(),h={...history,buffContributions:[{key:'bonus',name:'Bonus',source:'fixture',dice,rolls,total}]};
   expect(()=>sql(asOwner(historyCall(f,h,{...f.snapshot,total:15+total})))).toThrow();expect(historyEvents(f.id)).toEqual([]);expect(f.readBuffs()).toEqual(f.buffs);
  }
 });
 test('invalid history rolls back the attack and one-use markers',()=>{
  for(const h of [null,{...history,advantageState:'bad'},{...history,d20Alt:2},{...history,advantageState:'advantage',d20Alt:11},{...history,exhaustionLevel:2},{...history,buffContributions:[{}]}]){
   const f=masteryFixture();expect(()=>sql(asOwner(historyCall(f,h)))).toThrow();
   expect(sql(`select state from pending_attacks where id='${f.id}'`)).toBe('declared');expect(f.readBuffs()).toEqual(f.buffs);expect(historyEvents(f.id)).toEqual([]);
  }
 });
 test('a history insert failure rolls back the already-recorded roll and mastery consumption',()=>{
  const f=masteryFixture();
  expect(()=>sql(`begin;
   create function pg_temp.reject_attack_history() returns trigger language plpgsql as $$begin if new.event_type='attack_roll' and new.campaign_id='${camp}' then raise exception 'history unavailable';end if;return new;end;$$;
   create trigger test_reject_history before insert on combat_events for each row execute function pg_temp.reject_attack_history();
   set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;${historyCall(f)};commit;`)).toThrow('history unavailable');
  expect(sql(`select state from pending_attacks where id='${f.id}'`)).toBe('declared');expect(f.readBuffs()).toEqual(f.buffs);expect(historyEvents(f.id)).toEqual([]);
 });
 test('concurrent history recording preserves only the winning roll',async()=>{
  const f=masteryFixture(),run=promisify(execFile);
  const attempts=await Promise.all([10,11].map(d20=>run('docker',['exec','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c',asOwner(historyCall(f,history,{...f.snapshot,d20,total:d20+5}))])));
  const results=attempts.map(r=>JSON.parse(r.stdout));expect(results.map(r=>r.replayed).sort()).toEqual([false,true]);
  expect(results[0].attack.attack_roll_snapshot).toEqual(results[1].attack.attack_roll_snapshot);
  const events=historyEvents(f.id);expect(events).toHaveLength(1);expect(events[0].payload.total).toBe(results[0].attack.attack_total);
 });
 test('history wrapper retains anonymous and unrelated-user restrictions',()=>{
  const f=masteryFixture();expect(sql(`select has_function_privilege('anon','public.record_pending_attack_roll_with_history(uuid,timestamptz,jsonb,jsonb,jsonb)','execute')`)).toBe('f');
  expect(()=>sql(asOwner(historyCall(f)).replace(owner,randomUUID()))).toThrow();expect(historyEvents(f.id)).toEqual([]);expect(f.readBuffs()).toEqual(f.buffs);
 });
 test('records the roll and only its applicable mastery markers together, with exact replay',()=>{
  const f=masteryFixture();expect(f.call()).toMatchObject({replayed:false,attack:{attack_roll_snapshot:f.snapshot}});
  expect(f.readBuffs()).toEqual(f.buffs.slice(2));
  // A newly acquired Sap must survive replay of the earlier roll.
  f.setBuffs(f.buffs);expect(f.call()).toMatchObject({replayed:true,attack:{attack_roll_snapshot:f.snapshot}});expect(f.readBuffs()).toEqual(f.buffs);
 });
 test('failed evidence, changed bonuses and stale attacks preserve every marker',()=>{
  const f=masteryFixture();
  expect(()=>f.call({...f.snapshot,result:'miss'})).toThrow();expect(f.readBuffs()).toEqual(f.buffs);
  expect(()=>f.call(f.snapshot,[])).toThrow();expect(f.readBuffs()).toEqual(f.buffs);
  expect(()=>f.call(f.snapshot,f.buffs,'2020-01-01')).toThrow();expect(f.readBuffs()).toEqual(f.buffs);
  expect(sql(`select state from pending_attacks where id='${f.id}'`)).toBe('declared');
 });
 test('two pending attacks cannot both consume the same one-use markers',()=>{
  const f=masteryFixture(),second=randomUUID();
  sql(`insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${second}','${camp}','${f.enc}','${f.actor}','${f.target}','Attacker','monster','Target','monster','Strike','attack_roll',5,15,'${randomUUID()}')`);
  const updatedAt=sql(`select updated_at from pending_attacks where id='${second}'`);f.call();
  expect(()=>sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;
   select public.record_pending_attack_roll('${second}','${updatedAt}','${JSON.stringify({...f.snapshot,attackId:second})}','${JSON.stringify(f.buffs)}');commit;`)).toThrow();
  expect(sql(`select state from pending_attacks where id='${second}'`)).toBe('declared');expect(f.readBuffs()).toEqual(f.buffs.slice(2));
 });
 test('concurrent rolls serialize the shared mastery budget',async()=>{
  const f=masteryFixture(),second=randomUUID();
  sql(`insert into pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,target_participant_id,attacker_name,attacker_type,target_name,target_type,attack_name,attack_kind,attack_bonus,target_ac,chain_id)
   values('${second}','${camp}','${f.enc}','${f.actor}','${f.target}','Attacker','monster','Target','monster','Strike','attack_roll',5,15,'${randomUUID()}')`);
  const run=promisify(execFile);
  const attempts=await Promise.allSettled([f.id,second].map(id=>{
   const revision=sql(`select updated_at from pending_attacks where id='${id}'`);
   return run('docker',['exec','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c',
    `begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;select public.record_pending_attack_roll('${id}','${revision}','${JSON.stringify({...f.snapshot,attackId:id})}','${JSON.stringify(f.buffs)}');commit;`]);
  }));
  expect(attempts.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(sql(`select count(*) from pending_attacks where id in('${f.id}','${second}') and state='attack_rolled'`)).toBe('1');expect(f.readBuffs()).toEqual(f.buffs.slice(2));
 });
 test('campaign players may record their own character but not another participant',()=>{
  const f=masteryFixture(),player=randomUUID(),character=randomUUID();
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${player}','${player}@attack.local','{}');
   insert into campaign_members(campaign_id,user_id,role) values('${camp}','${player}','player');
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level) values('${character}','${player}','${camp}','Player','Human','Psion','Sage',3);`);
  const call=()=>sql(`begin;set local request.jwt.claims='{"sub":"${player}","role":"authenticated"}';set local role authenticated;
   select public.record_pending_attack_roll_with_history('${f.id}',(select updated_at from pending_attacks where id='${f.id}'),'${JSON.stringify(f.snapshot)}','${JSON.stringify(f.buffs)}','${JSON.stringify(history)}');commit;`);
  try{
   expect(call).toThrow();
   sql(`update combatants set definition_type='character',definition_id='${character}' where id=(select combatant_id from combat_participants where id='${f.actor}');
    update combat_participants set participant_type='character',entity_id='${character}' where id='${f.actor}'`);
   expect(JSON.parse(call())).toMatchObject({replayed:false});expect(f.readBuffs()).toEqual(f.buffs.slice(2));
  }finally{sql(`delete from characters where id='${character}';delete from auth.users where id='${player}'`);}
 });
 test('anonymous and unrelated authenticated users cannot record or consume markers',()=>{
  const f=masteryFixture(),stranger=randomUUID();
  expect(sql(`select has_function_privilege('anon','public.record_pending_attack_roll(uuid,timestamptz,jsonb,jsonb)','execute') or has_function_privilege('anon','dndkeep_private.record_pending_attack_roll(uuid,timestamptz,jsonb,jsonb)','execute')`)).toBe('f');
  expect(()=>sql(`begin;set local request.jwt.claims='{"sub":"${stranger}","role":"authenticated"}';set local role authenticated;
   select public.record_pending_attack_roll('${f.id}',now(),'${JSON.stringify(f.snapshot)}','${JSON.stringify(f.buffs)}');commit;`)).toThrow();
  expect(f.readBuffs()).toEqual(f.buffs);
 });
 test('live rolls against a free-text target still consume Sap and keep unscoped Vex',async({page})=>{
  const f=masteryFixture();sql(`update pending_attacks set target_participant_id=null where id='${f.id}'`);
  await signInAsSeedDm(page,email);
  const result=await page.evaluate(async id=>{
   const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');const original=Math.random;let calls=0;Math.random=()=>++calls===1?0.475:0.775;
   try{return {attack:await rollAttackRoll(id),calls};}finally{Math.random=original;}
  },f.id);
  expect(result).toMatchObject({calls:2,attack:{state:'attack_rolled',attack_d20:10}});expect(f.readBuffs()).toEqual(f.buffs.slice(1));
 });

 test('live attacks combine mastery and condition sources before cancellation',async({page})=>{
  await signInAsSeedDm(page,email);
  const cases=[
   {attacker:['Poisoned'],target:['Restrained'],vex:true,sap:false,calls:1,die:10},
   {attacker:['Poisoned'],target:['Restrained'],vex:false,sap:true,calls:1,die:10},
   {attacker:['Poisoned'],target:['Restrained'],vex:true,sap:true,calls:1,die:10},
   {attacker:['Poisoned'],target:[],vex:true,sap:false,calls:1,die:10},
   {attacker:[],target:['Restrained'],vex:false,sap:true,calls:1,die:10},
   {attacker:[],target:[],vex:true,sap:false,calls:2,die:16},
   {attacker:[],target:[],vex:false,sap:true,calls:2,die:10},
  ];
  for(const c of cases){
   const f=masteryFixture();f.setBuffs([...(c.vex?[{key:'mastery_vexed',onlyVsTargetParticipantId:f.target}]:[]),...(c.sap?[{key:'mastery_sapped'}]:[])]);
   sql(`update combatants set active_conditions=array[${c.attacker.map(v=>"'"+v+"'").join(',')}]::text[] where id=(select combatant_id from combat_participants where id='${f.actor}');
    update combatants set active_conditions=array[${c.target.map(v=>"'"+v+"'").join(',')}]::text[] where id=(select combatant_id from combat_participants where id='${f.target}')`);
   const result=await page.evaluate(async id=>{
    const {rollAttackRoll}=await import('/src/lib/pendingAttack.ts');const original=Math.random;let calls=0;Math.random=()=>++calls===1?0.475:0.775;
    try{return {attack:await rollAttackRoll(id),calls};}finally{Math.random=original;}
   },f.id);
   expect(result,JSON.stringify(c)).toMatchObject({calls:c.calls,attack:{state:'attack_rolled',attack_d20:c.die}});expect(f.readBuffs()).toEqual([]);
  }
 });

 function finishWindow(id:string,point='post_attack_roll'){
  sql(`begin;set local request.jwt.claims='{"sub":"${owner}","role":"authenticated"}';set local role authenticated;select public.attack_reaction_offers(id,'${point}',updated_at,array[]::text[]) from pending_attacks where id='${id}';commit;`);
 }
 function reactionOffer(f:ReturnType<typeof masteryFixture>,point='post_attack_roll'){
  const offer=randomUUID();sql(`insert into pending_reactions(id,campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at)
   values('${offer}','${camp}','${f.id}','${f.target}','Target','monster','fixture','Fixture reaction','${point}',now()+interval '2 minutes')`);return offer;
 }
 test('open attack reactions block live damage recording and preserve one-use damage bonuses',async({page})=>{
  const f=masteryFixture();f.call();
  const buffs=[{key:'fixture-rider',name:'Fixture bonus',source:'feature',singleUse:true,damageRider:{dice:'1d4',damageType:'fire'}}];f.setBuffs(buffs);
  sql(`update pending_attacks set damage_dice='1d6',damage_type='slashing' where id='${f.id}'`);const offer=reactionOffer(f);
  await signInAsSeedDm(page,email);
  const error=await page.evaluate(async id=>{const {rollDamage}=await import('/src/lib/pendingAttack.ts');try{await rollDamage(id);return null;}catch(cause){return String(cause);}},f.id);
  expect(error).toContain('Resolve offered reactions');expect(f.readBuffs()).toEqual(buffs);
  expect(sql(`select state from pending_attacks where id='${f.id}'`)).toBe('attack_rolled');
  sql(`update pending_reactions set state='declined' where id='${offer}'`);
  const saved=await page.evaluate(async id=>{const {rollDamage}=await import('/src/lib/pendingAttack.ts');return rollDamage(id);},f.id);
  expect(saved?.state).toBe('damage_rolled');expect(f.readBuffs()).toEqual([]);
 });
 test('late attack offers are rejected, while damage reactions block final advancement',()=>{
  const f=masteryFixture();f.call();finishWindow(f.id);
  sql(`update pending_attacks set state='damage_rolled',damage_raw=3,damage_final=3 where id='${f.id}'`);
  expect(()=>reactionOffer(f)).toThrow();const offer=reactionOffer(f,'post_damage_roll');
  expect(()=>sql(`update pending_attacks set state='applied' where id='${f.id}'`)).toThrow();
  sql(`update pending_reactions set state='expired' where id='${offer}'`);finishWindow(f.id,'post_damage_roll');sql(`update pending_attacks set state='applied' where id='${f.id}'`);
  expect(()=>reactionOffer(f,'post_damage_roll')).toThrow();
 });
 test('past the timer deadline still requires a recorded decision; cancel remains possible',()=>{
  const f=masteryFixture();f.call();const offer=reactionOffer(f);
  sql(`update pending_reactions set expires_at=now()-interval '1 minute' where id='${offer}'`);
  expect(()=>sql(`update pending_attacks set state='damage_rolled' where id='${f.id}'`)).toThrow();
  sql(`update pending_attacks set state='canceled' where id='${f.id}'`);
  expect(()=>reactionOffer(f)).toThrow();sql(`update pending_reactions set state='declined' where id='${offer}'`);
 });
 test('late offer and damage advancement cannot both win concurrently',async()=>{
  const f=masteryFixture();f.call();finishWindow(f.id);const run=promisify(execFile),offer=randomUUID();
  const commands=[`update pending_attacks set state='damage_rolled' where id='${f.id}'`,
   `insert into pending_reactions(id,campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at)
    values('${offer}','${camp}','${f.id}','${f.target}','Target','monster','fixture','Fixture reaction','post_attack_roll',now()+interval '2 minutes')`];
  const results=await Promise.allSettled(commands.map(q=>run('docker',['exec','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1','-c',q])));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const state=sql(`select state from pending_attacks where id='${f.id}'`),offers=sql(`select count(*) from pending_reactions where pending_attack_id='${f.id}' and state='offered'`);
  expect([state,offers]).toEqual(state==='attack_rolled'?['attack_rolled','1']:['damage_rolled','0']);
 });

 test('target checks reject a removed scene instead of loading another campaign map',async({page})=>{
  const selected=randomUUID(),otherScene=randomUUID();
  sql(`insert into scenes(id,campaign_id,owner_id,name,grid_type,grid_size_px,width_cells,height_cells,ambient_light,is_published) values
   ('${selected}','${camp}','${owner}','Selected arena','square',70,10,10,'bright',true),
   ('${otherScene}','${camp}','${owner}','Other arena','square',70,10,10,'bright',true)`);
  await signInAsSeedDm(page,email);
  expect(await page.evaluate(async({camp,selected})=>{
   const {loadActiveBattleMap}=await import('/src/lib/battleMapGeometry.ts');return (await loadActiveBattleMap(camp,{viewedSceneId:selected,throwOnError:true}))?.id;
  },{camp,selected})).toBe(selected);
  sql(`delete from scenes where id='${selected}'`);
  const result=await page.evaluate(async({camp,selected})=>{
   const {loadActiveBattleMap}=await import('/src/lib/battleMapGeometry.ts');let error:string|null=null;
   try{await loadActiveBattleMap(camp,{viewedSceneId:selected,throwOnError:true});}catch(cause){error=String(cause);}
   return {error,defaultId:(await loadActiveBattleMap(camp,{viewedSceneId:null,throwOnError:true}))?.id};
  },{camp,selected});
  expect(result.error).toContain('selected map is unavailable');expect(result.defaultId).toBe(otherScene);
 });

});
