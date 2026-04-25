-- v2.257.0 follow-up — drop the battlemap_assets_select policy entirely.
--
-- The previous step in this ship narrowed the policy from "anyone can
-- list" to "authenticated can list", but the security linter still
-- flags the policy because:
--   - the bucket is public (object URL access bypasses RLS anyway)
--   - having ANY SELECT policy on storage.objects for a public bucket
--     enables the LIST endpoint
--   - we never call .list() in code (verified across battleMapAssets.ts)
--
-- So the policy is doing nothing for us and exposing more than it
-- should. Drop it. Public URL fetches still work because the bucket
-- is marked public; uploads still work via separate INSERT policies.
-- If a future feature needs listing, we'll add a narrower per-user
-- policy (e.g. owner-only) at that time.

DROP POLICY IF EXISTS battlemap_assets_select ON storage.objects;
