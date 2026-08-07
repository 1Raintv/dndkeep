/**
 * log.ts — v2.640 (audit 2.8): the app's logging facade.
 *
 * Serilog-shaped: call sites talk ONLY to this facade; where events go
 * is a pluggable sink. Swapping/adding a provider later (Sentry etc.)
 * means writing a new LogSink and attaching it — no call site changes.
 *
 * Rules that keep that promise:
 *  - STRUCTURED events: log.error('save failed', err, { characterId }) —
 *    never bake context into the message string (kills grouping later).
 *  - This module stays EAGER-LIGHT (it's in the entry chunk): no imports
 *    beyond version.ts. Heavy sinks load lazily and attach at runtime
 *    (see main.tsx + logSinkSupabase.ts).
 */
import { APP_VERSION } from '../version';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'off';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, off: Infinity };

/**
 * Verbosity knobs (v2.640, Kyle): per-sink levels are configurable so
 * console noise and DB write volume can be turned down (or 'off')
 * without a code change. Resolution order:
 *   1. localStorage `dndkeep:log:<sink>`  — per-browser override, live
 *      (set in DevTools: localStorage.setItem('dndkeep:log:telemetry','off'))
 *   2. VITE_LOG_<SINK>_LEVEL env var      — per-build default
 *   3. the hardcoded fallback
 */
export function configuredLevel(sinkName: string, envValue: unknown, fallback: LogLevel): LogLevel {
  // Own-property check, not `in`: localStorage junk like 'toString' would pass
  // an `in` check via the prototype chain and yield NaN ranks downstream.
  // (hasOwnProperty.call, not Object.hasOwn — tsconfig lib predates ES2022.)
  const valid = (v: unknown): v is LogLevel =>
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(LEVEL_RANK, v);
  try {
    const ls = localStorage.getItem(`dndkeep:log:${sinkName}`);
    if (valid(ls)) return ls;
  } catch { /* storage can throw (Safari private mode etc.) — fall through */ }
  if (valid(envValue)) return envValue;
  return fallback;
}

export interface LogEvent {
  level: LogLevel;
  message: string;
  /** Normalized from the raw thrown value; undefined for plain messages. */
  error?: { name: string; message: string; stack?: string };
  context?: Record<string, unknown>;
  ts: string;          // ISO
  version: string;     // APP_VERSION at emit time
  route: string;       // location.pathname+hash at emit time
}

export interface LogSink {
  minLevel: LogLevel;
  handle(e: LogEvent): void;
}

const sinks: LogSink[] = [];

/** Attach a sink; returns a detach function (used by tests and HMR). */
export function attachSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

/** Anything can be thrown in JS — normalize to a plain shape sinks can ship. */
export function normalizeError(raw: unknown): LogEvent['error'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (raw instanceof Error) return { name: raw.name, message: raw.message, stack: raw.stack };
  return { name: 'NonError', message: typeof raw === 'string' ? raw : safeStringify(raw) };
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
}

function emit(level: LogLevel, message: string, rawError?: unknown, context?: Record<string, unknown>) {
  const e: LogEvent = {
    level, message,
    error: normalizeError(rawError),
    context,
    ts: new Date().toISOString(),
    version: APP_VERSION,
    route: typeof location !== 'undefined' ? location.pathname + location.hash : '',
  };
  for (const s of sinks) {
    if (LEVEL_RANK[level] >= LEVEL_RANK[s.minLevel]) {
      try { s.handle(e); } catch { /* a broken sink must never break the app */ }
    }
  }
}

export const log = {
  debug: (msg: string, context?: Record<string, unknown>) => emit('debug', msg, undefined, context),
  info:  (msg: string, context?: Record<string, unknown>) => emit('info', msg, undefined, context),
  warn:  (msg: string, error?: unknown, context?: Record<string, unknown>) => emit('warn', msg, error, context),
  error: (msg: string, error?: unknown, context?: Record<string, unknown>) => emit('error', msg, error, context),
};

/**
 * Default console sink — keeps DevTools behavior alive everywhere.
 * debug level is visible in dev only; prod console starts at info.
 */
export function consoleSink(minLevel: LogLevel): LogSink {
  return {
    minLevel,
    handle(e) {
      // eslint-disable-next-line no-console
      const fn = e.level === 'error' ? console.error : e.level === 'warn' ? console.warn : console.log;
      fn(`[${e.level}] ${e.message}`, ...(e.error ? [e.error] : []), ...(e.context ? [e.context] : []));
    },
  };
}

/**
 * Global capture — the two places errors escape React entirely.
 * unhandledrejection matters most here: it's where un-awaited Supabase
 * failures go to die. Call once from main.tsx.
 */
export function installGlobalErrorHooks(): void {
  window.addEventListener('error', (ev) => {
    log.error('uncaught error', ev.error ?? ev.message, { src: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    log.error('unhandled promise rejection', ev.reason, { src: 'unhandledrejection' });
  });
}
