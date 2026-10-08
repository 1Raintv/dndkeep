// Combat lifecycle E2E (audit 4.6 characterization net, v2.645).
//
// Pins the CONSUMER-VISIBLE combat plumbing before the state-management
// move: realtime/context load → InitiativeStrip render → End Turn
// advances the encounter → End Combat completes it. Combat *state* is
// seeded via SQL (fixture, not behavior under test); the UI lifecycle is
// what must survive the move unchanged.
//
// Per-project fixture campaign: desktop + mobile run in parallel against
// one database, and load() picks the LATEST active encounter per
// campaign — a shared campaign would cross-talk (same class of flake as
// telemetry.spec's shared-marker collision).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q:string):string => execFileSync('docker',
 ['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],
 {input:q,encoding:'utf8'}).trim();

test.describe('combat lifecycle (local stack)', () => {
  gateDbSuite();

  let camp = '', enc = '', campName = '', userId = '', email = '';

  test.beforeEach(async ({}, testInfo) => {
    camp=randomUUID();enc=randomUUID();userId=randomUUID();
    const cb1=randomUUID(),cb2=randomUUID();
    email=`combat-${userId}@dndkeep.local`;campName=`E2E Combat ${testInfo.project.name}`;
    // v2.815 — disposable accounts avoid shared seed campaign-slot limits.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Combat Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());commit;`);
    sql(`insert into campaigns (id, owner_id, name, description) values ('${camp}','${userId}','${campName}','combat lifecycle fixture')`);
    sql(`insert into combatants (id, campaign_id, owner_id, name, definition_type, definition_id, current_hp, max_hp) values ` +
        `('${cb1}','${camp}','${userId}','Fixture Goblin','srd_monster','e2e-gob-${userId}',7,7),` +
        `('${cb2}','${camp}','${userId}','Fixture Ogre','srd_monster','e2e-ogre-${userId}',29,29)`);
    sql(`insert into combat_encounters (id, campaign_id, status, current_turn_index) values ('${enc}','${camp}','active',0)`);
    sql(`insert into combat_participants (encounter_id, campaign_id, participant_type, entity_id, name, turn_order, initiative, combatant_id) values ` +
        `('${enc}','${camp}','creature','e2e-gob-${userId}','Fixture Goblin',0,15,'${cb1}'),` +
        `('${enc}','${camp}','creature','e2e-ogre-${userId}','Fixture Ogre',1,8,'${cb2}')`);
  });

  test.afterEach(() => {
    try {
      sql(`delete from combat_participants where campaign_id='${camp}'`);
      sql(`delete from combat_encounters where campaign_id='${camp}'`);
      sql(`delete from combatants where campaign_id='${camp}'`);
      sql(`delete from campaign_members where campaign_id='${camp}'`);
      sql(`delete from campaigns where id='${camp}'`);
      sql(`delete from auth.users where id='${userId}'`);
    } catch { /* best effort */ }
  });

  test('strip renders active combat; End Turn advances; End Combat completes', async ({ page }) => {
    await signInAsSeedDm(page,email);
    await page.goto('/campaigns');
    await page.locator(`text=${campName}`).locator('visible=true').first().click();

    // The combat overlay mounts at the dashboard root (outside the tab
    // content), so an active encounter must surface the strip regardless
    // of which tab the dashboard opened on.
    await expect(page.getByRole('button', { name: 'End Turn' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('text=Fixture Goblin').first()).toBeVisible();
    await expect(page.locator('text=Fixture Ogre').first()).toBeVisible();

    // End Turn → the encounter's turn index advances in the database and
    // the UI stays coherent (strip still up, no crash).
    // REAL clicks on purpose (v2.646): the original spec needed
    // dispatchEvent because the strip's fixed offsets pushed these
    // buttons off-screen on phones (End Turn at x=419 in a 393px
    // viewport — DMs literally couldn't end turns on mobile). The
    // narrow-viewport strip layout fixed it; real clicks now PROVE the
    // buttons are reachable at both viewports. Don't regress this to
    // dispatchEvent — unreachable-button bugs would go invisible again.
    await page.getByRole('button', { name: 'End Turn' }).click();
    await expect
      .poll(() => Number(sql(`select current_turn_index from combat_encounters where id='${enc}'`)), {
        timeout: 15_000, intervals: [500],
      })
      .toBe(1);
    await expect(page.getByRole('button', { name: 'End Turn' })).toBeVisible();

    // End Combat → confirm modal → encounter completed → strip unmounts.
    await page.getByRole('button', { name: 'End Combat' }).first().click();
    await page.getByRole('button', { name: 'End Combat' }).last().click(); // modal confirm
    await expect
      .poll(() => sql(`select status from combat_encounters where id='${enc}'`), {
        timeout: 15_000, intervals: [500],
      })
      .not.toBe('active');
    await expect(page.getByRole('button', { name: 'End Turn' })).toBeHidden({ timeout: 15_000 });
  });
});
