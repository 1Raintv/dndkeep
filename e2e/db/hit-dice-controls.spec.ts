import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Mixed Hit Dice controls', () => {
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

  for(const secondary of [false,true])test(`review and selected Surge (${secondary?'secondary':'primary'} Psion)`,async({page},info)=>{
    sql(`update characters set class_name='${secondary?'Fighter':'Psion'}',level=${secondary?3:7},secondary_class='${secondary?'Psion':'Fighter'}',secondary_level=${secondary?7:3},secondary_subclass='${secondary?'Telepath':'Champion'}',subclass='${secondary?'Champion':'Telepath'}',hit_dice_spent=2,current_hp=10,max_hp=30,class_resources='{"psion-disciplines":["Inerrant Aim"],"psionic-energy-dice":3}' where id='${charId}'`);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const rest=()=>page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first();
    await rest().click();const review=page.getByRole('region',{name:'Review spent Hit Dice'});
    await expect(review).toBeVisible();await expect(page.getByRole('button',{name:'Review Hit Dice first'})).toBeDisabled();await expect(review.getByRole('button',{name:'Save Hit Dice review'})).toBeDisabled();
    await review.getByLabel('Spent d6',{exact:true}).fill('1');await review.getByLabel('Spent d10',{exact:true}).fill('1');
    await page.screenshot({path:info.outputPath('hit-dice-review.png')});
    await review.getByRole('button',{name:'Save Hit Dice review'}).click();await expect(review).not.toBeVisible();
    const state=()=>JSON.parse(sql(`select json_build_object('spent',hit_dice_spent,'pools',hit_dice_spent_by_type,'hp',current_hp,'energy',class_resources->'psionic-energy-dice') from characters where id='${charId}'`));
    expect(state()).toEqual({spent:2,pools:{'6':1,'10':1},hp:10,energy:3});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    const row=page.locator('.arow-grid').filter({has:page.getByText('Inerrant Aim',{exact:true})});
    await expect(row.getByRole('button',{name:'Roll bonus'})).toBeVisible();await page.evaluate(()=>{Math.random=()=>0.01;});
    await row.getByRole('button',{name:'Roll bonus'}).evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await expect.poll(()=>row.getByRole('button',{name:'Roll bonus'}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    await row.getByRole('button',{name:'Roll bonus'}).click();
    const chooser=page.getByRole('dialog',{name:'Psionic Surge: choose a Hit Die'}),outcome=page.getByRole('dialog',{name:'Inerrant Aim'});
    await expect(chooser.getByRole('button',{name:'Spend 1d6 · 6 available'})).toBeVisible();
    await expect(chooser.getByRole('button',{name:'Spend 1d10 · 2 available'})).toBeVisible();
    await page.screenshot({path:info.outputPath('hit-die-choice.png')});
    await chooser.getByRole('button',{name:'Keep original roll'}).click();await outcome.getByRole('button',{name:'Keep die'}).click();expect(state().spent).toBe(2);
    await row.getByRole('button',{name:'Roll bonus'}).evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await expect.poll(()=>row.getByRole('button',{name:'Roll bonus'}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    await row.getByRole('button',{name:'Roll bonus'}).click();await chooser.getByRole('button',{name:'Spend 1d10 · 2 available'}).click();
    await expect(outcome).toContainText('Surge treats it as 4');await outcome.getByRole('button',{name:'Keep die'}).click();
    await expect.poll(state).toEqual({spent:3,pools:{'6':1,'10':2},hp:10,energy:3});
    await page.reload();await expect(row.getByRole('button',{name:'Roll bonus'})).toBeVisible();await page.evaluate(()=>{Math.random=()=>0.01;});
    await row.getByRole('button',{name:'Roll bonus'}).evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await expect.poll(()=>row.getByRole('button',{name:'Roll bonus'}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    await row.getByRole('button',{name:'Roll bonus'}).click();await expect(chooser.getByRole('button',{name:'Spend 1d10 · 1 available'})).toBeVisible();
    await chooser.getByRole('button',{name:'Spend 1d6 · 6 available'}).click();await outcome.getByRole('button',{name:'Keep die'}).click();
    await expect.poll(state).toEqual({spent:4,pools:{'6':2,'10':2},hp:10,energy:3});
    await rest().click();
    await expect(page.getByText('5 / 7 d6',{exact:true})).toBeVisible();await expect(page.getByText('1 / 3 d10',{exact:true})).toBeVisible();
    await page.getByLabel('Hit Die size',{exact:true}).selectOption('10');
    await page.getByRole('button',{name:'Roll Hit Dice (d10+0)',exact:true}).click();
    await expect.poll(state).toEqual({spent:5,pools:{'6':2,'10':3},hp:11,energy:3});
    await expect(page.getByRole('button',{name:'Roll Hit Dice (d10+0)',exact:true})).toBeDisabled();
    await page.screenshot({path:info.outputPath('mixed-rest-pools.png')});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.reload();await rest().click();
    await expect(page.getByText('0 / 3 d10',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Take Long Rest',exact:true}).click();
    await expect.poll(()=>state().pools).toEqual({});await expect.poll(()=>state().spent).toBe(0);
    expect(errors).toEqual([]);
  });
});
