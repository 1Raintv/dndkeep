-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422234038 (name 'phase_p_magic_items_table') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.154.0 — Phase P pt 2: canonical magic_items table.
-- Mirrors spells/monsters: canonical SRD rows have owner_id=NULL,
-- homebrew rows are user-owned. RLS filters so every user sees
-- canonical + own homebrew + public homebrew.
-- Mechanical bonus columns (ac/save/attack/damage_bonus) apply when
-- the item is equipped AND (attuned OR doesn't require attunement).

CREATE TABLE IF NOT EXISTS magic_items (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  item_type     TEXT NOT NULL CHECK (item_type IN (
                  'armor', 'potion', 'ring', 'rod', 'scroll', 'staff',
                  'wand', 'weapon', 'wondrous', 'ammunition'
                )),
  rarity        TEXT NOT NULL CHECK (rarity IN (
                  'common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'
                )),
  requires_attunement BOOLEAN NOT NULL DEFAULT false,
  description   TEXT NOT NULL,
  weight        NUMERIC DEFAULT 0,

  ac_bonus      INTEGER,
  save_bonus    INTEGER,
  attack_bonus  INTEGER,
  damage_bonus  INTEGER,

  max_charges   INTEGER,
  recharge      TEXT CHECK (recharge IS NULL OR recharge IN ('dawn', 'dusk', 'long_rest', 'short_rest')),

  owner_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'srd' CHECK (source IN ('srd', 'homebrew', 'expansion')),
  is_public     BOOLEAN NOT NULL DEFAULT false,
  ruleset_version TEXT CHECK (ruleset_version IS NULL OR ruleset_version IN ('2014', '2024')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_magic_items_type ON magic_items(item_type);
CREATE INDEX IF NOT EXISTS idx_magic_items_rarity ON magic_items(rarity);
CREATE INDEX IF NOT EXISTS idx_magic_items_owner ON magic_items(owner_id) WHERE owner_id IS NOT NULL;

ALTER TABLE magic_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY magic_items_select ON magic_items
  FOR SELECT USING (
    owner_id IS NULL
    OR owner_id = auth.uid()
    OR is_public = true
  );

CREATE POLICY magic_items_insert_own ON magic_items
  FOR INSERT WITH CHECK (owner_id = auth.uid() AND source = 'homebrew');

CREATE POLICY magic_items_update_own ON magic_items
  FOR UPDATE USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY magic_items_delete_own ON magic_items
  FOR DELETE USING (owner_id = auth.uid());
