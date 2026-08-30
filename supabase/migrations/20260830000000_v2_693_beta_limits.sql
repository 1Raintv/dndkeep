-- v2.693.0 — Beta allowances, server side.
--
-- Owner's decision (2026-08-30): the initial release is invite-only with Stripe
-- off and no shop. Each tester gets two characters and one campaign.
--
-- The client already applies these numbers (src/lib/betaMode.ts), but the
-- database enforces both limits independently, and it has to agree — otherwise
-- the UI offers a second character and the insert is refused, or offers a
-- campaign and the Pro gate rejects it. A client-only change would have made
-- the beta look broken in exactly the places it is meant to open up.
--
-- ── TURNING BILLING BACK ON ──────────────────────────────────────────────
-- Set `enabled: false` in src/lib/betaMode.ts AND apply a migration restoring
-- these two functions to the bodies preserved in the comments below. They are
-- reproduced verbatim so the revert is a copy-paste, not an archaeology
-- exercise. src/lib/betaMode.test.ts parses THIS FILE and fails if its numbers
-- and the TypeScript ones ever drift apart.

-- ── Characters: 1 + purchased  →  a flat 2 ───────────────────────────────
-- Restore to:
--     v_total := least(10, 1 + coalesce(v_extra, 0));
-- and put the "Buy another slot" wording back.
create or replace function public.enforce_character_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_extra integer;
  v_total integer;
  v_count integer;
begin
  select coalesce(extra_character_slots, 0) into v_extra
  from public.profiles where id = new.user_id;

  -- BETA: a flat allowance. Nothing can be purchased while the shop is off, so
  -- base+extra would just be "1" for everyone. Keep this number in step with
  -- BETA.characterSlots in src/lib/betaMode.ts.
  v_total := 2;

  select count(*) into v_count from public.characters where user_id = new.user_id;

  if v_count >= v_total then
    raise exception
      'CHARACTER_SLOT_LIMIT: You are using all % of your character slots for the beta.', v_total
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ── Campaigns: Pro subscribers only  →  one each ─────────────────────────
-- Restore to:
--     select subscription_tier into v_tier from profiles where id = new.owner_id;
--     if v_tier != 'pro' then
--       raise exception 'PRO_REQUIRED: Campaign management requires a Pro subscription.';
--     end if;
--
-- The tier check is replaced rather than loosened: during the beta every
-- account is `free`, deliberately (no billing state is faked), so a tier test
-- would refuse everybody. A count check is what "one campaign each" means.
create or replace function public.enforce_campaign_pro_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_limit integer := 1;   -- keep in step with BETA.campaignSlots
begin
  select count(*) into v_count from public.campaigns where owner_id = new.owner_id;

  if v_count >= v_limit then
    raise exception
      'CAMPAIGN_LIMIT: You are using your campaign slot for the beta.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ── Guard ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'enforce_character_limit') then
    raise exception 'enforce_character_limit is missing.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'enforce_campaign_pro_gate') then
    raise exception 'enforce_campaign_pro_gate is missing.';
  end if;
  raise notice 'Beta limits active: 2 characters, 1 campaign per account.';
end $$;
