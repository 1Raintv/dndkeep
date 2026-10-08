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




 test('a remote combat turn refreshes the record and preserves earlier pending outcomes',async({page})=>{
  test.setTimeout(90000);const camp=randomUUID(),enc=randomUUID(),cb=randomUUID(),participant=randomUUID(),attempt=randomUUID();
  try{
   sql(`begin;
    insert into campaigns(id,owner_id,name) values('${camp}','${userId}','Discipline turns fixture');
    update characters set campaign_id='${camp}' where id='${charId}';
    insert into combatants(id,campaign_id,owner_id,name,definition_type,definition_id,current_hp,max_hp)
     values('${cb}','${camp}','${userId}','Psion','character','${charId}',20,20);
    insert into combat_encounters(id,campaign_id,status,round_number,current_turn_index) values('${enc}','${camp}','active',1,0);
    insert into combat_participants(id,encounter_id,campaign_id,participant_type,entity_id,name,turn_order,initiative,combatant_id)
     values('${participant}','${enc}','${camp}','character','${charId}','Psion',0,15,'${cb}');
    set local role authenticated;set local request.jwt.claims='{"sub":"${userId}","role":"authenticated"}';
    select begin_psionic_discipline(c.id,'${attempt}',jsonb_build_object('encounterId',e.id,'round',e.round_number,'index',e.current_turn_index,'turnId',e.psionic_turn_id),'inerrant-aim',array[3],1,0,
     jsonb_build_object('class_name',c.class_name,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,'intelligence',c.intelligence,'inventory',c.inventory,'disciplines',c.class_resources->'psion-disciplines'))
     from characters c,combat_encounters e where c.id='${charId}' and e.id='${enc}';commit;`);
   const seen:Array<{soloTurn?:number;round?:number;turnId?:string}>=[];
   page.on('response',async response=>{if(response.url().endsWith('/rpc/get_psionic_discipline_turn')&&response.ok())seen.push((await response.json()).turn);});
   await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
   const panel=page.getByRole('region',{name:'Psionic Discipline record'});
   await expect(panel).toContainText('Recorded this turn: Inerrant Aim.');
   const first=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);
   sql(`update combat_encounters set round_number=2 where id='${enc}'`);
   await expect(panel).toContainText('Recorded this turn: none.',{timeout:15000});
   await expect(panel).toContainText('Inerrant Aim · outcome pending');
   sql(`update combat_encounters set round_number=1 where id='${enc}'`);
   const rewound=sql(`select psionic_turn_id from combat_encounters where id='${enc}'`);expect(rewound).not.toBe(first);
   await expect.poll(()=>seen.some(turn=>turn.turnId===rewound),{timeout:15000}).toBe(true);
   await expect(panel).toContainText('Recorded this turn: none.');
   sql(`delete from combat_participants where id='${participant}'`);
   await expect.poll(()=>seen.some(turn=>turn.soloTurn===0),{timeout:15000}).toBe(true);
   await expect(panel).toContainText('Inerrant Aim · outcome pending');
  }finally{
   sql(`update characters set campaign_id=null where id='${charId}';delete from combat_participants where campaign_id='${camp}';delete from combat_encounters where id='${enc}';delete from combatants where id='${cb}';delete from campaigns where id='${camp}';`);
  }
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
