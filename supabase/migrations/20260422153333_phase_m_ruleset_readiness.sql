-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422153333 (name 'phase_m_ruleset_readiness') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.142.0 — Phase M pt 5: default ruleset per campaign.
-- Infrastructure for coexistence of 2014 and 2024 monster stat blocks in a
-- single bestiary. The current 334 SRD rows are all ruleset_version='2014'.
-- When 2024 SRD 5.2 data is loaded, campaigns can opt into ruleset filtering.
--
-- Values:
--   NULL    — show all monsters regardless of ruleset (initial default)
--   '2014'  — hide 2024 monsters from this campaign's bestiary
--   '2024'  — hide 2014 monsters from this campaign's bestiary

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS default_ruleset_version TEXT
    CHECK (default_ruleset_version IS NULL
           OR default_ruleset_version IN ('2014', '2024'));
