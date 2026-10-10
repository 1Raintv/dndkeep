-- v2.869: preparation only. A future acceptance transaction must re-read this
-- context and verify map distance/visibility before claiming Reaction/payment.
create or replace function dndkeep_private.telepath_attack_context(p_character uuid,p_attack uuid,p_feature text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; a public.pending_attacks; actor public.combat_participants; subject public.combat_participants;
 budget jsonb; snapshot jsonb; item jsonb; connections jsonb; expected text; lvl integer; maximum integer; remaining integer; pool jsonb;
 base_range integer; extension integer:=0; range_verified boolean:=true; eligible boolean;
begin
 c:=public.psionic_character_for_update(p_character);
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if p_feature is null or p_feature not in('distraction','bolstering') or lvl<(case when p_feature='bolstering' then 10 else 3 end)
  or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Telepath' then raise exception 'Telepath feature is unavailable';end if;
 if c.campaign_id is null or not exists(select 1 from public.campaigns ca where ca.id=c.campaign_id and
  (ca.owner_id=auth.uid() or exists(select 1 from public.campaign_members cm where cm.campaign_id=ca.id and cm.user_id=auth.uid()))) then raise exception 'Campaign access is unavailable';end if;
 select * into a from public.pending_attacks where id=p_attack and campaign_id=c.campaign_id;
 if not found or a.state<>'attack_rolled' or a.attack_kind<>'attack_roll' or a.attack_roll_snapshot is null
  or a.damage_raw is not null or a.damage_final is not null then raise exception 'Attack has no available reaction window';end if;
 snapshot:=a.attack_roll_snapshot;
 if snapshot->>'attackId' is distinct from a.id::text or snapshot->>'campaignId' is distinct from a.campaign_id::text
  or snapshot->>'encounterId' is distinct from a.encounter_id::text or snapshot->>'attackerId' is distinct from a.attacker_participant_id::text
  or snapshot->>'targetId' is distinct from a.target_participant_id::text or snapshot->>'d20' is distinct from a.attack_d20::text
  or a.attack_total is null or a.target_ac is null then raise exception 'Original attack identity changed';end if;
 budget:=dndkeep_private.read_action_budget(c.id);
 if budget->'context'->>'encounterId' is distinct from a.encounter_id::text or a.encounter_id is null
  or not exists(select 1 from public.combat_encounters where id=a.encounter_id and campaign_id=c.campaign_id and status='active') then raise exception 'Attack encounter is no longer active';end if;
 select * into actor from public.combat_participants where id=(budget->'context'->>'participantId')::uuid and campaign_id=c.campaign_id and encounter_id=a.encounter_id
  and participant_type='character' and entity_id=c.id::text;
 if not found or not exists(select 1 from public.combatants where id=actor.combatant_id and campaign_id=c.campaign_id and definition_type='character' and definition_id=c.id::text) then raise exception 'Reactor identity changed';end if;
 select * into subject from public.combat_participants where id=a.attacker_participant_id and campaign_id=c.campaign_id and encounter_id=a.encounter_id;
 if not found or not exists(select 1 from public.combatants where id=subject.combatant_id and campaign_id=c.campaign_id)
  or not exists(select 1 from public.combat_participants where id=a.target_participant_id and campaign_id=c.campaign_id and encounter_id=a.encounter_id) then raise exception 'Attack participants are unavailable';end if;
 expected:=case when snapshot->>'automatic'='failure' or a.cover_level='total' then 'miss' when a.attack_d20=20 then 'crit'
  when a.attack_d20=1 and (snapshot->>'naturalOneAutoFails')::boolean then 'fumble' when a.attack_total<a.target_ac then 'miss'
  when (snapshot->>'criticalOnHit')::boolean then 'crit' else 'hit' end;
 if a.hit_result is distinct from expected then raise exception 'Current attack result needs review';end if;
 eligible:=case when p_feature='distraction' then expected in('hit','crit') else expected in('miss','fumble') end;
 if not eligible then raise exception 'Attack does not trigger this Telepath feature';end if;
 maximum:=case when lvl>=17 then 12 when lvl>=13 then 10 when lvl>=9 then 8 when lvl>=5 then 6 else 4 end;
 pool:=c.class_resources->'psionic-energy-dice';
 if pool is null then remaining:=maximum;
 elsif jsonb_typeof(pool)<>'number' or pool::text !~ '^[0-9]+$' or pool::text::numeric>maximum then raise exception 'Check Psionic Energy Dice';
 else remaining:=pool::text::integer;end if;
 base_range:=case when lvl>=6 then 60 else 30 end;
 connections:=dndkeep_private.psionic_connection(c.id,'list','{}');
 for item in select value from jsonb_array_elements(connections) loop
  if item->>'remainingSeconds' is null or item->'roll_result'='null'::jsonb then range_verified:=false;
  elsif (item->>'remainingSeconds')::integer>0 then extension:=greatest(extension,(item->'roll_result'->>'total')::integer);end if;
 end loop;
 return jsonb_build_object('characterId',c.id,'feature',p_feature,'psionLevel',lvl,'energyRemaining',remaining,
  'budget',budget,'reactionAvailable',not (budget->'spent'->>'reaction')::boolean and not coalesce(dndkeep_private.psionic_is_incapacitated(c.id),true),
  'telepathyRange',case when range_verified then base_range+10*extension else null end,'rangeVerified',range_verified,
  'subject',jsonb_build_object('participantId',subject.id,'combatantId',subject.combatant_id,'entityId',subject.entity_id,'participantType',subject.participant_type,'self',subject.id=actor.id),
  'attack',jsonb_build_object('id',a.id,'updatedAt',a.updated_at,'snapshot',snapshot,'total',a.attack_total,'targetAC',a.target_ac,'result',a.hit_result,'cover',a.cover_level),
  'spatialReviewRequired',true);
end;$$;
revoke all on function dndkeep_private.telepath_attack_context(uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.telepath_attack_context(uuid,uuid,text) to authenticated;
create or replace function public.get_telepath_attack_context(p_character uuid,p_attack uuid,p_feature text)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.telepath_attack_context(p_character,p_attack,p_feature);
$$;
revoke all on function public.get_telepath_attack_context(uuid,uuid,text) from public,anon;
grant execute on function public.get_telepath_attack_context(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
