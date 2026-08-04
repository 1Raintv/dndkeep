// @vitest-environment happy-dom
/**
 * checkedWrite contract (audit 3.4): every failed write becomes a
 * structured error-level log event (=> telemetry); successes are silent;
 * throws are contained into the standard {error} shape.
 */
import { describe, it, expect } from 'vitest';
import { attachSink, type LogEvent } from '../log';
import { checkedWrite } from './checked';

function collect() {
  const events: LogEvent[] = [];
  const detach = attachSink({ minLevel: 'error', handle: e => events.push(e) });
  return { events, detach };
}

describe('checkedWrite', () => {
  it('success passes through silently', async () => {
    const { events, detach } = collect();
    const res = await checkedWrite('t.update x', { id: 1 }, Promise.resolve({ error: null, data: [1] }));
    detach();
    expect(res.data).toEqual([1]);
    expect(events).toHaveLength(0);
  });

  it('a returned error is logged with op + context and still returned', async () => {
    const { events, detach } = collect();
    const res = await checkedWrite('combatants.update hp', { combatantId: 'c1' },
      Promise.resolve({ error: { code: '42501', message: 'permission denied' } }));
    detach();
    expect(res.error?.message).toBe('permission denied');
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('db write failed: combatants.update hp');
    expect(events[0].context).toMatchObject({ combatantId: 'c1', code: '42501' });
  });

  it('a THROWN failure is contained into the {error} shape and logged', async () => {
    const { events, detach } = collect();
    const res = await checkedWrite<{ error: { message: string } | null }>(
      't.insert y', {}, Promise.reject(new Error('fetch failed')));
    detach();
    expect(res.error?.message).toBe('fetch failed');
    expect(events).toHaveLength(1);
  });
});
