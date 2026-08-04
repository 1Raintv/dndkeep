/**
 * logSinkSupabase.ts — v2.640 (audit 2.8): ships error-level LogEvents to
 * the client_errors table. Loaded LAZILY from main.tsx (dynamic import
 * after first paint) — never add this to the eager graph.
 *
 * Behavior contract (tested in logSinkSupabase.test.ts):
 *  - Batches: events buffer and flush on an interval + pagehide, not per event.
 *  - Dedupes: same message+stack within a session folds into one row with
 *    a count — a render loop becomes 1 row, not 10,000.
 *  - Session cap: at most MAX_SESSION_EVENTS distinct rows per page load.
 *  - Missing table (prod until its migration is applied — 2026-08-04
 *    owner-queue): the insert 404s; we go dormant for RETRY_AFTER_MS and
 *    then try again. NEVER throws, NEVER spams.
 */
import { attachSink, type LogEvent, type LogSink } from './log';

type InsertRows = (rows: Record<string, unknown>[]) => Promise<{ error: { code?: string; message: string } | null }>;

// client_errors is not yet in the generated Database types (they're
// regenerated from prod — audit 3.5, owner queue). Single cast boundary.
const defaultInsert: InsertRows = async (rows) => {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from as any)('client_errors')
    .insert(rows.map(r => ({ ...r, user_id: userId })));
  return { error };
};

const FLUSH_MS = 10_000;
const RETRY_AFTER_MS = 5 * 60_000;
const MAX_SESSION_EVENTS = 50;
const MSG_MAX = 500, STACK_MAX = 4_000;

export function supabaseSink(insert: InsertRows = defaultInsert, flushMs = FLUSH_MS, minLevel: LogSink['minLevel'] = 'error'): LogSink & { flush(): Promise<void> } {
  interface Row { payload: Record<string, unknown>; count: number; dirty: boolean }
  const rows = new Map<string, Row>();   // dedupe key -> row
  let dormantUntil = 0;                  // epoch ms; >now means table missing / backoff
  let capped = false;

  async function flush(): Promise<void> {
    if (Date.now() < dormantUntil) return;
    const dirty = [...rows.values()].filter(r => r.dirty);
    if (!dirty.length) return;
    dirty.forEach(r => { r.dirty = false; }); // optimistic; re-marked on failure
    const { error } = await insert(dirty.map(r => ({ ...r.payload, count: r.count })));
    if (error) {
      // PGRST205 = table not in PostgREST schema cache (migration not applied
      // there yet); 42P01 = relation does not exist. Both mean "not an outage,
      // just early" — go dormant and retry later. Anything else: same backoff,
      // telemetry must never become its own error source.
      dirty.forEach(r => { r.dirty = true; });
      dormantUntil = Date.now() + RETRY_AFTER_MS;
    }
  }

  const timer = setInterval(() => { void flush(); }, flushMs);
  // Vite HMR replaces modules but old intervals survive — clear ours.
  if (import.meta.hot) import.meta.hot.dispose(() => clearInterval(timer));
  // Last-gasp flush when the tab hides/closes (best effort; may not complete).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush();
    });
  }

  return {
    minLevel,
    flush,
    handle(e: LogEvent) {
      const stack = e.error?.stack?.slice(0, STACK_MAX);
      const key = `${e.message}|${stack?.split('\n')[1] ?? ''}`;
      const existing = rows.get(key);
      if (existing) { existing.count++; existing.dirty = true; return; }
      if (rows.size >= MAX_SESSION_EVENTS) {
        if (!capped) { capped = true; /* one silent drop marker, no spam */ }
        return;
      }
      rows.set(key, {
        count: 1, dirty: true,
        payload: {
          occurred_at: e.ts,
          app_version: e.version,
          level: e.level,
          message: (e.error ? `${e.message}: ${e.error.message}` : e.message).slice(0, MSG_MAX),
          stack,
          route: e.route,
          browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
          context: e.context ?? null,
        },
      });
    },
  };
}

/** Wire-up used by main.tsx: attach the sink at the configured verbosity. */
export function attachSupabaseSink(minLevel: LogSink['minLevel'] = 'error'): void {
  attachSink(supabaseSink(undefined, undefined, minLevel));
}
