-- v2.869: distinguish a recorded decline from an ordinary zero-damage miss.
create or replace function dndkeep_private.read_graze_choice(p_attack_id uuid)
returns boolean language plpgsql security definer stable set search_path='' as $$
declare a public.pending_attacks; r jsonb;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then
  raise exception 'Graze choice is available to the current DM only';end if;
 select request into r from dndkeep_private.damage_roll_records where attack_id=a.id;
 if r->>'kind' is distinct from 'graze' then return null;end if;
 return (r->>'useGraze')::boolean;
end;$$;
revoke all on function dndkeep_private.read_graze_choice(uuid) from public,anon;
grant execute on function dndkeep_private.read_graze_choice(uuid) to authenticated;
create or replace function public.read_graze_choice(p_attack_id uuid) returns boolean
 language sql security invoker stable set search_path='' as $$select dndkeep_private.read_graze_choice(p_attack_id);$$;
revoke all on function public.read_graze_choice(uuid) from public,anon;
grant execute on function public.read_graze_choice(uuid) to authenticated;
notify pgrst,'reload schema';
