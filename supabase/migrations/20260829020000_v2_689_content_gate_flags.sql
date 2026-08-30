-- v2.689.0 — Give every gated content source BOTH switches, and make the
-- per-account one actually mean something.
--
-- Owner's ask, 2026-08-29: "The PSION abilities need to work similar to how
-- we're doing the artificer — they need to be able to be flipped on through
-- the whole site or by only a certain account."
--
-- So each gated source now answers to two independent controls:
--
--   site-wide   a constant in src/data/contentGates.ts — on for everyone
--   per-account a boolean column here                  — on for one person
--
-- Visible when EITHER is on. The Psion had only the account column; the
-- Artificer (v2.688) had only the constant. Now both have both.
--
-- ── THE PART THAT WAS NOT ACTUALLY A GATE ────────────────────────────────
-- `profiles.show_ua_content` has been self-serve since it was introduced.
-- The "profiles: own row update" policy lets a user write their own row, and
-- the v2.683 guard trigger deliberately let this column through — its comment
-- reads "users legitimately edit display_name, show_ua_content,
-- active_dice_skin". No UI ever exposed it, but a single PostgREST call
--
--   PATCH /rest/v1/profiles?id=eq.<own uid>  {"show_ua_content": true}
--
-- turned the Psion on for anybody who thought to try. "Only a certain account"
-- was not true of the mechanism, only of the interface.
--
-- Both content flags are added to the guard trigger below, so they can only be
-- granted by service_role / postgres — i.e. from the dashboard or a migration,
-- never by the account itself. Nothing in the app writes them (checked: no
-- component references show_ua_content except to read it through AuthContext),
-- so this breaks no existing flow.

-- ── 1. The new per-account flag ──────────────────────────────────────────
alter table public.profiles
  add column if not exists show_non_srd_content boolean not null default false;

comment on column public.profiles.show_non_srd_content is
  'Per-account access to published-but-not-SRD content (the Artificer). Granted by an admin only — see the guard trigger. Site-wide equivalent: NON_SRD_CONTENT_ENABLED in src/data/contentGates.ts.';

comment on column public.profiles.show_ua_content is
  'Per-account access to Unearthed Arcana / playtest content (the Psion). Granted by an admin only — see the guard trigger. Site-wide equivalent: UA_CONTENT_ENABLED in src/data/contentGates.ts.';

-- ── 2. Guard both flags the way billing columns are guarded ──────────────
-- Rewrites the v2.683 function, keeping its billing branch verbatim and adding
-- a content branch with its own error code so the two are distinguishable by a
-- client. Same trigger, so no DDL on the table itself.
create or replace function public.guard_profile_billing_columns()
returns trigger language plpgsql set search_path = public as $$
declare
  v_changed text;
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

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

  -- v2.689.0 — content access is granted, not chosen.
  v_changed := case
    when new.show_ua_content      is distinct from old.show_ua_content      then 'show_ua_content'
    when new.show_non_srd_content is distinct from old.show_non_srd_content then 'show_non_srd_content'
    else null
  end;

  if v_changed is not null then
    raise exception 'CONTENT_ACCESS_READONLY: % is granted by an admin, not by the client.', v_changed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── Guard ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'show_non_srd_content'
  ) then
    raise exception 'show_non_srd_content was not added to public.profiles.';
  end if;
end $$;
