-- v2.869: the original campaign DM can close a saved reaction even after
-- its character leaves. This endpoint cannot apply a roll or change resources.
create or replace function dndkeep_private.cancel_telepath_reaction_by_dm(p_request uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d dndkeep_private.telepath_declarations; a public.pending_attacks; offer public.pending_reactions;
 campaign uuid; outcome jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to cancel the saved reaction';end if;
 select * into d from dndkeep_private.telepath_declarations where request_id=p_request;
 if not found then raise exception 'Saved Telepath reaction is unavailable';end if;
 campaign:=(d.context->'attack'->'snapshot'->>'campaignId')::uuid;
 if not exists(select 1 from public.campaigns where id=campaign and owner_id=auth.uid())
  or not exists(select 1 from public.pending_attacks where id=d.attack_id and campaign_id=campaign) then
  raise exception 'Only the original campaign DM can cancel this reaction';end if;
 -- Match the normal lifecycle's character -> attack lock order. Never use the
 -- current-campaign character helper here: departure is exactly this case.
 perform 1 from public.characters where id=d.character_id for update;
 if not found then raise exception 'Saved Telepath character is unavailable';end if;
 select * into d from dndkeep_private.telepath_declarations where request_id=p_request;
 if not found then raise exception 'Saved Telepath reaction is unavailable';end if;
 select * into a from public.pending_attacks where id=d.attack_id and campaign_id=campaign for update;
 if not found or not exists(select 1 from public.campaigns where id=campaign and owner_id=auth.uid())
  or d.context->'attack'->'snapshot'->>'campaignId' is distinct from campaign::text then
  raise exception 'Only the original campaign DM can cancel this reaction';end if;
 if d.result is not null then
  if d.result->'cancelled' is distinct from 'true'::jsonb then raise exception 'A completed Telepath reaction cannot be canceled';end if;
  return d.result||jsonb_build_object('replayed',true);
 end if;
 if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'Enter a cancellation reason (1-500 characters)';end if;
 select * into offer from public.pending_reactions where id=d.request_id and pending_attack_id=a.id
  and campaign_id=campaign and reaction_key='telepath_'||(d.request->>'feature') for update;
 if not found or offer.state<>'offered' then raise exception 'Saved Telepath offer is unavailable';end if;
 outcome:=jsonb_build_object('requestId',d.request_id,'cancelled',true,'reactionCost',1,'energyCost',0,'energy',null,
  'replayed',false,'cancelReason',btrim(p_reason),'canceledBy',auth.uid());
 update dndkeep_private.telepath_declarations set result=outcome where request_id=d.request_id;
 update public.pending_reactions set state='declined',decided_at=now(),decision_payload=outcome where id=d.request_id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload)
 values(campaign,a.encounter_id,a.chain_id,3,'dm',auth.uid(),'DM','player',offer.reactor_name,'dm_override',
  jsonb_build_object('action_name','Cancel '||offer.reaction_name,'description',btrim(p_reason)||' Reaction and any spent Hit Dice remain spent; no Energy Die is charged.',
   'declaration_id',d.request_id,'reaction_cost',1,'energy_cost',0,'reason',btrim(p_reason)));
 return outcome;
end;$$;
revoke all on function dndkeep_private.cancel_telepath_reaction_by_dm(uuid,text) from public,anon;
grant execute on function dndkeep_private.cancel_telepath_reaction_by_dm(uuid,text) to authenticated;
create or replace function public.cancel_telepath_reaction_by_dm(p_request uuid,p_reason text)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.cancel_telepath_reaction_by_dm(p_request,p_reason);
$$;
revoke all on function public.cancel_telepath_reaction_by_dm(uuid,text) from public,anon;
grant execute on function public.cancel_telepath_reaction_by_dm(uuid,text) to authenticated;
notify pgrst,'reload schema';
