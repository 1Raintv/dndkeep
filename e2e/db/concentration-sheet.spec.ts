import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Concentration sheet saves (local stack)', () => {
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
    if (userId) sql(`delete from action_logs where character_id='${charId}'; delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  const protection=(equipped:boolean,attuned:boolean)=>({magic_item_id:'ring-protection',name:'Ring of Protection',magical:true,equipped,attuned,saveBonus:1});
  for (const sample of [
    {name:'proficient Constitution',level:5,con:14,proficient:true,die:10,damage:5,natural:false,bonus:5,passed:true},
    {name:'equipped and attuned protection contributes once',level:5,con:14,proficient:true,die:4,damage:5,natural:false,bonus:6,passed:true,inventory:[protection(true,true)]},
    {name:'unattuned protection does not contribute',level:5,con:14,proficient:true,die:4,damage:5,natural:false,bonus:5,passed:false,inventory:[protection(true,false)]},
    {name:'unequipped protection does not contribute',level:5,con:14,proficient:true,die:4,damage:5,natural:false,bonus:5,passed:false,inventory:[protection(false,true)]},
    {name:'equipment bonus works without Constitution proficiency',level:5,con:14,proficient:false,die:7,damage:5,natural:false,bonus:3,passed:true,inventory:[protection(true,true)]},
    {name:'natural one follows total under standard rules',level:20,con:30,proficient:true,die:1,damage:5,natural:false,bonus:16,passed:true},
    {name:'natural twenty can fail DC 30 under standard rules',level:5,con:10,proficient:false,die:20,damage:60,natural:false,bonus:0,passed:false},
    {name:'natural twenty house rule is preserved',level:5,con:10,proficient:false,die:20,damage:60,natural:true,bonus:0,passed:true},
  ]) test(sample.name,async({page})=>{
    await page.addInitScript(value=>{Math.random=()=>value;},(sample.die-0.5)/20);
    sql(`update characters set current_hp=100,max_hp=100,temp_hp=0,level=${sample.level},constitution=${sample.con},
      saving_throw_proficiencies='${sample.proficient?'{constitution}':'{}'}',nat_1_20_saves=${sample.natural},inventory='${JSON.stringify('inventory' in sample?sample.inventory:[])}',
      concentration_spell='detect-magic',concentration_rounds_remaining=100 where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByPlaceholder('0',{exact:true}).locator('visible=true').first().fill(String(sample.damage));
    await page.getByRole('button',{name:'Damage',exact:true}).locator('visible=true').first().click();
    const roll=page.getByRole('button',{name:`Roll CON Save (+${sample.bonus})`,exact:true}).locator('visible=true').first();
    await expect(roll).toBeVisible();await roll.click();
    await expect.poll(()=>sql(`select total from action_logs where character_id='${charId}' and action_name='Concentration Check'`)).toBe(String(sample.die+sample.bonus));
    await expect.poll(()=>sql(`select concentration_spell from characters where id='${charId}'`)).toBe(sample.passed?'detect-magic':'');
    expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Concentration Check'`)).toBe('1');
  });
  test('War Caster keeps the higher die and logs both without summing them',async({page},info)=>{
    sql(`update characters set current_hp=100,max_hp=100,temp_hp=0,constitution=14,
      saving_throw_proficiencies='{constitution}',gained_feats=array['War Caster'],nat_1_20_saves=false,
      concentration_spell='detect-magic',concentration_rounds_remaining=100 where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByPlaceholder('0',{exact:true}).locator('visible=true').first().fill('40');
    await page.getByRole('button',{name:'Damage',exact:true}).locator('visible=true').first().click();
    const roll=page.getByRole('button',{name:'Roll CON Save (+5)',exact:true}).locator('visible=true').first();
    await expect(page.getByText(/War Caster: roll two d20s/)).toBeVisible();const panel=page.getByRole('region',{name:'Concentration check required'});
    await panel.evaluate(el=>el.scrollIntoView({block:'center'}));
    await panel.screenshot({path:info.outputPath('sheet-war-caster-prompt.png')});
    await page.evaluate(()=>{let n=0;Math.random=()=>n++===0?.125:n===2?.825:.5;});
    await roll.click();
    await expect.poll(()=>sql(`select total from action_logs where character_id='${charId}' and action_name='Concentration Check'`)).toBe('22');
    const entry=JSON.parse(sql(`select jsonb_build_object('dice',individual_results,'expression',dice_expression,'notes',notes) from action_logs where character_id='${charId}' and action_name='Concentration Check'`));
    expect(entry).toMatchObject({dice:[3,17],expression:'2d20kh1'});expect(entry.notes).toContain('War Caster advantage');
    expect(sql(`select concentration_spell from characters where id='${charId}'`)).toBe('detect-magic');
    expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Concentration Check'`)).toBe('1');
  });
  for(const replacement of ['detect-magic','invisibility'])test(`delayed dice completion preserves a later ${replacement} casting`,async({page})=>{
    await page.addInitScript(()=>{Math.random=()=>0.001;});
    sql(`update characters set current_hp=100,max_hp=100,temp_hp=0,constitution=10,
      saving_throw_proficiencies='{}',nat_1_20_saves=false,concentration_spell='detect-magic',
      concentration_rounds_remaining=100 where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first().click();
    const roll=page.getByRole('button',{name:'Roll CON Save (+0)',exact:true}).locator('visible=true').first();
    await expect(roll).toBeVisible();await page.clock.install();await page.clock.pauseAt(new Date());
    // Freeze animation and fallback timers. The failed save must already be
    // persisted; completing an old animation is never a later spell mutation.
    await roll.dispatchEvent('click');
    await expect.poll(()=>sql(`select concentration_spell from characters where id='${charId}'`)).toBe('');
    sql(`update characters set concentration_spell='${replacement}',concentration_rounds_remaining=100 where id='${charId}'`);
    await page.clock.runFor(4500);
    await expect.poll(()=>sql(`select concentration_spell from characters where id='${charId}'`)).toBe(replacement);
    await page.reload();await expect(page.getByText('Concentration Check Required',{exact:true})).toHaveCount(0);
  });
  async function prepareSheet(page: import('@playwright/test').Page,extra=''){
    sql(`update characters set current_hp=30,max_hp=30,temp_hp=6,constitution=14,
      saving_throw_proficiencies='{constitution}',gained_feats=array['War Caster'],nat_1_20_saves=false,
      concentration_spell='detect-magic',concentration_rounds_remaining=100 where id='${charId}'`);
    if(extra)sql(`update characters set ${extra.slice(1)} where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await expect(page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first()).toBeVisible();
  }
  test('lost damage reply reloads the original hit and keeps HP locked until confirmation',async({page})=>{
    await prepareSheet(page);let requests=0;
    await page.route('**/rest/v1/rpc/apply_standalone_damage',async route=>{requests++;await route.fetch();await route.abort('failed');});
    await page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first().click();
    await expect(page.getByRole('alert').filter({hasText:/fetch|connection|confirm/i})).toBeVisible();expect(requests).toBe(2);
    expect(sql(`select temp_hp from characters where id='${charId}'`)).toBe('1');
    await expect(page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first()).toBeDisabled();
    await page.unroute('**/rest/v1/rpc/apply_standalone_damage');await page.reload();
    await page.getByRole('button',{name:'Confirm damage',exact:true}).click();
    await expect(page.getByTitle('Take 5 damage',{exact:true}).locator('visible=true').first()).toBeEnabled();
    expect(sql(`select temp_hp from characters where id='${charId}'`)).toBe('1');
    expect(sql(`select count(*) from dndkeep_private.standalone_damage_events where character_id='${charId}'`)).toBe('1');
    await expect(page.getByRole('region',{name:'Concentration check required',exact:true})).toHaveCount(1);
  });
  test('lost save reply confirms the original advantage dice after reload',async({page})=>{
    await prepareSheet(page);await page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first().click();
    const roll=page.getByRole('button',{name:'Roll CON Save (+5)',exact:true});await expect(roll).toBeVisible();
    await page.evaluate(()=>{let n=0;Math.random=()=>n++===0?.125:n===2?.825:.5;});
    await page.route('**/rest/v1/rpc/settle_standalone_concentration_save',async route=>{await route.fetch();await route.abort('failed');});
    await roll.click();await expect(page.getByRole('alert').filter({hasText:/fetch|connection|confirm/i})).toBeVisible();
    await page.unroute('**/rest/v1/rpc/settle_standalone_concentration_save');await page.reload();
    await page.getByRole('button',{name:'Confirm saved roll',exact:true}).click();
    await expect(page.getByText(/Earlier save confirmed: passed/)).toBeVisible();
    const logs=JSON.parse(sql(`select jsonb_agg(jsonb_build_object('rolls',individual_results,'total',total)) from action_logs where character_id='${charId}' and action_name='Concentration Check'`));
    expect(logs).toEqual([{rolls:[3,17],total:22}]);
  });
  test('two hits survive reload as two independent checks',async({page})=>{
    await prepareSheet(page);const hit=page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first();
    await hit.click();await expect(page.getByRole('region',{name:'Concentration check required',exact:true})).toHaveCount(1);
    await expect(hit).toBeEnabled();await hit.click();await expect(page.getByRole('region',{name:'Concentration check required',exact:true})).toHaveCount(2);
    await page.reload();await expect(page.getByRole('region',{name:'Concentration check required',exact:true})).toHaveCount(2);
    expect(sql(`select temp_hp from characters where id='${charId}'`)).toBe('4');
  });
  test('zero HP ends concentration without rolling even when automation is off',async({page})=>{
    await prepareSheet(page,`,current_hp=1,temp_hp=0,advanced_automations_unlocked=true,automation_overrides='{"concentration_on_damage":"off"}'`);
    await page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first().click();
    await expect(page.getByText('Damage confirmed. Concentration ended.',{exact:true})).toBeVisible();
    expect(sql(`select concentration_spell from characters where id='${charId}'`)).toBe('');
    expect(sql(`select count(*) from dndkeep_private.standalone_concentration_saves where character_id='${charId}' and outcome is null`)).toBe('0');
    expect(sql(`select outcome->'rolls' from dndkeep_private.standalone_concentration_saves where character_id='${charId}'`)).toBe('null');
  });
  test('automatic save runs once and ordinary off mode leaves no prompt',async({page})=>{
    await prepareSheet(page,`,advanced_automations_unlocked=true,automation_overrides='{"concentration_on_damage":"auto"}'`);
    await page.evaluate(()=>{Math.random=()=>.825;});await page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first().click();
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Concentration Check'`)).toBe('1');
    await page.reload();await expect(page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first()).toBeVisible();
    expect(sql(`select count(*) from action_logs where character_id='${charId}' and action_name='Concentration Check'`)).toBe('1');
    sql(`update characters set automation_overrides='{"concentration_on_damage":"off"}' where id='${charId}'`);await page.reload();
    await page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first().click();await expect(page.getByText('Damage confirmed.',{exact:true})).toBeVisible();
    await expect(page.getByRole('region',{name:'Concentration check required',exact:true})).toHaveCount(0);
  });
  test('another open sheet receives one saved check, without a duplicate local prompt',async({page,context})=>{
    await prepareSheet(page);const other=await context.newPage();await other.goto(`/character/${charId}`);
    await expect(other.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first()).toBeVisible();
    await page.getByTitle('Take 1 damage',{exact:true}).locator('visible=true').first().click();
    await expect(other.getByRole('region',{name:'Concentration check required',exact:true})).toHaveCount(1);
    await expect(other.getByRole('region',{name:'Saved concentration checks',exact:true})).toBeVisible();
    await expect(other.getByRole('region',{name:'Concentration check required',exact:true}).getByRole('button',{name:'Dismiss',exact:true})).toHaveCount(0);
    await other.reload();await expect(other.getByRole('region',{name:'Concentration check required',exact:true})).toHaveCount(1);await other.close();
  });

});
