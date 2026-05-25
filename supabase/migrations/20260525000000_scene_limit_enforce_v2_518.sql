-- v2.518.0 — Enforce per-campaign scene cap server-side. ALREADY APPLIED via MCP.
CREATE OR REPLACE FUNCTION public.enforce_scene_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE cap integer; current_count integer;
BEGIN
  SELECT COALESCE(c.scene_limit,10) INTO cap FROM public.campaigns c WHERE c.id = NEW.campaign_id;
  IF cap IS NULL THEN cap := 10; END IF;
  SELECT COUNT(*) INTO current_count FROM public.scenes s WHERE s.campaign_id = NEW.campaign_id;
  IF current_count >= cap THEN
    RAISE EXCEPTION 'scene_limit_reached: campaign % is at its % scene limit', NEW.campaign_id, cap USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_enforce_scene_limit ON public.scenes;
CREATE TRIGGER trg_enforce_scene_limit BEFORE INSERT ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_scene_limit();
