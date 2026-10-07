import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion spell replacement level-up', () => {
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

  test('database stores independent preparation and rejects invalid metadata',()=>{
    expect(JSON.parse(sql(`select spell_preparation_sources from characters where id='${charId}'`))).toEqual({});
    const sources={armor:['class:Psion'],shield:[]};
    sql(`update characters set spell_preparation_sources='${JSON.stringify(sources)}'::jsonb where id='${charId}'`);
    expect(JSON.parse(sql(`select spell_preparation_sources from characters where id='${charId}'`))).toEqual(sources);
    // Catch a real CHECK violation inside a subtransaction, without noisy
    // expected psql failures or changing the successfully persisted fixture.
    sql(`do $$ begin
      begin
        update characters set spell_preparation_sources='{"armor":null}'::jsonb where id='${charId}';
        raise exception 'Invalid preparation metadata was accepted';
      exception when check_violation then null; end;
    end $$;`);
    expect(JSON.parse(sql(`select spell_preparation_sources from characters where id='${charId}'`))).toEqual(sources);
  });

  for(const flow of ['banner','settings']) test(`${flow} replaces one spell and cantrip at level-up`,async({page},info)=>{
    sql(`update characters set level=5,pending_manual_level_grants=1,known_spells=ARRAY['minor-illusion','mind-sliver','mage-hand','mage-armor'],prepared_spells=ARRAY['mage-armor'],spell_slots='{"1":{"total":4,"used":1},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    if(flow==='banner'){
      await page.getByRole('button',{name:/Level up available/}).click();
      const next=page.getByRole('button',{name:'Next →',exact:true});
      await next.click();await next.click();await next.click();
    }else{
      await page.getByTitle('Level up available — open Settings',{exact:true}).click();
      await page.getByRole('button',{name:'Level Up',exact:true}).click();
      await page.getByRole('button',{name:'Level Up to 6',exact:true}).click();
    }
    const section=page.getByRole('region',{name:'Psion spell replacements'});
    await expect(section).toBeVisible();
    const confirm=page.getByRole('button',{name:flow==='banner'?'Confirm Level Up':'Advance to Level 6',exact:true});
    await section.getByLabel('Replace cantrip',{exact:true}).selectOption('minor-illusion');
    await section.getByRole('checkbox',{name:'Minor Illusion: Psion',exact:true}).check();
    await expect(confirm).toBeDisabled();
    await section.getByLabel('New cantrip',{exact:true}).selectOption('telekinetic-fling');
    await section.getByLabel('Replace prepared spell',{exact:true}).selectOption('mage-armor');
    await section.getByRole('checkbox',{name:'Mage Armor: Psion',exact:true}).check();
    await section.getByLabel('New prepared spell',{exact:true}).selectOption('hold-person');
    expect(await section.getByLabel('Replace cantrip',{exact:true}).locator('option[value="mage-hand"]').count()).toBe(0);
    await section.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`psion-spell-${flow}.png`)});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await confirm.click();await expect.poll(()=>sql(`select level from characters where id='${charId}'`)).toBe('6');
    const known=JSON.parse(sql(`select to_json(known_spells) from characters where id='${charId}'`));
    const prepared=JSON.parse(sql(`select to_json(prepared_spells) from characters where id='${charId}'`));
    expect(known).toEqual(expect.arrayContaining(['telekinetic-fling','hold-person','mind-sliver','mage-hand']));
    expect(known).not.toContain('minor-illusion');expect(known).not.toContain('mage-armor');
    expect(prepared).toContain('hold-person');expect(prepared).not.toContain('mage-armor');
  });
  test('ordinary picker keeps chosen spells but fills missing choices; advanced corrections remain explicit',async({page},info)=>{
    sql(`update characters set level=5,advanced_spell_edits_unlocked=false,known_spells=ARRAY['minor-illusion','mind-sliver','mage-hand','mage-armor'],prepared_spells=ARRAY['mage-armor'],spell_slots='{"1":{"total":4,"used":0},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    async function openBook(){await page.locator('button.tab').filter({hasText:/^Spells/}).click();await page.getByRole('button',{name:/Spell Book/}).click();}
    await openBook();const search=page.getByPlaceholder('Search spells by name, school, or effect…');
    await search.fill('Minor Illusion');await expect(page.getByRole('button',{name:'Replace at level-up',exact:true})).toBeDisabled();
    await search.fill('Telekinetic Fling');await expect(page.getByRole('button',{name:'+ Add',exact:true})).toBeInViewport();
    await page.screenshot({path:info.outputPath('spell-picker-reachable.png')});
    await page.getByRole('button',{name:'+ Add',exact:true}).click();
    await expect.poll(()=>sql(`select 'telekinetic-fling'=any(known_spells) from characters where id='${charId}'`)).toBe('t');
    sql(`update characters set advanced_spell_edits_unlocked=true where id='${charId}'`);await page.reload();await openBook();
    await search.fill('Minor Illusion');await page.getByRole('button',{name:'− Remove',exact:true}).click();
    await expect.poll(()=>sql(`select 'minor-illusion'=any(known_spells) from characters where id='${charId}'`)).toBe('f');
  });
  test('new subclass grants survive replacement, and cancel discards choices',async({page})=>{
    sql(`update characters set level=2,subclass='',pending_manual_level_grants=1,known_spells=ARRAY['minor-illusion','mind-sliver','mage-hand','mage-armor'],prepared_spells=ARRAY['mage-armor'],class_resources='{"psion-disciplines":["biofeedback","psionic-guards"]}',spell_slots='{"1":{"total":3,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    async function reachConfirm(){
      await page.getByRole('button',{name:/Level up available/}).click();
      const next=page.getByRole('button',{name:'Next →',exact:true});
      await next.click();await next.click();
      await page.getByRole('button',{name:/^Psi Warper/}).click();
      await next.click();await next.click();
    }
    await reachConfirm();
    const section=page.getByRole('region',{name:'Psion spell replacements'});
    await section.getByLabel('Replace prepared spell',{exact:true}).selectOption('mage-armor');
    await section.getByRole('checkbox',{name:'Mage Armor: Psion',exact:true}).check();
    await section.getByLabel('New prepared spell',{exact:true}).selectOption('hold-person');
    const back=page.getByRole('button',{name:'← Back',exact:true});
    for(let i=0;i<4;i++)await back.click();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    expect(sql(`select level||':'||subclass||':'||('mage-armor'=any(known_spells))::text from characters where id='${charId}'`)).toBe('2::true');
    await reachConfirm();await expect(section.getByLabel('Replace prepared spell',{exact:true})).toHaveValue('');
    await section.getByLabel('Replace prepared spell',{exact:true}).selectOption('mage-armor');
    await section.getByRole('checkbox',{name:'Mage Armor: Psion',exact:true}).check();
    await section.getByLabel('New prepared spell',{exact:true}).selectOption('hold-person');
    expect(await section.getByLabel('New prepared spell',{exact:true}).locator('option[value="misty-step"]').count()).toBe(0);
    await page.getByRole('button',{name:'Confirm Level Up',exact:true}).click();
    await expect.poll(()=>sql(`select level||':'||subclass from characters where id='${charId}'`)).toBe('3:Psi Warper');
    await expect.poll(()=>sql(`select ('hold-person'=any(known_spells) and 'misty-step'=any(known_spells) and not('mage-armor'=any(known_spells)))::text from characters where id='${charId}'`)).toBe('true');
  });
  test('switching level-up to another class discards pending Psion replacements',async({page})=>{
    sql(`update characters set level=5,secondary_class='Fighter',secondary_level=1,pending_manual_level_grants=1,known_spells=ARRAY['minor-illusion','mage-hand','mage-armor'],prepared_spells=ARRAY['mage-armor'],spell_slots='{"1":{"total":4,"used":0},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByRole('button',{name:/Level up available/}).click();
    const next=page.getByRole('button',{name:'Next →',exact:true});
    await next.click();await next.click();await next.click();
    const section=page.getByRole('region',{name:'Psion spell replacements'});
    await section.getByLabel('Replace prepared spell',{exact:true}).selectOption('mage-armor');
    await section.getByRole('checkbox',{name:'Mage Armor: Psion',exact:true}).check();
    await section.getByLabel('New prepared spell',{exact:true}).selectOption('hold-person');
    const back=page.getByRole('button',{name:'← Back',exact:true});
    await back.click();await back.click();await back.click();
    await page.getByRole('button',{name:/^Fighter Level/}).click();
    await next.click();await next.click();await expect(section).toHaveCount(0);
    await page.getByRole('button',{name:'Confirm Level Up',exact:true}).click();
    await expect.poll(()=>sql(`select level||':'||secondary_level from characters where id='${charId}'`)).toBe('5:2');
    expect(sql(`select ('mage-armor'=any(known_spells) and not('hold-person'=any(known_spells)))::text from characters where id='${charId}'`)).toBe('true');
  });
  test('replacing a shared Psion spell preserves Wizard ownership and can learn a Wizard-known spell',async({page})=>{
    sql(`update characters set level=5,secondary_class='Wizard',secondary_level=3,pending_manual_level_grants=1,known_spells=ARRAY['mage-armor','hold-person'],prepared_spells=ARRAY['mage-armor'],spell_sources='{"mage-armor":["class:Psion","class:Wizard"],"hold-person":["class:Wizard"]}',spell_slots='{"1":{"total":4,"used":0},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByRole('button',{name:/Level up available/}).click();
    const next=page.getByRole('button',{name:'Next →',exact:true});await next.click();await next.click();await next.click();
    const section=page.getByRole('region',{name:'Psion spell replacements'});
    await section.getByLabel('Replace prepared spell',{exact:true}).selectOption('mage-armor');
    await expect(section.getByRole('checkbox',{name:'Mage Armor: Wizard',exact:true})).toBeChecked();
    await section.getByLabel('New prepared spell',{exact:true}).selectOption('hold-person');
    await page.getByRole('button',{name:'Confirm Level Up',exact:true}).click();
    await expect.poll(()=>sql(`select level from characters where id='${charId}'`)).toBe('6');
    const sources=JSON.parse(sql(`select spell_sources from characters where id='${charId}'`));
    expect(sources['mage-armor']).toEqual(['class:Wizard']);expect(sources['hold-person']).toEqual(['class:Wizard','class:Psion']);
    const known=JSON.parse(sql(`select to_json(known_spells) from characters where id='${charId}'`));
    expect(known).toContain('mage-armor');expect(known.filter((id:string)=>id==='hold-person')).toHaveLength(1);
    await page.reload();expect(JSON.parse(sql(`select spell_sources from characters where id='${charId}'`))).toEqual(sources);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(page.getByTitle('9 more spells can be prepared',{exact:true})).toContainText('1/10');
  });
  test('database rejects malformed spell sources without changing the saved map',()=>{
    const invalid=[null,[],true,1,'bad',{'':[]},{spell:null},{spell:'class:Psion'},{spell:[1]},{spell:[{}]},{spell:['class:']},{spell:['class: Wizard']},{spell:['class:Wizard ']},{spell:['unknown']}];
    for(const value of invalid){
      const encoded=JSON.stringify(value).replaceAll("'","''");
      expect(()=>sql(`update characters set spell_sources='${encoded}'::jsonb where id='${charId}'`)).toThrow(/characters_spell_sources_valid/);
    }
    expect(sql(`select spell_sources from characters where id='${charId}'`)).toBe('{}');
    sql(`update characters set spell_sources='{"mage-armor":["class:Psion","class:Wizard","feat"],"hold-person":[]}' where id='${charId}'`);
    expect(JSON.parse(sql(`select spell_sources from characters where id='${charId}'`))).toEqual({'mage-armor':['class:Psion','class:Wizard','feat'],'hold-person':[]});
  });
  test('an open sheet receives source and spell-list changes together',async({page})=>{
    sql(`update characters set level=5,secondary_class='Wizard',secondary_level=3,pending_manual_level_grants=1,known_spells=ARRAY['mage-armor'],prepared_spells=ARRAY['mage-armor'],spell_sources='{"mage-armor":["class:Psion"]}',spell_slots='{"1":{"total":4,"used":0},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.getByRole('button',{name:/Level up available/}).click();
    const next=page.getByRole('button',{name:'Next →',exact:true});await next.click();await next.click();await next.click();
    const section=page.getByRole('region',{name:'Psion spell replacements'});
    await section.getByLabel('Replace prepared spell',{exact:true}).selectOption('mage-armor');
    await expect(section.getByRole('checkbox',{name:'Mage Armor: Psion',exact:true})).toBeChecked();
    sql(`update characters set known_spells=ARRAY['hold-person'],prepared_spells=ARRAY['hold-person'],spell_sources='{"hold-person":["class:Wizard"]}' where id='${charId}'`);
    await expect(section.getByLabel('Replace prepared spell',{exact:true})).toHaveValue('');
    await expect(section.getByLabel('Replace prepared spell',{exact:true}).locator('option[value="mage-armor"]')).toHaveCount(0);
    await section.getByText('Review existing spell sources',{exact:true}).click();
    await expect(section.getByRole('checkbox',{name:'Hold Person: Wizard',exact:true})).toBeChecked();
  });
  test('ordinary learning and advanced removal change only the Psion copy',async({page})=>{
    sql(`update characters set level=5,secondary_class='Wizard',secondary_level=3,known_spells=ARRAY['mage-armor'],prepared_spells='{}',spell_sources='{"mage-armor":["class:Wizard"]}',advanced_spell_edits_unlocked=true,spell_slots='{"1":{"total":4,"used":0},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await page.getByRole('button',{name:/Spell Book/}).click();
    await page.getByRole('button',{name:'1st',exact:true}).click();
    await page.getByPlaceholder('Search spells by name, school, or effect…').fill('Mage Armor');
    await page.getByRole('button',{name:'+ Add',exact:true}).click();
    await expect.poll(()=>sql(`select (spell_sources->'mage-armor')::text from characters where id='${charId}'`)).toBe('["class:Wizard", "class:Psion"]');
    expect(sql(`select ('mage-armor'=any(prepared_spells))::text from characters where id='${charId}'`)).toBe('true');
    await page.getByRole('button',{name:'− Remove',exact:true}).click();
    await expect.poll(()=>sql(`select (spell_sources->'mage-armor')::text from characters where id='${charId}'`)).toBe('["class:Wizard"]');
    expect(sql(`select ('mage-armor'=any(known_spells))::text from characters where id='${charId}'`)).toBe('true');
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(page.getByTitle('9 more spells can be prepared',{exact:true})).toContainText('0/9');
  });
});
