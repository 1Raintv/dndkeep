import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-t','-A','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Saved Propel controls',()=>{
 gateDbSuite();let charId:string,userId:string,email:string,campaignId:string;
 test.beforeEach(()=>{
  campaignId=randomUUID();charId=randomUUID();userId=randomUUID();email='propel-'+userId+'@dndkeep.local';
  sql(`begin;
   insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
   values('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Propel Fixture"}',now(),now(),'','','','');
   insert into auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
   values(gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
   update profiles set show_ua_content=true where id='${userId}';
   insert into characters(id,user_id,name,species,class_name,background,subclass,level,class_resources)
   values('${charId}','${userId}','Propel Fixture','Human','Psion','Sage','Psi Warper',5,'{"psionic-energy-dice":2}');commit;`);
 });
 test.afterEach(()=>{if(userId)sql(`delete from campaigns where id='${campaignId}';delete from action_logs where character_id='${charId}';delete from characters where user_id='${userId}';delete from auth.users where id='${userId}'`);});
 test('declares once, survives reload and spends a die only on failure',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telekinetic Propel',{exact:true})});
  await ability.getByRole('button',{name:'Use / resume'}).click();
  const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
  await dialog.getByLabel('Target',{exact:true}).fill('Tabletop goblin');
  await dialog.getByRole('checkbox').check();await dialog.getByLabel('Movement',{exact:true}).selectOption('powered');
  await page.screenshot({path:info.outputPath('propel-target.png')});
  await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();await expect(dialog).toContainText('Saved dice total:');
  await expect(dialog).toContainText('Resolve and confirm the saving throw before moving the target.');
  await expect(dialog.getByTestId('propel-movement')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
  const declaration=sql(`select request_id from dndkeep_private.propel_declarations where character_id='${charId}'`);
  const roll=sql(`select base_roll from dndkeep_private.propel_declarations where request_id='${declaration}'`);
  await page.screenshot({path:info.outputPath('propel-save.png')});
  await page.reload();await ability.getByRole('button',{name:'Use / resume'}).click();
  await dialog.getByRole('button',{name:/Resume Telekinetic Propel/}).click();await expect(dialog).toContainText(`Saved dice total: ${roll}.`);
  await dialog.getByRole('button',{name:'Save failed',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('Saved: failed. 1 Energy Dice spent.');
  await dialog.getByRole('button',{name:/Push \/ pull ·/}).click();
  await expect(dialog.getByTestId('propel-movement')).toContainText(`Move the target ${5*Number(roll)} ft straight toward or away from you.`);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${charId}'`)).toBe('1');
  await page.screenshot({path:info.outputPath('propel-finished.png')});
  await dialog.getByRole('button',{name:'Close for later'}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled();
  await page.getByRole('group',{name:'Turn economy',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('propel-budget-spent.png')});
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
  await expect(page.getByRole('button',{name:'Bonus Action Available',exact:true})).toBeEnabled({timeout:10000});
  expect(errors).toEqual([]);
 });
 // A real reload must recover the same seed, target and die after storage failure.
 for(const mode of ['powered','technique'] as const)test(`interrupted ${mode} preparation survives reload without rerolling`,async({page},info)=>{
  if(mode==='technique')sql(`update characters set subclass='Psykinetic' where id='${charId}'`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telekinetic Propel',{exact:true})});
  await ability.getByRole('button',{name:'Use / resume'}).click();
  const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
  await dialog.getByLabel('Target',{exact:true}).fill('Original goblin');await dialog.getByRole('checkbox').check();
  await dialog.getByLabel('Movement',{exact:true}).selectOption(mode);
  await page.evaluate(character=>{
   const original=Storage.prototype.setItem,random=crypto.randomUUID;
   (window as any).__restorePropelStorage=()=>{Storage.prototype.setItem=original;crypto.randomUUID=random;};
   crypto.randomUUID=()=> '40000000-0000-4000-8000-c00000000000';
   Storage.prototype.setItem=function(key,value){
    if(key.startsWith('dndkeep:propel:'+character+':')&&JSON.parse(value).kind==='begin')throw new DOMException('Storage full','QuotaExceededError');
    original.call(this,key,value);
   };
  },charId);
  await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Your original Propel roll is saved.');
  await expect(dialog.getByRole('button',{name:'Confirm saved use'})).toBeVisible();
  expect(sql(`select count(*) from dndkeep_private.propel_declarations where character_id='${charId}'`)).toBe('0');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${charId}'`)).toBe('0');
  await page.screenshot({path:info.outputPath('propel-storage-interrupted.png')});
  await page.evaluate(()=>(window as any).__restorePropelStorage());await page.reload();
  const recovered=await page.evaluate(async character=>{
   const random=crypto.randomUUID;crypto.randomUUID=()=>{throw new Error('Recovery must not generate another seed');};
   try{
    // @ts-ignore browser Vite import
    const {pendingPropel}=await import('/src/lib/propelRecovery.ts');return pendingPropel(character);
   }finally{crypto.randomUUID=random;}
  },charId);
  const roll=mode==='powered'?3:2;
  expect(recovered).toMatchObject([{kind:'begin',request:{mode,roll,target:{name:'Original goblin'}}}]);
  await ability.getByRole('button',{name:'Use / resume'}).click();
  await dialog.getByRole('button',{name:'Confirm saved use'}).click();
  await expect(dialog).toContainText(`Saved dice total: ${roll}.`);
  await expect(dialog).toContainText('Target: Original goblin');
  await dialog.getByRole('button',{name:'Save failed',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText(`Saved: failed. ${mode==='powered'?1:0} Energy Dice spent.`);
  expect(sql(`select base_roll from dndkeep_private.propel_declarations where character_id='${charId}'`)).toBe(String(roll));
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe(mode==='powered'?'1':'2');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${charId}'`)).toBe('1');
  await page.screenshot({path:info.outputPath('propel-storage-recovered.png')});expect(errors).toEqual([]);
 });
 // Guard the linked player choices as well as the server's conditional payment.
 for(const [mode,outcome] of [['free','failed'],['powered','passed'],['powered','failed']] as const)
 test(`Warp stays beside Propel and resolves ${mode} / ${outcome} as one Bonus Action`,async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const rows=page.locator('.arow-grid');
  const propel=rows.filter({has:page.getByText('Telekinetic Propel',{exact:true})});
  const warp=rows.filter({has:page.getByText('Warp Propel',{exact:true})});
  await expect(warp).toBeVisible();
  await expect(warp).toContainText('Propel modifier · same Bonus Action');
  await warp.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('propel-linked-rows.png')});
  const order=await rows.allTextContents();
  const index=order.findIndex(text=>text.includes('Telekinetic Propel'));
  expect(index).toBeGreaterThanOrEqual(0);
  expect(order[index+1]).toContain('Warp Propel');
  for(const row of [propel,warp]){
   await expect(row.locator('[title="Action type: bonus"]')).toBeVisible();
   await expect(row.locator('[title="Action type: special"]')).toHaveCount(0);
  }
  await warp.getByRole('button',{name:'Use / resume'}).click();
  const dialog=page.getByRole('dialog',{name:'Warp Propel',exact:true});
  await expect(dialog.getByRole('heading')).toHaveText('Warp Propel · Bonus Action');
  await dialog.getByLabel('Target',{exact:true}).fill('Tabletop goblin');
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByLabel('Movement',{exact:true}).locator('option[value="powered"]')).toHaveText('Roll Energy Die (d8)');
  await dialog.getByLabel('Movement',{exact:true}).selectOption(mode);
  await expect(dialog).toContainText('both use the same Bonus Action.');
  await page.screenshot({path:info.outputPath('propel-linked-choice.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[data-propel], [data-propel] *, [aria-label=\"Warp Propel\"], [aria-label=\"Warp Propel\"] *')");
   const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
  }
  await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();
  await expect(dialog).toContainText('Saved dice total:');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
  const roll=Number(sql(`select base_roll from dndkeep_private.propel_declarations where character_id='${charId}'`));
  if(mode==='free')expect(roll).toBe(0);else{expect(roll).toBeGreaterThanOrEqual(1);expect(roll).toBeLessThanOrEqual(8);}
  await dialog.getByRole('button',{name:outcome==='failed'?'Save failed':'Save passed',exact:true}).click();
  const cost=mode==='powered'&&outcome==='failed'?1:0;
  await expect(dialog.getByRole('status')).toContainText(`Saved: ${outcome}. ${cost} Energy Dice spent.`);
  if(outcome==='failed')await dialog.getByRole('button',{name:'Warp · within 30 ft of you'}).click();
  if(outcome==='failed')await expect(dialog.getByTestId('propel-movement')).toHaveText('Teleport the target to an unoccupied space you can see within 30 ft of you, horizontal to you. Apply movement on the map.');
  else await expect(dialog.getByTestId('propel-movement')).toHaveCount(0);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe(String(2-cost));
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${charId}'`)).toBe('1');
  await dialog.getByRole('button',{name:'Close for later'}).click();
  await propel.getByRole('button',{name:'Use / resume'}).click();
  const base=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
  await expect(base).toContainText('Your Bonus Action is unavailable.');
  await expect(base.getByRole('button',{name:'Declare Bonus Action'})).toBeDisabled();
  expect(errors).toEqual([]);
 });
 test('post-save Warp recovers a lost confirmation without another cost or history entry',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telekinetic Propel',{exact:true})});
  const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
  await ability.getByRole('button',{name:'Use / resume'}).click();await dialog.getByLabel('Target',{exact:true}).fill('Tabletop goblin');await dialog.getByRole('checkbox').check();
  await dialog.getByLabel('Movement',{exact:true}).selectOption('powered');await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();
  await dialog.getByRole('button',{name:'Save failed',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Warp · within 30 ft of you'})).toBeVisible();await expect(dialog.getByTestId('propel-movement')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('propel-movement-choice.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Telekinetic Propel\"], [aria-label=\"Telekinetic Propel\"] *')").replace(/const skip = \(el, cs\) =>[\s\S]*?;\n\n {4}const clipped/,"const skip = (_el, cs) => cs.filter !== 'none';\n\n    const clipped");
   const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
  }
  const declaration=sql(`select request_id from dndkeep_private.propel_declarations where character_id='${charId}'`);
  expect(sql(`select notes from action_logs where id='${declaration}'`)).toContain('Movement choice pending');
  await page.reload();await ability.getByRole('button',{name:'Use / resume'}).click();await dialog.getByRole('button',{name:'Resume movement · Tabletop goblin'}).click();
  let dropped=0;await page.route('**/rest/v1/rpc/propel_movement',async route=>{if(route.request().postDataJSON().p_operation==='choose'){await route.fetch();dropped++;await route.abort();}else await route.continue();});
  await dialog.getByRole('button',{name:'Warp · within 30 ft of you'}).click();await expect(dialog.getByRole('button',{name:'Confirm saved movement'})).toBeVisible();expect(dropped).toBe(2);
  await page.unroute('**/rest/v1/rpc/propel_movement');await page.reload();await ability.getByRole('button',{name:'Use / resume'}).click();await dialog.getByRole('button',{name:'Resume movement · Tabletop goblin'}).click();
  await expect(dialog.getByTestId('propel-movement')).toContainText('horizontal to you');await page.screenshot({path:info.outputPath('propel-movement-recovered.png')});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  expect(sql(`select count(*) from dndkeep_private.action_claims where character_id='${charId}'`)).toBe('1');
  expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Propel movement'`)).toBe('1');expect(errors).toEqual([]);
 });
 test('free Misty Step records the Bonus Action and retains it after reload',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Free Misty Step (Teleportation)',{exact:true})});
  await ability.getByRole('button',{name:'Cast',exact:true}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(sql(`select feature_uses->>'Free Misty Step (Teleportation)' from characters where id='${charId}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
  await page.reload();await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(errors).toEqual([]);
 });
 test('Psi Warper details retain target limits without invented automatic hits',async({page},info)=>{
  sql(`update characters set level=14 where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  for(const [name,detail] of [['Duplicitous Target','not Incapacitated'],['Warp Space','as close to the center as possible'],['Mass Teleportation','Huge or smaller'],['Teleporter Combat','does not spend your Action']]){
   const row=page.locator('.arow-grid').filter({has:page.getByText(name,{exact:true})});await row.click();
   await expect(page.getByText(detail,{exact:false})).toBeVisible();
   await page.getByText(detail,{exact:false}).scrollIntoViewIfNeeded();
   await page.screenshot({path:info.outputPath(name.toLowerCase().replaceAll(' ','-')+'.png')});
  }
 });
 for(const condition of ['', 'Paralyzed','Encumbered','willing'])test(`combat resolution stays on the declared target and settles its rolled save ${condition||'normal'}`,async({page},info)=>{
  const encounter=randomUUID(),self=randomUUID(),enemy=randomUUID(),targetCharacter=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Propel Combat');
   update characters set campaign_id='${campaignId}' where id='${charId}';
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level) values('${targetCharacter}','${userId}','${campaignId}','Target Fighter','Human','Fighter','Sage',1);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaignId}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${self}','${encounter}','${campaignId}','character','${charId}','Psion',0),('${enemy}','${encounter}','${campaignId}','character','${targetCharacter}','Target Fighter',1);
   update combatants set active_conditions=${condition&&condition!=='Paralyzed'&&condition!=='willing'?"array['"+condition+"']":"array[]::text[]"} where id=(select combatant_id from combat_participants where id='${enemy}');`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!(condition===''&&r.status()===503&&r.url().endsWith('/rpc/settle_propel_save')))errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telekinetic Propel',{exact:true})});await ability.getByRole('button',{name:'Use / resume'}).click();
  const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
  await expect(dialog.getByRole('combobox',{name:'Target',exact:true})).toBeEnabled();
  await dialog.getByRole('combobox',{name:'Target',exact:true}).selectOption({value:enemy});await expect(dialog.getByRole('combobox',{name:'Target',exact:true})).toHaveValue(enemy);await dialog.getByRole('checkbox').check();
  await dialog.getByLabel('Movement',{exact:true}).selectOption('powered');await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled({timeout:10000});
  expect(sql(`select bonus_used from combat_participants where id='${self}'`)).toBe('t');
  await dialog.getByRole('button',{name:'Resolve combat save'}).click();
  const saves=page.getByRole('dialog',{name:'Propel saving throw'});
  await expect(saves.getByText(/Target: Target Fighter/)).toBeVisible();await expect(saves.getByRole('combobox')).toHaveCount(0);
  await expect(saves.getByRole('button',{name:'Roll Save'})).toBeEnabled();
  if(condition==='Paralyzed')sql(`update combatants set active_conditions=array['Paralyzed'] where id=(select combatant_id from combat_participants where id='${enemy}')`);
  await page.evaluate(c=>{let n=0;Math.random=()=>c==='Encumbered'?(n++%2===0?0.99:0.01):0.01;},condition);
  if(condition==='Paralyzed')await saves.getByRole('spinbutton').fill('30');
  if(condition==='willing'){
   const effect=randomUUID(),clock=JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${encounter}','${self}')`));
   sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${effect}','${encounter}','${self}','${enemy}','${clock.turnId}',${clock.castTurnOrdinal},'active')`);
   await saves.getByRole('button',{name:'Target chooses failure',exact:true}).click();await expect(saves.getByText('DM confirms the target chooses to fail · no dice.')).toBeVisible();
   await page.reload();await ability.getByRole('button',{name:'Use / resume'}).click();await dialog.getByRole('button',{name:'Resume saved saving throw',exact:true}).click();
   await expect(saves.getByText('DM confirms the target chooses to fail · no dice.')).toBeVisible();
  }else await saves.getByRole('button',{name:'Roll Save'}).click();
  await page.screenshot({path:info.outputPath('propel-combat-save.png')});
  if(condition&&condition!=='willing'){
   const declaration=sql(`select request_id from dndkeep_private.propel_declarations where character_id='${charId}'`);
   const badSave={participantId:enemy,outcome:'failed',dc:100,d20:condition==='Paralyzed'?1:20,bonus:0,total:condition==='Paralyzed'?1:20,rolls:condition==='Paralyzed'?[1]:[20,1],advantage:false,naturalExtremes:false,...(condition==='Paralyzed'?{automaticFailure:true}:{disadvantage:true})};
   const payload=JSON.stringify({declarationId:declaration,outcome:'failed',save:badSave});
   expect(()=>sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${userId}","role":"authenticated"}';select psionic_propel('${charId}','finish','${payload}');commit;`)).toThrow(/Invalid rolled save/);
   expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
   expect(sql(`select outcome is null from dndkeep_private.propel_declarations where request_id='${declaration}'`)).toBe('t');
  }
  if(!condition){
   let attempts=0;await page.route('**/rest/v1/rpc/settle_propel_save',async route=>{attempts++;if(attempts===1)await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Lost final receipt'})});});
   await saves.getByRole('button',{name:'Confirm save',exact:true}).click();await expect(saves.getByRole('alert')).toContainText('Lost final receipt');
   expect(sql(`select outcome from dndkeep_private.propel_declarations where character_id='${charId}'`)).toBe('failed');
   await page.reload();await ability.getByRole('button',{name:'Use / resume'}).click();await dialog.getByRole('button',{name:'Resume saved saving throw',exact:true}).click();
   await expect(saves.getByRole('status')).toContainText('Saved: failed.');expect(attempts).toBe(2);
  }else{await saves.getByRole('button',{name:condition==='willing'?'Confirm chosen failure':'Confirm save',exact:true}).click();await expect(saves.getByRole('status')).toContainText('Saved: failed.');}
  await page.screenshot({path:info.outputPath('propel-save-confirmed.png')});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  expect(sql(`select target->>'participantId' from dndkeep_private.propel_declarations where character_id='${charId}'`)).toBe(enemy);
  const evidence=JSON.parse(sql(`select save_details from dndkeep_private.propel_declarations where character_id='${charId}'`));
  if(condition==='willing'){
   expect(evidence).toEqual({participantId:enemy,dc:11,outcome:'auto-failed'});
   await expect(saves.getByText('Target chose to fail · no dice.',{exact:true})).toBeVisible();await expect(saves.getByText('Next-save effect used without rolling dice.')).toBeVisible();
   expect(sql(`select consumed_kind from dndkeep_private.mind_sliver_effects where encounter_id='${encounter}'`)).toBe('feature');
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
    const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
    const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Propel saving throw\"], [aria-label=\"Propel saving throw\"] *')").replace(/const skip = \(el, cs\) =>[\s\S]*?;\n\n {4}const clipped/,"const skip = (_el, cs) => cs.filter !== 'none';\n\n    const clipped");
    const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
   }
  }else expect(evidence).toMatchObject({participantId:enemy,d20:1,rolls:condition==='Paralyzed'?[]:condition==='Encumbered'?[20,1]:[1],outcome:'failed',...(condition==='Paralyzed'?{automaticFailure:true}:condition==='Encumbered'?{disadvantage:true}:{})});
  expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Telekinetic Propel'`)).toBe('1');
  if(condition==='Paralyzed'){const notes=sql(`select notes from action_logs where character_id='${charId}' and action_name='Telekinetic Propel'`);expect(notes).toContain('automatic failure from condition (no dice)');expect(notes).not.toContain('cosmetic face');}
  expect(errors).toEqual([]);
 });

 for(const accept of [true,false])test(`Propel keeps dice through reload and lost response, then resistance ${accept}`,async({page},info)=>{
  await page.context().route('**/sw.js',route=>route.abort());
  const encounter=randomUUID(),self=randomUUID(),enemy=randomUUID(),effect=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Propel Resistance');update characters set campaign_id='${campaignId}' where id='${charId}';
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index,in_lair) values('${encounter}','${campaignId}','active',1,0,true);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,legendary_resistance,legendary_resistance_used) values
   ('${self}','${encounter}','${campaignId}','character','${charId}','Psion',0,0,0),('${enemy}','${encounter}','${campaignId}','creature','${enemy}','Resistant creature',1,3,3);
   update combatants set definition_id=p.entity_id from combat_participants p where combatants.id=p.combatant_id and p.id='${enemy}';`);
  const clock=JSON.parse(sql(`select dndkeep_private.next_save_turn_context('${encounter}','${self}')`));
  sql(`insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal,status) values('${effect}','${encounter}','${self}','${enemy}','${clock.turnId}',${clock.castTurnOrdinal},'active')`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const ability=page.locator('.arow-grid').filter({has:page.getByText('Telekinetic Propel',{exact:true})});
  const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true}),saves=page.getByRole('dialog',{name:'Propel saving throw'});
  await ability.getByRole('button',{name:'Use / resume'}).click();await dialog.getByRole('combobox',{name:'Target',exact:true}).selectOption(enemy);await dialog.getByRole('checkbox').check();
  await dialog.getByLabel('Movement',{exact:true}).selectOption('powered');await dialog.getByRole('button',{name:'Declare Bonus Action'}).click();
  await dialog.getByRole('button',{name:'Resolve combat save'}).click();await expect(saves.getByRole('button',{name:'Roll Save'})).toBeEnabled();
  await page.evaluate(()=>{Math.random=()=>0.55;});await saves.getByRole('button',{name:'Roll Save'}).click();await expect(saves.getByText('Saved d20 dice: 12',{exact:true})).toBeVisible();
  const reopen=async()=>{await page.reload();await ability.getByRole('button',{name:'Use / resume'}).click();await dialog.getByRole('button',{name:/Resume Telekinetic Propel/}).click();await dialog.getByRole('button',{name:'Resolve combat save'}).click();};
  await reopen();await expect(saves.getByText('Saved d20 dice: 12',{exact:true})).toBeVisible();
  await saves.getByRole('spinbutton').fill('1');await saves.getByRole('button',{name:'Review changed settings'}).click();await expect(saves.getByRole('button',{name:'Confirm save'})).toBeEnabled();
  await saves.getByRole('spinbutton').fill('0');await saves.getByRole('button',{name:'Review changed settings'}).click();await expect(saves.getByText('Saved d20 dice: 12',{exact:true})).toBeVisible();
  let settlements=0;
  await page.route('**/rest/v1/rpc/settle_propel_save',async route=>{settlements++;if(settlements<=2){if(settlements===1)await route.fetch();await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Simulated lost confirmation'})});}else await route.continue();});
  await saves.getByRole('button',{name:'Confirm save'}).click();await expect(saves.getByRole('alert')).toContainText('Simulated lost confirmation');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
  await saves.getByRole('button',{name:'Confirm save'}).click();await expect(saves.getByRole('status')).toContainText('Waiting for the DM');expect(settlements).toBe(2);
  await expect(saves.getByText('Mind Sliver: −3 included in the total.')).toBeVisible();
  await reopen();await expect(saves.getByRole('status')).toContainText('Waiting for the DM');
  await page.screenshot({path:info.outputPath('propel-resistance-waiting.png')});
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8'),body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Propel saving throw\"], [aria-label=\"Propel saving throw\"] *')").replace(/const skip = \(el, cs\) =>[\s\S]*?;\n\n {4}const clipped/,"const skip = (_el, cs) => cs.filter !== 'none';\n\n    const clipped");
   const report=await page.evaluate('('+scoped+'\n})()');expect(report.sideways,JSON.stringify(report)).toBe(false);expect(report.clipped,JSON.stringify(report)).toEqual([]);expect(report.pastEdge,JSON.stringify(report)).toEqual([]);
  }
  await saves.getByRole('button',{name:accept?'Use Legendary Resistance':'Keep failed save',exact:true}).click();
  await expect(saves.getByRole('status')).toContainText(`Saved: ${accept?'passed':'failed'}. ${accept?0:1} Energy Dice spent.`);
  await page.screenshot({path:info.outputPath('propel-resistance-decided.png')});
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe(accept?'2':'1');
  expect(sql(`select legendary_resistance_used from combat_participants where id='${enemy}'`)).toBe(accept?'4':'3');
  expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Telekinetic Propel'`)).toBe('1');expect(errors).toEqual([]);
 });

 for(const spellId of ['mage-hand','mind-sliver'])test(`Teleporter picker resumes ${spellId} without spending an Action`,async({page},info)=>{
  const encounter=randomUUID(),self=randomUUID(),enemy=randomUUID(),targetCharacter=randomUUID();
  sql(`insert into campaigns(id,owner_id,name) values('${campaignId}','${userId}','Teleporter Combat');
   update characters set campaign_id='${campaignId}',level=6,current_hp=40,max_hp=40,known_spells=array['mage-hand','mind-sliver','mending','true-strike'],spell_sources='{"mage-hand":["class:Psion"],"mind-sliver":["class:Psion"],"mending":["class:Psion"],"true-strike":["class:Psion"]}' where id='${charId}';
   insert into characters(id,user_id,campaign_id,name,species,class_name,background,level,current_hp,max_hp) values('${targetCharacter}','${userId}','${campaignId}','Target Fighter','Human','Fighter','Sage',1,40,40);
   insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${encounter}','${campaignId}','active',1,0);
   insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order) values
   ('${self}','${encounter}','${campaignId}','character','${charId}','Psion',0),('${enemy}','${encounter}','${campaignId}','character','${targetCharacter}','Target Fighter',1);
   update combatants set active_conditions=array[]::text[] where id=(select combatant_id from combat_participants where id='${enemy}');`);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  await page.locator('.arow-grid').filter({has:page.getByText('Free Misty Step (Teleportation)',{exact:true})}).getByRole('button',{name:'Cast',exact:true}).click();
  await expect(page.getByRole('button',{name:'Bonus Action Used',exact:true})).toBeDisabled();await page.reload();
  await page.getByRole('button',{name:'Choose cantrip',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Teleporter Combat',exact:true});
  await expect(picker.getByText('Misty Step confirmed',{exact:false})).toBeVisible();
  const select=picker.getByRole('combobox',{name:'Psion cantrip',exact:true});
  await select.selectOption('true-strike');await expect(picker.getByText(/No casting has been spent/)).toBeVisible();
  expect(sql(`select count(*) from dndkeep_private.teleporter_combat_children where character_id='${charId}'`)).toBe('0');
  await select.selectOption(spellId);
  expect(await select.locator('option').allTextContents()).not.toContain('Mending');
  await page.screenshot({path:info.outputPath('teleporter-picker.png')});
  if(spellId==='mage-hand')await picker.getByRole('button',{name:'Cast follow-up',exact:true}).click();
  else {await picker.getByRole('button',{name:'Choose follow-up target',exact:true}).click();await page.getByRole('button').filter({hasText:'Target Fighter'}).last().click();}
  const name=spellId==='mage-hand'?'Mage Hand':'Mind Sliver';
  const castDialog=page.getByRole('dialog',{name:`Casting ${name}`,exact:true});await expect(castDialog).toBeVisible();
  await expect.poll(()=>sql(`select count(*) from dndkeep_private.teleporter_combat_children where character_id='${charId}'`)).toBe('1');
  expect(sql(`select action_used from combat_participants where id='${self}'`)).toBe('f');
  if(spellId==='mind-sliver')expect(sql(`select request->'context'->'combat'->'target'->>'participantId' from dndkeep_private.declared_spell_payments where character_id='${charId}'`)).toBe(enemy);
  if(spellId==='mind-sliver')expect(sql(`select count(*) from dndkeep_private.mind_sliver_effects where encounter_id='${encounter}' and target_id='${enemy}' and status='waiting'`)).toBe('1');
  await page.reload();await expect(castDialog).toBeVisible();
  expect(sql(`select count(*) from dndkeep_private.teleporter_combat_children where character_id='${charId}'`)).toBe('1');
  await page.screenshot({path:info.outputPath('teleporter-cast-recovered.png')});
  expect(errors).toEqual([]);
 });

});
