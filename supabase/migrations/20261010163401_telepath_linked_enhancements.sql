-- v2.869: link Hit Die enhancements to the saved Telepath base die.
alter table dndkeep_private.telepath_declarations add column if not exists turn_context jsonb;
create table if not exists dndkeep_private.telepath_enhancements(
 request_id uuid primary key,
 declaration_id uuid not null references dndkeep_private.telepath_declarations(request_id) on delete cascade,
 kind text not null check(kind in('enkindled','surge')),
 request jsonb not null,unique(declaration_id,kind)
);
alter table dndkeep_private.telepath_enhancements enable row level security;
revoke all on dndkeep_private.telepath_enhancements from public,anon,authenticated;

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
 insert into dndkeep_private.telepath_declarations(request_id,character_id,attack_id,request,context,review,bindings,turn_context,action_receipt,base_roll,psion_level,source_feature)
 values(p_request,c.id,a.id,req,ctx,p_review,bindings,public.psionic_turn_context_internal(c.id),action,p_roll,(ctx->>'psionLevel')::integer,feature_name) returning * into d;
 return to_jsonb(d)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.begin_telepath_reaction(uuid,uuid,uuid,text,jsonb,integer,jsonb) from public,anon,authenticated;


create or replace function dndkeep_private.enhance_telepath_reaction(p_character uuid,p_declaration uuid,p_request uuid,p_kind text,p_extra integer[],p_hit_die integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.telepath_declarations; prior dndkeep_private.telepath_enhancements;
 req jsonb; rolls integer[]; extra integer[]; payment jsonb; a public.pending_attacks; bindings jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.telepath_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Telepath declaration unavailable';end if;
 if p_request is null or p_request=p_declaration or p_kind is null or p_kind not in('enkindled','surge') then raise exception 'Invalid Telepath enhancement';end if;
 req:=jsonb_build_object('declarationId',p_declaration,'kind',p_kind,'extraRolls',p_extra,'hitDie',p_hit_die);
 select * into prior from dndkeep_private.telepath_enhancements where request_id=p_request;
 if found then
  if prior.declaration_id<>p_declaration or prior.request<>req then raise exception 'Telepath enhancement identity changed';end if;
 else
  if d.result is not null then raise exception 'Telepath roll is already closed';end if;
  if d.turn_context is null or public.psionic_turn_context_internal(c.id) is distinct from d.turn_context then raise exception 'Telepath turn changed; no enhancement spent';end if;
  if public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level)<>d.psion_level
   or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Telepath' then raise exception 'Psion progression changed; review the saved roll';end if;
  select * into a from public.pending_attacks where id=d.attack_id for update;
  if not found or a.state<>'attack_rolled' or a.updated_at is distinct from (d.context->'attack'->>'updatedAt')::timestamptz
   or not exists(select 1 from public.pending_reactions where id=d.request_id and pending_attack_id=d.attack_id and state='offered') then raise exception 'Attack changed; no enhancement spent';end if;
  perform 1 from public.combat_participants p where p.id in(a.attacker_participant_id,a.target_participant_id,(d.context->'budget'->'context'->>'participantId')::uuid)
   order by p.id for share;
  select jsonb_object_agg(p.id::text,jsonb_build_object('combatantId',p.combatant_id,'entityId',p.entity_id,'type',p.participant_type)) into bindings
   from public.combat_participants p where p.id in(a.attacker_participant_id,a.target_participant_id,(d.context->'budget'->'context'->>'participantId')::uuid)
    and p.campaign_id=a.campaign_id and p.encounter_id=a.encounter_id;
  if d.bindings is null or bindings is distinct from d.bindings then raise exception 'Telepath participants changed; no enhancement spent';end if;
  if exists(select 1 from dndkeep_private.telepath_enhancements where declaration_id=p_declaration and kind=p_kind) then raise exception 'Telepath already has this enhancement';end if;
  if p_kind='enkindled' and exists(select 1 from dndkeep_private.telepath_enhancements where declaration_id=p_declaration and kind='surge') then raise exception 'Choose extra dice before Surge';end if;
  if exists(select 1 from dndkeep_private.psionic_discipline_uses where request_id=p_request)
   or exists(select 1 from public.psionic_feature_uses where request_id=p_request) or exists(select 1 from public.psionic_surge_uses where request_id=p_request)
   or exists(select 1 from public.psionic_energy_uses where request_id=p_request) or exists(select 1 from dndkeep_private.action_claims where request_id=p_request)
   then raise exception 'Enhancement payment identity is already used';end if;
 end if;
 rolls:=array[d.base_roll];
 if p_kind='enkindled' then
  if p_hit_die is not null then raise exception 'Enkindled does not select a Hit Die pool';end if;
  payment:=public.spend_enkindled_life_force(c.id,p_request,d.turn_context,cardinality(p_extra),rolls,p_extra,d.source_feature);
 else
  if p_extra is not null or p_hit_die is null then raise exception 'Select a Surge Hit Die pool';end if;
  select f.extra_rolls into extra from dndkeep_private.telepath_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
   where e.declaration_id=p_declaration and e.kind='enkindled';
  rolls:=rolls||coalesce(extra,'{}'::integer[]);
  payment:=public.spend_psionic_surge_from_pool(c.id,p_request,rolls,d.source_feature,p_hit_die);
 end if;
 if prior.request_id is null then insert into dndkeep_private.telepath_enhancements values(p_request,p_declaration,p_kind,req);end if;
 return payment||jsonb_build_object('declarationId',p_declaration,'kind',p_kind);
end;$$;
revoke all on function dndkeep_private.enhance_telepath_reaction(uuid,uuid,uuid,text,integer[],integer) from public,anon,authenticated;


create or replace function dndkeep_private.finish_telepath_reaction(p_character uuid,p_request uuid,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters;d dndkeep_private.telepath_declarations;a public.pending_attacks;
 evidence jsonb;budget jsonb;payment jsonb;bindings jsonb;extra integer[];original integer[];adjusted integer[];roll_total integer;outcome jsonb;total integer;hit text;changed boolean;cost integer;
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
  select f.extra_rolls into extra from dndkeep_private.telepath_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
   where e.declaration_id=d.request_id and e.kind='enkindled';
  original:=array[d.base_roll]||coalesce(extra,'{}'::integer[]);
  select s.adjusted_rolls into adjusted from dndkeep_private.telepath_enhancements e join public.psionic_surge_uses s on s.request_id=e.request_id
   where e.declaration_id=d.request_id and e.kind='surge';
  select sum(n)::integer into roll_total from unnest(coalesce(adjusted,original)) n;
  total:=a.attack_total+case when d.request->>'feature'='distraction' then -roll_total else roll_total end;
  hit:=case when evidence->'snapshot'->>'automatic'='failure' or a.cover_level='total' then 'miss'
   when a.attack_d20=20 then 'crit' when a.attack_d20=1 and (evidence->'snapshot'->>'naturalOneAutoFails')::boolean then 'fumble'
   when total<a.target_ac then 'miss' when (evidence->'snapshot'->>'criticalOnHit')::boolean then 'crit' else 'hit' end;
  changed:=(hit in('hit','crit')) is distinct from (a.hit_result in('hit','crit'));cost:=case when changed then 1 else 0 end;
  if cost=1 then payment:=public.settle_psionic_energy(c.id,d.request_id,'spend',1,array[d.base_roll],d.source_feature);end if;
  update public.pending_attacks set attack_total=total,hit_result=hit where id=a.id;
  outcome:=jsonb_build_object('requestId',d.request_id,'cancelled',false,'reactionCost',1,'energyCost',cost,'energy',payment,
   'originalTotal',a.attack_total,'total',total,'result',hit,'changed',changed,'roll',roll_total,'originalRolls',original,'enkindledRolls',coalesce(extra,'{}'::integer[]),
   'usedSurge',adjusted is not null,'rolls',coalesce(adjusted,original),'replayed',false);
 end if;
 update dndkeep_private.telepath_declarations set result=outcome where request_id=d.request_id;
 update public.pending_reactions set state=case when p_cancel then 'declined' else 'accepted' end,decided_at=now(),decision_payload=outcome where id=d.request_id;
 return outcome;
end;$$;
revoke all on function dndkeep_private.finish_telepath_reaction(uuid,uuid,boolean) from public,anon,authenticated;

