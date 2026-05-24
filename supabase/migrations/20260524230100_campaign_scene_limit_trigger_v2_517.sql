-- v2.517.0 — scene_limit stamp trigger. ALREADY APPLIED via MCP.
CREATE OR REPLACE FUNCTION public.set_campaign_scene_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE has_ultimate boolean;
BEGIN
  IF NEW.scene_limit IS NULL OR NEW.scene_limit = 10 THEN
    SELECT COALESCE(p.ultimate_campaign,false) INTO has_ultimate FROM public.profiles p WHERE p.id = NEW.owner_id;
    NEW.scene_limit := CASE WHEN has_ultimate THEN 50 ELSE 10 END;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_set_campaign_scene_limit ON public.campaigns;
CREATE TRIGGER trg_set_campaign_scene_limit BEFORE INSERT ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_scene_limit();
