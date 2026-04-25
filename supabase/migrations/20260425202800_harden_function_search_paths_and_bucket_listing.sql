-- v2.257.0 — Phase Q.9: Security advisor cleanup.
--
-- Background: Supabase's security linter has been flagging two
-- categories of WARN-level issues since v2.214 era. None are
-- critical, but the SECURITY DEFINER functions used in RLS
-- (auth_user_campaign_ids, auth_user_owned_campaign_ids) are the
-- highest-leverage items: a function with a mutable search_path can
-- be hijacked by a malicious schema in the calling role's path.
-- Pinning search_path closes that.
--
-- The 11 functions below all run as triggers, RLS helpers, or join-
-- code utilities. None of them reference objects from non-public
-- schemas, so 'public, pg_catalog' is the safe pin (pg_catalog needed
-- for built-ins like now(), gen_random_uuid()).
--
-- The bucket policy fix replaces a broad anon-readable SELECT with
-- an authenticated-only one. Public URL access still works (the
-- bucket itself is public; signed/public URLs bypass RLS on
-- storage.objects). Only the LIST endpoint is affected — and we
-- verified no code calls .list() on this bucket.

-- ─── 1. Pin search_path on all 11 functions ──────────────────────

ALTER FUNCTION public.add_owner_as_dm()             SET search_path = public, pg_catalog;
ALTER FUNCTION public.auth_user_campaign_ids()      SET search_path = public, pg_catalog;
ALTER FUNCTION public.auth_user_owned_campaign_ids() SET search_path = public, pg_catalog;
ALTER FUNCTION public.bump_battle_map_version()     SET search_path = public, pg_catalog;
ALTER FUNCTION public.bump_updated_at()             SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_join_code()          SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_campaign_by_code(text)    SET search_path = public, pg_catalog;
ALTER FUNCTION public.set_campaign_join_code()      SET search_path = public, pg_catalog;
ALTER FUNCTION public.set_updated_at()              SET search_path = public, pg_catalog;
ALTER FUNCTION public.trigger_set_updated_at()      SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_spells_updated_at()    SET search_path = public, pg_catalog;

-- ─── 2. Tighten battlemap-assets bucket SELECT policy ────────────
--
-- Before: any role (including anon) could list every file in the
-- bucket. Public URL access doesn't depend on this — the bucket
-- being marked public lets storage serve files via the public URL
-- without consulting RLS. The SELECT policy only matters for the
-- LIST API call.
--
-- After: only authenticated users can list. We verified
-- battleMapAssets.ts only calls getPublicUrl() and upload() — never
-- .list() — so no app behavior changes. (See follow-up migration
-- 20260425202900 which goes further and drops the policy entirely
-- since the linter still flags any SELECT on a public bucket.)
--
-- Drop the existing broad policy first, then create the narrower
-- one. Wrapped in DO so a re-run of this migration doesn't error
-- if the policy already got recreated by hand.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'battlemap_assets_select'
  ) THEN
    DROP POLICY battlemap_assets_select ON storage.objects;
  END IF;
END$$;

CREATE POLICY battlemap_assets_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'battlemap-assets');

-- HaveIBeenPwned password protection toggle is dashboard-only
-- (Auth → Policies → Leaked password protection); can't be set via
-- SQL. Documented in the deploy notes for manual enablement.
--
-- pg_net extension in public is left alone for this ship: moving it
-- requires updating any pg_net.* references in the codebase and
-- testing the storage hooks that depend on it. Out of scope for a
-- single security cleanup ship; revisit when there's a reason to
-- touch the extension surface.
