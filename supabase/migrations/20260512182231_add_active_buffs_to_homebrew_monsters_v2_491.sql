-- v2.491.0 — Add active_buffs to homebrew_monsters.
--
-- Background:
--   v2.477 added cross-encounter carry-over for characters: when an
--   encounter ends, combatants.active_buffs (and active_conditions,
--   active_immunities) are snapshotted back to the authoritative
--   characters row so the buff persists for display between fights.
--
--   v2.482 extended the same pattern to creature templates for
--   active_immunities only — homebrew_monsters is a TEMPLATE table
--   shared across every spawn, so HP/conditions can't carry back
--   (would corrupt fresh spawns) but campaign-scoped immunity
--   correctly belongs at the template level.
--
--   Buffs sit in the same bucket as immunities for creature
--   templates: a wizard who pre-buffed a hired mercenary creature
--   with Stoneskin reasonably expects "this creature is currently
--   under Stoneskin" to persist on the template between encounters,
--   the same way "this creature is immune to its own dragon's
--   Frightful Presence" persists.
--
--   The current state of the column is missing — homebrew_monsters
--   has no active_buffs JSONB. The matching app build (v2.491)
--   extends endEncounter creature carry-over to write here, and
--   NpcTokenQuickPanel to render the buff list with click-to-remove.
--
-- Scope of this ship (chose Option C in the planning discussion):
--   - DB: add the column (this migration).
--   - App: endEncounter carry-over writes combatants.active_buffs back
--     to homebrew_monsters.active_buffs for participant_type='creature'
--     (mirrors v2.482's immunity path).
--   - App: NpcTokenQuickPanel reads + renders the buff chips with
--     click-to-remove (mirrors v2.482's immunity panel).
--   - App: startEncounter and addParticipantToEncounter call a new
--     seedBuffsFromAuthoritativeTables helper after the participant
--     insert, which fetches characters.active_buffs and
--     homebrew_monsters.active_buffs and UPDATEs combatants.active_buffs.
--     This is the piece that was missing pre-v2.491: the cp_ensure_combatant_link
--     trigger (v2.319) hard-codes combatants.active_buffs to '[]'::jsonb,
--     which dropped carried-over buffs at the start of the next combat.
--     v2.491 leaves the trigger alone and re-seeds at the app layer
--     after the insert — same pattern v2.143 established for the
--     encumbrance sync. Closes the loop for BOTH characters (which
--     had the v2.477 carry-over but no re-seed) and creatures (which
--     had neither before this ship).
--
-- Scope explicitly NOT in this ship:
--   - Decrementing duration on Advance Time. Buff duration ticking
--     is still deferred to players per the original v2.477 design
--     note. If that decision flips later, the carried-over buffs
--     will participate in whatever tick semantics get implemented;
--     no schema change required.

ALTER TABLE public.homebrew_monsters
  ADD COLUMN IF NOT EXISTS active_buffs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.homebrew_monsters.active_buffs IS
  'Cross-encounter buff snapshot (v2.491). Mirrors the v2.477 character pattern but at the creature TEMPLATE level — shared across every spawn of this creature. Populated by endEncounter carry-over (combatEncounter.ts) from combatants.active_buffs. Re-seeded into combatants.active_buffs at startEncounter / addParticipantToEncounter so the buff is mechanically active in the next combat.';
