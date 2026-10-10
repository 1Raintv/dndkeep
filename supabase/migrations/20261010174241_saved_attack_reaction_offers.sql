-- v2.869: one durable offer batch per attack window, including an empty batch.
-- Eligibility remains in the existing registry; the server owns identity,
-- labels, deadlines, authorization and replay. No caller-supplied offer rows.
create table if not exists dndkeep_private.attack_reaction_offer_batches(
 attack_id uuid not null references public.pending_attacks(id) on delete cascade,
 trigger_point text not null check(trigger_point in('post_attack_roll','post_damage_roll','pre_damage_applied')),
 offer_count integer not null check(offer_count between 0 and 4),
 created_at timestamptz not null default now(),primary key(attack_id,trigger_point)
);
alter table dndkeep_private.attack_reaction_offer_batches enable row level security;
revoke all on dndkeep_private.attack_reaction_offer_batches from public,anon,authenticated;

create or replace function dndkeep_private.attack_reaction_offers(
 p_attack_id uuid,p_trigger text,p_expected_updated_at timestamptz,p_keys text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; target public.combat_participants; n integer; k text;
begin
 if auth.uid() is null then raise exception 'Sign in to recover reaction offers';end if;
 if p_trigger is null or p_trigger not in('post_attack_roll','post_damage_roll','pre_damage_applied') then raise exception 'Invalid reaction window';end if;
 select * into a from public.pending_attacks where id=p_attack_id for update;
 if not found then raise exception 'Attack is unavailable';end if;
 if not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) and not exists(
  select 1 from public.combat_participants ap join public.combatants cb on cb.id=ap.combatant_id
  join public.characters c on c.id::text=ap.entity_id and cb.definition_type='character' and cb.definition_id=c.id::text
  where ap.id=a.attacker_participant_id and ap.participant_type='character' and ap.campaign_id=a.campaign_id
   and ap.encounter_id is not distinct from a.encounter_id and cb.campaign_id=a.campaign_id
   and c.campaign_id=a.campaign_id and c.user_id=auth.uid()
   and exists(select 1 from public.campaign_members where campaign_id=a.campaign_id and user_id=auth.uid())) then
  raise exception 'Only the attacker or DM can recover reaction offers';
 end if;
 select offer_count into n from dndkeep_private.attack_reaction_offer_batches where attack_id=a.id and trigger_point=p_trigger;
 if found then return jsonb_build_object('attackId',a.id,'triggerPoint',p_trigger,'offerCount',n);end if;
 -- A read checks a durable winner before the client repeats eligibility queries.
 if p_keys is null then return null;end if;
 if cardinality(p_keys)>4 or array_position(p_keys,null) is not null or exists(select 1 from unnest(p_keys) v where
  not(p_trigger='post_attack_roll' and v='shield' or p_trigger='post_damage_roll' and v in('uncanny_dodge','absorb_elements','hellish_rebuke'))) then
  raise exception 'Invalid reaction candidates';end if;
 if a.updated_at is distinct from p_expected_updated_at then raise exception 'Attack changed; refresh its reaction candidates';end if;
 if p_trigger='post_attack_roll' and a.state<>'attack_rolled' or p_trigger in('post_damage_roll','pre_damage_applied') and a.state<>'damage_rolled' then
  raise exception 'Attack reaction window has closed';end if;
 if a.target_participant_id is not null then
  select * into target from public.combat_participants where id=a.target_participant_id and campaign_id=a.campaign_id
   and encounter_id is not distinct from a.encounter_id for share;
  if not found then raise exception 'Reaction target changed';end if;
 end if;
 if cardinality(p_keys)>0 and (target.id is null or target.participant_type<>'character' or coalesce(target.reaction_used,false)) then
  raise exception 'Reaction target is unavailable';end if;
 for k in select distinct value from unnest(p_keys) value loop
  -- Adopt earlier offers without resetting accepted/declined/expired decisions.
  if not exists(select 1 from public.pending_reactions where pending_attack_id=a.id and trigger_point=p_trigger
   and reactor_participant_id=target.id and reaction_key=k) then
   insert into public.pending_reactions(campaign_id,pending_attack_id,reactor_participant_id,reactor_name,reactor_type,
    reaction_key,reaction_name,trigger_point,offered_at,expires_at,state)
   values(a.campaign_id,a.id,target.id,target.name,'character',k,case k when 'shield' then 'Shield' when 'uncanny_dodge' then 'Uncanny Dodge'
    when 'absorb_elements' then 'Absorb Elements' when 'hellish_rebuke' then 'Hellish Rebuke' end,p_trigger,clock_timestamp(),clock_timestamp()+interval '120 seconds','offered');
  end if;
 end loop;
 select count(distinct reaction_key) into n from public.pending_reactions where pending_attack_id=a.id and trigger_point=p_trigger
  and reactor_participant_id=a.target_participant_id and reaction_key in('shield','uncanny_dodge','absorb_elements','hellish_rebuke');
 insert into dndkeep_private.attack_reaction_offer_batches(attack_id,trigger_point,offer_count) values(a.id,p_trigger,n);
 return jsonb_build_object('attackId',a.id,'triggerPoint',p_trigger,'offerCount',n);
end;$$;
revoke all on function dndkeep_private.attack_reaction_offers(uuid,text,timestamptz,text[]) from public,anon;
grant execute on function dndkeep_private.attack_reaction_offers(uuid,text,timestamptz,text[]) to authenticated;
create or replace function public.attack_reaction_offers(p_attack_id uuid,p_trigger text,p_expected_updated_at timestamptz,p_keys text[])
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.attack_reaction_offers(p_attack_id,p_trigger,p_expected_updated_at,p_keys);
$$;
revoke all on function public.attack_reaction_offers(uuid,text,timestamptz,text[]) from public,anon;
grant execute on function public.attack_reaction_offers(uuid,text,timestamptz,text[]) to authenticated;
notify pgrst,'reload schema';
