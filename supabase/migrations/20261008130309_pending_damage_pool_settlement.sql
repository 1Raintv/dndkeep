-- Private settlement stage, not an app endpoint. The eventual outer transaction
-- must add death/conditions, retaliation, concentration, mastery and events
-- before publishing applied state. Never expose this partial stage to clients.
create table if not exists dndkeep_private.pending_damage_pool_records(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 request jsonb not null,outcome jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.pending_damage_pool_records enable row level security;
revoke all on dndkeep_private.pending_damage_pool_records from public,anon,authenticated;
create or replace function dndkeep_private.settle_pending_damage_pools(
 p_attack_id uuid,p_expected jsonb,p_damage integer
) returns jsonb language plpgsql set search_path='' as $$
declare a public.pending_attacks; initial public.pending_attacks; cp public.combat_participants;
 cb public.combatants; character_id uuid; ctx jsonb; pools jsonb; result jsonb; req jsonb;
 prior dndkeep_private.pending_damage_pool_records;
begin
 select * into initial from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=initial.campaign_id and owner_id=auth.uid())
  then raise exception 'Damage settlement is available to the current DM only';end if;
 if p_expected is null or jsonb_typeof(p_expected)<>'object' or p_damage is null or p_damage<0 then raise exception 'Invalid damage settlement';end if;
 req:=jsonb_build_object('expected',p_expected,'damage',p_damage);
 -- Already-committed results remain readable after the target leaves combat.
 select * into prior from dndkeep_private.pending_damage_pool_records where attack_id=initial.id;
 if found then
  if prior.request is distinct from req then raise exception 'Saved damage settlement changed';end if;
  return prior.outcome||jsonb_build_object('replayed',true);
 end if;
 -- The character-before-combatant order matches existing concentration/party
 -- transactions. Recheck identities and the entire captured context after waits.
 if initial.target_participant_id is not null then
  select * into cp from public.combat_participants where id=initial.target_participant_id and campaign_id=initial.campaign_id and encounter_id is not distinct from initial.encounter_id;
  if not found then raise exception 'Damage target roster changed';end if;
  if cp.participant_type='character' then
   select id into character_id from public.characters where id::text=cp.entity_id and campaign_id=initial.campaign_id for update;
   if not found then raise exception 'Damage character is unavailable';end if;
  end if;
 end if;
 if initial.encounter_id is not null then perform 1 from public.combat_encounters where id=initial.encounter_id and campaign_id=initial.campaign_id for share;end if;
 if cp.id is not null then
  perform 1 from public.combat_participants where id=cp.id for share;
  select * into cb from public.combatants where id=cp.combatant_id and campaign_id=initial.campaign_id for update;
  if not found then raise exception 'Damage target combatant is unavailable';end if;
 end if;
 select * into a from public.pending_attacks where id=p_attack_id for update;
 if not found or (a.campaign_id,a.encounter_id,a.target_participant_id) is distinct from (initial.campaign_id,initial.encounter_id,initial.target_participant_id)
  or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then raise exception 'Damage settlement context changed';end if;
 select * into prior from dndkeep_private.pending_damage_pool_records where attack_id=a.id;
 if found then
  if prior.request is distinct from req then raise exception 'Saved damage settlement changed';end if;
  return prior.outcome||jsonb_build_object('replayed',true);
 end if;
 if a.state<>'damage_rolled' or coalesce(a.pending_lr_decision,false) then raise exception 'Resolve the attack before applying damage';end if;
 perform 1 from public.pending_reactions where pending_attack_id=a.id for share;
 ctx:=dndkeep_private.get_pending_damage_context(a.id);
 if ctx is distinct from p_expected then raise exception 'Damage context changed; review before applying';end if;
 if exists(select 1 from public.pending_reactions where pending_attack_id=a.id and state='offered') then raise exception 'Resolve offered reactions before applying damage';end if;
 if cb.id is not null then
  if cb.current_hp is null or cb.max_hp is null or cb.current_hp<0 or cb.max_hp<0 or cb.current_hp>cb.max_hp or coalesce(cb.temp_hp,0)<0 then raise exception 'Review target HP pools';end if;
  pools:=dndkeep_private.damage_hit_point_pools(cb.current_hp,coalesce(cb.temp_hp,0),p_damage);
  update public.combatants set current_hp=(pools->>'current_hp')::integer,temp_hp=(pools->>'temp_hp')::integer where id=cb.id;
 end if;
 result:=jsonb_build_object('attackId',a.id,'campaignId',a.campaign_id,'targetParticipantId',a.target_participant_id,
  'combatantId',cb.id,'damage',p_damage,'beforeHP',cb.current_hp,'beforeTempHP',case when cb.id is null then null else coalesce(cb.temp_hp,0) end,
  'afterHP',pools->'current_hp','afterTempHP',pools->'temp_hp');
 insert into dndkeep_private.pending_damage_pool_records(attack_id,request,outcome) values(a.id,req,result);
 return result||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.settle_pending_damage_pools(uuid,jsonb,integer) from public,anon,authenticated;
