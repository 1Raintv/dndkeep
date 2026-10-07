import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion Energy Dice concurrency', () => {
  gateDbSuite();
  let charId: string;
  let userId: string;
  let email: string;
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
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });



  test('simultaneous base Energy Die rolls both spend their cost',async({page,context})=>{
    test.setTimeout(60_000);
    sql(`update characters set level=5,class_resources='{"psionic-energy-dice":6}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const second=await context.newPage();
    let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});let pending=0;
    try{
      await second.goto(`/character/${charId}`);
      const roll=(p:typeof page)=>p.getByRole('button',{name:'Spend Die (1d8)',exact:true}).locator('visible=true').first();
      await expect(roll(page)).toBeEnabled();await expect(roll(second)).toBeEnabled();
      await context.route('**/rest/v1/**',async route=>{
        const request=route.request();
        const payment=request.method()==='POST'&&request.url().endsWith('/rpc/settle_psionic_energy');
        const legacy=request.method()==='PATCH'&&request.url().includes('/characters?')&&request.postDataJSON()?.class_resources?.['psionic-energy-dice']===5;
        if(!payment&&!legacy){await route.continue();return;}
        pending++;if(pending===2)release();await barrier;await route.continue();
      });
      await Promise.all([roll(page).click(),roll(second).click()]);
      await expect.poll(()=>pending).toBe(2);
      await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Spent Psionic Energy Die (1d8)'`)).toBe('2');
      await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('4');
    }finally{release();await second.close();}
  });
  test('manual pool adjustments and subclass payments persist without whole-pool writes',async({page})=>{
    sql(`update characters set level=6,class_resources='{"psionic-energy-dice":6}',feature_uses='{}' where id='${charId}'`);
    const writes:unknown[]=[];page.on('request',request=>{if(request.method()==='PATCH'&&request.url().includes('/rest/v1/characters?')&&request.postDataJSON()?.class_resources)writes.push(request.postDataJSON());});
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const balance=()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`);
    await page.getByRole('button',{name:'Psionic Energy Die 1 (available)',exact:true}).locator('visible=true').first().click();await expect.poll(balance).toBe('5');
    await page.getByRole('button',{name:'Psionic Energy Die 6 (used)',exact:true}).locator('visible=true').first().click();await expect.poll(balance).toBe('6');
    const row=(name:string)=>page.locator('.arow-grid').filter({has:page.getByText(name,{exact:true})}).locator('visible=true').first();
    const teleport=row('Free Misty Step (Teleportation)');
    await teleport.getByRole('button',{name:'Cast',exact:true}).click();
    await expect.poll(()=>sql(`select feature_uses->>'Free Misty Step (Teleportation)' from characters where id='${charId}'`)).toBe('1');expect(balance()).toBe('6');
    await teleport.getByTitle('Spend 1 PED to refresh this feature mid-rest',{exact:true}).click();await expect.poll(balance).toBe('5');
    await expect.poll(()=>sql(`select feature_uses->>'Free Misty Step (Teleportation)' from characters where id='${charId}'`)).toBe('0');
    await teleport.getByRole('button',{name:'Free Misty Step (Teleportation) use 1 (available)',exact:true}).click();
    await expect.poll(()=>sql(`select feature_uses->>'Free Misty Step (Teleportation)' from characters where id='${charId}'`)).toBe('1');
    await teleport.getByRole('button',{name:'Free Misty Step (Teleportation) use 1 (used)',exact:true}).click();
    await expect.poll(()=>sql(`select feature_uses->>'Free Misty Step (Teleportation)' from characters where id='${charId}'`)).toBe('0');expect(balance()).toBe('5');
    await row('Warp Space').getByRole('button',{name:'Cast (1 PED)',exact:true}).click();await expect.poll(balance).toBe('4');
    expect(writes).toEqual([]);await page.reload();await expect(page.getByTitle('4 of 6 Psionic Energy Dice remaining',{exact:true}).locator('visible=true').first()).toBeVisible();
  });

});
