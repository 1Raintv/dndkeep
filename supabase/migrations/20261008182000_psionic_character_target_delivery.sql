-- v2.857: pending attacks use character/creature; combat events use player/creature.
-- Normalize history independently so character-target damage and its receipt commit.
create or replace function public.queue_destructive_thoughts_effect(p_character_id uuid,p_activation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; r dndkeep_private.psionic_effect_rolls; e public.combat_encounters;
 actor public.combat_participants; target public.combat_participants; b public.combatants;
 metadata jsonb; source jsonb; destination jsonb; dice jsonb; outcome jsonb; chain uuid:=gen_random_uuid();
 campaign uuid; encounter uuid; actor_id uuid; target_id uuid;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select * into r from dndkeep_private.psionic_effect_rolls where request_id=p_activation_id and character_id=c.id for update;
 if not found or r.result is null or r.result->>'discipline'<>'destructive-thoughts' then raise exception 'Finalize this Destructive Thoughts roll before queuing it';end if;
 -- Deleted/canceled attacks must never be recreated by retrying an old roll.
 if r.applied_result is not null then return r.applied_result||jsonb_build_object('replayed',true);end if;
 metadata:=r.context->'context';source:=metadata->'self';destination:=r.context->'target';
 campaign:=(metadata->>'campaignId')::uuid;encounter:=(metadata->>'encounterId')::uuid;
 actor_id:=(source->>'id')::uuid;target_id:=(destination->>'id')::uuid;
 if campaign is null or encounter is null or actor_id is null or target_id is null or c.campaign_id is distinct from campaign
  then raise exception 'The saved roll has no current campaign target; keep its damage for manual resolution';end if;
 select * into e from public.combat_encounters where id=encounter and campaign_id=campaign for update;
 if not found or e.status<>'active' then raise exception 'The encounter ended; keep the rolled damage for manual resolution';end if;
 perform 1 from public.combat_participants where id in(actor_id,target_id) order by id for update;
 select * into actor from public.combat_participants where id=actor_id and campaign_id=campaign and encounter_id=encounter;
 if not found or actor.participant_type<>'character' or actor.entity_id<>c.id::text
  or source->>'participant_type' is distinct from actor.participant_type or source->>'entity_id' is distinct from actor.entity_id
  or source->>'combatant_id' is distinct from actor.combatant_id::text then raise exception 'The original attacking participant changed';end if;
 select * into target from public.combat_participants where id=target_id and campaign_id=campaign and encounter_id=encounter;
 if not found or target.participant_type not in('character','creature')
  or destination->>'participant_type' is distinct from target.participant_type or destination->>'entity_id' is distinct from target.entity_id
  or destination->>'combatant_id' is distinct from target.combatant_id::text then raise exception 'The original target participant changed';end if;
 if target.hidden_from_players and not exists(select 1 from public.campaigns where id=campaign and owner_id=auth.uid()) then raise exception 'The saved target is hidden; review it with the DM';end if;
 -- A roster row can stay constant while its linked map piece is repointed.
 if actor.combatant_id is null or target.combatant_id is null then raise exception 'The original map piece is unavailable';end if;
 perform 1 from public.combatants where id in(actor.combatant_id,target.combatant_id) order by id for update;
 select * into b from public.combatants where id=actor.combatant_id and campaign_id=campaign;
 if not found or b.definition_type<>'character' or b.definition_id is distinct from c.id::text then raise exception 'The attacking map piece changed';end if;
 select * into b from public.combatants where id=target.combatant_id and campaign_id=campaign;
 if not found or b.definition_id is distinct from target.entity_id or (b.definition_type='character') is distinct from (target.participant_type='character') then raise exception 'The target map piece changed';end if;
 if exists(select 1 from public.pending_attacks where id=r.request_id) then raise exception 'This declaration identity is already in use; review combat';end if;
 dice:=jsonb_build_object('version',1,'sides',r.result->'sides','originalRolls',r.result->'originalRolls','rolls',r.result->'rolls','modifier',r.result->'modifier');
 insert into public.pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,
  target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,psionic_damage_dice,damage_dice,damage_type,state,chain_id)
 values(r.request_id,campaign,encounter,actor.id,actor.name,'character',target.id,target.name,target.participant_type,
  'ability','Destructive Thoughts','auto_hit',dice,r.result->>'total','Psychic','declared',chain);
 outcome:=jsonb_build_object('effect','destructive-thoughts','requestId',r.request_id,'characterId',c.id,'attackId',r.request_id);
 update dndkeep_private.psionic_effect_rolls set applied_result=outcome where request_id=r.request_id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload)
 values(campaign,encounter,chain,0,'player',c.id,actor.name,case when target.participant_type='character' then 'player' else 'creature' end,target.name,'attack_declared',
  jsonb_build_object('attack_name','Destructive Thoughts','attack_kind','auto_hit','attack_source','ability','damage_dice',r.result->>'total','damage_type','Psychic','pending_attack_id',r.request_id));
 return outcome||jsonb_build_object('replayed',false);
end; $$;
revoke all on function public.queue_destructive_thoughts_effect(uuid,uuid) from public,anon;
grant execute on function public.queue_destructive_thoughts_effect(uuid,uuid) to authenticated;
