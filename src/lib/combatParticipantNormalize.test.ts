/**
 * Characterization pins for the combat_participants → combatants read
 * normalization (audit 4.6 prep). The state-management move must not
 * change how joined combatant fields flatten onto participant rows —
 * every useCombat consumer reads HP/conditions through this.
 */
import { describe, it, expect } from 'vitest';
import { normalizeParticipantRow } from './combatParticipantNormalize';

describe('normalizeParticipantRow', () => {
  it('passes rows without a join through untouched (same reference)', () => {
    const row = { id: 'p1', name: 'Gob', current_hp: 7 };
    expect(normalizeParticipantRow(row)).toBe(row);
  });

  it('flattens joined combatant fields over the row copies', () => {
    const row = {
      id: 'p1', name: 'Gob', turn_order: 2,
      // post-v2.321: legacy columns gone from participant rows — declared
      // undefined here so TS knows the flattened keys on the result type.
      current_hp: undefined, max_hp: undefined, temp_hp: undefined,
      active_conditions: undefined, death_save_failures: undefined,
      combatants: {
        current_hp: 4, max_hp: 11, temp_hp: 2,
        active_conditions: ['prone'], is_dead: false, is_stable: null,
        death_save_successes: 0, death_save_failures: 1,
        exhaustion_level: 0, active_buffs: null, condition_sources: null,
      },
    };
    const out = normalizeParticipantRow(row);
    expect(out).not.toBe(row);                       // new object, no mutation
    expect(row.current_hp).toBeUndefined();          // input untouched
    expect(out.current_hp).toBe(4);
    expect(out.max_hp).toBe(11);
    expect(out.temp_hp).toBe(2);
    expect(out.active_conditions).toEqual(['prone']);
    expect(out.death_save_failures).toBe(1);
    expect(out.turn_order).toBe(2);                  // non-mirrored fields survive
    expect(out.combatants).toBeDefined();            // join object preserved
  });

  it('join is the SOLE source — null joined values overwrite row values', () => {
    // Post-v2.321 there are no ?? fallbacks: a null combatant field must
    // land as null even if a stale row value exists (legacy payloads).
    const out = normalizeParticipantRow({
      id: 'p1', name: 'Gob', current_hp: 99,
      combatants: { current_hp: null, max_hp: null },
    });
    expect(out.current_hp).toBeNull();
  });
});
