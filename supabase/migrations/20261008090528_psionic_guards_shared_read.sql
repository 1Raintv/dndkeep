-- v2.822: other campaign players may resolve an ability against a character,
-- but must not receive the private discipline ledger or resource receipts.
-- Return only current Guards protection; no locks or resource writes needed.
create or replace function dndkeep_private.get_psionic_guards_active(p_character_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to read protection'; end if;
 if not exists (
  select 1 from public.characters c where c.id=p_character_id and (
   c.user_id=auth.uid()
   or exists(select 1 from public.campaigns ca where ca.id=c.campaign_id and ca.owner_id=auth.uid())
   or exists(select 1 from public.campaign_members cm where cm.campaign_id=c.campaign_id and cm.user_id=auth.uid())
  )
 ) then raise exception 'Character protection is unavailable'; end if;
 return dndkeep_private.psionic_guards_effect(p_character_id) is not null;
end; $$;
revoke all on function dndkeep_private.get_psionic_guards_active(uuid) from public,anon;
grant execute on function dndkeep_private.get_psionic_guards_active(uuid) to authenticated;

create or replace function public.get_psionic_guards_active(p_character_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select dndkeep_private.get_psionic_guards_active(p_character_id);
$$;
revoke all on function public.get_psionic_guards_active(uuid) from public,anon;
grant execute on function public.get_psionic_guards_active(uuid) to authenticated;
