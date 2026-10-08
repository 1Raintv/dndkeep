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
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });

  for (const sample of [
    {name:'proficient Constitution',level:5,con:14,proficient:true,die:10,damage:5,natural:false,bonus:5,passed:true},
    {name:'natural one follows total under standard rules',level:20,con:30,proficient:true,die:1,damage:5,natural:false,bonus:16,passed:true},
    {name:'natural twenty can fail DC 30 under standard rules',level:5,con:10,proficient:false,die:20,damage:60,natural:false,bonus:0,passed:false},
    {name:'natural twenty house rule is preserved',level:5,con:10,proficient:false,die:20,damage:60,natural:true,bonus:0,passed:true},
  ]) test(sample.name,async({page})=>{
    await page.addInitScript(value=>{Math.random=()=>value;},(sample.die-0.5)/20);
    sql(`update characters set current_hp=100,max_hp=100,temp_hp=0,level=${sample.level},constitution=${sample.con},
      saving_throw_proficiencies='${sample.proficient?'{constitution}':'{}'}',nat_1_20_saves=${sample.natural},
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
});
