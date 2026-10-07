import { expect, test } from '@playwright/test';
import { gateDbSuite, signInAsSeedDm } from './helpers';

test.describe('complete SRD spell details', () => {
  gateDbSuite();
  test.use({ serviceWorkers: 'block' });
  test('real spell browser retains exceptions, scaling, and source links', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await signInAsSeedDm(page);
    await page.goto('/spells');
    const search = page.getByPlaceholder('Search name or description...');
    await search.fill('Sleep');
    await page.getByRole('button', { name: /^Sleep\s/ }).click();
    await expect(page.getByText(/fails the second save/)).toBeVisible();
    await expect(page.getByText(/Immunity to the Exhaustion condition/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'SRD 5.2.1 Â· p. 163' })).toHaveAttribute('href', /#page=163$/);
    // Same viewport metric as the shared overflow probe: innerWidth widens on mobile.
    const layout = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      screen: Math.round(window.visualViewport?.width ?? window.innerWidth),
    }));
    expect(layout.content).toBeLessThanOrEqual(layout.screen);
    await page.screenshot({ path: info.outputPath('sleep.png'), fullPage: true });
    await search.fill('Bless');
    await page.getByRole('button', { name: /^Bless\s/ }).click();
    await expect(page.getByText(/Holy Symbol worth 5\+ GP/)).toBeVisible();
    await expect(page.getByText(/one additional creature for each spell slot level above 1/)).toBeVisible();
    await page.screenshot({ path: info.outputPath('bless.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
  test('stale canonical DB text is repaired without replacing homebrew', async ({ page }) => {
    let sawOwnerColumn = false;
    await page.route(/\/rest\/v1\/spells\?/, async route => {
      sawOwnerColumn = new URL(route.request().url()).searchParams.get('select')?.split(',').includes('owner_id') ?? false;
      const common = { source: 'srd', level: 1, school: 'Enchantment', casting_time: '1 action', range: '90 feet', components: 'V', duration: '1 minute', concentration: false, ritual: false, classes: ['Wizard'] };
      await route.fulfill({ json: [
        { ...common, id: 'sleep', name: 'Sleep', owner_id: null, description: 'Legacy five dice HP pool', higher_levels: 'More d8s', damage_dice: '5d8' },
        { ...common, id: 'bless', name: 'Bless', owner_id: '11111111-1111-1111-1111-111111111111', description: 'Personal blessing with custom limits', higher_levels: 'Custom extra targets' },
      ] });
    });
    await signInAsSeedDm(page);
    await page.goto('/spells');
    await expect.poll(() => sawOwnerColumn).toBe(true);
    const search = page.getByPlaceholder('Search name or description...');
    await search.fill('Sleep');
    await page.getByRole('button', { name: /^Sleep\s/ }).click();
    await expect(page.getByText(/fails the second save/)).toBeVisible();
    await expect(page.getByText('Legacy five dice HP pool')).toHaveCount(0);
    await expect(page.getByText('More d8s')).toHaveCount(0);
    await search.fill('Bless');
    await page.getByRole('button', { name: /^Bless\s/ }).click();
    await expect(page.getByText('Personal blessing with custom limits')).toBeVisible();
    await expect(page.getByText(/Custom extra targets/)).toBeVisible();
    await expect(page.getByRole('link', { name: /SRD 5.2.1 · p\./ })).toHaveCount(0);
  });
});
