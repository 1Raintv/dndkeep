// v2.506.0 — Movement-gated feature auto-reset.
//
// Called by advanceTurn(encounterId) on the OUTGOING participant (the
// one whose turn just ended), alongside processEndOfTurnConditions.
//
// Concern: some limited-use features recharge not on a rest but when
// the character takes a turn without moving. The canonical example is
// the 2024 Tabaxi trait Feline Agility:
//
//   "When you move on your turn, you can double your speed until the
//    end of your turn. Once you do this, you can't do it again until
//    you move 0 feet on one of your turns."
//
// So: at the end of a character's turn, if they moved 0 ft this turn,
// any movement-gated feature they've exhausted should refresh (its
// feature_uses entry resets to 0 = available).
//
// This reads the OUTGOING participant's movement_used_ft (which
// advanceTurn resets to 0 only for the INCOMING actor, so the
// outgoing value still reflects what they actually moved this turn),
// resolves the participant to its character row, and clears the
// movement-gated feature_uses entries.
//
// Design notes:
//   - Characters only. Monsters/NPCs don't have feature_uses-tracked
//     movement-gated traits in our data model; if that changes, the
//     registry below can be extended and the entity resolution widened.
//   - Idempotent + defensive: any failure logs and returns without
//     blocking turn advance (mirrors processEndOfTurnConditions).
//   - The set of movement-gated feature NAMES is derived from SPECIES
//     data at module load, so adding `recovery: 'movement'` to a new
//     trait automatically enrolls it here — no second edit needed.

import { supabase } from './supabase';
import { SPECIES } from '../data/species';

// Build the set of movement-gated feature names once. Today this is
// just Feline Agility, but deriving it keeps the automation in sync
// with the data: any trait tagged `recovery: 'movement'` enrolls.
const MOVEMENT_GATED_FEATURE_NAMES: string[] = (() => {
  const names = new Set<string>();
  for (const sp of SPECIES) {
    for (const trait of sp.traits as Array<{ name: string; recovery?: string }>) {
      if (trait.recovery === 'movement') names.add(trait.name);
    }
  }
  return [...names];
})();

export interface ResetMovementGatedInput {
  /** The outgoing participant whose turn just ended. */
  participantId: string;
  participantType: 'character' | 'creature' | 'monster' | 'npc';
  /** entity_id from the participant row — the character id when type is 'character'. */
  entityId: string | null;
  /** movement_used_ft for the turn that just ended. */
  movementUsedFt: number;
}

/**
 * Reset movement-gated features for a character who ended their turn
 * having moved 0 ft. No-op for non-characters, for movers, or when
 * there are no movement-gated features exhausted.
 */
export async function resetMovementGatedFeatures(
  input: ResetMovementGatedInput,
): Promise<void> {
  try {
    // Only characters carry these traits, and only a 0-ft turn refreshes.
    if (input.participantType !== 'character') return;
    if (!input.entityId) return;
    if ((input.movementUsedFt ?? 0) > 0) return;
    if (MOVEMENT_GATED_FEATURE_NAMES.length === 0) return;

    // Pull the character's current feature_uses.
    const { data: charRow, error: readErr } = await supabase
      .from('characters')
      .select('feature_uses')
      .eq('id', input.entityId)
      .maybeSingle();
    if (readErr) {
      console.warn('[resetMovementGatedFeatures] character read failed', readErr);
      return;
    }
    if (!charRow) return;

    const featureUses = { ...((charRow.feature_uses as Record<string, number> | null) ?? {}) };

    // Clear only the movement-gated entries that are currently spent.
    // Two key forms exist for the same trait depending on render path:
    //   - bare name ("Feline Agility") — ClassAbilitiesSection's tracker
    //   - "species:"-prefixed ("species:Feline Agility") — the dedicated
    //     SPECIES section block in CharacterSheet/index.tsx
    // We clear both so the exhaustion state is consistent no matter
    // which surface the player toggled it from.
    let changed = false;
    for (const name of MOVEMENT_GATED_FEATURE_NAMES) {
      for (const key of [name, `species:${name}`]) {
        if ((featureUses[key] ?? 0) > 0) {
          featureUses[key] = 0;
          changed = true;
        }
      }
    }
    if (!changed) return; // nothing exhausted — no write needed

    const { error: writeErr } = await supabase
      .from('characters')
      // v2.506.0 — feature_uses is a jsonb column; asJsonb keeps the
      // typed write clean (see src/lib/jsonbCast.ts).
      .update({ feature_uses: featureUses as unknown as never })
      .eq('id', input.entityId);
    if (writeErr) {
      console.warn('[resetMovementGatedFeatures] feature_uses write failed', writeErr);
    }
  } catch (err) {
    // Defensive: never block turn advance on this.
    console.error('[resetMovementGatedFeatures] crashed (non-fatal)', err);
  }
}
