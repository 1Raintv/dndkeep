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
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const sql = (q: string): string => execFileSync('docker', ['exec', '-i', 'supabase_db_dndkeep', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: q, encoding: 'utf8' }).trim();

test.describe('psion disciplines (local stack)', () => {
  gateDbSuite();
  // v2.675.0 — this suite used to skip the mobile project: the Actions-tab
  // ability grid was a fixed 8-column template (v2.501) needing ~505px, so
  // at 375px the 1fr NAME column collapsed to width 0 and EVERY ability row
  // on every class rendered nameless. The template now lives in `.arow-grid`
  // (globals.css) and stacks under 640px, so mobile asserts the same names
  // as desktop and the skip is gone.

  let charId: string;
  let userId: string;
  let email: string;
  test.beforeEach(() => {
    charId = randomUUID(); userId = randomUUID();
    email = 'psion-' + userId + '@dndkeep.local';
    // v2.784: own disposable account, so shared seed users' slot limits and
    // parallel suites cannot affect this fixture. Never alter their characters.
    sql(`begin;
      insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000','${userId}','authenticated','authenticated','${email}',extensions.crypt('dndkeep-local-test',extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{"display_name":"Psion Fixture"}',now(),now(),'','','','');
      insert into auth.identities (id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
      values (gen_random_uuid(),'${userId}','${userId}','{"sub":"${userId}","email":"${email}"}','email',now(),now(),now());
      update profiles set show_ua_content=true where id='${userId}';
      insert into characters (id,user_id,name,species,class_name,background,subclass,level,class_resources)
      values ('${charId}','${userId}','Discipline Fixture','Human','Psion','Sage','Telepath',5,'{"psion-disciplines":["Biofeedback","Psionic Guards","Inerrant Aim"],"psionic-energy-dice":6}');
      commit;`);
  });
  test.afterEach(() => {
    if (userId) sql(`delete from characters where user_id='${userId}'; delete from auth.users where id='${userId}';`);
  });



  test('chosen disciplines render as usable abilities on the Actions tab', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    await signInAsSeedDm(page, email);
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

    await signInAsSeedDm(page, email);
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
