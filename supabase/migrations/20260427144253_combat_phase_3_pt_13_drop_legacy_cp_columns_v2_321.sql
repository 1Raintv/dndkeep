-- v2.321.0 — Combat Phase 3 pt 13: drop the 11 mirrored columns
-- from combat_participants. The arc closes here.
--
-- Pre-drop state (verified):
--   - v2.317: every reader sources from combatants via JOIN+normalize
--   - v2.318: every UPDATE writer targets combatants directly
--   - v2.319: cp_dual_write_to_combatant trigger dropped (dead);
--             cp_ensure_combatant_link rewritten to seed combatants
--             from authoritative tables (characters/monsters/npcs),
--             no NEW.legacy_columns references
--   - v2.320: every cp .select() / .insert() payload stripped of
--             the 11 mirrored field names
--
-- After this migration, combatants is the SOLE storage for HP /
-- conditions / buffs / death-save state / exhaustion. The
-- combat_participants table retains: id, encounter_id, campaign_id,
-- combatant_id (FK), participant_type, entity_id, name, initiative
-- fields, action economy, ac, concentration_spell_id, legendary
-- action fields, hidden_from_players, max_speed_ft, etc.
--
-- ac and concentration_spell_id stay on cp — out of scope for this
-- arc. ac has different semantics from combatants.ac_override;
-- concentration_spell_id has no equivalent on combatants.

ALTER TABLE public.combat_participants
  DROP COLUMN current_hp,
  DROP COLUMN max_hp,
  DROP COLUMN temp_hp,
  DROP COLUMN active_conditions,
  DROP COLUMN condition_sources,
  DROP COLUMN active_buffs,
  DROP COLUMN exhaustion_level,
  DROP COLUMN death_save_successes,
  DROP COLUMN death_save_failures,
  DROP COLUMN is_stable,
  DROP COLUMN is_dead;
