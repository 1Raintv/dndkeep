/**
 * combatStore pins (audit 4.6 slice 2): identity-preserving reconciliation
 * and silent background refreshes — the properties that make granular
 * selectors and React.memo actually skip no-op realtime ticks.
 * Unit rule: no database — supabase is fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCombatStore, reconcileById, reconcileValue } from './combatStore';

const fixtures: { encounter: unknown; participants: unknown[] } = { encounter: null, participants: [] };

vi.mock('../supabase', () => {
  const makeChain = () => {
    const self: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) self[m] = () => self;
    self.maybeSingle = async () => ({ data: fixtures.encounter });
    self.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: JSON.parse(JSON.stringify(fixtures.participants)) }).then(resolve);
    return self;
  };
  return { supabase: { from: () => makeChain() } };
});

const enc = () => ({ id: 'e1', status: 'active', current_turn_index: 0, campaign_id: 'c1' });
const rowA = () => ({ id: 'pa', name: 'Aria', turn_order: 0, combatant_id: 'cb1', combatants: { current_hp: 9, max_hp: 12, is_dead: false } });
const rowB = () => ({ id: 'pb', name: 'Borin', turn_order: 1, combatant_id: 'cb2', combatants: { current_hp: 3, max_hp: 15, is_dead: false } });

beforeEach(() => { fixtures.encounter = null; fixtures.participants = []; });

describe('reconcile helpers', () => {
  it('reconcileValue keeps the previous reference for deep-equal values', () => {
    const prev = { a: 1 };
    expect(reconcileValue(prev, { a: 1 })).toBe(prev);
    expect(reconcileValue(prev, { a: 2 })).toEqual({ a: 2 });
  });

  it('reconcileById reuses unchanged rows and the whole array when nothing changed', () => {
    const a = rowA(), b = rowB();
    const prev = [a, b];
    expect(reconcileById(prev, [rowA(), rowB()])).toBe(prev); // identical → same array
    const changed = reconcileById(prev, [rowA(), { ...rowB(), combatants: { current_hp: 1, max_hp: 15, is_dead: false } }]);
    expect(changed).not.toBe(prev);
    expect(changed[0]).toBe(a);          // untouched row keeps its identity
    expect(changed[1]).not.toBe(b);      // changed row gets the new object
  });
});

describe('combatStore load', () => {
  it('no-op refresh preserves encounter AND participants references', async () => {
    fixtures.encounter = enc();
    fixtures.participants = [rowA(), rowB()];
    const store = createCombatStore('c1');
    await store.getState().load();
    const first = store.getState();
    await store.getState().load();       // same DB payload
    const second = store.getState();
    expect(second.encounter).toBe(first.encounter);
    expect(second.participants).toBe(first.participants);
  });

  it('a single HP change swaps only that row', async () => {
    fixtures.encounter = enc();
    fixtures.participants = [rowA(), rowB()];
    const store = createCombatStore('c1');
    await store.getState().load();
    const first = store.getState().participants;
    (fixtures.participants[1] as ReturnType<typeof rowB>).combatants.current_hp = 1;
    await store.getState().load();
    const second = store.getState().participants;
    expect(second).not.toBe(first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
    expect((second[1] as { current_hp?: number }).current_hp).toBe(1);
  });

  it('loading flips only on the FIRST load; refreshes are silent', async () => {
    fixtures.encounter = enc();
    fixtures.participants = [rowA()];
    const store = createCombatStore('c1');
    const loadingSeen: boolean[] = [];
    store.subscribe(s => loadingSeen.push(s.loading));
    await store.getState().load();
    expect(store.getState().loading).toBe(false);
    const flips = loadingSeen.length;
    await store.getState().load();       // background refresh
    // no additional loading:true observed after the first load completed
    expect(loadingSeen.slice(flips)).not.toContain(true);
  });
});
