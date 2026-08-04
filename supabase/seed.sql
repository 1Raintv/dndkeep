-- =============================================================
-- v2.638 — LOCAL development seed (applied automatically by
-- `supabase db reset`; NEVER runs against production — the CLI only
-- executes this against the local Docker stack).
--
-- Creates a deterministic test login + campaign so E2E flows and
-- manual local testing have a known starting point:
--   email:    test-dm@dndkeep.local
--   password: dndkeep-local-test
--   campaign: "Local Test Campaign" (user is owner + dm member)
--   character: "Seeded Fighter" (Fighter 1) — hosts the sheet flows
--     (3D dice roller, skill checks, HP panel) for E2E and manual testing
-- =============================================================

-- Test user (fixed UUID so later seed rows and tests can reference it).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'test-dm@dndkeep.local',
  extensions.crypt('dndkeep-local-test', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Local Test DM"}',
  now(), now(), '', '', '', ''
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"test-dm@dndkeep.local"}',
  'email', now(), now(), now()
);

-- profiles row is created by the on_auth_user_created trigger.
-- Campaign creation is Pro-gated AT THE DATABASE (PRO_REQUIRED trigger),
-- so the test user must be Pro before the campaign insert below.
update profiles
set subscription_tier = 'pro', subscription_status = 'active'
where id = '11111111-1111-1111-1111-111111111111';

insert into campaigns (id, owner_id, name, description)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Local Test Campaign',
  'Seeded by supabase/seed.sql for local development and E2E tests.'
);

-- campaign_members: the owner's dm membership row is added automatically
-- by a trigger on campaign insert — no explicit insert needed (it
-- conflicts on the (campaign_id, user_id) unique key if attempted).

-- Seed character: only 5 columns lack defaults; everything else
-- (ability scores, HP, slots) comes from column defaults. Gives E2E and
-- manual testing a ready character sheet — the surface that hosts the
-- 3D dice roller, skill checks, and the HP panel.
insert into characters (id, user_id, name, species, class_name, background)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Seeded Fighter',
  'Human',
  'Fighter',
  'Soldier'
);
