import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';
// Resource behavior is independent of the production updater lifecycle.
test.use({serviceWorkers:'block'});

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion saved payment recovery', () => {
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



  for(const kind of ['enkindled','surge'])test(`a lost ${kind} response survives reload without a second charge or automatic effect`,async({page},info)=>{
    test.setTimeout(90_000);await page.addInitScript(()=>{Math.random=()=>0.01;});
    sql(`update characters set intelligence=18,temp_hp=0,hit_dice_spent=0,class_resources='{"psion-disciplines":["Biofeedback"],"psionic-energy-dice":12}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const endpoint=kind==='enkindled'?'**/rest/v1/rpc/spend_enkindled_life_force':'**/rest/v1/rpc/spend_psionic_surge';
    const spent=kind==='enkindled'?2:3;let calls=0;await page.route(endpoint,async route=>{calls++;const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort();});
    await page.getByRole('button',{name:'Gain temp HP',exact:true}).locator('visible=true').first().click();
    const base=page.getByRole('dialog',{name:'Biofeedback',exact:true});await base.getByRole('textbox').fill('2');await base.getByRole('button',{name:'Spend and roll'}).click();
    const extra=page.getByRole('dialog',{name:'Enkindled Life Force'});await extra.getByRole('textbox').fill('2');await extra.getByRole('button',{name:'Continue'}).click();
    if(kind==='surge')await page.getByRole('dialog',{name:'Psionic Surge'}).getByRole('button',{name:'Spend 1 Hit Point Die'}).click();
    await page.getByRole('dialog',{name:'Dice cost not confirmed'}).getByRole('button',{name:'Resolve later'}).click();expect(calls).toBe(2);
    const state=()=>JSON.parse(sql(`select json_build_object('spent',hit_dice_spent,'pool',class_resources->'psionic-energy-dice','temp',temp_hp) from characters where id='${charId}'`));
    expect(state()).toEqual({spent,pool:10,temp:0});
    await page.unroute(endpoint);await page.reload();
    const recovery=page.getByRole('status',{name:'Psion roll recovery'});await expect(recovery).toContainText(kind==='enkindled'?'proposed extra 1, 1':'original rolls 1, 1, 1, 1');await expect(recovery).toContainText('Intelligence 4');
    await recovery.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('saved-psion-payment.png')});
    await recovery.getByRole('button',{name:'Confirm dice cost'}).click();await expect(recovery).toContainText('dice cost confirmed');
    expect(state()).toEqual({spent,pool:10,temp:0});
    expect(sql(`select count(*) from psionic_feature_uses where character_id='${charId}'`)).toBe('1');
    expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Enkindled Life Force'`)).toBe('1');
    if(kind==='surge')expect(sql(`select count(*) from psionic_surge_uses where character_id='${charId}'`)).toBe('1');
    await expect.poll(()=>page.evaluate(id=>Object.keys(localStorage).filter(key=>key.startsWith(`dndkeep:psionic-payment:${id}:`)).length,charId)).toBe(0);
    await page.screenshot({path:info.outputPath('confirmed-psion-payment.png')});
  });
  test('two tabs share the same Enkindled turn limit',async({page,context},info)=>{
    test.setTimeout(90_000);await context.addInitScript(()=>{Math.random=()=>0.01;});
    sql(`update characters set hit_dice_spent=0,class_resources='{"psion-disciplines":["Biofeedback"],"psionic-energy-dice":12}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const roll=(p:typeof page)=>p.getByRole('button',{name:'Spend Die (1d12)',exact:true}).locator('visible=true').first();
    await roll(page).click();await expect(page.getByRole('dialog',{name:'Enkindled Life Force'})).toBeVisible();
    await expect.poll(()=>sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('11');
    const second=await context.newPage();
    try{
      // Load after the first base-die cost. This isolates competing capstone
      // payments from the separately tracked optimistic Energy Die pool.
      await second.goto(`/character/${charId}`);await roll(second).click();await expect(second.getByRole('dialog',{name:'Enkindled Life Force'})).toBeVisible();
      for(const p of [page,second])await p.getByRole('dialog',{name:'Enkindled Life Force'}).getByRole('textbox').fill('1');
      await Promise.all([page,second].map(p=>p.getByRole('dialog',{name:'Enkindled Life Force'}).getByRole('button',{name:'Continue'}).click()));
      for(const p of [page,second])await p.getByRole('dialog',{name:'Psionic Surge'}).getByRole('button',{name:/^Keep /}).click();
      await expect.poll(()=>sql(`select hit_dice_spent from characters where id='${charId}'`)).toBe('1');
      expect(sql(`select count(*) from psionic_feature_uses where character_id='${charId}'`)).toBe('1');
      expect(sql(`select class_resources->>'psionic-energy-dice' from characters where id='${charId}'`)).toBe('10');
      await page.reload();await roll(page).click();await expect(page.getByRole('dialog',{name:'Psionic Surge'})).toBeVisible();
      await expect(page.getByRole('dialog',{name:'Enkindled Life Force'})).toHaveCount(0);await page.getByRole('button',{name:'Keep roll of 1',exact:true}).click();
      expect(sql(`select hit_dice_spent from characters where id='${charId}'`)).toBe('1');
      await page.screenshot({path:info.outputPath('enkindled-shared-limit.png')});
    }finally{await second.close();}
  });
  test('a delayed Surge receipt cannot restore dice spent in another tab',async({page,context})=>{
    test.setTimeout(90_000);await context.addInitScript(()=>{Math.random=()=>0.01;});
    sql(`update characters set level=7,hit_dice_spent=5,class_resources='{"psion-disciplines":["Biofeedback"],"psionic-energy-dice":6}' where id='${charId}'`);
    let receivedLatest=false;
    page.on('websocket',socket=>socket.on('framereceived',({payload})=>{
      // Observe the real subscription, not just the other tab's database write.
      try{const frame=JSON.parse(String(payload));const data=Array.isArray(frame)?frame[4]:frame?.payload;const record=data?.data?.record;
        if(record?.id===charId&&record.hit_dice_spent===7)receivedLatest=true;
      }catch{/* Non-JSON heartbeat frames are irrelevant. */}
    }));
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    let release!:()=>void;const delivery=new Promise<void>(resolve=>{release=resolve;});let held=false;
    await page.route('**/rest/v1/rpc/spend_psionic_surge',async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);held=true;await delivery;await route.fulfill({response});});
    const roll=(p:typeof page)=>p.getByRole('button',{name:'Spend Die (1d8)',exact:true}).locator('visible=true').first();
    const second=await context.newPage();
    try{
      await roll(page).click();await page.getByRole('button',{name:'Spend 1 Hit Point Die',exact:true}).click();await expect.poll(()=>held).toBe(true);
      expect(sql(`select hit_dice_spent from characters where id='${charId}'`)).toBe('6');
      await second.goto(`/character/${charId}`);await roll(second).click();await second.getByRole('button',{name:'Spend 1 Hit Point Die',exact:true}).click();
      await expect.poll(()=>sql(`select hit_dice_spent from characters where id='${charId}'`)).toBe('7');await expect(roll(second)).toBeEnabled();
      // Give the first sheet its subscribed revision before releasing the older
      // HTTP receipt. A stale acknowledgement must not offer a nonexistent die.
      await expect.poll(()=>receivedLatest).toBe(true);
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      release();await expect(roll(page)).toBeEnabled();await roll(page).click();await expect(roll(page)).toBeEnabled();
      await expect(page.getByRole('dialog',{name:'Psionic Surge'})).toHaveCount(0);
      await expect.poll(()=>sql(`select count(*) from psionic_surge_uses where character_id='${charId}'`)).toBe('2');
      expect(sql(`select hit_dice_spent from characters where id='${charId}'`)).toBe('7');
    }finally{release();await second.close();}
  });

});
