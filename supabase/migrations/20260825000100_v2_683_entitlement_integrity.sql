-- v2.683.0 — Entitlement integrity: only billing grants paid things.
--
-- Phase 2 items 3, 4 and 5 in docs/MVP_LAUNCH.md. Companion to the security
-- lockdown migration: that one stops users editing their own entitlements
-- directly, this one closes the side doors that handed out the same things.

-- =============================================================
-- 1. dice_skin_unlocks — the webhook grants skins, nobody else
-- =============================================================
-- WAS: `for insert with check (auth.uid() = user_id)` — the check proved you
--      were inserting a row for YOURSELF, and said nothing at all about
--      skin_id. So any user could insert {user_id: me, skin_id: 'crimson'} and
--      own a paid dice set for free.
--
-- NOW: no INSERT policy for normal clients at all. RLS denies by default, so
--      the absence of a policy IS the lockdown; the service role bypasses RLS
--      entirely, which is how the Stripe webhook will write these.
--
-- Deliberately not replaced with a cleverer predicate: there is no fact
-- available to a client-side INSERT that proves payment. Only the webhook
-- knows, so only the webhook writes.

drop policy if exists "Users insert own unlocks" on public.dice_skin_unlocks;

-- SELECT stays as it was: you can see what you own.
-- (policy "Users see own unlocks" — using auth.uid() = user_id)

-- VERIFY: signed in, `POST /rest/v1/dice_skin_unlocks
-- {"user_id":"<own>","skin_id":"crimson"}` → denied. Skins already owned still
-- load in the dice picker.


-- =============================================================
-- 2. characters — the free-tier cap was wrong in both directions
-- =============================================================
-- WAS: enforce_character_limit() hardcoded a limit of 1 for tier 'free' and
--      ignored extra_character_slots entirely. It was the only server-side cap
--      and it contradicted src/lib/entitlements.ts both ways: a user who BOUGHT
--      slots still could not use them, and a user on any non-'free' tier string
--      had no cap whatsoever.
--
-- NOW: mirrors entitlements.ts exactly —
--        totalCharacterSlots = min(MAX_CHARACTER_SLOTS, BASE + extra)
--        BASE = 1, MAX = 10
--      and applies to EVERY tier, because slots are owned permanently and are
--      not a subscription benefit. A subscription buys the level cap coming
--      off and a campaign to DM; it does not buy character slots.
--
-- Keep these two numbers in step with BASE_CHARACTER_SLOTS and
-- MAX_CHARACTER_SLOTS in src/lib/entitlements.ts.

create or replace function public.enforce_character_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_extra integer;
  v_total integer;
  v_count integer;
begin
  select coalesce(extra_character_slots, 0) into v_extra
  from public.profiles where id = new.user_id;

  -- No profile row (shouldn't happen — handle_new_user creates one) falls back
  -- to the base allowance rather than to "unlimited".
  v_total := least(10, 1 + coalesce(v_extra, 0));

  select count(*) into v_count from public.characters where user_id = new.user_id;

  if v_count >= v_total then
    raise exception
      'CHARACTER_SLOT_LIMIT: You are using all % of your character slots. Buy another slot to create more.', v_total
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- VERIFY: on a fresh account, creating a 2nd character fails. Grant
-- extra_character_slots = 1 as the service role, and the 2nd succeeds while a
-- 3rd fails. An account at 9 extra slots can hold 10 characters, not 11.


-- =============================================================
-- 3. stripe_events — make webhook delivery idempotent
-- =============================================================
-- Phase 2 item 3. Stripe retries on any non-2xx, and it can also deliver the
-- same event more than once at least-once semantics. Without a record of what
-- has been processed, a retry re-grants: a duplicated one-time purchase means
-- a second character slot for one payment.
--
-- Insert-or-skip on the primary key is the whole mechanism. The webhook does
-- `insert ... on conflict do nothing` and stops if it affected zero rows.

create table if not exists public.stripe_events (
  id           text primary key,            -- Stripe's event.id (evt_...)
  type         text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- No policies, deliberately: this table is service-role only. RLS denies by
-- default, so no client can read what anyone has bought.

-- Housekeeping: Stripe events are only interesting while retries are possible.
-- Left unpruned for now (rows are tiny); if it ever matters, a pg_cron job in
-- the shape of client_errors_retention can trim past 90 days.

comment on table public.stripe_events is
  'Processed Stripe webhook event ids, for idempotency. Service-role only.';
