// v2.350.0 — Participant-type compat layer.
//
// In v2.350 we collapsed combat_participants.participant_type from
// ('character' | 'npc' | 'monster') to ('character' | 'creature'),
// merging NPCs and monsters into a single creature concept under
// homebrew_monsters. The migration changed every existing 'monster'
// row to 'creature' and added a CHECK constraint enforcing the new
// enum.
//
// Frontend code that compared `=== 'monster'` or `=== 'npc'` would
// silently fail to match the new value. This helper is the single
// source of truth — call it instead of literal-string comparisons.
//
// ADDITIONALLY accepts 'monster' and 'npc' as aliases for 'creature'
// to handle any in-flight server data, realtime payloads sent before
// a peer reloaded, or tests that haven't been updated yet. Once
// v2.351+ has been live for a while and we're confident no stale
// data is in motion, the legacy strings can be dropped.

/** Type union covering both the new and legacy participant_type values. */
export type ParticipantType = 'character' | 'creature' | 'monster' | 'npc';

/** True if the value represents a non-character creature (any of:
 *  'creature', 'monster', 'npc'). False for 'character' and any
 *  other unexpected value. */
export function isCreatureParticipantType(t: string | null | undefined): boolean {
  return t === 'creature' || t === 'monster' || t === 'npc';
}

/** True if the value represents a character (player). */
export function isCharacterParticipantType(t: string | null | undefined): boolean {
  return t === 'character';
}

/** Normalize legacy values to the canonical 'creature' string. Use
 *  whenever WRITING to a column that's now CHECK-constrained to
 *  ('character'|'creature'). The DB will reject 'monster' or 'npc'
 *  going forward.
 *
 *  Pass-through for 'character'. Anything else collapses to
 *  'creature' as the safe default. */
export function normalizeParticipantType(t: string | null | undefined): 'character' | 'creature' {
  if (t === 'character') return 'character';
  return 'creature';
}
