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
import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const PSQL = `docker exec supabase_db_dndkeep psql -U postgres -d postgres -t -A -c`;
const sql = (q: string): string =>
  execSync(`${PSQL} "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

const SEED_DM = '11111111-1111-1111-1111-111111111111';

test.describe('combat lifecycle (local stack)', () => {
  gateDbSuite();

  let camp = '', enc = '', campName = '';

  test.beforeEach(async ({}, testInfo) => {
    const d = testInfo.project.name === 'mobile' ? '2' : '1';
    camp = `77777777-7777-7777-7777-77777777000${d}`;
    enc = `99999999-9999-9999-9999-99999999000${d}`;
    const cb1 = `88888888-8888-8888-8888-8888888800${d}1`;
    const cb2 = `88888888-8888-8888-8888-8888888800${d}2`;
    campName = `E2E Combat ${testInfo.project.name}`;
    // Idempotent re-seed: wipe any leftovers from a crashed run first.
    sql(`delete from combat_participants where campaign_id='${camp}'`);
    sql(`delete from combat_encounters where campaign_id='${camp}'`);
    sql(`delete from combatants where campaign_id='${camp}'`);
    sql(`delete from campaigns where id='${camp}'`);
    sql(`insert into campaigns (id, owner_id, name, description) values ('${camp}','${SEED_DM}','${campName}','combat lifecycle fixture')`);
    sql(`insert into combatants (id, campaign_id, owner_id, name, definition_type, definition_id, current_hp, max_hp) values ` +
        `('${cb1}','${camp}','${SEED_DM}','Fixture Goblin','srd_monster','e2e-gob-${d}',7,7),` +
        `('${cb2}','${camp}','${SEED_DM}','Fixture Ogre','srd_monster','e2e-ogre-${d}',29,29)`);
    sql(`insert into combat_encounters (id, campaign_id, status, current_turn_index) values ('${enc}','${camp}','active',0)`);
    sql(`insert into combat_participants (encounter_id, campaign_id, participant_type, entity_id, name, turn_order, initiative, combatant_id) values ` +
        `('${enc}','${camp}','monster','e2e-gob-${d}','Fixture Goblin',0,15,'${cb1}'),` +
        `('${enc}','${camp}','monster','e2e-ogre-${d}','Fixture Ogre',1,8,'${cb2}')`);
  });

  test.afterEach(() => {
    try {
      sql(`delete from combat_participants where campaign_id='${camp}'`);
      sql(`delete from combat_encounters where campaign_id='${camp}'`);
      sql(`delete from combatants where campaign_id='${camp}'`);
      sql(`delete from campaign_members where campaign_id='${camp}'`);
      sql(`delete from campaigns where id='${camp}'`);
    } catch { /* best effort */ }
  });

  test('strip renders active combat; End Turn advances; End Combat completes', async ({ page }) => {
    await signInAsSeedDm(page);
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
    // dispatchEvent, not click: on the mobile viewport an overlaying
    // element intercepts pointer events over the strip (same class of
    // issue as the dice-overlay gotcha in verify-ui-dndkeep). The spec
    // pins the ACTION's behavior; mobile hit-target ergonomics are a
    // separate (real) observation, noted in the audit doc.
    await page.getByRole('button', { name: 'End Turn' }).dispatchEvent('click');
    await expect
      .poll(() => Number(sql(`select current_turn_index from combat_encounters where id='${enc}'`)), {
        timeout: 15_000, intervals: [500],
      })
      .toBe(1);
    await expect(page.getByRole('button', { name: 'End Turn' })).toBeVisible();

    // End Combat → confirm modal → encounter completed → strip unmounts.
    await page.getByRole('button', { name: 'End Combat' }).first().dispatchEvent('click');
    await page.getByRole('button', { name: 'End Combat' }).last().dispatchEvent('click'); // modal confirm
    await expect
      .poll(() => sql(`select status from combat_encounters where id='${enc}'`), {
        timeout: 15_000, intervals: [500],
      })
      .not.toBe('active');
    await expect(page.getByRole('button', { name: 'End Turn' })).toBeHidden({ timeout: 15_000 });
  });
});
