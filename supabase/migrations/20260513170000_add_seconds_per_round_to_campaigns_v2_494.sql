-- v2.494.0 — Add seconds_per_round to campaigns (Time Scale setting).
--
-- Background:
--   D&D 5e RAW: 1 round = 6 seconds. Many tables prefer round numbers
--   for in-fiction time math (10 sec/round → 1 hour = 360 rounds rather
--   than 600), so DND 404 makes this a per-campaign setting.
--
--   Two consumers in v2.494:
--     1. Buff duration display in NpcTokenQuickPanel and (eventually)
--        the character sheet active-buffs strip. Buff durations are
--        stored in rounds; the DM-facing label renders as
--        "Xr / Y sec" using campaigns.seconds_per_round to compute Y.
--     2. Advance Time math in PartyDashboard. Previously the 1h/8h/24h
--        buttons hard-coded round counts (600/4800/14400 at 6 s/r).
--        v2.494 stores button intent as seconds and converts at click
--        time via `Math.round(seconds / seconds_per_round)` so the
--        campaign setting drives the math.
--
-- Scope of this ship:
--   - DB: add the column with NOT NULL DEFAULT 10 (this migration).
--     Range 1-600 sec/round enforced via CHECK constraint.
--   - App: new src/lib/buffDuration.ts (decrement + format + sweep).
--   - App: combatEncounter.advanceTurn decrements all combatant
--     active_buffs by 1 round when the round wraps.
--   - App: PartyDashboard Advance Time buttons converted from
--     {rounds} to {seconds}; both empty-state and full-DM panels
--     call elapseCampaignBuffDurations after the immunity prune.
--   - App: CampaignSettings Rules tab gains a Time Scale card with
--     lock/unlock pattern + RAW (6) and Default (10) quick chips.
--   - App: NpcTokenQuickPanel renders DM-only duration countdown
--     using formatDurationLabel.
--
-- Backfill: existing rows pick up the DEFAULT clause automatically.
-- No data migration required.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS seconds_per_round INTEGER NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'campaigns_seconds_per_round_range_chk'
  ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_seconds_per_round_range_chk
      CHECK (seconds_per_round >= 1 AND seconds_per_round <= 600);
  END IF;
END $$;

COMMENT ON COLUMN public.campaigns.seconds_per_round IS
  'v2.494: seconds per combat round for duration display and Advance Time math. 5e RAW = 6; default 10. Range 1-600 sec.';
