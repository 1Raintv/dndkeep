// Unit tests for elapseCampaignBuffDurations' sweep behavior — the
// control flow rewritten in the v2.637 N+1 fix (concurrent table sweeps,
// parallel row writes). The client is injected as a parameter, so a
// chainable fake exercises the real read/decide/write logic end to end.
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { elapseCampaignBuffDurations } from './buffDuration';

type Row = { id: string; active_buffs: unknown };

/** Chainable fake covering exactly the surface the sweep uses:
 *  .from(t).select().eq() → rows, and .from(t).update(v).eq(id) → record. */
function fakeClient(data: Record<string, Row[]>, opts?: {
  failSelect?: string[]; failUpdateIds?: string[];
}) {
  const updates: Array<{ table: string; id: string; value: unknown }> = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq: async () =>
              opts?.failSelect?.includes(table)
                ? { data: null, error: new Error(`${table} read boom`) }
                : { data: data[table] ?? [], error: null },
          };
        },
        update(value: Record<string, unknown>) {
          return {
            eq: async (_col: string, id: string) => {
              if (opts?.failUpdateIds?.includes(id)) {
                return { error: { message: `${id} write boom` } };
              }
              updates.push({ table, id, value: value.active_buffs });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, updates };
}

const buff = (duration?: number) => ({ id: 'b', name: 'Bless', ...(duration !== undefined ? { duration } : {}) });

describe('elapseCampaignBuffDurations', () => {
  it('writes only rows whose buffs actually changed', async () => {
    const { client, updates } = fakeClient({
      characters: [
        { id: 'c1', active_buffs: [buff(5)] },   // decrements → write
        { id: 'c2', active_buffs: [buff()] },    // rider, no duration → skip
        { id: 'c3', active_buffs: [] },          // empty → skip
        { id: 'c4', active_buffs: [buff(-1)] },  // indefinite → skip
      ],
      combatants: [{ id: 'm1', active_buffs: [buff(1)] }], // expires → write
      homebrew_monsters: [],
    });
    const { errors } = await elapseCampaignBuffDurations(client, 'camp', 1);
    expect(errors).toEqual([]);
    expect(updates.map(u => `${u.table}:${u.id}`).sort()).toEqual(['characters:c1', 'combatants:m1']);
  });

  it('drops expired buffs from the written array', async () => {
    const { client, updates } = fakeClient({
      characters: [{ id: 'c1', active_buffs: [buff(2), buff(10)] }],
      combatants: [], homebrew_monsters: [],
    });
    await elapseCampaignBuffDurations(client, 'camp', 3);
    expect(updates).toHaveLength(1);
    // duration 2 expired (dropped); duration 10 → 7 survives.
    expect(updates[0].value).toEqual([expect.objectContaining({ duration: 7 })]);
  });

  it('collects a per-table error without blocking the other tables', async () => {
    const { client, updates } = fakeClient({
      characters: [{ id: 'c1', active_buffs: [buff(5)] }],
      combatants: [{ id: 'm1', active_buffs: [buff(5)] }],
      homebrew_monsters: [],
    }, { failSelect: ['characters'] });
    const { errors } = await elapseCampaignBuffDurations(client, 'camp', 1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('characters');
    // combatants sweep still completed despite the characters failure.
    expect(updates.map(u => u.table)).toEqual(['combatants']);
  });

  it('collects per-row write errors and keeps writing the rest', async () => {
    const { client, updates } = fakeClient({
      characters: [
        { id: 'c1', active_buffs: [buff(5)] },
        { id: 'c2', active_buffs: [buff(5)] },
      ],
      combatants: [], homebrew_monsters: [],
    }, { failUpdateIds: ['c1'] });
    const { errors } = await elapseCampaignBuffDurations(client, 'camp', 1);
    expect(errors).toEqual(['characters[c1]: c1 write boom']);
    expect(updates.map(u => u.id)).toEqual(['c2']);
  });

  it('no-ops on zero ticks or missing campaign id', async () => {
    const { client, updates } = fakeClient({
      characters: [{ id: 'c1', active_buffs: [buff(5)] }],
      combatants: [], homebrew_monsters: [],
    });
    expect((await elapseCampaignBuffDurations(client, 'camp', 0)).errors).toEqual([]);
    expect((await elapseCampaignBuffDurations(client, '', 3)).errors).toEqual([]);
    expect(updates).toHaveLength(0);
  });
});
