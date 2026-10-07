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
    await dialog.getByRole('button',{name:'Spend and roll'}).click();
    if(level===7){
      const surge=page.getByRole('dialog',{name:'Psionic Surge'});await expect(surge).toContainText('rolled 1, 1 on 2d8');
      await expect.poll(()=>state().pool).toBe(0);
      await page.screenshot({path:info.outputPath('biofeedback-surge.png')});
      // v2.773 — hold only history delivery; the paid ability must resolve.
      let release!:()=>void;let held=false;
      const delivery=new Promise<void>(resolve=>{release=resolve;});
      await page.route('**/rest/v1/action_logs*',async route=>{
        if(route.request().method()==='POST' && route.request().postDataJSON()?.action_name==='Psionic Surge'){
          held=true;await delivery;
        }
        await route.continue();
      });
      try {
        await surge.getByRole('button',{name:'Spend 1 Hit Point Die'}).click();
        await expect.poll(()=>held).toBe(true);
        await expect.poll(()=>state().temp).toBe(12);
      } finally {release();}

    }
    await expect.poll(state).toEqual({pool:level===5?3:0,temp:level===5?7:12,spent:level===5?0:1,other:9});
    await page.reload();await expect(activate).toBeVisible();
    if(level===7)await expect(activate).toBeDisabled();
    // A second grant cannot stack with a higher existing temporary-HP total.
    sql(`update characters set temp_hp=20,class_resources=class_resources || '{"psionic-energy-dice":2}'::jsonb where id='${charId}'`);
    await page.reload();await activate.click();await dialog.getByRole('textbox').fill('2');await dialog.getByRole('button',{name:'Spend and roll'}).click();
    if(level===7)await page.getByRole('button',{name:'Keep these rolls',exact:true}).click();
    await expect.poll(state).toEqual({pool:0,temp:20,spent:level===5?0:1,other:9});
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Biofeedback'`)).toBe('2');
    expect(errors).toEqual([]);
  });
});
