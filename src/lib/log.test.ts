// @vitest-environment jsdom
/**
 * Facade tests (audit 2.8). The contract that makes providers swappable:
 * call sites emit structured events; sinks receive them filtered by
 * minLevel; a broken sink never breaks the app.
 */
import { describe, it, expect } from 'vitest';
import { attachSink, configuredLevel, log, normalizeError, installGlobalErrorHooks, type LogEvent } from './log';

function collect(minLevel: 'debug' | 'error' = 'debug') {
  const events: LogEvent[] = [];
  const detach = attachSink({ minLevel, handle: e => events.push(e) });
  return { events, detach };
}

describe('log facade', () => {
  it('emits structured events with version/route/ts enrichment', () => {
    const { events, detach } = collect();
    log.error('save failed', new Error('boom'), { characterId: 'c1' });
    detach();
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.message).toBe('save failed');           // context NOT baked into string
    expect(e.context).toEqual({ characterId: 'c1' });
    expect(e.error?.message).toBe('boom');
    expect(e.version).toMatch(/^\d+\./);
    expect(typeof e.route).toBe('string');
    expect(e.ts).toMatch(/^\d{4}-/);
  });

  it('respects sink minLevel', () => {
    const { events, detach } = collect('error');
    log.debug('noise');
    log.info('noise');
    log.warn('noise');
    log.error('signal');
    detach();
    expect(events.map(e => e.message)).toEqual(['signal']);
  });

  it('a throwing sink never breaks the caller or other sinks', () => {
    const bad = attachSink({ minLevel: 'debug', handle: () => { throw new Error('sink died'); } });
    const { events, detach } = collect();
    expect(() => log.error('still works')).not.toThrow();
    bad(); detach();
    expect(events).toHaveLength(1);
  });

  it('normalizes non-Error throwables (strings, objects)', () => {
    expect(normalizeError('plain string')?.message).toBe('plain string');
    expect(normalizeError({ code: 42 })?.message).toBe('{"code":42}');
    expect(normalizeError(undefined)).toBeUndefined();
  });

  it("minLevel 'off' silences a sink completely", () => {
    const events: LogEvent[] = [];
    const detach = attachSink({ minLevel: 'off', handle: e => events.push(e) });
    log.error('even errors stay out');
    detach();
    expect(events).toHaveLength(0);
  });

  it('configuredLevel: localStorage override > env > fallback; junk ignored', () => {
    localStorage.removeItem('dndkeep:log:t');
    expect(configuredLevel('t', undefined, 'error')).toBe('error');       // fallback
    expect(configuredLevel('t', 'warn', 'error')).toBe('warn');           // env
    expect(configuredLevel('t', 'loud', 'error')).toBe('error');          // junk env ignored
    localStorage.setItem('dndkeep:log:t', 'off');
    expect(configuredLevel('t', 'warn', 'error')).toBe('off');            // localStorage wins
    localStorage.setItem('dndkeep:log:t', 'nonsense');
    expect(configuredLevel('t', 'warn', 'error')).toBe('warn');           // junk ls ignored
    localStorage.removeItem('dndkeep:log:t');
  });

  it('global hooks capture unhandled rejections and uncaught errors', () => {
    installGlobalErrorHooks();
    const { events, detach } = collect('error');
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('uncaught!') }));
    // PromiseRejectionEvent isn't constructable in jsdom — synthesize it.
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    ev.reason = new Error('rejected!');
    window.dispatchEvent(ev);
    detach();
    expect(events.map(e => e.error?.message)).toEqual(['uncaught!', 'rejected!']);
    expect(events.map(e => e.context?.src)).toEqual(['window.onerror', 'unhandledrejection']);
  });
});
