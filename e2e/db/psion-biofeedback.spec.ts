import {readFileSync} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion Biofeedback', () => {
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

  for(const level of [5,7])test(`Biofeedback ${level}: chosen cost, temporary HP and Surge`,async({page},info)=>{
    await page.addInitScript(()=>{Math.random=()=>0.01;});
    sql(`update characters set level=${level},intelligence=18,temp_hp=0,hit_dice_spent=0,class_resources='{"psion-disciplines":["Biofeedback"],"psionic-energy-dice":${level===5?6:2},"other":9}' where id='${charId}'`);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const state=()=>JSON.parse(sql(`select json_build_object('pool',class_resources->'psionic-energy-dice','temp',temp_hp,'spent',hit_dice_spent,'other',class_resources->'other') from characters where id='${charId}'`));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const activate=page.getByRole('button',{name:'Gain temp HP',exact:true}).locator('visible=true').first();
    await activate.click();let dialog=page.getByRole('dialog',{name:'Biofeedback',exact:true});
    await expect(dialog).toContainText('Necromancy or Transmutation');
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
    expect(state().pool).toBe(level===5?6:2);
    await activate.click();await dialog.getByRole('textbox').fill(level===5?'3':'2');
    await page.screenshot({path:info.outputPath('biofeedback-cost.png')});
    let lostApplication=false;
    await page.route('**/rest/v1/rpc/apply_biofeedback_effect',async route=>{
      if(!lostApplication){lostApplication=true;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort();}else await route.continue();
    });
    await dialog.getByRole('button',{name:'Spend and roll'}).click();
    if(level===7){
      await expect(page.getByRole('dialog',{name:'Psionic Surge'})).toContainText('rolled 1, 1 on 2d8');await expect.poll(()=>state().pool).toBe(0);
      await page.reload();await page.getByRole('button',{name:/Resume paid roll/}).scrollIntoViewIfNeeded();if(process.env.DNDKEEP_UI_OVERFLOW_PROBE){const source=readFileSync(process.env.DNDKEEP_UI_OVERFLOW_PROBE,'utf8');const body=source.split('report = await page.evaluate(')[1]?.split('\n  });')[0];expect(body).toBeTruthy();const scoped=body.replace("document.querySelectorAll('*')","document.querySelectorAll('[aria-label=\"Biofeedback recovery\"], [aria-label=\"Biofeedback recovery\"] *')");const layout=await page.evaluate('('+scoped+'\n})()');expect(layout.sideways,JSON.stringify(layout)).toBe(false);expect(layout.clipped).toEqual([]);expect(layout.pastEdge).toEqual([]);}
      await page.screenshot({path:info.outputPath('biofeedback-resume.png')});await page.getByRole('button',{name:/Resume paid roll/}).click();
      await page.getByRole('dialog',{name:'Psionic Surge'}).getByRole('button',{name:'Spend 1 Hit Point Die'}).click();
    }
    await expect.poll(()=>lostApplication).toBe(true);
    await expect.poll(state).toEqual({pool:level===5?3:0,temp:level===5?7:12,spent:level===5?0:1,other:9});
    await page.reload();await expect(activate).toBeVisible();
    if(level===7)await expect(activate).toBeDisabled();
    const paid=sql(`select request_id from dndkeep_private.psionic_effect_rolls where character_id='${charId}'`);
    sql(`update characters set temp_hp=1 where id='${charId}'`);
    const replay=await page.evaluate(async({charId,paid})=>{const path='/src/lib/api/psionicEffectRolls.ts';return (await import(/* @vite-ignore */ path)).applyBiofeedbackEffect(charId,paid);},{charId,paid});
    expect(replay.replayed).toBe(true);expect(state().temp).toBe(1);expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Biofeedback'`)).toBe('1');
    // A second grant cannot stack with a higher existing temporary-HP total.
    sql(`update characters set temp_hp=20,class_resources=class_resources || '{"psionic-energy-dice":2}'::jsonb where id='${charId}'`);
    await page.reload();await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();
    await expect.poll(()=>sql(`select turn_number from psionic_solo_turns where character_id='${charId}'`)).toBe('1');
    await activate.click();await dialog.getByRole('textbox').fill('2');await dialog.getByRole('button',{name:'Spend and roll'}).click();
    if(level===7)await page.getByRole('button',{name:'Keep these rolls',exact:true}).click();
    await expect.poll(state).toEqual({pool:0,temp:20,spent:level===5?0:1,other:9});
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Biofeedback'`)).toBe('2');
    expect(errors).toEqual([]);
  });
});
