-- v2.640 audit 2.8: client error telemetry sink table.
--
-- Write-only from the app's perspective: anon + authenticated may INSERT,
-- nobody may SELECT/UPDATE/DELETE through PostgREST (no policies, no
-- grants) — the owner reads rows in Supabase Studio, which uses the
-- service role and bypasses RLS. Client-side batching/dedupe lives in
-- src/lib/logSinkSupabase.ts; the sink tolerates this table not existing
-- yet (prod lags until its migration workflow lands — see the owner
-- queue in .claude/audit/dndkeep-audit.md).
--
-- IF NOT EXISTS guards are defense-in-depth per the 2026-08-04 migration
-- convention; the schema_migrations ledger is the real once-ness gate.

create table if not exists public.client_errors (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  app_version text,
  level       text not null default 'error',
  message     text not null,
  stack       text,
  route       text,
  user_id     uuid,          -- no FK: keep error rows even if the user is deleted
  browser     text,
  count       integer not null default 1,  -- client-side dedupe: occurrences folded into one row
  context     jsonb
);

-- Owner triage pattern is "what broke recently" — index newest-first.
create index if not exists client_errors_occurred_at_idx
  on public.client_errors (occurred_at desc);

alter table public.client_errors enable row level security;

drop policy if exists "client_errors_insert" on public.client_errors;
create policy "client_errors_insert" on public.client_errors
  for insert to anon, authenticated
  with check (true);

grant insert on public.client_errors to anon, authenticated;
