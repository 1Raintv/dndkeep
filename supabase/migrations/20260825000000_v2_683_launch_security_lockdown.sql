-- v2.683.0 — Launch security lockdown.
--
-- Closes the four RLS/privilege holes tracked as Phase 1 items 1, 3, 4 and 5 in
-- docs/MVP_LAUNCH.md. Each was a deliberate development convenience that is not
-- survivable once strangers have accounts. Every section states what was open,
-- what closes it, and how to prove it closed.

-- =============================================================
-- 1. profiles — stop users granting themselves paid features
-- =============================================================
-- WAS: `create policy "profiles: own row update" on profiles for update
--       using (auth.uid() = id)` — no column restriction, no WITH CHECK. Any
--       logged-in user could PATCH /rest/v1/profiles?id=eq.<own uid> with
--       {"subscription_tier":"pro"} and take every paid feature for free. The
--       server-side gates read the same column, so this defeated those too.
--
-- NOW: the policy stays (users legitimately edit display_name, show_ua_content,
--      active_dice_skin), but a BEFORE UPDATE trigger rejects any change to a
--      billing column from a normal client. Only the service role — i.e. the
--      Stripe webhook — may move them.
--
-- Chose a trigger over splitting the policy because Postgres RLS has no
-- column-level UPDATE restriction: a policy can say which ROWS you may touch,
-- not which COLUMNS. Column privileges (`revoke update (col)`) would work but
-- fail with a bare permission error that PostgREST reports as a 403 with no
-- hint; the trigger names the column instead.

-- SECURITY INVOKER (the default) is load-bearing here — do not add DEFINER.
-- Inside a SECURITY DEFINER function `current_user` is the function's OWNER,
-- which is `postgres`, so the bypass branch below would match on every call and
-- the guard would silently allow everything. That is exactly what the first
-- version of this migration did, and the exploit test caught it: the update
-- succeeded with no error. A trigger that only inspects OLD/NEW needs no
-- elevated rights, so invoker rights are also the correct privilege level.
create or replace function public.guard_profile_billing_columns()
returns trigger language plpgsql set search_path = public as $$
declare
  v_changed text;
begin
  -- The webhook and migrations run as these; they are the only writers allowed
  -- to move entitlements. A normal PostgREST request is `authenticated`/`anon`.
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  -- `is distinct from` so a NULL -> NULL no-op does not trip the guard. A
  -- client that re-sends the whole row unchanged must still succeed, or every
  -- ordinary profile save would fail.
  v_changed := case
    when new.subscription_tier     is distinct from old.subscription_tier     then 'subscription_tier'
    when new.subscription_status   is distinct from old.subscription_status   then 'subscription_status'
    when new.stripe_customer_id    is distinct from old.stripe_customer_id    then 'stripe_customer_id'
    when new.stripe_subscription_id is distinct from old.stripe_subscription_id then 'stripe_subscription_id'
    when new.ultimate_campaign     is distinct from old.ultimate_campaign     then 'ultimate_campaign'
    when new.extra_campaign_slots  is distinct from old.extra_campaign_slots  then 'extra_campaign_slots'
    when new.extra_character_slots is distinct from old.extra_character_slots then 'extra_character_slots'
    else null
  end;

  if v_changed is not null then
    raise exception 'ENTITLEMENT_READONLY: % is set by billing, not by the client.', v_changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_billing on public.profiles;
create trigger trg_guard_profile_billing
  before update on public.profiles
  for each row execute procedure public.guard_profile_billing_columns();

-- VERIFY: as a normal logged-in user,
--   PATCH /rest/v1/profiles?id=eq.<own uid>  {"subscription_tier":"pro"}
-- must fail with ENTITLEMENT_READONLY, and the value must be unchanged after.
-- Updating display_name in the same way must still succeed.


-- =============================================================
-- 2. characters — actually enforce the share token
-- =============================================================
-- WAS: `create policy "Public share read" on characters for select
--       using (share_enabled = true)` — no TO clause, and it never referenced
--       share_token. The token was a client-side filter only, so
--       `GET /rest/v1/characters?select=*` with just the anon key returned
--       EVERY shared sheet: names, backstories, notes, personality traits,
--       bonds, flaws and user_id.
--
-- NOW: the anon-readable policy is gone and share reads go through a
--      SECURITY DEFINER function that takes the token as an argument. RLS
--      policies cannot see query parameters, so a policy simply cannot check a
--      token the caller supplies — a function is the only way to require it.

create or replace function public.get_shared_character(p_token text)
returns setof public.characters
language sql
security definer
stable
set search_path = public
as $$
  select *
  from public.characters
  where share_enabled = true
    and share_token is not null
    -- Guard against a null/empty token matching a null column.
    and p_token is not null
    and length(trim(p_token)) > 0
    and share_token = p_token
  limit 1;
$$;

revoke all on function public.get_shared_character(text) from public;
grant execute on function public.get_shared_character(text) to anon, authenticated;

drop policy if exists "Public share read" on public.characters;

-- VERIFY: anonymous `GET /rest/v1/characters?select=*` returns zero rows.
-- `POST /rest/v1/rpc/get_shared_character {"p_token":"<valid>"}` returns the
-- sheet; the same call with a wrong token returns nothing.


-- =============================================================
-- 3. storage — stop cross-user writes into the assets bucket
-- =============================================================
-- WAS: the battlemap-assets INSERT policy checked only `bucket_id`, so any
--      authenticated user could write into any other user's folder. UPDATE and
--      DELETE both already carried the folder-ownership predicate; INSERT
--      being without one was an oversight, not a design.

drop policy if exists "battlemap_assets_insert" on storage.objects;
create policy "battlemap_assets_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'battlemap-assets'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- NOTE — the bucket stays PUBLIC-READ, deliberately, against the audit's
-- "flip the bucket private". Public read is a design decision here, not a
-- hole: campaign members fetch token portraits and scene backgrounds straight
-- from the CDN, and making the bucket private means every one of those becomes
-- a signed-URL round trip that expires mid-session. The actual vulnerability
-- was the write path, which is what this closes. Revisit only if assets ever
-- carry something private; today they are art the whole table is looking at.

-- VERIFY: as user A, upload to a path prefixed with user B's UUID → denied.
-- Uploading under A's own UUID still works.


-- =============================================================
-- 4. get_campaign_by_code — no anonymous campaign enumeration
-- =============================================================
-- WAS: SECURITY DEFINER with no REVOKE, so anyone holding the anon key could
--      walk join codes and harvest campaign names plus owner_id UUIDs. Those
--      UUIDs are what made the edge-function takeover easy to exploit. The
--      newer join_campaign_by_code revokes correctly — this was an
--      inconsistency rather than a pattern.
--
-- Joining a campaign already requires being signed in (the route is behind
-- ProtectedRoute), so authenticated-only costs the real flow nothing.

revoke all on function public.get_campaign_by_code(text) from public, anon;
grant execute on function public.get_campaign_by_code(text) to authenticated;

-- VERIFY: call the RPC with only the anon key → denied. Signed in → works.
