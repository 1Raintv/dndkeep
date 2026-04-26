-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260423003639 (name 'phase_p_magic_items_recharge_dice') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.157.0 — Phase P pt 5: charges + recharge dice.
-- recharge_dice = dice expression for recovery on a recharge trigger.
-- NULL means item fully recharges (no dice roll). Examples:
--   Wand of Fireballs: 'Regains 1d6+1 at dawn' → recharge_dice='1d6+1'
--   Rod of Rulership:  'Once per day' → recharge='dawn', dice=NULL (full)
-- Parser in lib/charges.ts supports XdY, XdY+N, 'full'.

ALTER TABLE magic_items
ADD COLUMN IF NOT EXISTS recharge_dice TEXT;

COMMENT ON COLUMN magic_items.recharge_dice IS
  'Dice expression for recharge roll (e.g. "1d6+1", "1d3"). NULL means full recharge on trigger.';
