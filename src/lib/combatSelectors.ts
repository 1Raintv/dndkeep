// v2.645 (audit 4.6 prep): pure combat derivations, carved out of
// CombatContext so the state-management move can swap the CARRIER
// (context → selector store) while the test-pinned semantics stay put.
// Pure module: no React, no supabase — unit-testable by construction.
import type { CombatEncounter, CombatParticipant } from '../types';

/** The current actor is the encounter's turn index applied to the
 *  ALIVE participants sorted by turn_order. Pinned semantics
 *  (combatSelectors.test.ts): dead participants are excluded BEFORE
 *  indexing (so a death shifts who the index lands on — matches how
 *  advanceTurn maintains the index), hidden participants are NOT
 *  excluded, and an out-of-range index yields null, never a wrap. */
export function deriveCurrentActor(
  encounter: Pick<CombatEncounter, 'current_turn_index'> | null,
  participants: CombatParticipant[],
): CombatParticipant | null {
  if (!encounter) return null;
  const visibleOrdered = [...participants]
    .filter(p => !p.is_dead)
    .sort((a, b) => a.turn_order - b.turn_order);
  return visibleOrdered[encounter.current_turn_index] ?? null;
}
