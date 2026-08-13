// DB-gated: v2.661 wall material picker.
//
// Guards the two things that actually broke while building it, both of
// which the unit tests are structurally blind to because they are layout,
// not logic:
//
//   1. The panel overlapped the tool hint bar (`top:12 right:12
//      maxWidth:40%`), clipping the "Window" chip by 69px.
//   2. Moved to `bottom:12` it landed under PartyVitalsBar, which
//      intercepted every click — the chips rendered but were dead.
//
// So this asserts the chips are present AND unobstructed AND actually
// clickable. A render-only assertion would have passed through bug 2.
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

test.describe('wall type panel (local stack)', () => {
  gateDbSuite();

  test('material chips render unobstructed and are clickable', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));

    await signInAsSeedDm(page);
    await page.goto('/campaigns');
    await page.locator('text=Local Test Campaign').locator('visible=true').first().click();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    // Panel is authoring state — absent until the wall tool is on.
    const solid = page.locator('button:has-text("Solid")');
    await expect(solid).toHaveCount(0);

    await page.locator('button[title*="Wall" i]').first().click();

    for (const label of ['Solid', 'Low', 'Window']) {
      await expect(page.locator(`button:has-text("${label}")`).first()).toBeVisible();
    }

    // Clickable, not just visible — this is the PartyVitalsBar guard.
    // A short timeout so an intercepting overlay fails fast rather than
    // burning the default 30s in "retrying click action".
    await page.locator('button:has-text("Low")').first().click({ timeout: 5_000 });

    // ...and the click registered, i.e. selection actually moved.
    await expect(page.locator('button:has-text("Low")').first())
      .toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button:has-text("Solid")').first())
      .toHaveAttribute('aria-pressed', 'false');

    // No chip may be covered by ANY other map overlay. Checked generically
    // rather than against one named element: the first version of this
    // guard only knew about the tool hint bar, and the second bug was
    // PartyVitalsBar — a different element entirely.
    const covered = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('button')]
        .filter(b => /^(Solid|Low|Window)/.test((b.textContent || '').trim()));
      if (chips.length !== 3) return ['chips:' + chips.length];
      const panel = chips[0].parentElement!;
      const hits: string[] = [];
      for (const chip of chips) {
        const r = chip.getBoundingClientRect();
        // What does the browser say is actually on top at the chip's centre?
        const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        if (top && !chip.contains(top) && !panel.contains(top)) {
          hits.push(`${(chip.textContent || '').trim().slice(0, 10)} covered by ` +
                    `${top.tagName}.${(top.className || '').toString().slice(0, 30)}`);
        }
      }
      return hits;
    });
    expect(covered).toEqual([]);

    expect(errors).toEqual([]);
  });
});
