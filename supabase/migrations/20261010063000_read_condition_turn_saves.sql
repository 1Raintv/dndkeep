-- Recover committed condition saves before generating any new dice.
create or replace function public.get_condition_turn_save(p_participant uuid,p_turn uuid,p_condition text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;result jsonb;
begin
 select * into cp from public.combat_participants where id=p_participant;
 if auth.uid() is null or not found or not(exists(select 1 from public.campaigns where id=cp.campaign_id and owner_id=auth.uid())
  or (cp.participant_type='character' and exists(select 1 from public.characters where id::text=cp.entity_id and campaign_id=cp.campaign_id and user_id=auth.uid())))
 then raise exception 'Condition save is unavailable';end if;
 select r.result||jsonb_build_object('replayed',true) into result from dndkeep_private.condition_turn_saves r
 where participant_id=cp.id and turn_id=p_turn and condition_name=p_condition;
 return result;
end;$$;
revoke all on function public.get_condition_turn_save(uuid,uuid,text) from public,anon;
grant execute on function public.get_condition_turn_save(uuid,uuid,text) to authenticated;
