-- v2.550 — keep_warm RPC for the GitHub Action keep-warm cron.
-- Prevents Supabase free-tier auto-pause (2 production outages caused by it).
-- Deliberately trivial: no table coupling, no RLS dependency, can't silently rot.

create or replace function public.keep_warm()
returns int
language sql
stable
as $$
  select 1;
$$;

-- Anon-callable on purpose: the Action authenticates with the anon key.
grant execute on function public.keep_warm() to anon;
grant execute on function public.keep_warm() to authenticated;
