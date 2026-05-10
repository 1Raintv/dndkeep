-- v2.474.0 — Cross-encounter condition immunity foundation (Ship 1/N).
--
-- Background:
--   RAW Frightful Presence (and similar source-keyed effects) grants
--   24-hour immunity on a successful save: "If a creature's saving
--   throw is successful or the effect ends for it, the creature is
--   immune to this creature's Frightful Presence for the next 24
--   hours." Today's implementation (combatants.condition_source_immunities,
--   added v2.445) is per-encounter — it dies with the combatants row
--   when the encounter ends. Cross-encounter immunity needs storage
--   that outlives the encounter.
--
-- Design (from chat with user, May 2026):
--   - Combat is the source of truth for in-game time. RAW: 1 round =
--     6 seconds, 10 rounds = 1 minute, 24 hours = 14,400 rounds.
--     Outside-combat fast-forward is deferred to a future ship.
--   - Immunities (and conditions / buffs) applied during combat
--     should persist on the character/NPC after the encounter ends,
--     not reset to clean state. Player removes them when the duration
--     expires or they're cleared by another effect.
--   - Two storage layers:
--       1. campaign_condition_immunities (this migration) — the
--          authoritative cross-encounter store. Survives encounter
--          teardown. One row per (target, source) pair.
--       2. characters.active_immunities / npcs.active_immunities
--          (this migration, JSONB columns) — denormalized character-
--          side view for the sheet UI. Mirror of the table, same
--          shape as active_buffs, populated by Ship 3's carry-over
--          logic at end of encounter.
--   - In-game clock: campaigns.combat_rounds_elapsed counts every
--     completed round across every encounter in the campaign's
--     history. Incremented in advanceTurn on round wrap. Expiry math
--     is `granted_at_rounds + duration_rounds <= current_rounds`.
--
-- This ship is Ship 1/5 of the arc. It's pure-additive schema with a
-- single counter bump; no read/write paths change yet. Old
-- combatants.condition_source_immunities keeps working in parallel.
-- Ship 2 wires up auto-grant + dual-read; Ship 3 adds carry-over;
-- Ship 4 adds the character sheet UI; Ship 5 drops the legacy column.

-- ────────────────────────────────────────────────────────────────────
-- Cross-encounter immunity table
-- ────────────────────────────────────────────────────────────────────
--
-- target_type / target_id key off the AUTHORITATIVE entity (character
-- / npc / homebrew_monster), NOT combat_participants — that table is
-- encounter-scoped and gets recreated per encounter. By keying on the
-- entity, the immunity row outlives any number of encounter teardowns.
--
-- source_kind is a slug like 'frightful_presence' (matches the
-- conditions.ts ApplyConditionInput.sourceKind contract). source_id is
-- the attacker's entity_id (character.id, npc.id, monster.id, or
-- homebrew_monster.id depending on attacker type) so two different
-- dragons get separate immunities.
--
-- granted_at_rounds is the campaigns.combat_rounds_elapsed value at
-- grant time. expires_at_rounds is granted_at + duration; NULL means
-- "no time-based expiry, only manual revoke" (e.g. for permanent
-- magical immunities granted by other systems).
--
-- encounter_id (nullable) tags the encounter that granted the
-- immunity. Useful for diagnostics ("which fight earned this?") and
-- for any future "clear all immunities from encounter X" admin
-- action. NOT used for cleanup — the user's model is that immunities
-- persist on the character regardless of encounter state.

CREATE TABLE IF NOT EXISTS public.campaign_condition_immunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,

  target_type TEXT NOT NULL CHECK (target_type IN ('character', 'creature', 'monster', 'npc')),
  target_id UUID NOT NULL,

  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,

  granted_at_rounds INT NOT NULL DEFAULT 0,
  expires_at_rounds INT,
  encounter_id UUID REFERENCES public.combat_encounters(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One immunity per (target, source) pair. Re-grant overwrites — we
  -- don't accumulate stacked immunities. If the dragon's Frightful
  -- Presence triggers twice and the target saves both times, the
  -- second save resets the 24h timer (the conservative RAW reading;
  -- a stricter reading would say the first immunity is already
  -- active so the second save can't even happen — but applyCondition
  -- short-circuits before then, so this branch is unreachable in
  -- practice).
  UNIQUE (campaign_id, target_type, target_id, source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_condition_immunities_lookup
  ON public.campaign_condition_immunities (campaign_id, target_type, target_id);

-- RLS: campaign members can SELECT; only owner/system can INSERT/UPDATE/DELETE.
-- Mirroring the pattern used by other campaign-scoped tables (e.g.
-- combat_encounters).
ALTER TABLE public.campaign_condition_immunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_members_select_immunities"
  ON public.campaign_condition_immunities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_members cm
      WHERE cm.campaign_id = campaign_condition_immunities.campaign_id
        AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_condition_immunities.campaign_id
        AND c.owner_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE limited to the campaign owner. The auto-grant
-- path runs through pendingAttack / endOfTurnConditions, both of
-- which execute in the DM's session. Players don't directly write to
-- this table — they trigger writes via combat actions. Future ship
-- (manual remove UI) will need a separate policy for the target
-- character's owner to DELETE their own immunities; deferred until
-- that UI lands.
CREATE POLICY "campaign_owner_write_immunities"
  ON public.campaign_condition_immunities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_condition_immunities.campaign_id
        AND c.owner_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────
-- Character + NPC denormalized immunity view
-- ────────────────────────────────────────────────────────────────────
--
-- JSONB array shape mirrors active_buffs:
--   [{ source_kind: 'frightful_presence', source_id: '...',
--      source_name: 'Adult Red Dragon',
--      granted_at_rounds: 14250, expires_at_rounds: 28650,
--      encounter_id: '...' }, ...]
--
-- Populated by Ship 3's end-of-encounter carry-over from
-- campaign_condition_immunities. The character sheet UI (Ship 4)
-- reads from here, NOT from the table — denormalization keeps the
-- sheet render simple and avoids an extra realtime subscription per
-- character. The table remains the source of truth; this column is
-- a snapshot updated at encounter end.

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS active_immunities JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.npcs
  ADD COLUMN IF NOT EXISTS active_immunities JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ────────────────────────────────────────────────────────────────────
-- Campaign in-game clock
-- ────────────────────────────────────────────────────────────────────
--
-- Counts every completed round across every encounter in the
-- campaign's history. Incremented in advanceTurn (combatEncounter.ts)
-- when a turn wrap bumps round_number. Used for time-based immunity
-- expiry: `granted_at_rounds + 14400 <= combat_rounds_elapsed` means
-- a 24h Frightful Presence immunity has worn off.
--
-- Why not derive from sum(combat_encounters.round_number)?
--   1. Faster (no aggregate on every immunity check).
--   2. Survives encounter deletion (the immunity timer shouldn't
--      reset because the DM cleaned up an old encounter).
--   3. Lets us add outside-combat fast-forward later (ship N+M)
--      without changing the read path — that ship just bumps this
--      counter from a Party-tab UI control.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS combat_rounds_elapsed INT NOT NULL DEFAULT 0;

-- Backfill existing campaigns from completed combat encounters. Best-
-- effort sum over round_number for every encounter; not perfectly
-- accurate (encounters that ended mid-round add the wrong amount by
-- ~1 round) but close enough for retroactive immunity checks. New
-- campaigns start at 0 and accumulate cleanly.
UPDATE public.campaigns c
   SET combat_rounds_elapsed = COALESCE(sub.total_rounds, 0)
  FROM (
    SELECT campaign_id, SUM(round_number) AS total_rounds
      FROM public.combat_encounters
     GROUP BY campaign_id
  ) sub
 WHERE c.id = sub.campaign_id
   AND c.combat_rounds_elapsed = 0;
