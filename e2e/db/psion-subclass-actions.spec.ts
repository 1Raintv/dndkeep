import {existsSync,readFileSync} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion subclass action eligibility', () => {
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

  test('Propel choices are adjacent Bonus Actions and the die is spent only on failure',async({page},info)=>{
    test.setTimeout(90000);
    sql(`update characters set level=5 where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const abilityRow=(name:string)=>page.locator('.arow-grid').filter({has:page.getByText(name,{exact:true})}).locator('visible=true').first();
    const base=abilityRow('Telekinetic Propel'),warp=abilityRow('Warp Propel');
    await expect(base.getByTitle('Action type: bonus',{exact:true})).toBeVisible();
    await expect(warp.getByTitle('Action type: bonus',{exact:true})).toBeVisible();
    const order=await page.locator('.arow-grid .arow-name').allTextContents();
    expect(order.findIndex(t=>t.trim()==='Warp Propel')).toBe(order.findIndex(t=>t.trim()==='Telekinetic Propel')+1);
    await base.scrollIntoViewIfNeeded();
    if(existsSync('propel-overflow-probe.tmp')){
      const report=await page.evaluate(readFileSync('propel-overflow-probe.tmp','utf8'));
      await info.attach('propel-overflow',{body:JSON.stringify(report),contentType:'application/json'});
      expect(report.sideways).toBe(false);expect(report.clipped).toEqual([]);expect(report.pastEdge).toEqual([]);
    }
    await page.screenshot({path:info.outputPath('propel-choices.png')});
    await warp.getByRole('button',{name:'Teleport (no die)',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Telekinetic Propel',exact:true});
    await expect(dialog).toContainText('Warp Propel');await expect(dialog).toContainText('horizontal to you');
    await expect(dialog).not.toContainText('Movement is straight');
    await dialog.getByRole('button',{name:'Save failed',exact:true}).click();await expect(dialog).toBeHidden();
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
    await base.getByRole('button',{name:'Roll Energy Die',exact:true}).click();
    await expect(dialog).toContainText('Spend 1 die only if the target fails.');
    await dialog.getByRole('button',{name:'Save passed',exact:true}).click();await expect(dialog).toBeHidden();
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
    await base.getByRole('button',{name:'Roll Energy Die',exact:true}).click();
    await page.screenshot({path:info.outputPath('propel-energy-die.png')});
    await dialog.getByRole('button',{name:'Save failed',exact:true}).click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1');
  });

  test('only Psi Warpers see their six subclass actions',async({page},info)=>{
    test.setTimeout(60000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const names=['Free Misty Step (Teleportation)','Warp Propel','Warp Space','Teleporter Combat','Duplicitous Target','Mass Teleportation'];
    const row=(name:string)=>page.getByText(name,{exact:true}).locator('visible=true');
    await expect(page.getByRole('button',{name:'Free 5 ft',exact:true}).locator('visible=true').first()).toBeVisible();
    for(const name of names) await expect(row(name).first()).toBeVisible();
    await row('Warp Propel').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('psi-warper.png')});
    for(const subclass of ['Telepath','Psykinetic','Metamorph','']) {
      sql(`update characters set subclass='${subclass}' where id='${charId}'`);
      await page.reload();
      await expect(page.getByRole('button',{name:'Free 5 ft',exact:true}).locator('visible=true').first()).toBeVisible();
      for(const name of names) await expect(row(name)).toHaveCount(0);
      await expect(row('Subtle Telekinesis').first()).toBeVisible();
    }
    await row('Subtle Telekinesis').first().click();
    await expect(page.getByText(/You know the Mage Hand cantrip. You can cast it without Somatic components/).locator('visible=true').first()).toBeVisible();
    await page.screenshot({path:info.outputPath('base-powers.png')});
    sql(`update characters set subclass='Psi Warper',level=2 where id='${charId}'`);
    await page.reload();
    await expect(page.getByRole('button',{name:'Free 5 ft',exact:true}).locator('visible=true').first()).toBeVisible();
    for(const name of names) await expect(row(name)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
