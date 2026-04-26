-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260407193423 (name 'homebrew_classes') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE public.homebrew_classes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  hit_die         int  NOT NULL DEFAULT 8 CHECK (hit_die IN (6,8,10,12)),
  primary_abilities   text[] NOT NULL DEFAULT '{}',
  saving_throw_proficiencies text[] NOT NULL DEFAULT '{}',
  skill_choices   text[] NOT NULL DEFAULT '{}',
  skill_count     int  NOT NULL DEFAULT 2,
  armor_proficiencies  text[] NOT NULL DEFAULT '{}',
  weapon_proficiencies text[] NOT NULL DEFAULT '{}',
  tool_proficiencies   text[] NOT NULL DEFAULT '{}',
  is_spellcaster      boolean NOT NULL DEFAULT false,
  spellcasting_ability text,
  spellcaster_type    text NOT NULL DEFAULT 'none'
                      CHECK (spellcaster_type IN ('full','half','warlock','none')),
  subclasses  jsonb NOT NULL DEFAULT '[]',
  is_public   boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, name)
);

ALTER TABLE public.homebrew_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homebrew_classes: owner full control"
  ON public.homebrew_classes FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "homebrew_classes: public classes readable by all"
  ON public.homebrew_classes FOR SELECT
  USING (is_public = true);

CREATE TRIGGER trg_homebrew_classes_updated_at
  BEFORE UPDATE ON public.homebrew_classes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
