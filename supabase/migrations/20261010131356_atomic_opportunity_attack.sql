-- v2.869: bind each new OA offer and settle its attack/reaction/history once.
create table if not exists dndkeep_private.opportunity_attack_offers (
 offer_id uuid primary key references public.pending_reactions(id) on delete cascade,
 binding jsonb not null, request jsonb, receipt jsonb
);
alter table dndkeep_private.opportunity_attack_offers enable row level security;
revoke all on dndkeep_private.opportunity_attack_offers from public,anon,authenticated;

create or replace function dndkeep_private.opportunity_binding(p_actor uuid,p_target uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 -- Names/HP can change; identities, encounter and triggering turn cannot.
 select jsonb_build_object('campaign',a.campaign_id,'encounter',a.encounter_id,'turn',e.psionic_turn_id,
  'actor',jsonb_build_object('id',a.id,'type',a.participant_type,'entity',a.entity_id,'combatant',a.combatant_id,'definitionType',ac.definition_type,'definitionId',ac.definition_id),
  'target',jsonb_build_object('id',t.id,'type',t.participant_type,'entity',t.entity_id,'combatant',t.combatant_id,'definitionType',tc.definition_type,'definitionId',tc.definition_id)) into result
 from public.combat_participants a join public.combat_participants t on t.id=p_target
 join public.combat_encounters e on e.id=a.encounter_id
 join public.combatants ac on ac.id=a.combatant_id join public.combatants tc on tc.id=t.combatant_id
 where a.id=p_actor and a.id<>t.id and a.encounter_id=t.encounter_id and a.campaign_id=t.campaign_id
 and e.campaign_id=a.campaign_id and ac.campaign_id=a.campaign_id and tc.campaign_id=a.campaign_id;
 return result;
end;$$;
revoke all on function dndkeep_private.opportunity_binding(uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.capture_opportunity_offer()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_id uuid; binding jsonb;
begin
 if new.reaction_key<>'opportunity_attack' then return new;end if;
 if new.state<>'offered' or new.trigger_point<>'movement_out_of_reach' then raise exception 'Invalid Opportunity Attack offer';end if;
 target_id:=(new.decision_payload->>'mover_participant_id')::uuid;
 perform 1 from public.combat_encounters e join public.combat_participants p on p.encounter_id=e.id where p.id=new.reactor_participant_id for share of e;
 perform 1 from public.combat_participants where id in(new.reactor_participant_id,target_id) order by id for share;
 perform 1 from public.combatants where id in(select combatant_id from public.combat_participants where id in(new.reactor_participant_id,target_id)) order by id for share;
 binding:=dndkeep_private.opportunity_binding(new.reactor_participant_id,target_id);
 if binding is null or binding->>'campaign' is distinct from new.campaign_id::text then raise exception 'Opportunity Attack participants are unavailable';end if;
 insert into dndkeep_private.opportunity_attack_offers(offer_id,binding) values(new.id,binding);
 return new;
end;$$;
revoke all on function dndkeep_private.capture_opportunity_offer() from public,anon,authenticated;
drop trigger if exists capture_opportunity_offer on public.pending_reactions;
create trigger capture_opportunity_offer after insert on public.pending_reactions for each row execute function dndkeep_private.capture_opportunity_offer();

create or replace function dndkeep_private.guard_opportunity_offer()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.reaction_key='opportunity_attack' or new.reaction_key='opportunity_attack' then
  if new.reaction_key is distinct from old.reaction_key or new.campaign_id is distinct from old.campaign_id
   or new.reactor_participant_id is distinct from old.reactor_participant_id or new.reactor_type is distinct from old.reactor_type
   or new.trigger_point is distinct from old.trigger_point or new.pending_attack_id is distinct from old.pending_attack_id
   or new.decision_payload->>'mover_participant_id' is distinct from old.decision_payload->>'mover_participant_id'
   or new.expires_at is distinct from old.expires_at then raise exception 'Opportunity Attack identity cannot change';end if;
  if new.state='accepted' and not exists(select 1 from dndkeep_private.opportunity_attack_offers s
   where s.offer_id=new.id and s.receipt->>'attackId'=new.decision_payload->>'attack_id') then raise exception 'Accept Opportunity Attacks through the saved transaction';end if;
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_opportunity_offer() from public,anon,authenticated;
drop trigger if exists guard_opportunity_offer on public.pending_reactions;
create trigger guard_opportunity_offer before update on public.pending_reactions for each row execute function dndkeep_private.guard_opportunity_offer();

create or replace function dndkeep_private.accept_opportunity_attack(p_offer uuid,p_name text,p_bonus integer,p_dice text,p_damage_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pending_reactions; initial public.combat_participants; a public.combat_participants; t public.combat_participants;
 c public.characters; camp public.campaigns; e public.combat_encounters; cb public.combatants;
 saved dndkeep_private.opportunity_attack_offers; req jsonb; result jsonb; context jsonb;
 target_id uuid; attack_id uuid:=gen_random_uuid(); chain uuid:=gen_random_uuid();
begin
 if auth.uid() is null then raise exception 'Sign in to accept Opportunity Attacks';end if;
 select * into o from public.pending_reactions where id=p_offer and reaction_key='opportunity_attack' for update;
 select * into initial from public.combat_participants where id=o.reactor_participant_id;
 if initial.participant_type='character' then select * into c from public.characters where id::text=initial.entity_id for update;end if;
 select * into camp from public.campaigns where id=o.campaign_id for share;
 if camp.id is null or not coalesce(camp.owner_id=auth.uid() or (initial.participant_type='character' and c.user_id=auth.uid() and c.campaign_id=camp.id),false) then raise exception 'Opportunity Attack offer is unavailable';end if;
 select * into saved from dndkeep_private.opportunity_attack_offers where offer_id=o.id for update;
 if not found then raise exception 'This older offer has no saved participants; decline it and use a new offer';end if;
 if saved.binding->'actor'->>'entity' is distinct from initial.entity_id or saved.binding->'actor'->>'combatant' is distinct from initial.combatant_id::text or saved.binding->'actor'->>'type' is distinct from initial.participant_type then raise exception 'Original Opportunity Attack reactor changed';end if;
 req:=jsonb_build_object('name',p_name,'bonus',p_bonus,'dice',p_dice,'damageType',p_damage_type);
 -- Completed retries only read the saved result, even after turn/effect changes.
 if saved.receipt is not null then
  if saved.request is distinct from req then raise exception 'Opportunity Attack choice already saved';end if;
  return saved.receipt||jsonb_build_object('replayed',true);
 end if;
 target_id:=(saved.binding->'target'->>'id')::uuid;
 select * into e from public.combat_encounters where id=initial.encounter_id and campaign_id=camp.id for share;
 perform 1 from public.combat_participants where id in(initial.id,target_id) order by id for update;
 select * into a from public.combat_participants where id=initial.id;
 select * into t from public.combat_participants where id=target_id;
 perform 1 from public.combatants where id in(a.combatant_id,t.combatant_id) order by id for share;
 select * into cb from public.combatants where id=a.combatant_id;
 if saved.binding is distinct from dndkeep_private.opportunity_binding(a.id,t.id)
  or a.entity_id is distinct from initial.entity_id or a.participant_type is distinct from initial.participant_type
  or a.campaign_id is distinct from camp.id then raise exception 'Original Opportunity Attack participants or turn changed';end if;
 if a.participant_type='character' then
  if c.id is null or c.id::text is distinct from a.entity_id or c.campaign_id is distinct from camp.id
   or cb.definition_type is distinct from 'character' or cb.definition_id is distinct from c.id::text
   then raise exception 'Opportunity Attack character link changed';end if;
 elsif a.participant_type not in('creature','monster','npc') or camp.owner_id is distinct from auth.uid() then raise exception 'Only the DM can act for this creature';end if;
 if e.status<>'active' or o.state<>'offered' or o.expires_at<=clock_timestamp() then raise exception 'Opportunity Attack window is closed';end if;
 if exists(select 1 from dndkeep_private.outgoing_turn_reservations where encounter_id=e.id and turn_id=e.psionic_turn_id) then raise exception 'The triggering turn is already ending';end if;
 if coalesce(a.reaction_used,true) then raise exception 'Reaction is already spent';end if;
 if cb.id is null or coalesce(cb.is_dead,false) or coalesce(cb.current_hp,0)<=0 or coalesce(cb.exhaustion_level,0)>=6
  or exists(select 1 from unnest(coalesce(cb.active_conditions,array[]::text[])) condition where lower(condition) in('incapacitated','unconscious','paralyzed','petrified','stunned')) then raise exception 'This creature cannot take a reaction';end if;
 if exists(select 1 from jsonb_array_elements(case when jsonb_typeof(cb.active_buffs)='array' then cb.active_buffs else '[]'::jsonb end) buff
  where left(buff->>'key',length('telekinetic_disorient:'))='telekinetic_disorient:' and buff->>'technique'='disorient' and buff->'preventsOpportunityAttacks'='true'::jsonb) then raise exception 'Telekinetic Disorient prevents Opportunity Attacks until the start of your next turn';end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 120 or p_bonus is null or p_bonus not between -30 and 50
  or p_dice is null or length(p_dice) not between 1 and 100 or regexp_replace(p_dice,'[[:space:]]','','g') !~ '^([0-9]{1,3}[dD](4|6|8|10|12|20|100)|[0-9]{1,4})([+-]([0-9]{1,3}[dD](4|6|8|10|12|20|100)|[0-9]{1,4}))*$'
  or p_damage_type is null or lower(p_damage_type) not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder') then raise exception 'Review the Opportunity Attack weapon details';end if;
 if a.participant_type='character' then
  context:=dndkeep_private.action_turn_context(c.id);
  if context->>'participantId' is distinct from a.id::text then raise exception 'Reaction turn context changed';end if;
  perform dndkeep_private.claim_action(c.id,o.id,jsonb_build_object('turnId',context->>'turnId','grantId','normal:reaction','kind','reaction','purpose','attack','sourceId','opportunity-attack'));
 end if;
 insert into public.pending_attacks(id,campaign_id,encounter_id,chain_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,
 attack_source,attack_mode,attack_name,attack_kind,attack_bonus,target_ac,damage_dice,damage_type,cover_level,state)
 values(attack_id,camp.id,e.id,chain,a.id,a.name,case when a.participant_type='character' then 'character' else 'creature' end,t.id,t.name,
 case when t.participant_type='character' then 'character' else 'creature' end,'weapon','melee',btrim(p_name)||' (OA)','attack_roll',p_bonus,t.ac,p_dice,p_damage_type,'none','declared');
 update public.combat_participants set reaction_used=true where id=a.id;
 result:=jsonb_build_object('offerId',o.id,'attackId',attack_id,'actorId',a.id,'targetId',t.id,'replayed',false);
 update dndkeep_private.opportunity_attack_offers set request=req,receipt=result where offer_id=o.id;
 update public.pending_reactions set state='accepted',decided_at=now(),decision_payload=coalesce(o.decision_payload,'{}'::jsonb)||jsonb_build_object('attack_id',attack_id,'weapon_name',p_name,'attack_bonus',p_bonus,'damage_dice',p_dice,'damage_type',p_damage_type) where id=o.id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
 values(camp.id,e.id,chain,0,case when a.participant_type='character' then 'player' else 'creature' end,a.name,
 case when t.participant_type='character' then 'player' else 'creature' end,t.name,'attack_declared',jsonb_build_object('attack_name',btrim(p_name)||' (OA)','attack_kind','attack_roll','attack_bonus',p_bonus,'damage_dice',p_dice,'damage_type',p_damage_type),case when a.hidden_from_players or t.hidden_from_players then 'hidden_from_players' else 'public' end),
 (camp.id,e.id,chain,1,case when a.participant_type='character' then 'player' else 'creature' end,a.name,'self',a.name,'reaction_used',result||jsonb_build_object('reaction','Opportunity Attack'),case when a.hidden_from_players then 'hidden_from_players' else 'public' end);
 return result;
end;$$;
revoke all on function dndkeep_private.accept_opportunity_attack(uuid,text,integer,text,text) from public,anon;
grant execute on function dndkeep_private.accept_opportunity_attack(uuid,text,integer,text,text) to authenticated;
create or replace function public.accept_opportunity_attack(p_offer uuid,p_name text,p_bonus integer,p_dice text,p_damage_type text)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.accept_opportunity_attack(p_offer,p_name,p_bonus,p_dice,p_damage_type);$$;
revoke all on function public.accept_opportunity_attack(uuid,text,integer,text,text) from public,anon;
grant execute on function public.accept_opportunity_attack(uuid,text,integer,text,text) to authenticated;
notify pgrst,'reload schema';
