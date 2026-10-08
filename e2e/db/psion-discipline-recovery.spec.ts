import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {expect,test} from '@playwright/test';
import {gateDbSuite,signInAsSeedDm} from './helpers';
test.use({serviceWorkers:'block'});
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
test.describe('Discipline outcome recovery on the sheet',()=>{
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




 test('an interrupted paid outcome survives reload with the original decision and one charge',async({page},info)=>{
  test.setTimeout(90000);const id=randomUUID(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  sql(`begin;set local role authenticated;set local request.jwt.claims='{"sub":"${userId}","role":"authenticated"}';
   select begin_psionic_discipline(c.id,'${id}','{"soloTurn":0}','inerrant-aim',array[3],1,0,jsonb_build_object('class_name',c.class_name,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,'intelligence',c.intelligence,'inventory',c.inventory,'disciplines',c.class_resources->'psion-disciplines')) from characters c where id='${charId}';commit;`);
  await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
  const panel=page.getByRole('region',{name:'Psionic Discipline record'});
  await expect(panel).toContainText('Inerrant Aim · outcome pending');await expect(panel).toContainText('Original base roll: 3');
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('discipline-pending.png')});
  // Optional local skill probe runs its unchanged DOM algorithm inside the
  // authenticated page, since the standalone CLI cannot sign into fixtures.
  if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){
   const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');
   const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();
   const layout=await page.evaluate('('+body+'\n})()');
   await info.attach('discipline-layout',{body:JSON.stringify(layout),contentType:'application/json'});
   expect(layout.sideways).toBe(false);
   // The whole-sheet report also includes existing compact/ellipsis controls.
   // Keep that report, then apply the same probe to the changed panel.
   const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Psionic Discipline record\"], [aria-label=\"Psionic Discipline record\"] *')");
   const panelLayout=await page.evaluate('('+scoped+'\n})()');
   expect(panelLayout.clipped).toEqual([]);expect(panelLayout.pastEdge).toEqual([]);
  }
  expect(errors).toEqual([]);
  let calls=0;const endpoint='**/rest/v1/rpc/finish_psionic_discipline';
  await page.route(endpoint,async route=>{calls++;expect(route.request().postDataJSON().p_changed_outcome).toBe(true);const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort();});
  await panel.getByRole('button',{name:'Changed outcome · spend 1'}).click();
  const recovery=page.getByRole('status',{name:'Psion roll recovery'});
  await expect(recovery.getByRole('button',{name:'Confirm saved attempt'})).toBeVisible();expect(calls).toBe(2);
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  await expect(recovery.getByRole('button',{name:'Dismiss recovery'})).toHaveCount(0);
  await page.unroute(endpoint);await page.reload();
  await recovery.getByRole('button',{name:'Confirm saved attempt'}).click();await expect(recovery).toContainText('base Energy Dice were spent once');
  expect(sql(`select count(*) from psionic_energy_uses where request_id='${id}'`)).toBe('1');
  expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  expect(errors).toEqual([]);await expect(panel).not.toContainText('outcome pending');await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('discipline-confirmed.png')});
  await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();await expect(panel).toHaveCount(0);
 });
});
