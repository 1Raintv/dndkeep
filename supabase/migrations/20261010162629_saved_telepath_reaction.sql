-- v2.869: private lifecycle; no player-facing dispatcher until enhancements
-- and reaction controls are integrated. DM review supplies visibility/range
-- evidence explicitly; this is not automatic map or special-sense validation.
create table if not exists dndkeep_private.telepath_declarations(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 attack_id uuid not null references public.pending_attacks(id) on delete cascade,
 request jsonb not null,context jsonb not null,review jsonb not null,bindings jsonb,
 action_receipt jsonb not null,base_roll integer not null,psion_level integer not null,
 source_feature text not null,result jsonb,created_at timestamptz not null default now()
);
alter table dndkeep_private.telepath_declarations add column if not exists bindings jsonb;
create index if not exists telepath_declaration_character_idx on dndkeep_private.telepath_declarations(character_id);
create index if not exists telepath_declaration_attack_idx on dndkeep_private.telepath_declarations(attack_id);
alter table dndkeep_private.telepath_declarations enable row level security;
revoke all on dndkeep_private.telepath_declarations from public,anon,authenticated;

create or replace function dndkeep_private.begin_telepath_reaction(
 p_character uuid,p_request uuid,p_attack uuid,p_feature text,p_expected jsonb,p_roll integer,p_review jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters;d dndkeep_private.telepath_declarations;a public.pending_attacks;
 req jsonb;ctx jsonb;action jsonb;bindings jsonb;sides integer;feature_name text;distance numeric;
begin
 c:=public.psionic_character_for_update(p_character);
 req:=jsonb_build_object('attackId',p_attack,'feature',p_feature,'expected',p_expected,'roll',p_roll,'review',p_review);
 if p_request is null then raise exception 'Telepath request identity is required';end if;
 select * into d from dndkeep_private.telepath_declarations where request_id=p_request;
 if found then
  if d.character_id is distinct from c.id or d.request is distinct from req then raise exception 'Saved Telepath request changed';end if;
  return to_jsonb(d)||jsonb_build_object('replayed',true);
 end if;
 if not exists(select 1 from public.campaigns where id=c.campaign_id and owner_id=auth.uid()) then raise exception 'DM review is required for this Telepath reaction';end if;
 -- Establish the shared turn/actor locks before locking the attack, then
 -- re-read its context under the lock to reject stale preparation.
 ctx:=dndkeep_private.telepath_attack_context(c.id,p_attack,p_feature);
 select * into a from public.pending_attacks where id=p_attack and campaign_id=c.campaign_id for update;
 if not found then raise exception 'Reaction attack is unavailable';end if;
 perform 1 from public.combat_participants p where p.id in(a.attacker_participant_id,a.target_participant_id,(ctx->'budget'->'context'->>'participantId')::uuid)
  order by p.id for share;
 ctx:=dndkeep_private.telepath_attack_context(c.id,p_attack,p_feature);
 if ctx is distinct from p_expected then raise exception 'Telepath context changed; review the attack again';end if;
 if ctx->'reactionAvailable' is distinct from 'true'::jsonb or (ctx->>'energyRemaining')::integer<1
  or ctx->'rangeVerified' is distinct from 'true'::jsonb then raise exception 'Telepath Reaction, die or range is unavailable';end if;
 if p_review is null or jsonb_typeof(p_review)<>'object' or p_review-array['distanceFeet','visible','confirmed']<>'{}'::jsonb
  or p_review->'confirmed' is distinct from 'true'::jsonb or jsonb_typeof(p_review->'distanceFeet') is distinct from 'number'
  or jsonb_typeof(p_review->'visible') is distinct from 'boolean' then raise exception 'Confirm Telepath distance and visibility';end if;
 distance:=(p_review->>'distanceFeet')::numeric;
 if distance<0 or distance>(ctx->>'telepathyRange')::integer
  or (ctx->'subject'->>'self')::boolean and distance<>0
  or not (p_review->>'visible')::boolean and not(p_feature='bolstering' and (ctx->'subject'->>'self')::boolean)
  then raise exception 'Telepath subject is not in range or visible';end if;
 sides:=case when (ctx->>'psionLevel')::integer>=17 then 12 when (ctx->>'psionLevel')::integer>=11 then 10 when (ctx->>'psionLevel')::integer>=5 then 8 else 6 end;
 if p_roll is null or p_roll not between 1 and sides then raise exception 'Invalid Telepath base die';end if;
 if exists(select 1 from public.psionic_energy_uses where request_id=p_request)
  or exists(select 1 from public.psionic_feature_uses where request_id=p_request)
  or exists(select 1 from public.psionic_surge_uses where request_id=p_request)
  or exists(select 1 from dndkeep_private.action_claims where request_id=p_request)
  or exists(select 1 from public.pending_reactions where id=p_request) then raise exception 'Telepath request identity already used';end if;
 select jsonb_object_agg(p.id::text,jsonb_build_object('combatantId',p.combatant_id,'entityId',p.entity_id,'type',p.participant_type)) into bindings
  from public.combat_participants p where p.id in(a.attacker_participant_id,a.target_participant_id,(ctx->'budget'->'context'->>'participantId')::uuid)
   and p.campaign_id=a.campaign_id and p.encounter_id=a.encounter_id;
 feature_name:=case when p_feature='distraction' then 'Telepathic Distraction' else 'Telepathic Bolstering' end;
 action:=dndkeep_private.claim_action(c.id,p_request,jsonb_build_object('turnId',ctx->'budget'->'context'->>'turnId',
  'grantId','normal:reaction','kind','reaction','purpose','feature','sourceId',feature_name));
 insert into public.pending_reactions(id,campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,trigger_point,expires_at,decision_payload)
 values(p_request,c.campaign_id,a.id,(ctx->'budget'->'context'->>'participantId')::uuid,c.name,'character','telepath_'||p_feature,feature_name,
  'post_attack_roll',now()+interval '2 minutes',jsonb_build_object('declarationId',p_request,'savedRoll',p_roll));
 insert into dndkeep_private.telepath_declarations(request_id,character_id,attack_id,request,context,review,bindings,action_receipt,base_roll,psion_level,source_feature)
 values(p_request,c.id,a.id,req,ctx,p_review,bindings,action,p_roll,(ctx->>'psionLevel')::integer,feature_name) returning * into d;
 return to_jsonb(d)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.begin_telepath_reaction(uuid,uuid,uuid,text,jsonb,integer,jsonb) from public,anon,authenticated;

create or replace function dndkeep_private.finish_telepath_reaction(p_character uuid,p_request uuid,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters;d dndkeep_private.telepath_declarations;a public.pending_attacks;
 evidence jsonb;budget jsonb;payment jsonb;bindings jsonb;outcome jsonb;total integer;hit text;changed boolean;cost integer;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.telepath_declarations where request_id=p_request and character_id=c.id;
 if not found or p_cancel is null then raise exception 'Saved Telepath reaction is unavailable';end if;
 if d.result is not null then
  if (d.result->>'cancelled')::boolean is distinct from p_cancel then raise exception 'Saved Telepath decision changed';end if;
  return d.result||jsonb_build_object('replayed',true);
 end if;
 budget:=dndkeep_private.read_action_budget(c.id);
 select * into a from public.pending_attacks where id=d.attack_id for update;
 if not found then raise exception 'Reaction attack is unavailable';end if;
 if not exists(select 1 from public.pending_reactions where id=d.request_id and pending_attack_id=a.id and state='offered') then raise exception 'Saved Telepath offer is unavailable';end if;
 if p_cancel then
  outcome:=jsonb_build_object('requestId',d.request_id,'cancelled',true,'reactionCost',1,'energyCost',0,'energy',null,'replayed',false);
 else
  if budget->'context' is distinct from d.context->'budget'->'context' then raise exception 'Telepath turn changed; cancel the saved reaction';end if;
  if public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level)<>d.psion_level
   or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Telepath' then raise exception 'Psion progression changed; cancel the saved reaction';end if;
  perform 1 from public.combat_participants p where p.id in(a.attacker_participant_id,a.target_participant_id,(d.context->'budget'->'context'->>'participantId')::uuid)
   order by p.id for share;
  evidence:=d.context->'attack';
  if a.state<>'attack_rolled' or a.attack_kind<>'attack_roll' or a.damage_raw is not null or a.damage_final is not null
   or a.campaign_id::text is distinct from evidence->'snapshot'->>'campaignId'
   or a.encounter_id::text is distinct from evidence->'snapshot'->>'encounterId'
   or a.attacker_participant_id::text is distinct from evidence->'snapshot'->>'attackerId'
   or a.target_participant_id::text is distinct from evidence->'snapshot'->>'targetId'
   or a.attack_roll_snapshot is distinct from evidence->'snapshot'
   or a.updated_at is distinct from (evidence->>'updatedAt')::timestamptz then raise exception 'Attack changed; review or cancel the saved Telepath reaction';end if;
  select jsonb_object_agg(p.id::text,jsonb_build_object('combatantId',p.combatant_id,'entityId',p.entity_id,'type',p.participant_type)) into bindings
   from public.combat_participants p where p.id in(a.attacker_participant_id,a.target_participant_id,(d.context->'budget'->'context'->>'participantId')::uuid)
    and p.campaign_id=a.campaign_id and p.encounter_id=a.encounter_id;
  if d.bindings is null or bindings is distinct from d.bindings then raise exception 'Telepath participants changed; cancel the saved reaction';end if;
  -- No new dice accepted here. Enhancements must be linked to this saved base
  -- before the finalizer is extended to read their receipts.
  total:=a.attack_total+case when d.request->>'feature'='distraction' then -d.base_roll else d.base_roll end;
  hit:=case when evidence->'snapshot'->>'automatic'='failure' or a.cover_level='total' then 'miss'
   when a.attack_d20=20 then 'crit' when a.attack_d20=1 and (evidence->'snapshot'->>'naturalOneAutoFails')::boolean then 'fumble'
   when total<a.target_ac then 'miss' when (evidence->'snapshot'->>'criticalOnHit')::boolean then 'crit' else 'hit' end;
  changed:=(hit in('hit','crit')) is distinct from (a.hit_result in('hit','crit'));cost:=case when changed then 1 else 0 end;
  if cost=1 then payment:=public.settle_psionic_energy(c.id,d.request_id,'spend',1,array[d.base_roll],d.source_feature);end if;
  update public.pending_attacks set attack_total=total,hit_result=hit where id=a.id;
  outcome:=jsonb_build_object('requestId',d.request_id,'cancelled',false,'reactionCost',1,'energyCost',cost,'energy',payment,
   'originalTotal',a.attack_total,'total',total,'result',hit,'changed',changed,'roll',d.base_roll,'replayed',false);
 end if;
 update dndkeep_private.telepath_declarations set result=outcome where request_id=d.request_id;
 update public.pending_reactions set state=case when p_cancel then 'declined' else 'accepted' end,decided_at=now(),decision_payload=outcome where id=d.request_id;
 return outcome;
end;$$;
revoke all on function dndkeep_private.finish_telepath_reaction(uuid,uuid,boolean) from public,anon,authenticated;

create or replace function dndkeep_private.guard_saved_telepath_offer()
returns trigger language plpgsql security definer set search_path='' as $$
declare d dndkeep_private.telepath_declarations;
begin
 select * into d from dndkeep_private.telepath_declarations where request_id=old.id;
 if not found then if tg_op='DELETE' then return old;else return new;end if;end if;
 -- Campaign/attack deletion may clean up its dependent offers; direct deletion
 -- must not erase the only recovery handle or release an unfinished result.
 if tg_op='DELETE' then
  if exists(select 1 from public.pending_attacks where id=d.attack_id)
   and exists(select 1 from public.characters where id=d.character_id) then raise exception 'Keep the saved Telepath reaction for recovery';end if;
  return old;
 end if;
 if (new.campaign_id,new.pending_attack_id,new.reactor_participant_id,new.reaction_key,new.trigger_point)
  is distinct from (old.campaign_id,old.pending_attack_id,old.reactor_participant_id,old.reaction_key,old.trigger_point) then raise exception 'Saved Telepath offer identity changed';end if;
 if d.result is null then
  if new.state<>'offered' or new.decision_payload is distinct from old.decision_payload then raise exception 'Finish or cancel the saved Telepath reaction';end if;
 elsif new.state is distinct from (case when (d.result->>'cancelled')::boolean then 'declined' else 'accepted' end)
  or new.decision_payload is distinct from d.result then raise exception 'Saved Telepath outcome changed';end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_saved_telepath_offer() from public,anon,authenticated;
drop trigger if exists guard_saved_telepath_offer on public.pending_reactions;
create trigger guard_saved_telepath_offer before update or delete on public.pending_reactions for each row execute function dndkeep_private.guard_saved_telepath_offer();
