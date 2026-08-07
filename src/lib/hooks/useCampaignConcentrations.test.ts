// Unit tests for the refcounted shared concentration channel (v2.637,
// audit 6.6). The rules under test are exactly the ones with crash
// history: v2.472 crashed because .on() was called on an
// already-subscribed named channel; the share must therefore create and
// subscribe each campaign's channel EXACTLY once, fan events out in JS,
// and tear down only when the last consumer releases.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Chainable fake channel that records handlers so tests can fire events.
type Handler = () => void;
const created: Array<{ name: string; handlers: Handler[]; subscribed: boolean; removed: boolean }> = [];

vi.mock('../supabase', () => ({
  supabase: {
    channel(name: string) {
      const entry = { name, handlers: [] as Handler[], subscribed: false, removed: false };
      created.push(entry);
      const ch = {
        on(_type: string, _spec: unknown, handler: Handler) {
          if (entry.subscribed) throw new Error('cannot add postgres_changes after subscribe'); // the v2.472 crash
          entry.handlers.push(handler);
          return ch;
        },
        subscribe() { entry.subscribed = true; return ch; },
        __entry: entry,
      };
      return ch;
    },
    removeChannel(ch: { __entry: { removed: boolean } }) { ch.__entry.removed = true; },
  },
}));

import { acquireConcChannel } from './useCampaignConcentrations';

beforeEach(() => { created.length = 0; });

describe('acquireConcChannel', () => {
  it('creates ONE subscribed channel for two consumers of the same campaign', () => {
    const a = vi.fn(); const b = vi.fn();
    const releaseA = acquireConcChannel('camp-1', a);
    const releaseB = acquireConcChannel('camp-1', b);
    expect(created).toHaveLength(1);
    expect(created[0].subscribed).toBe(true);
    releaseA(); releaseB();
  });

  it('fans one realtime event out to every registered listener', () => {
    const a = vi.fn(); const b = vi.fn();
    const releaseA = acquireConcChannel('camp-1', a);
    const releaseB = acquireConcChannel('camp-1', b);
    created[0].handlers.forEach(h => h()); // simulate a postgres_changes event
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    releaseA(); releaseB();
  });

  it('keeps the channel alive until the LAST consumer releases', () => {
    const releaseA = acquireConcChannel('camp-1', vi.fn());
    const releaseB = acquireConcChannel('camp-1', vi.fn());
    releaseA();
    expect(created[0].removed).toBe(false);
    releaseB();
    expect(created[0].removed).toBe(true);
  });

  it('a released listener stops receiving events while others continue', () => {
    const a = vi.fn(); const b = vi.fn();
    const releaseA = acquireConcChannel('camp-1', a);
    const releaseB = acquireConcChannel('camp-1', b);
    releaseA();
    created[0].handlers.forEach(h => h());
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    releaseB();
  });

  it('creates a FRESH channel after full teardown (remount path)', () => {
    const release1 = acquireConcChannel('camp-1', vi.fn());
    release1();
    // Second acquire must build a new channel — .on() before .subscribe()
    // on a fresh object, never re-.on() the removed one (v2.472 crash).
    const release2 = acquireConcChannel('camp-1', vi.fn());
    expect(created).toHaveLength(2);
    expect(created[1].subscribed).toBe(true);
    release2();
  });

  it('separate campaigns get separate channels', () => {
    const r1 = acquireConcChannel('camp-1', vi.fn());
    const r2 = acquireConcChannel('camp-2', vi.fn());
    expect(created.map(c => c.name)).toEqual(['conc-camp-1', 'conc-camp-2']);
    r1(); r2();
  });
});
