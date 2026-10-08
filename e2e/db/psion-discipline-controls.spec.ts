import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.use({serviceWorkers:'block'});
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const cases=[['biofeedback','Gain temp HP'],['destructive-thoughts','Roll damage'],['devilish-tongue','Roll bonus'],['expanded-awareness','Roll bonus'],['inerrant-aim','Roll bonus'],['observant-mind','Roll bonus'],['bolstering-precognition','Use discipline'],['id-insinuation','Use discipline'],['psionic-backlash','Use discipline'],['psionic-guards','Activate Guards'],['sharpened-mind','Use discipline']];
test.describe('Psionic Discipline activation controls',()=>{
 gateDbSuite();let charId:string,userId:string,email:string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID();
    email = 'psion-' + userId + '@dndkeep.local';
    // v2.747: own disposable account, so shared seed users' slot limits and
    // parallel suites cannot affect this fixture. Never alter their characters.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Psion Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
      update profiles set show_ua_content=true where id='${userId}';
      insert into characters (id,user_id,name,species,class_name,background,subclass,level,class_resources)
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Psi Warper',20,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from action_logs where character_id='${charId}'; delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });





 for(const [discipline,label] of cases)test(`${discipline} records its first attempt and rejects a second`,async({page},info)=>{
  test.setTimeout(90000);await page.addInitScript(()=>{Math.random=()=>0.25;});
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["${discipline}"],"psionic-energy-dice":6}' where id='${charId}'`);
  if(discipline==='psionic-guards')sql(`update characters set saving_throw_proficiencies=array['intelligence'] where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const button=page.getByRole('button',{name:label,exact:true}).locator('visible=true').first();
  const activate=async()=>{
   await button.click();
   if(discipline==='destructive-thoughts'){const target=page.getByRole('dialog',{name:'Destructive Thoughts target'});await target.getByRole('textbox').fill('Practice target');await target.getByRole('button',{name:'Choose target'}).click();}
   if(['biofeedback','destructive-thoughts'].includes(discipline))await page.getByRole('dialog').getByRole('button',{name:'Spend and roll'}).click();
  };
  await activate();
  if(label==='Roll bonus')await page.getByRole('dialog').getByRole('button',{name:'Keep die'}).click();
  await expect.poll(()=>sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('1');
  if(label==='Roll bonus')await expect.poll(()=>sql(`select outcome->>'spent' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('false');
  const pool=()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`);
  expect(pool()).toBe(label==='Roll bonus'?'6':'5');
  expect(sql(`select receipt->'rolls' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe(discipline==='psionic-guards'?'[]':'[3]');
  await expect(button).toBeEnabled();await activate();
  await expect(page.getByText('This discipline was already used this turn', {exact:true})).toBeVisible();
  expect(pool()).toBe(label==='Roll bonus'?'6':'5');expect(sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('1');
  if(discipline==='psionic-guards'){
   const protection=page.getByRole('status',{name:'Psionic Guards protection'});await expect(protection).toContainText('Psionic Guards active');
   await page.reload();await expect(protection).toBeVisible();await protection.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('guards-active.png')});
   if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
    const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');
    const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
    const layout=await page.evaluate('('+body+'\n})()');expect(layout.sideways).toBe(false);
    await info.attach('guards-sheet-layout',{body:JSON.stringify(layout),contentType:'application/json'});
    const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Psionic Discipline record\"], [aria-label=\"Psionic Discipline record\"] *')");
    const local=await page.evaluate('('+scoped+'\n})()');expect(local.clipped).toEqual([]);expect(local.pastEdge).toEqual([]);
   }
   await page.getByRole('button',{name:/^intelligence saving throw/}).locator('visible=true').first().click();
   await expect.poll(()=>sql(`select count(*) from roll_logs where character_id='${charId}' and label='Intelligence Save (Advantage · Psionic Guards)'`),{timeout:20000}).toBe('1');
   const guarded=JSON.parse(sql(`select jsonb_build_object('dice',individual_results,'total',total,'modifier',modifier) from roll_logs where character_id='${charId}' and label='Intelligence Save (Advantage · Psionic Guards)'`));
   expect(guarded.dice).toHaveLength(2);expect(guarded.modifier).toBe(7);expect(guarded.total).toBe(Math.max(...guarded.dice)+7);
   await expect(page.getByText('Rolling...', {exact:true})).not.toBeVisible();
   await page.screenshot({path:info.outputPath('guards-save.png')});
   await page.reload();await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();await expect(protection).toHaveCount(0);
   await page.getByRole('button',{name:/^intelligence saving throw/}).locator('visible=true').first().click();
   await expect.poll(()=>sql(`select count(*) from roll_logs where character_id='${charId}' and label='Intelligence Save'`),{timeout:20000}).toBe('1');
   const normal=JSON.parse(sql(`select jsonb_build_object('dice',individual_results,'total',total) from roll_logs where character_id='${charId}' and label='Intelligence Save'`));
   expect(normal.dice).toHaveLength(1);expect(normal.total).toBe(normal.dice[0]+7);
  }
  if(discipline==='psionic-guards'||discipline==='inerrant-aim')await page.screenshot({path:info.outputPath(discipline+'-used.png')});
 });
 test('secondary Psion uses the original class snapshot instead of the display projection',async({page})=>{
  sql(`update characters set class_name='Fighter',level=3,secondary_class='Psion',secondary_level=5,intelligence=18,class_resources='{"psion-disciplines":["psionic-guards"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await page.getByRole('button',{name:'Activate Guards',exact:true}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('5');
  expect(sql(`select request->'expected'->>'class_name' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('Fighter');
 });
 test('two tabs share one ordinary discipline attempt even when its die is kept',async({page,context})=>{
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["inerrant-aim","biofeedback"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);const second=await context.newPage();
  try{
   await second.goto(`/character/${charId}`);await page.getByRole('button',{name:'Roll bonus',exact:true}).locator('visible=true').first().click();
   await page.getByRole('dialog').getByRole('button',{name:'Keep die'}).click();
   await second.getByRole('button',{name:'Gain temp HP',exact:true}).locator('visible=true').first().click();await second.getByRole('dialog').getByRole('button',{name:'Spend and roll'}).click();
   await expect(second.getByText('A discipline was already used this turn',{exact:true})).toBeVisible();
   expect(sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('1');
   expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('6');
  }finally{await second.close();}
 });
 test('distinct start-of-turn exceptions allow a subsequent ordinary discipline',async({page},info)=>{
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["psionic-guards","sharpened-mind","biofeedback"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  await page.getByRole('button',{name:'Activate Guards',exact:true}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('5');
  await page.getByRole('button',{name:'Use discipline',exact:true}).locator('visible=true').first().click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('4');
  await page.getByRole('button',{name:'Gain temp HP',exact:true}).locator('visible=true').first().click();await page.getByRole('dialog').getByRole('button',{name:'Spend and roll'}).click();
  await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('3');
  expect(sql(`select count(*) from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('3');
  await page.getByRole('region',{name:'Psionic Discipline record'}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('discipline-exceptions.png')});
 });

 test('closing the bonus leaves its outcome pending across reload',async({page},info)=>{
  sql(`update characters set level=5,intelligence=18,class_resources='{"psion-disciplines":["inerrant-aim"],"psionic-energy-dice":6}' where id='${charId}'`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);await page.getByRole('button',{name:'Roll bonus',exact:true}).locator('visible=true').first().click();
  await expect(page.getByRole('dialog',{name:'Inerrant Aim'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(sql(`select outcome is null from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('t');
  await page.reload();const record=page.getByRole('region',{name:'Psionic Discipline record'});await expect(record).toContainText('outcome pending');await record.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('discipline-closed.png')});
  await record.getByRole('button',{name:'No change · keep die'}).click();await expect(record).toContainText('Outcome confirmed');
  expect(sql(`select outcome->>'spent' from dndkeep_private.psionic_discipline_uses where character_id='${charId}'`)).toBe('false');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('6');
 });

});
