-- v2.786: an encounter snapshot transfer is not a fresh damage event.
-- Written with HP in the same update, so realtime ordering cannot separate them.
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS combat_hp_sync_id uuid;
COMMENT ON COLUMN public.characters.combat_hp_sync_id IS
  'Last encounter HP carry-over identity; changes atomically with copied HP.';
