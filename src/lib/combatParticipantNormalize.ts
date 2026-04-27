// v2.315.0 — Combat Phase 3 pt 7: combat_participants → combatants
// read normalization helper.
//
// During the dual-write phase (v2.311 onwards), HP/conditions/buffs/
// death-save state lives on BOTH combat_participants and combatants,
// kept in sync by the cp_dual_write_to_combatant trigger. Reading
// from combatants is the architecturally-correct source — it
// resolves the "two participants for one combatant" divergence
// (multi-encounter creatures share state). Writes still target
// combat_participants (legacy path); the trigger mirrors them.
//
// To keep call-site churn small, this helper:
//   1. Exposes the JOIN clause that every SELECT against
//      combat_participants should add to read combatant data.
//   2. Provides a normalize() that flattens the JOINed combatants
//      object back onto the row's own keys, so downstream code that
//      reads `row.current_hp` keeps working unchanged.
//
// When v2.316 drops the legacy columns from combat_participants,
// the JOIN remains correct (the column moves entirely to combatants)
// and the `?? row.X` fallback in normalize becomes unreachable but
// harmless.

import type { Json } from '../types/supabase';

/** Append this fragment to any combat_participants .select() that
 *  needs to read HP / conditions / buffs / death-save state. The
 *  resulting row will have a `combatants` property populated by
 *  Supabase's PostgREST FK join. */
export const JOINED_COMBATANT_FIELDS =
  'combatants:combatant_id ( current_hp, max_hp, temp_hp, ' +
  'active_conditions, condition_sources, active_buffs, ' +
  'exhaustion_level, death_save_successes, death_save_failures, ' +
  'is_stable, is_dead )';

interface JoinedCombatant {
  current_hp?: number | null;
  max_hp?: number | null;
  temp_hp?: number | null;
  active_conditions?: string[] | null;
  condition_sources?: Json | null;
  active_buffs?: Json | null;
  exhaustion_level?: number | null;
  death_save_successes?: number | null;
  death_save_failures?: number | null;
  is_stable?: boolean | null;
  is_dead?: boolean | null;
}

interface RowWithCombatant {
  combatants?: JoinedCombatant | null;
  current_hp?: number | null;
  max_hp?: number | null;
  temp_hp?: number | null;
  active_conditions?: string[] | null;
  condition_sources?: Json | null;
  active_buffs?: Json | null;
  exhaustion_level?: number | null;
  death_save_successes?: number | null;
  death_save_failures?: number | null;
  is_stable?: boolean | null;
  is_dead?: boolean | null;
  [key: string]: unknown;
}

/** Flatten the JOINed combatants object onto the participant row's
 *  own keys. Combatant values take precedence; the participant's
 *  legacy column values are the fallback for rows that somehow
 *  lack a combatant_id (shouldn't happen post-v2.315 BEFORE INSERT
 *  trigger, but defensively handled).
 *
 *  Returns a NEW object — does not mutate input. The original
 *  `combatants` property is preserved on the result for callers
 *  that want to inspect it. */
export function normalizeParticipantRow<T extends RowWithCombatant>(row: T): T {
  if (!row.combatants) return row;
  const cb = row.combatants;
  return {
    ...row,
    current_hp:           cb.current_hp           ?? row.current_hp,
    max_hp:               cb.max_hp               ?? row.max_hp,
    temp_hp:              cb.temp_hp              ?? row.temp_hp,
    active_conditions:    cb.active_conditions    ?? row.active_conditions,
    condition_sources:    cb.condition_sources    ?? row.condition_sources,
    active_buffs:         cb.active_buffs         ?? row.active_buffs,
    exhaustion_level:     cb.exhaustion_level     ?? row.exhaustion_level,
    death_save_successes: cb.death_save_successes ?? row.death_save_successes,
    death_save_failures:  cb.death_save_failures  ?? row.death_save_failures,
    is_stable:            cb.is_stable            ?? row.is_stable,
    is_dead:              cb.is_dead              ?? row.is_dead,
  };
}
