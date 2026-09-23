// Unit tests for the v2.746 identity changes in combatEncounter.ts:
//   - seedToRow is the ONE seed → combat_participants row builder and
//     writes combatant_id explicitly (per-instance participants);
//   - startEncounter retries once, one-per-definition, when a database
//     still carrying the pre-v2.746 UNIQUE rejects the batch with 23505;
//   - endEncounter's character carry-over writes the characters table's
//     REAL column names (death_saves_*), which it never did before.
// The module imports supabase at module scope — mocked with a recording
// proxy so nothing can reach a database (unit tests never touch prod).
import { describe, expect, it, vi, beforeEach } from 'vitest';

type Op = { op: string; args: unknown[] };
type Call = { table: string; ops: Op[] };
type Resp = { data?: unknown; error?: unknown; count?: number | null };

const h = vi.hoisted(() => {
  const state = {
    calls: [] as Call[],
    respond: ((_c: Call) => ({ data: [], error: null })) as (c: Call) => Resp,
  };
  function builder(call: Call): unknown {
    const b: unknown = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve().then(() => state.respond(call)).then(res, rej);
        }
        return (...args: unknown[]) => { call.ops.push({ op: String(prop), args }); return b; };
      },
    });
    return b;
  }
  return {
    state,
    supabase: {
      from(table: string) { const c: Call = { table, ops: [] }; state.calls.push(c); return builder(c); },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});

vi.mock('./supabase', () => ({ supabase: h.supabase }));
vi.mock('./combatEvents', () => ({
  emitCombatEvent: vi.fn(async () => null),
  emitCombatEventChain: vi.fn(async () => null),
  newChainId: () => 'chain',
}));
vi.mock('./api/checked', () => ({ checkedWrite: vi.fn(async () => ({ error: null })) }));

import { seedToRow, firstPerDefinition, startEncounter, endEncounter, type SeedSource } from './combatEncounter';

const seed = (over: Partial<SeedSource>): SeedSource => ({
  type: 'creature', entityId: 'goblin-def', name: 'Goblin Scout',
  ac: 13, hp: 7, maxHp: 7, dexMod: 2, initiativeBonus: 0, ...over,
});
const ctx = { encounterId: 'enc', campaignId: 'camp', initiativeMode: 'auto_all' as const, turnOrder: 0 };
const opOf = (c: Call, name: string) => c.ops.find(o => o.op === name);

beforeEach(() => {
  h.state.calls.length = 0;
  h.state.respond = () => ({ data: [], error: null });
});

describe('seedToRow', () => {
  it('writes combatant_id when the seed carries one and null otherwise', () => {
    expect(seedToRow(seed({ combatantId: 'cb-1' }), ctx).combatant_id).toBe('cb-1');
    expect(seedToRow(seed({}), ctx).combatant_id).toBeNull();
    expect(seedToRow(seed({ combatantId: null }), ctx).combatant_id).toBeNull();
  });

  it('keeps entity_id as the definition id and normalizes legacy types', () => {
    const row = seedToRow(seed({ type: 'monster', attacksPerAction: 2 }), { ...ctx, turnOrder: 999 });
    expect(row.entity_id).toBe('goblin-def');
    expect(row.participant_type).toBe('creature');
    expect(row.turn_order).toBe(999);
    expect(row.attacks_per_action).toBe(2);
    expect(row.attacks_remaining).toBe(2);
  });

  it('leaves a hidden monster unrolled unless roll_at_start', () => {
    expect(seedToRow(seed({ hiddenFromPlayers: true }), ctx).initiative).toBeNull();
    expect(seedToRow(seed({ hiddenFromPlayers: true }), { ...ctx, hiddenMonsterRevealMode: 'roll_at_start' }).initiative)
      .toBeTypeOf('number');
  });
});

describe('firstPerDefinition', () => {
  it('keeps the first seed per (type, entityId) with its combatantId', () => {
    const out = firstPerDefinition([
      seed({ combatantId: 'a', name: 'Goblin A' }),
      seed({ combatantId: 'b', name: 'Goblin B' }),
      seed({ type: 'character', entityId: 'pc', combatantId: 'c' }),
    ]);
    expect(out.map(s => s.combatantId)).toEqual(['a', 'c']);
  });
});

describe('startEncounter 23505 fallback', () => {
  const encounterRow = { id: 'enc', campaign_id: 'camp', status: 'active' };

  it('retries ONCE with one-per-definition rows when the legacy UNIQUE rejects the batch', async () => {
    let participantInserts = 0;
    h.state.respond = c => {
      if (c.table === 'combat_encounters') return { data: encounterRow, error: null };
      if (c.table === 'combat_participants' && opOf(c, 'insert')) {
        participantInserts += 1;
        if (participantInserts === 1) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        const rows = (opOf(c, 'insert')!.args[0] as Array<Record<string, unknown>>);
        return { data: rows.map((r, i) => ({ ...r, id: `p${i}` })), error: null };
      }
      return { data: [], error: null };
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await startEncounter({
      campaignId: 'camp', initiativeMode: 'auto_all',
      seeds: [seed({ combatantId: 'a' }), seed({ combatantId: 'b' }), seed({ combatantId: 'c' })],
    });
    warn.mockRestore();
    expect(participantInserts).toBe(2);
    const inserts = h.state.calls.filter(c => c.table === 'combat_participants' && opOf(c, 'insert'));
    expect((opOf(inserts[0], 'insert')!.args[0] as unknown[]).length).toBe(3);
    const retryRows = opOf(inserts[1], 'insert')!.args[0] as Array<{ combatant_id: string | null }>;
    expect(retryRows.length).toBe(1);
    expect(retryRows[0].combatant_id).toBe('a');
    expect(res?.participants.length).toBe(1);
  });

  it('does not retry on any other error', async () => {
    let participantInserts = 0;
    h.state.respond = c => {
      if (c.table === 'combat_encounters') return { data: encounterRow, error: null };
      if (c.table === 'combat_participants' && opOf(c, 'insert')) {
        participantInserts += 1;
        return { data: null, error: { code: '42501', message: 'permission denied' } };
      }
      return { data: [], error: null };
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await startEncounter({ campaignId: 'camp', initiativeMode: 'auto_all', seeds: [seed({ combatantId: 'a' })] });
    err.mockRestore();
    expect(participantInserts).toBe(1);
    expect(res?.participants).toEqual([]);
  });
});

describe('endEncounter character carry-over', () => {
  it('writes death_saves_successes / death_saves_failures (the characters columns), never the singular', async () => {
    h.state.respond = c => {
      if (c.table === 'combat_encounters' && opOf(c, 'select')) {
        return { data: { campaign_id: 'camp', started_at: null, round_number: 3 }, error: null };
      }
      if (c.table === 'combat_participants') {
        return { data: [{ combatant_id: 'cb1', participant_type: 'character', entity_id: 'char1' }], error: null };
      }
      if (c.table === 'combatants') {
        return { data: [{ id: 'cb1', current_hp: 4, temp_hp: null, death_save_successes: 1, death_save_failures: 2, is_stable: false, is_dead: false, active_conditions: ['Prone'], active_buffs: [] }], error: null };
      }
      return { data: [], error: null };
    };
    const res = await endEncounter('enc');
    expect(res).toEqual({ ok: true });
    const charUpdate = h.state.calls.find(c => c.table === 'characters' && opOf(c, 'update'));
    expect(charUpdate).toBeTruthy();
    const payload = opOf(charUpdate!, 'update')!.args[0] as Record<string, unknown>;
    expect(payload.death_saves_successes).toBe(1);
    expect(payload.death_saves_failures).toBe(2);
    // v2.746 — characters has no is_stable / is_dead column; sending either 400s the whole row.
    expect(payload).not.toHaveProperty('is_stable');
    expect(payload).not.toHaveProperty('is_dead');
    expect(payload).not.toHaveProperty('death_save_successes');
    expect(payload).not.toHaveProperty('death_save_failures');
    expect(payload.current_hp).toBe(4);
    expect(payload.active_conditions).toEqual(['Prone']);
  });
});
