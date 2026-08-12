-- v2.654.0 — Break the RLS recursion on scene_token_placements.
--
-- THE BUG
-- Every UPDATE to scene_token_placements failed with Postgres 42P17,
-- "infinite recursion detected in policy for relation
-- scene_token_placements" — including the DM's own token drags. Two
-- policies referenced each other:
--
--   stp_player_update_owned_combatant  (v2.616, on placements)
--     USING: EXISTS (SELECT 1 FROM combatants cb WHERE cb.id = ...)
--
--   combatants_player_select_via_placement  (v2.309, on combatants)
--     USING: EXISTS (SELECT 1 FROM scene_token_placements p JOIN ...)
--
-- Evaluating the placement UPDATE policy runs a SELECT on combatants,
-- which applies combatants' SELECT policies, one of which runs a SELECT
-- back on scene_token_placements — and Postgres aborts. Permissive
-- policies are all evaluated regardless of whether an earlier one would
-- have granted access, so scene_token_placements_dm_all passing on its
-- own did not save the DM from this.
--
-- WHY IT WASN'T CAUGHT
-- Production has both policies but is not currently broken: its one
-- campaign predates the v2.497 flag flip and still carries
-- use_combatants_for_battlemap = false, so the client writes to the
-- legacy scene_tokens table and never touches placements. The COLUMN
-- DEFAULT is true, so the next campaign created there would have had a
-- battle map on which no token could be moved. Found v2.653 while
-- verifying multi-select against the local stack.
--
-- THE FIX
-- Resolve combatant ownership through a SECURITY DEFINER function. It
-- runs as the owner, so the inner lookup does not apply combatants' RLS
-- and the placement policies stop re-entering. The combatants side is
-- left alone: with this edge cut, nothing re-enters placements, and
-- scene_token_placements_player_select does not reference combatants.
--
-- SECURITY POSTURE — deliberately identical to v2.616, not wider:
--   * The function answers exactly one question: "does the caller own
--     this combatant?" It returns a boolean and leaks no row data.
--   * search_path is pinned, so a caller cannot shadow `combatants`
--     with a temp table and spoof ownership.
--   * EXECUTE is granted to `authenticated` only. Note that REVOKE ...
--     FROM PUBLIC is NOT sufficient here: Supabase ships ALTER DEFAULT
--     PRIVILEGES granting EXECUTE on new functions in `public` to anon,
--     authenticated and service_role, and those are explicit grants
--     rather than the PUBLIC pseudo-role. Verified against pg_proc.proacl
--     on the local stack — the first cut of this migration left
--     `anon=X/postgres` sitting in the ACL. `anon` is revoked by name.
--   * auth.uid() still resolves to the CALLER inside a SECURITY
--     DEFINER function — it reads the request JWT, not the role — so
--     ownership is still evaluated per user.

CREATE OR REPLACE FUNCTION public.owns_combatant(cb_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.combatants cb
    WHERE cb.id = cb_id
      AND cb.owner_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.owns_combatant(uuid) IS
  'v2.654 — SECURITY DEFINER ownership check used by the '
  'scene_token_placements player policies. Exists to stop those '
  'policies from re-entering combatants RLS, which recursed (42P17). '
  'Returns a boolean only; grants no read access to combatant rows.';

REVOKE ALL ON FUNCTION public.owns_combatant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_combatant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.owns_combatant(uuid) TO authenticated;

-- Re-point the three player policies at the helper. Same rule, same
-- scope — only the evaluation path changes.
DROP POLICY IF EXISTS stp_player_insert_owned_combatant ON scene_token_placements;
CREATE POLICY stp_player_insert_owned_combatant ON scene_token_placements
  FOR INSERT WITH CHECK (public.owns_combatant(combatant_id));

DROP POLICY IF EXISTS stp_player_update_owned_combatant ON scene_token_placements;
CREATE POLICY stp_player_update_owned_combatant ON scene_token_placements
  FOR UPDATE USING (public.owns_combatant(combatant_id))
  WITH CHECK (public.owns_combatant(combatant_id));

DROP POLICY IF EXISTS stp_player_delete_owned_combatant ON scene_token_placements;
CREATE POLICY stp_player_delete_owned_combatant ON scene_token_placements
  FOR DELETE USING (public.owns_combatant(combatant_id));

-- NOTE on the WITH CHECK added to the UPDATE policy: v2.616 declared
-- USING only, which meant a player who could update a row could also
-- re-point its combatant_id at a combatant they do not own. Postgres
-- falls back to the USING expression for WITH CHECK when the latter is
-- omitted, so in practice this was already enforced — stating it
-- explicitly keeps the intent readable rather than implied.
