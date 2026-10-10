-- v2.869: history belongs to the saved lifecycle transaction, not a browser
-- callback. Existing rows are not backfilled with invented historical events.
create or replace function dndkeep_private.log_saved_telepath_step()
returns trigger language plpgsql security definer set search_path='' as $$
declare d dndkeep_private.telepath_declarations; a public.pending_attacks; o public.pending_reactions;
 stage text; title text; detail text; payload jsonb; faces jsonb; sides integer; seq integer;
 kind text:='reaction_used'; hit_cost integer:=0; energy_cost integer:=0; reaction_cost integer:=0;
begin
 if tg_table_name='telepath_enhancements' then
  select * into d from dndkeep_private.telepath_declarations where request_id=new.declaration_id;
  stage:=new.kind;seq:=case when new.kind='enkindled' then 71 else 72 end;kind:='generic_roll';
  if new.kind='enkindled' then
   select to_jsonb(base_rolls||extra_rolls),cardinality(extra_rolls) into faces,hit_cost from public.psionic_feature_uses where request_id=new.request_id and character_id=d.character_id;
  else
   select to_jsonb(adjusted_rolls),1 into faces,hit_cost from public.psionic_surge_uses where request_id=new.request_id and character_id=d.character_id;
  end if;
  if faces is null then raise exception 'Telepath enhancement history requires its saved payment';end if;
  title:=case when new.kind='enkindled' then 'Enkindled' else 'Psionic Surge' end;
  detail:=hit_cost||case when hit_cost=1 then ' Hit Die spent; saved dice ' else ' Hit Dice spent; saved dice ' end||faces::text||'.';
  payload:=jsonb_build_object('enhancement_id',new.request_id);
 else
  d:=new;
  if tg_op='INSERT' then
   if d.result is not null then return new;end if;
   stage:='declared';seq:=70;reaction_cost:=1;faces:=jsonb_build_array(d.base_roll);
   detail:='Reaction spent; saved base die '||d.base_roll||'. Energy payment waits for the outcome.';
  else
   if old.result is not null or d.result is null then return new;end if;
   -- Original-campaign cleanup already writes one reasoned dm_override event.
   if d.result ? 'canceledBy' then return new;end if;
   stage:=case when (d.result->>'cancelled')::boolean then 'cancelled' else 'resolved' end;seq:=73;
   energy_cost:=(d.result->>'energyCost')::integer;
   faces:=case when stage='cancelled' then null else d.result->'rolls' end;
   detail:=case when stage='cancelled' then 'Canceled. Reaction and any paid Hit Dice remain spent; no Energy Die charged.'
    else 'Attack '||(d.result->>'originalTotal')||' to '||(d.result->>'total')||' ('||(d.result->>'result')||'); '||energy_cost||case when energy_cost=1 then ' Energy Die spent.' else ' Energy Dice spent.' end end;
  end if;
  title:=d.source_feature;payload:=coalesce(d.result,'{}'::jsonb);
 end if;
 select * into a from public.pending_attacks where id=d.attack_id and campaign_id=(d.context->'attack'->'snapshot'->>'campaignId')::uuid;
 if not found then raise exception 'Telepath history attack is unavailable';end if;
 select * into o from public.pending_reactions where id=d.request_id and pending_attack_id=a.id;
 if not found then raise exception 'Telepath history offer is unavailable';end if;
 sides:=case when d.psion_level>=17 then 12 when d.psion_level>=11 then 10 when d.psion_level>=5 then 8 else 6 end;
 payload:=payload||jsonb_build_object('declaration_id',d.request_id,'telepath_stage',stage,'source_feature',d.source_feature,
  'action_name',title||' — '||detail,'description',detail,'reaction_cost',reaction_cost,'hit_dice_cost',hit_cost,'energy_cost',energy_cost,
  'individual_results',coalesce(faces,'[]'::jsonb),'dice_expression',case when faces is null then '' else jsonb_array_length(faces)||'d'||sides end);
 if stage='resolved' then payload:=payload||jsonb_build_object('hit_result',d.result->>'result');end if;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload)
 values(a.campaign_id,a.encounter_id,a.chain_id,seq,'player',d.character_id,o.reactor_name,
  case when d.context->'subject'->>'participantType'='character' then 'player' else 'creature' end,a.attacker_name,kind,payload);
 return new;
end;$$;
revoke all on function dndkeep_private.log_saved_telepath_step() from public,anon,authenticated;
drop trigger if exists telepath_declaration_history on dndkeep_private.telepath_declarations;
create trigger telepath_declaration_history after insert or update of result on dndkeep_private.telepath_declarations for each row execute function dndkeep_private.log_saved_telepath_step();
drop trigger if exists telepath_enhancement_history on dndkeep_private.telepath_enhancements;
create trigger telepath_enhancement_history after insert on dndkeep_private.telepath_enhancements for each row execute function dndkeep_private.log_saved_telepath_step();

-- DM cleanup retains prior spending; its history entry is not another Reaction.
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
  jsonb_build_object('action_name','Cancel '||offer.reaction_name||' — '||btrim(p_reason),'description',btrim(p_reason)||' Reaction and any spent Hit Dice remain spent; no Energy Die is charged.',
   'declaration_id',d.request_id,'reaction_cost',0,'energy_cost',0,'reaction_retained',true,'hit_dice_retained',true,'telepath_stage','cancelled','reason',btrim(p_reason)));
 return outcome;
end;$$;
revoke all on function dndkeep_private.cancel_telepath_reaction_by_dm(uuid,text) from public,anon;
grant execute on function dndkeep_private.cancel_telepath_reaction_by_dm(uuid,text) to authenticated;
