import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Conditional Psion dice', () => {
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
    if (userId) sql(`delete from action_logs where character_id='${charId}'; delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  const nextTurn=async(page:import('@playwright/test').Page)=>{
    const before=Number(sql(`select coalesce((select turn_number from psionic_solo_turns where character_id='${charId}'),0)`));
    await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
    await expect.poll(()=>Number(sql(`select turn_number from psionic_solo_turns where character_id='${charId}'`))).toBe(before+1);
  };
  test('four disciplines roll first and spend only on confirmed changed outcomes',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    sql(`update characters set level=10,hit_dice_spent=10,class_resources='{"psion-disciplines":["Devilish Tongue","Expanded Awareness","Inerrant Aim","Observant Mind"],"psionic-energy-dice":3,"other":9}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await expect(page.getByRole('button',{name:'Roll bonus',exact:true})).toHaveCount(4);
    const row=page.locator('.arow-grid').filter({has:page.getByText('Inerrant Aim',{exact:true})});
    await row.getByRole('button',{name:'Roll bonus'}).click();
    const dialog=page.getByRole('dialog',{name:'Inerrant Aim'});
    await expect(dialog).toBeVisible();await expect(dialog).toContainText(/Rolled [1-8] on 1d8/);
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('3');
    await page.screenshot({path:info.outputPath('conditional-die.png')});
    await dialog.getByRole('button',{name:'Keep die'}).click();await expect(dialog).not.toBeVisible();
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('3');
    await nextTurn(page);await row.getByRole('button',{name:'Roll bonus'}).click();await dialog.getByRole('button',{name:'Changed to hit · spend 1'}).click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('2');
    expect(sql(`select class_resources->>'other' from characters where id='${charId}'`)).toBe('9');
    await nextTurn(page);const check=page.locator('.arow-grid').filter({has:page.getByText('Expanded Awareness',{exact:true})});
    await check.getByRole('button',{name:'Roll bonus'}).click();
    await expect(page.getByRole('dialog',{name:'Expanded Awareness'})).toContainText('ability check');
    await page.getByRole('dialog').getByRole('button',{name:'Keep die',exact:true}).click();
    expect(errors).toEqual([]);
  });
  test('Surge spends Hit Point Dice independently of the conditional Energy Die',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    sql(`update characters set level=7,hit_dice_spent=0,class_resources='{"psion-disciplines":["Inerrant Aim"],"psionic-energy-dice":3,"other":9}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const row=page.locator('.arow-grid').filter({has:page.getByText('Inerrant Aim',{exact:true})});
    await expect(row.getByRole('button',{name:'Roll bonus'})).toBeVisible();
    // Fixed entropy only in this disposable browser page: exercise the actual
    // canonical roller's low result, not a substitute game-rule implementation.
    await page.evaluate(()=>{Math.random=()=>0.01;});
    const surge=page.getByRole('dialog',{name:'Psionic Surge'});
    const outcome=page.getByRole('dialog',{name:'Inerrant Aim'});
    const resources=()=>sql(`select hit_dice_spent||':'||(class_resources->>'psionic-energy-dice') from characters where id='${charId}'`);
    await row.getByRole('button',{name:'Roll bonus'}).click();
    await expect(surge).toContainText('rolled 1 on 1d8');expect(resources()).toBe('0:3');
    await page.screenshot({path:info.outputPath('psionic-surge.png')});
    await surge.getByRole('button',{name:'Spend 1 Hit Point Die'}).click();
    await expect(outcome).toContainText('Surge treats it as 4');
    await expect.poll(resources).toBe('1:3');
    await page.screenshot({path:info.outputPath('surged-outcome.png')});
    await outcome.getByRole('button',{name:'Keep die'}).click();
    await expect(outcome).not.toBeVisible();expect(resources()).toBe('1:3');await nextTurn(page);
    await row.getByRole('button',{name:'Roll bonus'}).click();
    await surge.getByRole('button',{name:'Keep roll of 1'}).click();
    await expect(outcome).toContainText('Rolled 1 on 1d8');
    await outcome.getByRole('button',{name:'Keep die'}).click();
    await expect(outcome).not.toBeVisible();expect(resources()).toBe('1:3');await nextTurn(page);
    await row.getByRole('button',{name:'Roll bonus'}).click();
    await surge.getByRole('button',{name:'Spend 1 Hit Point Die'}).click();
    await outcome.getByRole('button',{name:'Changed to hit · spend 1'}).click();
    await expect.poll(resources).toBe('2:2');
    expect(sql(`select class_resources->>'other' from characters where id='${charId}'`)).toBe('9');
    await page.reload();await expect(row.getByRole('button',{name:'Roll bonus'})).toBeVisible();
    expect(resources()).toBe('2:2');expect(errors).toEqual([]);
  });

});
