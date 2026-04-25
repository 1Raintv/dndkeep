-- v2.253.0 — Phase Q.7: NPC save proficiencies.
--
-- v2.249→v2.252 built the NPC save story end-to-end (modal that
-- displays bonuses → real types → real ability scores → builder UI).
-- The remaining gap: an NPC with proficient saves (e.g. a Veteran's
-- STR/CON saves) was getting just the ability mod, no proficiency
-- bonus. This finishes the arc.
--
-- Two columns added:
--   - dm_npc_roster.save_proficiencies (text[], default {}): the source
--     of truth, edited via the v2.252 roster builder. Stored as an
--     ARRAY rather than a jsonb object because each value is one of a
--     fixed 6-element enum and ARRAY queries cleanly.
--   - npcs.save_proficiencies (jsonb, default []): the snapshot taken
--     at spawn, sibling to ability_scores. jsonb (not _text) for
--     symmetry with ability_scores and to leave room for per-instance
--     deviations later (a goblin with situational expertise from a
--     blessing, etc.).
--
-- Allowed values: 'str', 'dex', 'con', 'int', 'wis', 'cha' (lowercase
-- to match the ability_scores key shape from v2.251).

ALTER TABLE public.dm_npc_roster
  ADD COLUMN IF NOT EXISTS save_proficiencies text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS save_proficiencies jsonb NOT NULL DEFAULT '[]'::jsonb;

-- No backfill: existing roster entries had no concept of save profs
-- so they all default to "none proficient". DMs can edit via the
-- builder. The jsonb default is [] (empty array) rather than {}
-- (empty object) because the contract is "list of ability keys".
