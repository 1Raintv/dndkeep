// @vitest-environment jsdom
/**
 * Supabase sink contract (audit 2.8). Insert fn is injected — these tests
 * never touch a database (repo unit-test rule) and never import the
 * supabase client (the sink's real insert imports it lazily).
 */
import { describe, it, expect, vi } from 'vitest';
import { supabaseSink } from './logSinkSupabase';
import type { LogEvent } from './log';

const evt = (over: Partial<LogEvent> = {}): LogEvent => ({
  level: 'error', message: 'boom',
  error: { name: 'Error', message: 'boom', stack: 'Error: boom\n  at explode (app.js:1:1)' },
  ts: '2026-08-04T12:00:00.000Z', version: '2.640.0', route: '/campaign', context: undefined,
  ...over,
});

describe('supabaseSink', () => {
  it('batches: nothing sent until flush, then one insert call', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sink = supabaseSink(insert, 1e9);
    sink.handle(evt({ message: 'a' }));
    sink.handle(evt({ message: 'b' }));
    expect(insert).not.toHaveBeenCalled();
    await sink.flush();
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toHaveLength(2);
  });

  it('dedupes same message+stack into one row with a count', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sink = supabaseSink(insert, 1e9);
    for (let i = 0; i < 500; i++) sink.handle(evt()); // render-loop scenario
    await sink.flush();
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(500);
  });

  it('flushes only dirty rows; unchanged rows are not re-sent', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sink = supabaseSink(insert, 1e9);
    sink.handle(evt());
    await sink.flush();
    await sink.flush(); // nothing new
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('missing table → goes dormant instead of throwing or spamming', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: 'PGRST205', message: 'Could not find the table' } });
    const sink = supabaseSink(insert, 1e9);
    sink.handle(evt());
    await expect(sink.flush()).resolves.toBeUndefined(); // never throws
    await sink.flush(); await sink.flush();              // dormant: no further calls
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('caps distinct rows per session', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sink = supabaseSink(insert, 1e9);
    for (let i = 0; i < 100; i++) sink.handle(evt({ message: `distinct ${i}` }));
    await sink.flush();
    expect(insert.mock.calls[0][0].length).toBeLessThanOrEqual(50);
  });

  it('drops known-noise patterns before they cost a row (v2.641)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sink = supabaseSink(insert, 1e9);
    sink.handle(evt({ message: 'unhandled promise rejection', error: { name: 'NavigatorLockAcquireTimeoutError', message: 'Acquiring an exclusive Navigator LockManager lock "lock:sb-127-auth-token" immediately failed' } }));
    sink.handle(evt({ message: 'uncaught error', error: { name: 'Error', message: 'ResizeObserver loop limit exceeded' } }));
    sink.handle(evt({ message: 'uncaught error', error: { name: 'Error', message: 'Script error.' } }));
    sink.handle(evt({ message: 'real bug survives the filter' }));
    await sink.flush();
    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toContain('real bug survives the filter');
  });

  it('truncates oversized messages and stacks', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const sink = supabaseSink(insert, 1e9);
    sink.handle(evt({
      message: 'm'.repeat(10_000),
      error: { name: 'Error', message: 'x', stack: 's'.repeat(100_000) },
    }));
    await sink.flush();
    const row = insert.mock.calls[0][0][0];
    expect((row.message as string).length).toBeLessThanOrEqual(500);
    expect((row.stack as string).length).toBeLessThanOrEqual(4_000);
  });
});
