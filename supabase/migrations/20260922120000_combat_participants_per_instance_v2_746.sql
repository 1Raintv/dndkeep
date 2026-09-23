-- supabase/migrations/20260922120000_combat_participants_per_instance_v2_746.sql
-- v2.746 — combat participants are per INSTANCE (one per battle-map token), not per
-- creature definition. The phase-D UNIQUE (encounter_id, participant_type, entity_id)
-- forced three Goblin Scout tokens into ONE participant; cp_ensure_combatant_link's
-- unordered LIMIT 1 could bind it to a combatant on another scene. The app now writes
-- combatant_id explicitly (combatEncounter.ts seedToRow); the trigger skips its guess
-- when it is present. entity_id stays the definition id (stat lookups untouched).
-- Idempotent. NOTE: .github/workflows/migrate.yml applies this to PROD on push to main.

-- 0. Refuse to run if any encounter already holds two rows for one combatant — before
--    touching the schema, so a failure leaves prod exactly as it was.
do $$
declare v_dups int;
begin
  select count(*) into v_dups from (
    select encounter_id, combatant_id from public.combat_participants
    where combatant_id is not null group by 1,2 having count(*) > 1) d;
  if v_dups > 0 then
    raise exception 'v2.746 migration: % (encounter_id, combatant_id) duplicates in combat_participants — dedupe before applying', v_dups;
  end if;
end $$;

-- 1. Drop the per-definition uniqueness (constraint name verified locally).
alter table public.combat_participants
  drop constraint if exists combat_participants_encounter_id_participant_type_entity_id_key;

-- 2. One participant per combatant instance per encounter (NULL combatant_id rows,
--    i.e. legacy callers that let the trigger guess, are not constrained).
create unique index if not exists combat_participants_encounter_combatant_key
  on public.combat_participants (encounter_id, combatant_id)
  where combatant_id is not null;

-- 3. Player characters stay one-per-encounter regardless of token count.
create unique index if not exists combat_participants_encounter_character_key
  on public.combat_participants (encounter_id, entity_id)
  where participant_type = 'character';

comment on index public.combat_participants_encounter_combatant_key is
  'v2.746: per-instance participants — replaces UNIQUE(encounter_id, participant_type, entity_id)';
