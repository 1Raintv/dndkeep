-- v2.804: retries reuse a cast's reaction prompts, including declined prompts.
-- The caller supplies only candidate IDs after the existing map/source checks.
-- No caller-controlled names, campaign, expiry or save DC enter stored offers.
create index if not exists pending_counterspell_cast_idx on public.pending_reactions
 ((decision_payload->>'spell_cast_id'),reactor_participant_id) where reaction_key='counterspell';

create or replace function dndkeep_private.offer_counterspell_once(p_cast_id uuid,p_candidates uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare cast_row public.pending_spell_casts; caster public.characters; cp public.combat_participants; offer_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in to offer Counterspell';end if;
 if p_candidates is null or cardinality(p_candidates)>128 or array_position(p_candidates,null) is not null
  then raise exception 'Invalid Counterspell candidates';end if;
 select s.* into cast_row from public.pending_spell_casts s join public.characters c on c.id=s.caster_character_id
 join public.campaigns ca on ca.id=s.campaign_id where s.id=p_cast_id and c.campaign_id=s.campaign_id
 and (c.user_id=auth.uid() or ca.owner_id=auth.uid());
 if not found then raise exception 'Spell declaration is unavailable';end if;
 -- Same cast lock as acceptance/settlement. Retries cannot create two prompts
 -- or reopen one after it was accepted/declined/expired.
 select * into cast_row from public.pending_spell_casts where id=p_cast_id for update;
 select * into cp from public.combat_participants where id=cast_row.caster_participant_id for update;
 select * into caster from public.characters where id=cast_row.caster_character_id for update;
 if caster.id is null or cp.id is null or cp.participant_type<>'character' or cp.entity_id is distinct from caster.id::text
  or caster.campaign_id is distinct from cast_row.campaign_id or cp.campaign_id is distinct from cast_row.campaign_id
  or cp.encounter_id is distinct from cast_row.encounter_id
  or not(caster.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=cast_row.campaign_id and ca.owner_id=auth.uid()))
  then raise exception 'Caster context changed';end if;
 if exists(select 1 from unnest(p_candidates) candidate where not exists(
  select 1 from public.combat_participants p join public.characters c on c.id::text=p.entity_id
  where p.id=candidate and p.id<>cp.id and p.participant_type='character'
   and p.campaign_id=cast_row.campaign_id and p.encounter_id=cast_row.encounter_id and c.campaign_id=cast_row.campaign_id))
  then raise exception 'Counterspell candidate is unavailable';end if;
 if cast_row.state='declared' and cast_row.expires_at>clock_timestamp()
  and exists(select 1 from public.combat_encounters e where e.id=cast_row.encounter_id and e.campaign_id=cast_row.campaign_id and e.status='active') then
  insert into public.pending_reactions(campaign_id,reactor_participant_id,reactor_name,reactor_type,reaction_key,reaction_name,
   trigger_point,offered_at,expires_at,state,decision_payload)
  select cast_row.campaign_id,p.id,p.name,'character','counterspell','Counterspell','spell_declared',clock_timestamp(),cast_row.expires_at,'offered',
   jsonb_build_object('spell_cast_id',cast_row.id,'caster_name',cast_row.caster_name,'spell_name',cast_row.spell_name,'spell_level',cast_row.spell_level,'save_dc',null)
  from public.combat_participants p join public.characters c on c.id::text=p.entity_id
  left join public.combatants cb on cb.id=p.combatant_id
  where p.id=any(p_candidates) and not coalesce(p.reaction_used,false)
   and not coalesce(cb.is_dead,false) and coalesce(cb.current_hp,c.current_hp,0)>0
   and not exists(select 1 from unnest(coalesce(cb.active_conditions,c.active_conditions,array[]::text[])) condition
    where lower(condition) in('incapacitated','unconscious','paralyzed','petrified','stunned'))
   and exists(select 1 from jsonb_each(case when jsonb_typeof(c.spell_slots)='object' then c.spell_slots else '{}'::jsonb end) slot
    where slot.key ~ '^[3-9]$' and case when coalesce(slot.value->>'total','')~'^[0-9]+$' and coalesce(slot.value->>'used','')~'^[0-9]+$'
     then (slot.value->>'used')::numeric<(slot.value->>'total')::numeric else false end)
   and exists(select 1 from jsonb_array_elements_text(case when jsonb_typeof(c.spell_sources->'counterspell')='array'
    then c.spell_sources->'counterspell' else '[]'::jsonb end) source
    where (source in('species','grant:species','feat','other')
     or (source ~ '^(grant:)?class:' and ((regexp_replace(source,'^(grant:)?class:','')=c.class_name and c.level>0)
      or (regexp_replace(source,'^(grant:)?class:','')=c.secondary_class and c.secondary_level>0))))
     and (source like 'grant:%' or case when c.spell_preparation_sources ? 'counterspell'
      then jsonb_typeof(c.spell_preparation_sources->'counterspell')='array' and (c.spell_preparation_sources->'counterspell') ? source
      else coalesce('counterspell'=any(c.prepared_spells),false)
       and (select count(*) from jsonb_array_elements_text(c.spell_sources->'counterspell') owned where owned not like 'grant:%')=1 end))
   and not exists(select 1 from public.pending_reactions r where r.reaction_key='counterspell'
    and r.campaign_id=cast_row.campaign_id and r.decision_payload->>'spell_cast_id'=cast_row.id::text and r.reactor_participant_id=p.id);
 end if;
 select count(distinct r.reactor_participant_id) into offer_count from public.pending_reactions r
 where r.reaction_key='counterspell' and r.campaign_id=cast_row.campaign_id and r.decision_payload->>'spell_cast_id'=cast_row.id::text;
 return jsonb_build_object('castId',cast_row.id,'offerCount',offer_count);
end;
$$;
revoke all on function dndkeep_private.offer_counterspell_once(uuid,uuid[]) from public,anon;
grant execute on function dndkeep_private.offer_counterspell_once(uuid,uuid[]) to authenticated;
create or replace function public.offer_counterspell_once(p_cast_id uuid,p_candidates uuid[])
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.offer_counterspell_once(p_cast_id,p_candidates);
$$;
revoke all on function public.offer_counterspell_once(uuid,uuid[]) from public,anon;
grant execute on function public.offer_counterspell_once(uuid,uuid[]) to authenticated;
