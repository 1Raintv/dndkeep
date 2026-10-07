import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('Psion spell stat display', () => {
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

  test('spell attack and DC follow Psion level and Intelligence',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const failed:string[]=[];page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    sql(`update characters set level=5,intelligence=18,spell_slots='{"1":{"total":4,"used":0},"2":{"total":3,"used":0},"3":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    const attack=page.getByText('Spell Attack',{exact:true}).locator('visible=true').first().locator('..');
    const dc=page.getByText('Spell DC',{exact:true}).locator('visible=true').first().locator('..');
    await expect(attack).toHaveText('+7Spell Attack');await expect(dc).toHaveText('15Spell DC');
    await attack.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('psion-stats.png')});
    sql(`update characters set level=17,intelligence=20 where id='${charId}'`);
    await page.reload();await expect(attack).toHaveText('+11Spell Attack');await expect(dc).toHaveText('19Spell DC');
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const stats=page.getByRole('region',{name:'Spellcasting statistics'});
    await expect(stats).toContainText('+5MODIFIER');await expect(stats).toContainText('+11SPELL ATTACK');await expect(stats).toContainText('19SAVE DC');
    // The header must use effective Intelligence, including an attuned item.
    sql(`update characters set level=5,intelligence=10,inventory='[{"id":"header-headband","magic_item_id":"headband-of-intellect","name":"Headband of Intellect","quantity":1,"equipped":true,"attuned":true}]' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(stats).toContainText('+4MODIFIER');await expect(stats).toContainText('+7SPELL ATTACK');await expect(stats).toContainText('15SAVE DC');
    await stats.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await page.screenshot({path:info.outputPath('psion-spell-header.png')});
    sql(`update characters set inventory='[]' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(stats).toContainText('+0MODIFIER');await expect(stats).toContainText('+3SPELL ATTACK');await expect(stats).toContainText('11SAVE DC');
    expect(errors).toEqual([]);expect(failed).toEqual([]);
  });
  test('multiclass Psion casting uses total proficiency and effective Intelligence',async({page})=>{
    sql(`update characters set level=3,secondary_class='Fighter',secondary_level=2,intelligence=10,known_spells='{"charm-person"}',prepared_spells='{"charm-person"}',spell_slots='{"1":{"total":4,"used":0},"2":{"total":2,"used":0}}',inventory='[{"id":"casting-headband","magic_item_id":"headband-of-intellect","name":"Headband of Intellect","quantity":1,"equipped":true,"attuned":true}]' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const stats=page.getByRole('region',{name:'Spellcasting statistics'});
    await expect(stats).toContainText('+7SPELL ATTACK');await expect(stats).toContainText('15SAVE DC');
    const row=page.locator('.srow-grid').filter({has:page.getByText('Charm Person',{exact:true})}).first();
    await row.getByRole('button',{name:'Cast',exact:true}).click();
    await expect(page.getByText('WIS Save — DC 15',{exact:true})).toBeVisible();
    sql(`update characters set inventory='[]' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(stats).toContainText('+3SPELL ATTACK');await expect(stats).toContainText('11SAVE DC');
    await row.getByRole('button',{name:'Cast',exact:true}).click();
    await expect(page.getByText('WIS Save — DC 11',{exact:true})).toBeVisible();
  });

  test('Telepath cantrip damage scales and includes only its own Intelligence bonus',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    sql(`update characters set level=6,subclass='Telepath',intelligence=18,known_spells='{"mind-sliver"}',spell_sources='{"mind-sliver":["class:Psion"]}',spell_slots='{}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const row=page.locator('.srow-grid').filter({has:page.getByText('Mind Sliver',{exact:true})}).first();
    const roll=row.getByRole('button').filter({hasText:'2d6+4'});
    await expect(roll).toBeVisible();
    await row.getByText('Mind Sliver',{exact:true}).click();
    await expect(page.getByText('Potent Thoughts: +4 Intelligence damage included.',{exact:true})).toBeVisible();
    await roll.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('telepath-cantrip.png')});
    await roll.click();
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_type='damage' and dice_expression='2d6+4'`)).toBe('1');
    const logged=JSON.parse(sql(`select json_build_object('rolls',individual_results,'total',total)::text from action_logs where character_id='${charId}' and action_type='damage' order by created_at desc limit 1`));
    expect(logged.rolls).toHaveLength(2);expect(logged.total).toBe(logged.rolls.reduce((sum:number,n:number)=>sum+n,4));
    sql(`update characters set level=11,spell_sources='{"mind-sliver":["class:Wizard"]}' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await expect(row.getByRole('button').filter({hasText:/^3d6$/})).toBeVisible();
    sql(`update characters set spell_sources='{}' where id='${charId}'`);
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    await row.getByText('Mind Sliver',{exact:true}).click();
    await expect(page.getByText('Review this spell’s sources to apply Potent Thoughts if it is a Psion cantrip.',{exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Metamorph healing rolls MOD, spends the chosen slot and persists character history',async({page},info)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const failed:string[]=[];page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    sql(`update characters set level=3,subclass='Metamorph',intelligence=18,known_spells='{"cure-wounds","mage-hand"}',spell_slots='{"1":{"total":4,"used":0},"2":{"total":2,"used":0}}' where id='${charId}'`);
    await signInAsSeedDm(page,email);await page.goto(`/character/${charId}`);
    await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const row=page.locator('.srow-grid').filter({has:page.getByText('Cure Wounds',{exact:true})}).first();
    await row.getByRole('button',{name:/^2d8\s*\+\s*MOD$/}).click();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    expect(sql(`select spell_slots->'1'->>'used' from characters where id='${charId}'`)).toBe('0');
    await row.getByRole('button',{name:/^2d8\s*\+\s*MOD$/}).click();
    await page.getByRole('button',{name:/Level 2/}).click();
    await expect(page.getByText('Healing: 4d8+4',{exact:true})).toBeVisible();
    const confirm=page.getByRole('button',{name:/Upcast at Level 2.*Roll Healing/});
    await confirm.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('metamorph-heal-slot.png')});
    await confirm.click();
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_type='heal'`)).toBe('1');
    const logged=JSON.parse(sql(`select json_build_object('dice',dice_expression,'rolls',individual_results,'total',total)::text from action_logs where character_id='${charId}' and action_type='heal' order by created_at desc limit 1`));
    expect(logged.dice.replace(/\s/g,'')).toBe('4d8+MOD');expect(logged.rolls).toHaveLength(4);
    expect(logged.total).toBe(logged.rolls.reduce((sum:number,n:number)=>sum+n,4));
    expect(sql(`select spell_slots->'1'->>'used' from characters where id='${charId}'`)).toBe('0');
    await expect.poll(()=>sql(`select spell_slots->'2'->>'used' from characters where id='${charId}'`)).toBe('1');
    await page.reload();await page.locator('button.tab').filter({hasText:/^Spells/}).click();
    const hand=page.locator('.srow-grid').filter({has:page.getByText('Mage Hand',{exact:true})}).first();
    await hand.getByRole('button',{name:'Cast',exact:true}).click();
    await expect.poll(()=>sql(`select count(*) from action_logs where character_id='${charId}' and action_type='spell' and action_name='Mage Hand'`)).toBe('1');
    expect(errors).toEqual([]);expect(failed).toEqual([]);
  });

});
