-- v2.251.0 — Phase Q.5: snapshot ability scores onto spawned NPCs.
--
-- Background: roster-spawned NPCs (created via createNpcInstances when
-- the DM places an entry from dm_npc_roster) lost their ability scores
-- at spawn time. Only dm_npc_roster carries str/dex/con/int/wis/cha;
-- the npcs row had nowhere to put them. This meant getTargetSaveBonus
-- always returned a 0 fallback for NPC participants, and the v2.249
-- save-bonus modal showed a yellow "?" indicator on every NPC row.
--
-- Stored as jsonb rather than 6 separate columns:
--   - The npcs table is shared with v1's NPCManager (named/social NPCs
--     with faction/relationship/etc. fields). Most npcs rows are not
--     stat-blocks — adding 6 NOT-NULL int columns would force defaults
--     on rows that don't represent statted creatures.
--   - jsonb gives us forward room for saving_throws, skills, traits if
--     we want to deepen NPC combat fidelity later, without per-field
--     migrations.
--
-- Shape: { str: int, dex: int, con: int, int: int, wis: int, cha: int }
-- Empty {} is fine — getTargetSaveBonus reads each ability key
-- defensively and falls back to the v2.250 low-confidence path when
-- absent. So legacy rows keep working, and new spawns populate it.

ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS ability_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill existing roster-spawned NPCs by name-matching back to the
-- roster within the same campaign. Imperfect (DMs can rename a spawned
-- NPC, two roster entries can share a name across campaigns) but
-- captures the common case where a goblin is still named "Goblin 3".
-- Anything we miss falls back to v2.250 behavior — the DM types an
-- override into the modal — so this is purely additive.
UPDATE public.npcs n
SET ability_scores = jsonb_build_object(
      'str', r.str,
      'dex', r.dex,
      'con', r.con,
      'int', r.int,
      'wis', r.wis,
      'cha', r.cha
    )
FROM public.dm_npc_roster r
WHERE n.campaign_id = r.campaign_id
  AND n.ability_scores = '{}'::jsonb
  AND (
    n.name = r.name
    OR n.name ~ ('^' || r.name || ' \d+$')   -- "Goblin 3" matches roster "Goblin"
  );
