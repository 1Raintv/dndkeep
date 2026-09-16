import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

const characterId = '33333333-3333-3333-3333-333333333333';
const sql = (query: string) => execFileSync('docker', ['exec', 'supabase_db_dndkeep',
  'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();

test.describe('release recovery (local Docker only)', () => {
  gateDbSuite();
  // Both viewports use the seed character; run with --workers=1.
  test('creator draft survives reload and can be explicitly discarded', async ({ page }) => {
    await signInAsSeedDm(page);
    await page.goto('/creator');
    const name = page.getByPlaceholder('What do they call you?');
    await name.fill('Recovery test draft');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Continue your character?' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume character' }).click();
    await expect(name).toHaveValue('Recovery test draft');
    await page.reload();
    await page.getByRole('button', { name: 'Discard draft' }).click();
    await expect(name).toHaveValue('');
  });

  test('failed sheet save survives navigation and retries the same edit', async ({ page }) => {
    const before = Number(sql(`select current_hp from characters where id='${characterId}'`));
    expect(before).toBeGreaterThan(1);
    try {
      await signInAsSeedDm(page);
      await page.goto(`/character/${characterId}`);
      let fail = true;
      await page.route('**/rest/v1/characters?*', async route => {
        if (route.request().method() === 'PATCH' && fail) {
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Release test: temporarily unavailable' }) });
        }
        await route.continue();
      });
      await page.getByTitle('Take 1 damage', { exact: true }).click();
      await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
      expect(Number(sql(`select current_hp from characters where id='${characterId}'`))).toBe(before);
      // SPA navigation preserves the in-memory queue; a hard reload would not.
      await page.locator('a[href="/lobby"]:visible').first().click();
      await page.getByRole('link', { name: 'Return to character' }).click();
      fail = false;
      await page.getByRole('button', { name: 'Retry save' }).click();
      await expect.poll(() => Number(sql(`select current_hp from characters where id='${characterId}'`))).toBe(before - 1);
      await expect(page.getByRole('button', { name: 'Retry save' })).toBeHidden();
    } finally {
      sql(`update characters set current_hp=${before} where id='${characterId}'`);
    }
  });
});
