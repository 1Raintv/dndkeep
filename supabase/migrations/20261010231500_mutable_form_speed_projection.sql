-- v2.869: computed participant field, not a stored change to base Speed.
-- Unnamed composite argument keeps this out of the RPC endpoint surface.
create or replace function public.mutable_form_speed_bonus(public.combat_participants)
returns integer language sql stable security invoker set search_path='' as $$
 select case when ($1).participant_type='character' then
  case when dndkeep_private.get_mutable_form_active(($1).entity_id::uuid) is null then 0 else 5 end
 else 0 end;
$$;
revoke all on function public.mutable_form_speed_bonus(public.combat_participants) from public,anon;
grant execute on function public.mutable_form_speed_bonus(public.combat_participants) to authenticated;
notify pgrst,'reload schema';

-- Campaign game-time advances must refresh computed effects even outside a
-- turn transition. Existing campaign RLS still controls realtime visibility.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
  and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaigns') then
  alter publication supabase_realtime add table public.campaigns;
 end if;
end;$$;
