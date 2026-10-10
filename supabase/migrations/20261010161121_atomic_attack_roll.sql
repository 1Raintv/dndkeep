-- v2.869: the original attack and consumed Sap/Vex markers commit together.
-- The immutable snapshot is the replay receipt; no second dice roll is accepted.
create or replace function dndkeep_private.record_pending_attack_roll(
 p_attack_id uuid,p_expected_updated_at timestamptz,p_snapshot jsonb,p_expected_buffs jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks;cp public.combat_participants;actor public.combatants;
 initial_campaign uuid;initial_actor uuid;initial_encounter uuid;remaining jsonb;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null then raise exception 'Attack roll is unavailable';end if;
 initial_campaign:=a.campaign_id;initial_actor:=a.attacker_participant_id;initial_encounter:=a.encounter_id;
 if a.attacker_participant_id is not null then
  select * into cp from public.combat_participants where id=a.attacker_participant_id and campaign_id=a.campaign_id and encounter_id is not distinct from a.encounter_id;
  if not found then raise exception 'Attacker roster changed';end if;
 end if;
 if not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) and not exists(
  select 1 from public.characters c join public.combatants cb on cb.id=cp.combatant_id and cb.definition_type='character' and cb.definition_id=c.id::text
   where cp.participant_type='character' and cp.entity_id=c.id::text and c.campaign_id=a.campaign_id and cb.campaign_id=a.campaign_id and c.user_id=auth.uid()
   and exists(select 1 from public.campaign_members cm where cm.campaign_id=a.campaign_id and cm.user_id=auth.uid())) then raise exception 'Only the attacker or DM can record this attack';end if;
 -- Serialize attacks drawing from the same bonus before locking their rows.
 if a.attacker_participant_id is not null then
  select * into actor from public.combatants where id=cp.combatant_id and campaign_id=a.campaign_id for update;
  if not found then raise exception 'Attacker combatant is unavailable';end if;
  if not exists(select 1 from public.combat_participants where id=cp.id and combatant_id=actor.id and campaign_id=a.campaign_id and encounter_id is not distinct from cp.encounter_id and participant_type is not distinct from cp.participant_type and entity_id is not distinct from cp.entity_id) then raise exception 'Attacker roster changed';end if;
 end if;
 select * into a from public.pending_attacks where id=p_attack_id for update;
 if not found then raise exception 'Attack roll is unavailable';end if;
 if a.campaign_id is distinct from initial_campaign or a.attacker_participant_id is distinct from initial_actor or a.encounter_id is distinct from initial_encounter then raise exception 'Attack ownership changed';end if;
 -- Revalidate ownership after any wait for the shared actor lock.
 if not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) and not exists(
  select 1 from public.characters c where cp.participant_type='character' and cp.entity_id=c.id::text and actor.definition_type='character' and actor.definition_id=c.id::text and c.user_id=auth.uid() and c.campaign_id=a.campaign_id
   and exists(select 1 from public.campaign_members cm where cm.campaign_id=a.campaign_id and cm.user_id=auth.uid())) then raise exception 'Only the attacker or DM can record this attack';end if;

 if a.state in('attack_rolled','damage_rolled','applied') and a.attack_roll_snapshot is not null then
  return jsonb_build_object('attack',to_jsonb(a),'replayed',true);
 end if;
 if a.state<>'declared' or a.attack_kind<>'attack_roll' then raise exception 'Attack cannot be rolled';end if;
 if a.updated_at is distinct from p_expected_updated_at then raise exception 'Attack changed before its roll was recorded';end if;
 if actor.id is not null then
  if p_expected_buffs is distinct from coalesce(actor.active_buffs,'[]'::jsonb) or jsonb_typeof(p_expected_buffs) is distinct from 'array' then
   raise exception 'Attacker bonuses changed before the roll was recorded';
  end if;
  -- Derive consumption from the locked actor, never caller-provided keys.
  select coalesce(jsonb_agg(value),'[]'::jsonb) into remaining from jsonb_array_elements(p_expected_buffs)
   where not(coalesce(value->>'key','')='mastery_sapped'
    or coalesce(value->>'key','')='mastery_vexed' and a.target_participant_id is not null
     and coalesce(value->>'onlyVsTargetParticipantId','')=a.target_participant_id::text);
 elsif p_expected_buffs is not null then raise exception 'Unexpected attacker bonus snapshot';end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot) is distinct from 'object' then raise exception 'Original attack evidence is required';end if;
 -- Existing snapshot guard checks identities, natural extremes, cover and totals.
 -- A rejected write rolls back marker consumption as well.
 update public.pending_attacks set attack_d20=(p_snapshot->>'d20')::integer,
  attack_total=(p_snapshot->>'total')::integer,target_ac=(p_snapshot->>'targetAC')::integer,
  hit_result=p_snapshot->>'result',attack_roll_snapshot=p_snapshot,state='attack_rolled'
  where id=a.id returning * into a;
 if actor.id is not null and remaining is distinct from coalesce(actor.active_buffs,'[]'::jsonb) then
  update public.combatants set active_buffs=remaining where id=actor.id;
 end if;
 return jsonb_build_object('attack',to_jsonb(a),'replayed',false);
end;$$;
revoke all on function dndkeep_private.record_pending_attack_roll(uuid,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.record_pending_attack_roll(uuid,timestamptz,jsonb,jsonb) to authenticated;
create or replace function public.record_pending_attack_roll(p_attack_id uuid,p_expected_updated_at timestamptz,p_snapshot jsonb,p_expected_buffs jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.record_pending_attack_roll(p_attack_id,p_expected_updated_at,p_snapshot,p_expected_buffs);
$$;
revoke all on function public.record_pending_attack_roll(uuid,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.record_pending_attack_roll(uuid,timestamptz,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
