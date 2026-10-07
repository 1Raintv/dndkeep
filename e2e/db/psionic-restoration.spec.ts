import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psionic Restoration (local stack)', () => {
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
      values ('${charId}','${userId}','Restoration Fixture','Human','Psion','Sage','Telepath',5,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  test('Psion powers charge only the correct uses and persist after reload',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const button=(name:string)=>page.getByRole('button',{name,exact:true}).locator('visible=true').first();
    const dice=()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`);
    await button('Free 5 ft').click();await expect(page.getByRole('dialog',{name:'Telekinetic Propel'})).toBeVisible();
    await button('Save failed').click();expect(dice()).toBe('2');
    await button('Powered (1 die)').click();await button('Save passed').click();await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Telekinetic Propel' and notes like 'Passed STR save%'`)).toBe('1');expect(dice()).toBe('2');
    await button('Powered (1 die)').click();
    await page.screenshot({path:info.outputPath('propel-save.png')});
    await button('Save failed').click();await expect.poll(dice).toBe('1');
    await button('Extend (free)').click();await button('Cancel').click();expect(dice()).toBe('1');
    await button('Extend (free)').click();await button('Extend telepathy').click();
    await expect(button('Extend (1 die)')).toBeEnabled();
    await expect.poll(()=>sql(`select feature_uses->>'Telepathic Connection' from characters where id='${charId}'`)).toBe('1');
    expect(dice()).toBe('1');await page.reload();await expect(button('Extend (1 die)')).toBeEnabled();
    await button('Extend (1 die)').click();await button('Extend telepathy').click();await expect.poll(dice).toBe('0');
    await expect(button('Powered (1 die)')).toBeDisabled();await expect(button('Extend (1 die)')).toBeDisabled();await expect(button('Spend Die (1d8)')).toBeDisabled();await expect(button('Free 5 ft')).toBeEnabled();
    await button('Free 5 ft').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('psion-powers.png')});
    await page.getByRole('button',{name:/^Rest$/}).locator('visible=true').first().click();await page.getByTitle('End short rest',{exact:true}).click();
    await expect.poll(dice).toBe('1');await expect(button('Extend (1 die)')).toBeEnabled();
    await page.getByRole('button',{name:/^Rest$/}).locator('visible=true').first().click();await button('Take Long Rest').click();
    await expect.poll(dice).toBe('6');await expect(button('Extend (free)')).toBeEnabled();expect(errors).toEqual([]);
  });

  for (const view of ['Actions','Features']) test(`Psionic Restoration from ${view} refills dice, persists and refreshes only after a Long Rest`,async({page},info)=>{
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if(response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    sql(`update characters set class_resources = class_resources || '{"psionic-energy-dice":2}'::jsonb, feature_uses='{}'::jsonb where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    if(view==='Features') await page.locator('button.tab').filter({hasText:/^Features$/}).click();
    const meditate=()=>page.getByRole('button',{name:'Meditate (1 min)',exact:true}).locator('visible=true').first();
    await expect(meditate()).toBeVisible({timeout:20_000});
    await meditate().scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('restoration-action.png')});
    await meditate().click();
    await expect(page.getByRole('dialog',{name:'Psionic Restoration'})).toBeVisible();
    await page.screenshot({path:info.outputPath('psionic-restoration.png')});
    await page.getByRole('button',{name:'Complete meditation',exact:true}).click();
    await expect(page.getByRole('button',{name:'Used · Long Rest',exact:true}).locator('visible=true').first()).toBeDisabled();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('6');
    await expect.poll(()=>sql(`select feature_uses->>'Psionic Restoration' from characters where id='${charId}'`)).toBe('1');
    await page.reload();if(view==='Features') await page.locator('button.tab').filter({hasText:/^Features$/}).click();
    await expect(page.getByRole('button',{name:'Used · Long Rest',exact:true}).locator('visible=true').first()).toBeDisabled();
    // Spend again, then exercise real rest handlers rather than resetting trackers by hand.
    sql(`update characters set class_resources=class_resources || '{"psionic-energy-dice":2}'::jsonb where id='${charId}'`);
    await page.reload();if(view==='Features') await page.locator('button.tab').filter({hasText:/^Features$/}).click();
    await page.getByRole('button',{name:/^Rest$/}).locator('visible=true').first().click();
    await page.getByTitle('End short rest', {exact:true}).click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('3');
    await expect(page.getByRole('button',{name:'Used · Long Rest',exact:true}).locator('visible=true').first()).toBeDisabled();
    await page.getByRole('button',{name:/^Rest$/}).locator('visible=true').first().click();
    await page.getByRole('button',{name:'Take Long Rest',exact:true}).click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-restoration' from characters where id='${charId}'`)).toBe('1');
    await expect(page.getByRole('button',{name:'Dice full',exact:true}).locator('visible=true').first()).toBeDisabled();
    sql(`update characters set class_resources=class_resources || '{"psionic-energy-dice":5}'::jsonb where id='${charId}'`);
    await page.reload();if(view==='Features') await page.locator('button.tab').filter({hasText:/^Features$/}).click();await expect(meditate()).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test('malformed saved dice cannot be spent and a Long Rest restores valid availability',async({page},info)=>{
    sql(`update characters set class_resources=class_resources || '{"psionic-energy-dice":1.5}'::jsonb where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const button=(name:string)=>page.getByRole('button',{name,exact:true}).locator('visible=true').first();
    const warning=button('Check Psionic Energy Dice');
    await expect(warning).toBeDisabled({timeout:20_000});
    for(const label of ['Powered (1 die)','Extend (free)','Roll bonus','Free 5 ft','Spend Die (1d8)'])await expect(button(label)).toBeDisabled();
    expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('1.5');
    await warning.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await page.screenshot({path:info.outputPath('invalid-psionic-pool.png')});
    await page.getByRole('button',{name:/^Rest$/}).locator('visible=true').first().click();
    await button('Take Long Rest').click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('6');
    await expect(button('Powered (1 die)')).toBeEnabled();await expect(button('Extend (free)')).toBeEnabled();
    await button('Spend Die (1d8)').click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('5');
    await button('Spend Die (1d8)').click();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('4');
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and notes like '%4 dice remaining'`)).toBe('1');
  });

  test('Surge boosts base powers while preserving their separate Energy Die costs',async({page},info)=>{
    // A slow history insert must not discard the next independent power.
    let release!:()=>void;const pending=new Promise<void>(r=>release=r);
    let delayed=false,heldConnection=false;
    await page.route('**/rest/v1/action_logs*',async route=>{
      if(!delayed && route.request().method()==='POST' && route.request().postDataJSON()?.action_name==='Telekinetic Propel') {
        delayed=true;await pending;
      }
      if(route.request().method()==='POST' && route.request().postDataJSON()?.action_name==='Telepathic Connection'){heldConnection=true;await pending;}
      await route.continue();
    });
    try {
    sql(`update characters set level=7,hit_dice_spent=0 where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const button=(name:string)=>page.getByRole('button',{name,exact:true}).locator('visible=true').first();
    await expect(button('Powered (1 die)')).toBeVisible({timeout:20_000});
    await page.evaluate(()=>{Math.random=()=>0.01;});
    const resources=()=>sql(`select hit_dice_spent||':'||(class_resources->>'psionic-energy-dice') from characters where id='${charId}'`);
    await button('Powered (1 die)').click();await button('Spend 1 Hit Point Die').click();
    const propel=page.getByRole('dialog',{name:'Telekinetic Propel'});
    await expect(propel).toContainText('Psionic Surge treats 1 as 4: 20 ft');
    await expect.poll(resources).toBe('1:2');
    await page.screenshot({path:info.outputPath('surged-propel.png')});
    await button('Save passed').click();await expect(propel).toBeHidden();expect(resources()).toBe('1:2');
    await button('Extend (free)').click();await button('Extend telepathy').click();await button('Spend 1 Hit Point Die').click();
    await expect.poll(resources).toBe('2:2');await expect(button('Extend (1 die)')).toBeEnabled();
    await expect.poll(()=>heldConnection).toBe(true);expect(delayed).toBe(true);release();
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Telepathic Connection' and notes like 'Telepathy range 100 ft%'`)).toBe('1');
    await button('Powered (1 die)').click();await button('Spend 1 Hit Point Die').click();
    await expect(propel).toBeVisible();await button('Cancel').click();await expect.poll(resources).toBe('3:2');
    await button('Extend (1 die)').click();await button('Extend telepathy').click();await button('Keep roll of 1').click();
    await expect.poll(resources).toBe('3:1');
    await page.reload();await expect(button('Powered (1 die)')).toBeVisible();expect(resources()).toBe('3:1');
    } finally {release();}
  });

});
