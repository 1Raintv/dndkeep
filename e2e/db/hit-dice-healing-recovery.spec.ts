import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Hit Dice healing recovery (local stack)', () => {
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
      values ('${charId}','${userId}','Short Rest Fixture','Human','Psion','Sage','Telepath',5,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":2}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });


  for(const className of ['Psion','Fighter'])for(const rejectedRetry of [false,true])test(`${className}: recover lost healing${rejectedRetry?' after a later rejection':''} without repeating it`,async({page},info)=>{
    const die=className==='Psion'?6:10;
    sql(`update characters set class_name='${className}',constitution=10,current_hp=2,max_hp=30,hit_dice_spent=0 where id='${charId}'`);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const openRest=()=>page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first().click();
    await openRest();await page.evaluate(()=>{Math.random=()=>0.999;});
    const endpoint='**/rest/v1/rpc/spend_rest_hit_dice',requests:Record<string,unknown>[]=[];
    await page.route(endpoint,async route=>{
      requests.push(route.request().postDataJSON());
      if(rejectedRetry&&requests.length===2){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Confirmation temporarily unavailable'})});return;}
      const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort();
    });
    const roll=page.getByRole('button',{name:`Roll Hit Dice (d${die}+0)`,exact:true});await roll.click();
    const recovery=page.getByRole('status',{name:'Hit Dice recovery'});
    await expect(recovery.getByRole('button',{name:'Confirm saved healing'})).toBeVisible();
    expect(requests).toHaveLength(2);expect(requests[0]).toEqual(requests[1]);expect(requests[0].p_hit_die).toBe(die);expect(requests[0].p_rolls).toEqual([die]);
    await expect(roll).toBeDisabled();await expect(page.getByRole('button',{name:'Done',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Take Long Rest',exact:true})).toBeDisabled();
    const state=()=>JSON.parse(sql(`select json_build_object('hp',current_hp,'spent',hit_dice_spent,'pools',hit_dice_spent_by_type) from characters where id='${charId}'`));
    expect(state()).toEqual({hp:2+die,spent:1,pools:{[die]:1}});
    await page.screenshot({path:info.outputPath('saved-hit-dice-healing.png')});
    sql(`update characters set current_hp=3 where id='${charId}'`);
    await page.unroute(endpoint);await page.reload();await openRest();await page.evaluate(()=>{Math.random=()=>0.01;});
    await expect(recovery.getByRole('button',{name:'Confirm saved healing'})).toBeVisible();
    let confirmed:Record<string,unknown>|undefined;await page.route(endpoint,async route=>{confirmed=route.request().postDataJSON();await route.continue();});
    await recovery.getByRole('button',{name:'Confirm saved healing'}).click();await expect(recovery).toContainText('Saved healing confirmed');
    expect(confirmed).toEqual(requests[0]);expect(state()).toEqual({hp:3,spent:1,pools:{[die]:1}});
    await expect(page.getByText('3 / 30',{exact:true})).toBeVisible();await expect(roll).toBeEnabled();
    expect(sql(`select count(*) from character_history where character_id='${charId}' and field='current_hp'`)).toBe('1');
    expect(sql(`select count(*) from combat_events where actor_id='${charId}' and event_type='healing_applied'`)).toBe('1');
    expect(await page.evaluate(id=>Object.keys(localStorage).filter(key=>key.startsWith(`dndkeep:psionic-payment:${id}:`)).length,charId)).toBe(0);
    await page.screenshot({path:info.outputPath('confirmed-hit-dice-healing.png')});expect(errors).toEqual([]);
  });
  test('a delayed healing response cannot replace newer damage on the open sheet',async({page},info)=>{
    sql(`update characters set constitution=10,current_hp=2,max_hp=30,hit_dice_spent=0 where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first().click();await page.evaluate(()=>{Math.random=()=>0.999;});
    const endpoint='**/rest/v1/rpc/spend_rest_hit_dice';let held=false;let release!:()=>void;const delivery=new Promise<void>(resolve=>{release=resolve;});
    await page.route(endpoint,async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);held=true;await delivery;await route.fulfill({response});});
    const roll=page.getByRole('button',{name:'Roll Hit Dice (d6+0)',exact:true});
    try{
      await roll.click();await expect.poll(()=>held).toBe(true);await expect(roll).toBeDisabled();
      sql(`update characters set current_hp=3 where id='${charId}'`);await expect(page.getByText('3 / 30',{exact:true})).toBeVisible();
      release();await expect(roll).toBeEnabled();await expect(page.getByText('3 / 30',{exact:true})).toBeVisible();
      expect(sql(`select current_hp||','||hit_dice_spent from characters where id='${charId}'`)).toBe('3,1');
      await page.unroute(endpoint);await roll.click();await expect.poll(()=>sql(`select current_hp||','||hit_dice_spent from characters where id='${charId}'`)).toBe('9,2');
      await expect(page.getByText('9 / 30',{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('healing-after-newer-damage.png')});
    }finally{release();}
  });
  test('campaign History shows one detailed entry for the healing transaction',async({page},info)=>{
    const campaign=randomUUID();sql(`insert into campaigns(id,owner_id,name) values('${campaign}','${userId}','Healing history fixture');update characters set campaign_id='${campaign}',constitution=10,current_hp=2,max_hp=30,hit_dice_spent=0 where id='${charId}'`);
    try{
      await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
      await page.getByRole('button',{name:'Rest',exact:true}).locator('visible=true').first().click();await page.evaluate(()=>{Math.random=()=>0.999;});
      await page.getByRole('button',{name:'Roll Hit Dice (d6+0)',exact:true}).click();await expect(page.getByText('+6 HP recovered this rest',{exact:true})).toBeVisible();
      const dismissDice=page.getByText('Click anywhere to dismiss',{exact:true});await expect(dismissDice).toBeVisible();await dismissDice.locator('..').click({position:{x:10,y:10}});await expect(dismissDice).toHaveCount(0);
      await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'History',exact:true}).click();
      await expect(page.getByText('Short Rest: Hit Dice',{exact:true})).toHaveCount(1);
      await expect(page.getByText('Spent 1d6 · Rolls 6 · CON +0 per die · Restored 6 HP (2 → 8)',{exact:true})).toBeVisible();
      await expect(page.getByText('Short Rest: spent 1d6, recovered 6 HP (6 rolled).',{exact:true})).toHaveCount(0);
      await page.screenshot({path:info.outputPath('hit-dice-history.png')});
    }finally{sql(`update characters set campaign_id=null where id='${charId}';delete from campaigns where id='${campaign}'`);}
  });

});
