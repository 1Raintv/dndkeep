-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260423221301 (name 'add_base_damage_dice_to_magic_items') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.181.0 — Phase Q.0 pt 22: base damage dice on magic items.
-- Magic weapons in the catalogue had no base damage stored, so equipping
-- (e.g.) a Luck Blade fell back to '1d4'. This column stores canonical
-- SRD damage dice strings. addToInventory copies into InventoryItem.damage.
-- Nullable: non-weapons don't need it; generic 'Weapon, +N' entries omit it.

ALTER TABLE public.magic_items
  ADD COLUMN IF NOT EXISTS base_damage_dice text;

COMMENT ON COLUMN public.magic_items.base_damage_dice
  IS 'Canonical SRD base damage for magic weapons, e.g. "1d8 slashing". NULL for non-weapons or generic +N entries.';

-- Swords: longsword base (1d8 slashing) per SRD
UPDATE public.magic_items SET base_damage_dice = '1d8 slashing' WHERE id IN (
  'sword-plus-1', 'sword-plus-2', 'sword-plus-3',
  'thundering-blade', 'luck-blade', 'flame-tongue',
  'frost-brand', 'dragon-slayer', 'giant-slayer',
  'holy-avenger', 'vorpal-sword'
);

-- Staves: quarterstaff base (1d6 bludgeoning one-handed)
UPDATE public.magic_items SET base_damage_dice = '1d6 bludgeoning' WHERE id IN (
  'staff-of-fire', 'staff-of-healing', 'staff-of-power',
  'staff-of-swarming-insects', 'staff-of-thunder-lightning'
);

-- Generic 'Weapon, +N' intentionally left NULL.
