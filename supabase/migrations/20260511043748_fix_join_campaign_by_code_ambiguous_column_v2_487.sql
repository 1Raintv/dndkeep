-- v2.487.0 — Fix `column reference "campaign_id" is ambiguous`
-- in join_campaign_by_code RPC.
--
-- Bug:
--   The function signature is
--     RETURNS TABLE(campaign_id uuid, campaign_name text, already_member boolean)
--   When the body does
--     SELECT EXISTS (
--       SELECT 1 FROM public.campaign_members
--        WHERE campaign_id = v_camp_id AND user_id = v_uid
--     ) INTO v_already;
--   Postgres can't decide whether the unqualified `campaign_id` in the
--   WHERE clause refers to `campaign_members.campaign_id` (the row
--   being filtered) or the return-table output column `campaign_id`
--   (which is in scope as a local name inside the function body).
--   It raises SQLSTATE 42702 "column reference \"campaign_id\" is
--   ambiguous" and the join silently fails — the UI surfaces the raw
--   Postgres text because that code wasn't in the friendly-error
--   map in CharacterSettings.tsx (which only handles P0002 / 22023).
--
--   Same latent risk for `user_id` (not a return-table column today,
--   but qualifying it is good hygiene and protects against future
--   signature changes).
--
-- Fix:
--   Qualify every column reference inside the EXISTS WHERE clause
--   with the table alias `cm`. No behavior change beyond resolving
--   the ambiguity.

CREATE OR REPLACE FUNCTION public.join_campaign_by_code(p_code text)
 RETURNS TABLE(campaign_id uuid, campaign_name text, already_member boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_code      text := upper(btrim(coalesce(p_code, '')));
  v_camp_id   uuid;
  v_camp_name text;
  v_already   boolean;
BEGIN
  -- Caller must be authenticated.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Code must be non-empty after trim. Reject obvious junk early so
  -- we don't even hit the index.
  IF length(v_code) = 0 THEN
    RAISE EXCEPTION 'Join code is required' USING ERRCODE = '22023';
  END IF;

  -- Lookup. join_code in the campaigns table is stored as upper-case
  -- (generate_join_code emits uppercase) — match by upper() defensively
  -- so legacy lowercase rows still resolve.
  SELECT c.id, c.name INTO v_camp_id, v_camp_name
    FROM public.campaigns c
   WHERE upper(btrim(c.join_code)) = v_code
   LIMIT 1;

  IF v_camp_id IS NULL THEN
    RAISE EXCEPTION 'No campaign matches that join code' USING ERRCODE = 'P0002';
  END IF;

  -- v2.487 — qualify every column with `cm.` to disambiguate from the
  -- function's RETURNS TABLE output names (campaign_id, campaign_name,
  -- already_member).
  SELECT EXISTS (
    SELECT 1 FROM public.campaign_members cm
     WHERE cm.campaign_id = v_camp_id AND cm.user_id = v_uid
  ) INTO v_already;

  IF NOT v_already THEN
    INSERT INTO public.campaign_members (campaign_id, user_id, role)
    VALUES (v_camp_id, v_uid, 'player');
  END IF;

  -- Return the campaign id + name so the UI can show "joined Campaign X"
  -- without a follow-up SELECT (which would race the RLS materialization).
  RETURN QUERY SELECT v_camp_id, v_camp_name, v_already;
END;
$function$;
