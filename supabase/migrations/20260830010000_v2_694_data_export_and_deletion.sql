-- v2.694.0 — "Download my data" and "Delete my account".
--
-- Launch requirement (docs/MVP_LAUNCH.md, Phase 3). You hold people's email
-- addresses, characters, campaigns and chat; they are entitled to a copy and to
-- have it removed, and that stays true for a twelve-person invite beta.
--
-- ── WHY DELETION NEEDED SCHEMA WORK FIRST ────────────────────────────────
-- Most of the 22 user-owned foreign keys already cascade — 10 from profiles,
-- 8 from auth.users — so deleting the auth user takes almost everything with
-- it. Two did not, and would have made deletion fail outright with a foreign
-- key violation the moment a user had ever authored one row:
--
--   session_schedules.created_by   NO ACTION
--   token_notes.author_id          NO ACTION
--
-- Both columns are nullable, so they become SET NULL: the schedule and the
-- note survive for the rest of the table, detached from the person who left.
-- That is the same treatment campaign_chat and schedule_availability already
-- had, and it is the right one — deleting a shared campaign's session schedule
-- because one player left would destroy other people's data.
--
-- client_errors is the other gap: it carries user_id with NO foreign key at
-- all, so nothing would ever have cleaned it up. delete_my_account() nulls it
-- explicitly. The error report is worth keeping; the identity is not.

-- ── 1. Unblock deletion ──────────────────────────────────────────────────
alter table public.session_schedules
  drop constraint if exists session_schedules_created_by_fkey;
alter table public.session_schedules
  add constraint session_schedules_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.token_notes
  drop constraint if exists token_notes_author_id_fkey;
alter table public.token_notes
  add constraint token_notes_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete set null;

-- ── 2. Export ────────────────────────────────────────────────────────────
-- Everything the caller owns, as one JSON document. SECURITY DEFINER so it can
-- read past RLS, but every branch is filtered on auth.uid() and the function
-- takes no arguments — there is no way to ask it for somebody else's data.
--
-- Shared tables are filtered to the caller's OWN rows: their chat messages, not
-- the channel; their availability, not the group's. Exporting a campaign you
-- merely joined would hand you other people's data.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED: sign in to export your data.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'format_note', 'One JSON document of everything DNDKeep stores about this account. Rows shared with other people (campaign chat, availability) include only your own.',
    'account',              (select to_jsonb(p) from profiles p where p.id = v_uid),
    'characters',           coalesce((select jsonb_agg(to_jsonb(t)) from characters t where t.user_id = v_uid), '[]'::jsonb),
    'character_history',    coalesce((select jsonb_agg(to_jsonb(t)) from character_history t where t.user_id = v_uid), '[]'::jsonb),
    'campaigns_owned',      coalesce((select jsonb_agg(to_jsonb(t)) from campaigns t where t.owner_id = v_uid), '[]'::jsonb),
    'campaign_memberships', coalesce((select jsonb_agg(to_jsonb(t)) from campaign_members t where t.user_id = v_uid), '[]'::jsonb),
    'campaign_chat_mine',   coalesce((select jsonb_agg(to_jsonb(t)) from campaign_chat t where t.user_id = v_uid), '[]'::jsonb),
    'roll_logs',            coalesce((select jsonb_agg(to_jsonb(t)) from roll_logs t where t.user_id = v_uid), '[]'::jsonb),
    'scenes_owned',         coalesce((select jsonb_agg(to_jsonb(t)) from scenes t where t.owner_id = v_uid), '[]'::jsonb),
    'homebrew_classes',     coalesce((select jsonb_agg(to_jsonb(t)) from homebrew_classes t where t.user_id = v_uid), '[]'::jsonb),
    'homebrew_items',       coalesce((select jsonb_agg(to_jsonb(t)) from homebrew_items t where t.user_id = v_uid), '[]'::jsonb),
    'homebrew_monsters',    coalesce((select jsonb_agg(to_jsonb(t)) from homebrew_monsters t where t.user_id = v_uid), '[]'::jsonb),
    'homebrew_spells',      coalesce((select jsonb_agg(to_jsonb(t)) from spells t where t.owner_id = v_uid), '[]'::jsonb),
    'homebrew_magic_items', coalesce((select jsonb_agg(to_jsonb(t)) from magic_items t where t.owner_id = v_uid), '[]'::jsonb),
    'homebrew_monsters_v2', coalesce((select jsonb_agg(to_jsonb(t)) from monsters t where t.owner_id = v_uid), '[]'::jsonb),
    'creature_folders',     coalesce((select jsonb_agg(to_jsonb(t)) from creature_folders t where t.owner_id = v_uid), '[]'::jsonb),
    'session_schedules',    coalesce((select jsonb_agg(to_jsonb(t)) from session_schedules t where t.created_by = v_uid), '[]'::jsonb),
    'my_availability',      coalesce((select jsonb_agg(to_jsonb(t)) from schedule_availability t where t.user_id = v_uid), '[]'::jsonb),
    'token_notes_mine',     coalesce((select jsonb_agg(to_jsonb(t)) from token_notes t where t.author_id = v_uid), '[]'::jsonb),
    'dice_skin_unlocks',    coalesce((select jsonb_agg(to_jsonb(t)) from dice_skin_unlocks t where t.user_id = v_uid), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ── 3. Deletion ──────────────────────────────────────────────────────────
-- Deletes the caller's auth user, which cascades everything else. Takes no
-- arguments for the same reason as the export: nothing to point at another
-- account. The confirmation lives in the UI; this is the irreversible half.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED: sign in to delete your account.'
      using errcode = '42501';
  end if;

  -- No foreign key covers this one, so nothing else would ever remove it.
  -- Keep the error report, drop the person it belonged to.
  update public.client_errors set user_id = null where user_id = v_uid;

  -- Everything else follows from here: profiles cascades to 10 tables,
  -- auth.users to 8 more, and the four SET NULL columns detach.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ── Guard ────────────────────────────────────────────────────────────────
do $$
declare n integer;
begin
  select count(*) into n
    from pg_constraint c
   where c.conname in ('session_schedules_created_by_fkey', 'token_notes_author_id_fkey')
     and c.confdeltype = 'n';   -- SET NULL
  if n <> 2 then
    raise exception 'The two blocking foreign keys are not SET NULL (% of 2).', n;
  end if;

  if to_regprocedure('public.export_my_data()') is null
     or to_regprocedure('public.delete_my_account()') is null then
    raise exception 'export_my_data / delete_my_account missing.';
  end if;
end $$;
