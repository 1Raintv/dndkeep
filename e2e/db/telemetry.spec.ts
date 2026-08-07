// Telemetry pipeline E2E (audit 2.8, v2.641): real browser → error hooks →
// log facade → Supabase sink → local client_errors table.
//
// The table is write-only through the API (insert-only RLS), so assertions
// read through the database side — same channel as /check-telemetry.
// Local-stack only (gateDbSuite): docker + psql are present by definition.
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { gateDbSuite } from './helpers';

const PSQL = `docker exec supabase_db_dndkeep psql -U postgres -d postgres -t -A -c`;

function sql(query: string): string {
  return execSync(`${PSQL} "${query.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe('client error telemetry', () => {
  gateDbSuite();

  // Unique per run AND per project — desktop + mobile run this spec in
  // parallel against the same table, so a shared marker collides on the
  // dedupe assertion (observed flake, 2026-08-04).
  let like = '';

  test.afterEach(() => {
    if (like) try { sql(`delete from client_errors where message like '${like}'`); } catch { /* best effort */ }
  });

  test('uncaught errors, rejections, and loops land deduped in client_errors', async ({ page }, testInfo) => {
    const runId = `e2e-${Date.now()}-${testInfo.project.name}`;
    like = `%[${runId}]%`;
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();

    // Inject all three shapes the hooks must catch. setTimeout escapes
    // evaluate()'s own try/catch so the throw is genuinely uncaught.
    await page.evaluate((id) => {
      setTimeout(() => { throw new Error(`[${id}] uncaught throw`); }, 0);
      setTimeout(() => { void Promise.reject(new Error(`[${id}] unawaited rejection`)); }, 50);
      for (let i = 0; i < 100; i++) setTimeout(() => { throw new Error(`[${id}] repeated loop error`); }, 100);
    }, runId);

    // Sink flushes on a 10 s interval; poll the table rather than sleep-and-pray.
    await expect
      .poll(() => Number(sql(`select count(distinct message) from client_errors where message like '${like}'`)), {
        timeout: 30_000, intervals: [2_000],
      })
      .toBe(3);

    // Dedupe: 100 identical throws → ONE row carrying the count.
    const loopRow = sql(
      `select count(*) || '|' || max(count) from client_errors where message like '%[${runId}] repeated loop error%'`
    );
    expect(loopRow).toBe('1|100');

    // Enrichment present on every row: route, version, browser, stack.
    const bare = sql(
      `select count(*) from client_errors where message like '${like}' and (route is null or app_version is null or browser is null or stack is null)`
    );
    expect(Number(bare)).toBe(0);
  });
});
