import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion Enkindled Life Force', () => {
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


  test('capstone and Surge feed every existing Energy Die roll flow with separate costs',async({page},info)=>{
    test.setTimeout(90_000);
    await page.addInitScript(()=>{Math.random=()=>0.01;});
    sql(`update characters set level=20,intelligence=18,temp_hp=0,hit_dice_spent=0,class_resources='{"psion-disciplines":["Biofeedback","Destructive Thoughts","Inerrant Aim"],"psionic-energy-dice":12,"other":9}' where id='${charId}'`);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const button=(name:string)=>page.getByRole('button',{name,exact:true}).locator('visible=true').first();
    const state=()=>JSON.parse(sql(`select json_build_object('pool',class_resources->'psionic-energy-dice','spent',hit_dice_spent,'temp',temp_hp,'other',class_resources->'other') from characters where id='${charId}'`));
    const check=async(pool:number,spent:number)=>expect.poll(state).toEqual({pool,spent,temp:20,other:9});
    const enhance=async(surge=true)=>{
      const choice=page.getByRole('dialog',{name:'Enkindled Life Force'});await expect(choice).toBeVisible();
      await expect(choice).toContainText('Once per turn');await choice.getByRole('textbox').fill('2');
      await page.screenshot({path:info.outputPath(`enkindled-${state().spent}.png`)});
      await choice.getByRole('button',{name:'Continue'}).click();
      if(surge)await page.getByRole('dialog',{name:'Psionic Surge'}).getByRole('button',{name:'Spend 1 Hit Point Die'}).click();
    };
    let turn=0;
    const nextTurn=async()=>{await page.getByRole('button',{name:/End Turn/}).locator('visible=true').first().click();turn++;await expect.poll(()=>sql(`select turn_number from psionic_solo_turns where character_id='${charId}'`)).toBe(String(turn));};
    // Each independent tabletop use starts a persisted turn, like the real UI.
    await button('Gain temp HP').click();let dialog=page.getByRole('dialog',{name:'Biofeedback',exact:true});
    await dialog.getByRole('textbox').fill('2');await dialog.getByRole('button',{name:'Spend and roll'}).click();await enhance();await check(10,3);await nextTurn();
    await button('Roll damage').click();dialog=page.getByRole('dialog',{name:'Destructive Thoughts target'});
    await dialog.getByRole('textbox').fill('Tabletop Goblin');await dialog.getByRole('button',{name:'Choose target'}).click();
    await page.getByRole('dialog',{name:'Destructive Thoughts',exact:true}).getByRole('button',{name:'Spend and roll'}).click();await enhance();await check(9,6);await nextTurn();
    await expect(page.getByRole('status').filter({hasText:'16 Psychic ·'})).toContainText('Apply at the table');
    await button('Roll bonus').click();await enhance();dialog=page.getByRole('dialog',{name:'Inerrant Aim'});await expect(dialog).toContainText('Add +12');await dialog.getByRole('button',{name:'Keep die'}).click();await check(9,9);await nextTurn();
    await button('Powered (1 die)').click();await enhance();dialog=page.getByRole('dialog',{name:'Telekinetic Propel'});await expect(dialog).toContainText('60 ft on a failed save');await dialog.getByRole('button',{name:'Save failed'}).click();await check(8,12);await nextTurn();
    await button('Extend (free)').click();await page.getByRole('dialog',{name:'Telepathic Connection'}).getByRole('button',{name:'Extend telepathy'}).click();await enhance();await check(8,15);await nextTurn();
    await expect.poll(()=>sql(`select notes from action_logs where character_id='${charId}' and action_name='Telepathic Connection'`)).toContain('150 ft');
    await button('Spend Die (1d12)').click();await enhance();await check(7,18);await nextTurn();
    await button('Spend Die (1d12)').click();await enhance(false);await check(6,20);await nextTurn();await expect(page.getByRole('dialog',{name:'Psionic Surge'})).toHaveCount(0);
    await button('Spend Die (1d12)').click();await check(5,20);await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Spent Psionic Energy Die (1d12)' and total in (12,3,1)`)).toBe('3');
    await page.reload();await expect(button('Spend Die (1d12)')).toBeEnabled();await check(5,20);expect(errors).toEqual([]);
  });
});
