-- Read the shared normal-action budget without exposing claims or grant writers.
create or replace function dndkeep_private.read_action_budget(p_character uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; participant public.combat_participants; claimed jsonb; spent jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 context:=dndkeep_private.action_turn_context(c.id);
 select jsonb_build_object('action',coalesce(bool_or(grant_id='normal:action'),false),
  'bonusAction',coalesce(bool_or(grant_id='normal:bonusAction'),false),
  'reaction',coalesce(bool_or(grant_id='normal:reaction'),false)) into claimed
 from dndkeep_private.action_claims where character_id=c.id and owner_turn_id=context->>'ownerTurnId';
 if context->>'participantId' is not null then
  select * into participant from public.combat_participants where id=(context->>'participantId')::uuid;
 end if;
 spent:=jsonb_build_object('action',(claimed->>'action')::boolean or coalesce(participant.action_used,false)
   or coalesce(participant.attacks_remaining<participant.attacks_per_action,false),
  'bonusAction',(claimed->>'bonusAction')::boolean or coalesce(participant.bonus_used,false),
  'reaction',(claimed->>'reaction')::boolean or coalesce(participant.reaction_used,false));
 return jsonb_build_object('context',context,'spent',spent,'claimed',claimed);
end;$$;
revoke all on function dndkeep_private.read_action_budget(uuid) from public,anon;
grant execute on function dndkeep_private.read_action_budget(uuid) to authenticated;
create or replace function public.get_action_budget(p_character uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.read_action_budget(p_character);
$$;
revoke all on function public.get_action_budget(uuid) from public,anon;
grant execute on function public.get_action_budget(uuid) to authenticated;
