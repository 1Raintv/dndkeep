-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260407185044 (name 'auto_add_owner_as_dm_member') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE OR REPLACE FUNCTION add_owner_as_dm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.campaign_members (campaign_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'dm')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_owner_as_dm ON public.campaigns;
CREATE TRIGGER trg_add_owner_as_dm
  AFTER INSERT ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION add_owner_as_dm();

INSERT INTO public.campaign_members (campaign_id, user_id, role)
SELECT c.id, c.owner_id, 'dm'
FROM public.campaigns c
WHERE NOT EXISTS (
  SELECT 1 FROM public.campaign_members cm
  WHERE cm.campaign_id = c.id AND cm.user_id = c.owner_id
)
ON CONFLICT DO NOTHING;
