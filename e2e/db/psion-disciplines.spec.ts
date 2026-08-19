// DB-gated: v2.674 Psion Discipline key resolution.
//
// The bug this guards is invisible to every other layer. Both pickers wrote
// `disc.name` into class_resources['psion-disciplines'] while the Actions tab
// looked entries up by `disc.id` — so `find` always returned undefined, the
// injected ability list came back empty, and a Psion's chosen disciplines
// rendered NOWHERE. No console error, no type error, no failing unit test:
// the array was well-formed, it just answered to a key nothing asked for.
//
// So the fixture stores the LEGACY name form on purpose — that is the shape
// sitting in production on every Psion created before the fix. If the sheet
// can render those, it can render the ids the pickers write now.
import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const PSQL = `docker exec supabase_db_dndkeep psql -U postgres -d postgres -t -A -c`;
const sql = (q: string): string => execSync(`${PSQL} "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

const SEED_DM = '11111111-1111-1111-1111-111111111111';

test.describe('psion disciplines (local stack)', () => {
  gateDbSuite();
  // Desktop only, and NOT because the fix is desktop-only. The Actions-tab
  // ability grid is a fixed 8-column template (v2.501) that needs ~505px;
  // at 375px the 1fr NAME column collapses to width 0, so EVERY ability
  // row on every class renders nameless on a phone. That is a pre-existing
  // responsive bug in the shared grid, unrelated to discipline resolution —
  // asserting on it here would just encode it. Filed separately.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'mobile',
      'ability-row grid collapses the name column below ~505px (pre-existing)');
  });

  // Per-project id: desktop + mobile run in parallel against one database,
  // and a shared character row would have them racing each other's cleanup.
  let charId = '';

  test.beforeEach(({}, testInfo) => {
    const d = testInfo.project.name === 'mobile' ? '2' : '1';
    charId = `44444444-4444-4444-4444-44444444000${d}`;
    // Psion is UA content — hidden from accounts without the flag.
    sql(`update profiles set show_ua_content = true where id = '${SEED_DM}'`);
    sql(
      `insert into characters (id, user_id, name, species, class_name, background, subclass, level, class_resources) ` +
      `values ('${charId}', '${SEED_DM}', 'Discipline Fixture', 'Human', 'Psion', 'Sage', 'Telepath', 5, ` +
      `'{"psion-disciplines": ["Biofeedback", "Psionic Guards", "Inerrant Aim"], "psionic-energy-dice": 6}'::jsonb) ` +
      // Idempotent: a crashed run used to leave the row behind and the
      // next insert died on the primary key.
      `on conflict (id) do update set level = excluded.level, ` +
      `subclass = excluded.subclass, class_resources = excluded.class_resources`
    );
  });

  test.afterEach(() => {
    try {
      sql(`delete from characters where id = '${charId}'`);
      sql(`update profiles set show_ua_content = false where id = '${SEED_DM}'`);
    } catch { /* best effort */ }
  });

  test('chosen disciplines render as usable abilities on the Actions tab', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    await signInAsSeedDm(page);
    await page.goto(`/character/${charId}`);

    // A level-5 Psion is owed exactly 3 disciplines, so the fixture seeds 3:
    // with nothing outstanding, PendingChoicesAlert stays off the page and
    // these names can only come from the Actions rows. (Seeded with 2, the
    // alert's own chips satisfied a bare getByText and the assertion passed
    // against a still-broken sheet.)
    // The sheet opens on Actions, where ClassAbilitiesSection injects each
    // chosen discipline as a clickable ability row alongside Telekinetic
    // Propel and Telepathic Connection.
    // visible=true throughout: the responsive layout keeps a second copy of
    // the sheet in the DOM, and a bare .first() resolves to the HIDDEN one on
    // whichever project isn't rendering it (same trap as login-flow.spec).
    const visible = (text: string) => page.getByText(text).locator('visible=true').first();
    await expect(visible('Telekinetic Propel')).toBeVisible({ timeout: 20_000 });

    // The assertion the pre-fix build failed: both picks are on the sheet.
    for (const name of ['Biofeedback', 'Psionic Guards', 'Inerrant Aim']) {
      await expect(visible(name)).toBeVisible();
    }
    await expect(page.getByText(/Psionic Disciplines — choose/i)).toHaveCount(0);

    // ...and they are inside the class-abilities panel, not stray text
    // elsewhere on the sheet — scoped to the "Psion Abilities" section so
    // the assertion can't be satisfied by a picker chip or a Features row.
    // The strongest single signal: this sub-heading renders ONLY when at
    // least one chosen discipline resolved into an ability row. Pre-fix it
    // could never appear, whatever the character had stored.
    const heading = page.getByText('Psychic Disciplines').locator('visible=true').first();
    await expect(heading).toBeVisible();
    await heading.scrollIntoViewIfNeeded();
    await testInfo.attach('psion-abilities', {
      body: await page.screenshot(), contentType: 'image/png',
    });

    expect(errors, 'no page errors on a Psion sheet').toEqual([]);
  });

  test('picking one through the UI stores an id and it lands on the sheet', async ({ page }) => {
    // The write half of the round trip. Seeded one short of the level-5
    // allowance so PendingChoicesAlert offers the picker; the pick has to
    // persist in a form the Actions tab can resolve, and the chip has to
    // still read as a display name rather than the raw id.
    sql(`update characters set class_resources = '{"psion-disciplines": ["Biofeedback", "Psionic Guards"]}'::jsonb where id = '${charId}'`);

    await signInAsSeedDm(page);
    await page.goto(`/character/${charId}`);

    // Filter the list down to one row first — clicking a Choose button by
    // ordinal picked whatever sat last in the list (observed: Sharpened
    // Mind), which would have "passed" against the wrong discipline.
    await page.getByRole('button', { name: /choose →/i }).locator('visible=true').first().click();
    await page.getByPlaceholder('Search disciplines...').locator('visible=true').first().fill('Inerrant');
    await page.getByRole('button', { name: 'Choose', exact: true }).locator('visible=true').first().click();

    // Stored as the id — the whole point of the write change.
    await expect
      .poll(() => sql(`select class_resources->>'psion-disciplines' from characters where id = '${charId}'`),
            { timeout: 10_000 })
      .toContain('inerrant-aim');

    // ...and read back as a name everywhere a human looks.
    await expect(page.getByText('Psychic Disciplines').locator('visible=true').first())
      .toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('inerrant-aim')).toHaveCount(0);
  });
});
