-- v2.669.0 — Remembered-terrain fog: a third fog mode.
--
-- Dynamic fog forgets. Walk out of a room and it goes black again, which
-- is right for "what can you see RIGHT NOW" and wrong for "do you
-- remember the shape of the dungeon you just walked through". This mode
-- keeps both: what the party can currently see renders exactly as
-- dynamic, and everywhere they have BEEN keeps its wall layout drawn on
-- top of otherwise-solid fog, like a dungeon-crawler automap.
--
-- WHAT A REMEMBERED CELL SHOWS: the walls, and nothing else. The fog
-- over it is never erased, so tokens — which render UNDER the fog — stay
-- hidden by construction. You remember the room's shape; you do not get
-- to watch the goblin that wandered into it after you left.
--
-- Idempotent: safe to re-run.

-- 1. Allow the new mode. The existing constraint enumerates values, so
--    it has to be dropped and rebuilt rather than extended in place.
alter table scenes drop constraint if exists scenes_fog_mode_check;
alter table scenes
  add constraint scenes_fog_mode_check
  check (fog_mode = any (array['dynamic'::text, 'manual'::text, 'remembered'::text]));

-- 2. Where the memory lives.
--
-- SEPARATE FROM revealed_cells, deliberately. That column is the DM's
-- hand-painted manual fog. Accumulating automatic exploration into it
-- would quietly overwrite a painted map the first time anyone switched
-- modes, and there would be no way to tell the two apart afterwards.
-- Remembered mode reads the UNION of the two, so a DM can still paint
-- an area in as "they know about this" without it being explored.
alter table scenes
  add column if not exists explored_cells jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scenes_explored_cells_is_array'
  ) then
    alter table scenes
      add constraint scenes_explored_cells_is_array
      check (jsonb_typeof(explored_cells) = 'array');
  end if;
end $$;

comment on column scenes.explored_cells is
  'v2.669 — [row, col] grid cells the party has ever been able to see, '
  'accumulated automatically while fog_mode = ''remembered''. Distinct '
  'from revealed_cells (the DM''s hand-painted manual fog); remembered '
  'mode renders the union of both.';

-- 3. Let PLAYERS explore, not just the DM.
--
-- The point of the mode is that moving your own token uncovers the map,
-- so the client that computes the newly-seen cells is usually a
-- player's. Players have no UPDATE on scenes and should not get one — a
-- blanket grant would let any player rewrite the DM's fog, scene name or
-- published flag.
--
-- So: a SECURITY DEFINER function that can only ever ADD cells. It
-- unions and cannot remove, so the worst a hostile client can do is
-- reveal map it could already see (it computes the same visibility the
-- fog does), and it can never un-reveal or clear anything.
--
-- Membership is checked explicitly because SECURITY DEFINER bypasses
-- RLS: without this, any authenticated user could explore any scene in
-- the database by id.

create or replace function public.explore_scene_cells(
  p_scene_id uuid,
  p_cells jsonb
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_campaign_id uuid;
begin
  if jsonb_typeof(p_cells) is distinct from 'array' then
    raise exception 'p_cells must be a JSON array of [row, col] pairs';
  end if;

  select s.campaign_id into v_campaign_id from public.scenes s where s.id = p_scene_id;
  if v_campaign_id is null then
    raise exception 'scene not found';
  end if;

  -- Caller must be in the campaign: its DM/owner, or a member.
  if not exists (
    select 1 from public.campaigns c
     where c.id = v_campaign_id and c.owner_id = auth.uid()
  ) and not exists (
    select 1 from public.campaign_members m
     where m.campaign_id = v_campaign_id and m.user_id = auth.uid()
  ) then
    raise exception 'not a member of this campaign';
  end if;

  -- Union, de-duplicated. Add-only: there is no code path here that
  -- removes a cell, which is what makes granting this to players safe.
  update public.scenes s
     set explored_cells = coalesce((
           select jsonb_agg(distinct e)
             from jsonb_array_elements(s.explored_cells || p_cells) e
         ), '[]'::jsonb)
   where s.id = p_scene_id;
end;
$$;

revoke all on function public.explore_scene_cells(uuid, jsonb) from public;
-- Explicit, because REVOKE ... FROM PUBLIC does not remove a direct
-- grant, and Supabase's default privileges hand `anon` EXECUTE on new
-- functions in `public`. Verified before adding this: an anon caller
-- still failed, but on the membership check (auth.uid() is NULL) rather
-- than on the grant. That is defence in depth working as intended — it
-- is not a reason to leave the outer door open.
revoke all on function public.explore_scene_cells(uuid, jsonb) from anon;
grant execute on function public.explore_scene_cells(uuid, jsonb) to authenticated;

comment on function public.explore_scene_cells(uuid, jsonb) is
  'v2.669 — add-only union into scenes.explored_cells, callable by any '
  'campaign member so a PLAYER moving their own token uncovers the map. '
  'SECURITY DEFINER (players have no UPDATE on scenes), so it checks '
  'campaign membership explicitly and can never remove a cell.';
