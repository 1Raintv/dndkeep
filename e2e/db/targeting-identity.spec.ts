// v2.746 — targeting identity (local stack, DB-backed).
//
// Combat participants are per INSTANCE (one per battle-map token) and the
// geometry layer resolves each one to ITS token. Before this, three Goblin
// Scout tokens sharing one homebrew_monsters definition became ONE
// participant (phase-D UNIQUE on entity_id), so two goblins could never be
// targeted, and a participant whose trigger-guessed combatant lived on
// another scene vanished from every AoE / range query.
//
// Fixture (supabase/seed): "Local Test Campaign", scene "Ruined Keep
// (fixture)" (grid 70 px) with 13 placements — three Goblin Scouts at
// cols 18/18/19 rows 2/3/2 and a Large Ogre at col 19 row 4 — and
// "Overland Trail (fixture, hex)" holding a fourth Goblin Scout placement
// backed by the SAME definition. Requires migration
// 20260922120000_combat_participants_per_instance_v2_746 on the local DB
// (`npx supabase migration up`).
//
// Everything this spec starts, it ends: the encounter is ended through
// the app's own endEncounter and its rows are deleted in `finally`.
import { execSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const PSQL = `docker exec supabase_db_dndkeep psql -U postgres -d postgres -t -A -c`;
const sql = (q: string): string =>
  execSync(`${PSQL} "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

const CAMPAIGN = '22222222-2222-2222-2222-222222222222';

async function openMap(page: Page, sceneName: string) {
  await page.goto('/campaigns');
  await page.getByText('Local Test Campaign', { exact: true }).locator('visible=true').first().click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('select').filter({ has: page.locator('option', { hasText: sceneName }) }).selectOption({ label: sceneName });
  await expect.poll(() => page.evaluate(async () => {
    const s = '/src/lib/stores/battleMapStore.ts';
    const { useBattleMapStore } = await import(/* @vite-ignore */ s);
    const st = useBattleMapStore.getState();
    return !st.loading && Object.keys(st.tokens).length;
  })).toBeGreaterThan(0);
}

/** Start combat exactly the way the Start Combat button does (injected
 *  store snapshot) and return the encounter id + participant count. */
async function startCombat(page: Page) {
  return page.evaluate(async (campaignId) => {
    const s = '/src/lib/stores/battleMapStore.ts';
    const { useBattleMapStore } = await import(/* @vite-ignore */ s);
    const m = '/src/lib/startCombatFromMap.ts';
    const { startCombatFromMapTokens } = await import(/* @vite-ignore */ m);
    const st = useBattleMapStore.getState();
    const r = await startCombatFromMapTokens(campaignId, { sceneId: st.currentSceneId, tokens: Object.values(st.tokens) });
    if (!r.ok) throw new Error(`start failed: ${r.reason} ${r.message ?? ''}`);
    return { encounterId: r.result.encounter.id as string, participantCount: r.participantCount as number };
  }, CAMPAIGN);
}

async function endCombat(page: Page, encounterId: string | null) {
  if (!encounterId) return;
  try {
    await page.evaluate(async (id) => {
      const m = '/src/lib/combatEncounter.ts';
      const { endEncounter } = await import(/* @vite-ignore */ m);
      await endEncounter(id);
    }, encounterId);
  } catch { /* fall through to SQL cleanup */ }
  sql(`delete from combat_events where encounter_id='${encounterId}'`);
  sql(`delete from combat_participants where encounter_id='${encounterId}'`);
  sql(`delete from combat_encounters where id='${encounterId}'`);
}

/** In-page: resolve every participant of the encounter against the viewed
 *  scene and run the footprint-aware AoE finders. */
async function geometry(page: Page, encounterId: string, center: { row: number; col: number }, radiusFt: number, excludeName: string) {
  return page.evaluate(async ({ campaignId, encounterId, center, radiusFt, excludeName }) => {
    const g = '/src/lib/battleMapGeometry.ts';
    const geo = await import(/* @vite-ignore */ g);
    const a = '/src/lib/supabase.ts';
    const { supabase } = await import(/* @vite-ignore */ a);
    const { data } = await supabase.from('combat_participants')
      .select('id, name, participant_type, entity_id, combatant_id').eq('encounter_id', encounterId);
    const participants = (data ?? []).map(geo.participantLookup);
    const map = await geo.loadActiveBattleMap(campaignId);
    const footprints = geo.buildParticipantFootprints(participants, map.tokens);
    const exclude = new Set(participants.filter((p: any) => p.name === excludeName).map((p: any) => p.id));
    const radius = geo.findParticipantsInRadiusFootprint(participants, footprints, center, radiusFt, exclude);
    const sphere = geo.findParticipantsInAreaFootprint(participants, footprints, 'sphere', radiusFt, center, null, exclude);
    const resolved = participants.map((p: any) => ({ name: p.name, combatant_id: p.combatant_id, token: geo.findTokenForParticipant(p, map.tokens)?.combatant_id ?? null }));
    return {
      total: participants.length,
      placed: footprints.size,
      radius: radius.map((m: any) => m.participant.name).sort(),
      sphere: sphere.map((m: any) => m.participant.name).sort(),
      resolved,
    };
  }, { campaignId: CAMPAIGN, encounterId, center, radiusFt, excludeName });
}

test.describe('targeting identity (local stack)', () => {
  gateDbSuite();

  test('Ruined Keep: one participant per token; every goblin registers in a 20-ft sphere', async ({ page }) => {
    await signInAsSeedDm(page);
    await openMap(page, 'Ruined Keep (fixture)');
    let encounterId: string | null = null;
    try {
      const started = await startCombat(page);
      encounterId = started.encounterId;
      expect(started.participantCount).toBe(13);

      // Three Goblin Scout participants, each bound to ITS placement's combatant.
      const goblins = sql(`select combatant_id from combat_participants where encounter_id='${encounterId}' and name='Goblin Scout' order by 1`).split('\n').filter(Boolean);
      const placements = sql(`select p.combatant_id from scene_token_placements p join combatants c on c.id=p.combatant_id join scenes s on s.id=p.scene_id where s.name='Ruined Keep (fixture)' and c.name='Goblin Scout' order by 1`).split('\n').filter(Boolean);
      expect(goblins).toEqual(placements);
      expect(goblins.length).toBe(3);
      expect(sql(`select count(*) from combat_participants where encounter_id='${encounterId}' and name='Crypt Skeleton'`)).toBe('2');

      // Geometry: centre col 18 / row 3 (between the goblins), 20 ft = 4 cells
      // → all three goblins plus the Large ogre at col 19 row 4. The dragon,
      // assassin and party are well outside.
      const geo = await geometry(page, encounterId, { row: 3, col: 18 }, 20, 'Ilyana Vell');
      expect(geo.total).toBe(13);
      expect(geo.placed).toBe(13);
      expect(geo.radius).toEqual(['Goblin Scout', 'Goblin Scout', 'Goblin Scout', 'Ogre Bruiser']);
      expect(geo.sphere).toEqual(geo.radius);
      // Every participant resolves to the token carrying its own combatant.
      for (const r of geo.resolved) expect(r.token, r.name).toBe(r.combatant_id);
    } finally {
      await endCombat(page, encounterId);
    }
  });

  test('Overland Trail: the shared-definition goblin binds to THIS scene\'s placement', async ({ page }) => {
    await signInAsSeedDm(page);
    await openMap(page, 'Overland Trail (fixture, hex)');
    let encounterId: string | null = null;
    try {
      const started = await startCombat(page);
      encounterId = started.encounterId;
      expect(started.participantCount).toBe(2);
      const rows = sql(`select name || '|' || combatant_id from combat_participants where encounter_id='${encounterId}' order by name`).split('\n').filter(Boolean);
      const expected = sql(`select c.name || '|' || p.combatant_id from scene_token_placements p join combatants c on c.id=p.combatant_id join scenes s on s.id=p.scene_id where s.name='Overland Trail (fixture, hex)' order by c.name`).split('\n').filter(Boolean);
      expect(rows).toEqual(expected);
      const geo = await geometry(page, encounterId, { row: 7, col: 6 }, 20, '');
      expect(geo.placed).toBe(2);
      for (const r of geo.resolved) expect(r.token, r.name).toBe(r.combatant_id);
    } finally {
      await endCombat(page, encounterId);
    }
  });
});
