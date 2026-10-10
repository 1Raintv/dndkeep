-- v2.869: only declarations made after this migration enter atomic save damage.
-- Existing declarations can contain an interrupted legacy HP write; do not adopt them.
alter table dndkeep_private.save_batch_declarations add column if not exists atomic_damage boolean not null default false;
alter table dndkeep_private.save_batch_declarations alter column atomic_damage set default true;
create table if not exists dndkeep_private.saved_save_damage_applications(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 outcome jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.saved_save_damage_applications enable row level security;
revoke all on dndkeep_private.saved_save_damage_applications from public,anon,authenticated;
create or replace function dndkeep_private.apply_saved_save_damage(
 p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; prior dndkeep_private.saved_save_damage_applications;
 result jsonb; life jsonb; damage integer; actor_kind text; target_kind text; p_resolution jsonb:=null; log_visibility text;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid())
  then raise exception 'Saved save damage application is available to the current DM only';end if;
 select * into prior from dndkeep_private.saved_save_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 -- A null expected snapshot only looks for a committed receipt, never writes.
 if p_expected is null then return null;end if;
 if a.attack_kind<>'save' or a.attack_source<>'monster_action' or a.state<>'damage_rolled'
  or a.save_result not in('passed','failed') or a.save_result is null
  or not exists(select 1 from dndkeep_private.save_batch_declarations d where d.chain_id=a.chain_id and d.atomic_damage) then
  raise exception 'Review this legacy or unsupported save damage before applying';end if;
 if not exists(select 1 from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id and status='active') then raise exception 'Damage encounter is no longer active';end if;
 if a.damage_final is null or a.damage_final<0 then raise exception 'Record the damage dice before applying';end if;
 -- Use the exact captured roll. The nested locked comparison rejects any
 -- intervening change rather than applying damage from an earlier read.
 if p_expected->'attack' is distinct from to_jsonb(a) then
  raise exception 'Attack changed; refresh before applying damage';end if;
 damage:=a.damage_final;
 -- Preserve the existing final-damage contract, including the condition-wide
 -- resistance applied here. Typed-defense planning remains a separate audit.
 if p_expected->'target'->'combatant'->'active_conditions' ? 'Petrified' then damage:=damage/2;end if;
 if damage is null or damage<0 then raise exception 'Review the resolved damage';end if;
 life:=dndkeep_private.settle_pending_damage_life(a.id,p_expected,damage,p_con_modifier,
  coalesce(p_expected->'target'->>'definitionType'='character',false));
 -- The nested stage locks the attack. A competing request may have committed
 -- the entire application while we waited; return its winner without new events.
 select * into prior from dndkeep_private.saved_save_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 select case when coalesce(bool_or(hidden_from_players),false) then 'hidden_from_players' else 'public' end into log_visibility from public.combat_participants where id in(a.attacker_participant_id,a.target_participant_id);
 target_kind:=case when a.target_type='character' then 'player' else a.target_type end;
 actor_kind:=case when a.attacker_type='character' then 'player' when a.attacker_type='system' then 'system' else 'monster' end;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
 values(a.campaign_id,a.encounter_id,a.chain_id,3,actor_kind,a.attacker_name,target_kind,a.target_name,'damage_applied',
  jsonb_build_object('action_name',a.attack_name,'total',damage,'damage_type',a.damage_type,'attack_id',a.id,
   'hp_after',life->'afterHP','temp_hp_after',life->'afterTempHP','resolution',p_resolution-'choice'-'damageBefore'),log_visibility);
 if (p_resolution is null and damage<>a.damage_final) or coalesce((p_resolution->>'immune')::boolean,false) or (coalesce((p_resolution->>'resistant')::boolean,false) and not coalesce((p_resolution->>'bypass')::boolean,false)) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,2,'system','System',target_kind,a.target_name,'resistance_applied',
   jsonb_build_object('source',case when p_resolution is null then 'condition' else 'psychic_defenses' end,'original_damage',a.damage_final,'resolved_damage',damage,'resolution',p_resolution-'choice'-'damageBefore'),log_visibility);
 end if;
 if (life->>'dead')::boolean and not coalesce((p_expected->'target'->'combatant'->>'is_dead')::boolean,false) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'participant_died',jsonb_build_object('massive_damage',life->'massiveDamage','damage',damage),log_visibility);
 elsif (life->>'beforeHP')::integer>0 and (life->>'afterHP')::integer=0 then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'dropped_to_0_hp',jsonb_build_object('damage',damage),log_visibility);
 end if;
 if (life->>'concentrationBroken')::boolean then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,6,'system','System',target_kind,a.target_name,'concentration_broken',jsonb_build_object('reason','incapacitated','spell',p_expected->'target'->'definition'->'concentration_spell'),log_visibility);
 elsif life->>'concentrationCheckId' is not null then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,59,'system','System',target_kind,a.target_name,'concentration_save_prompted',jsonb_build_object('damage',damage,'dc',least(30,greatest(10,damage/2)),'automation_setting',life->'concentrationMode'),log_visibility);
 end if;
 update public.pending_attacks set state='applied',damage_final=damage,applied_at=now(),
  damage_was_fudged=damage_was_fudged where id=a.id returning * into a;
 result:=jsonb_build_object('attack',to_jsonb(a),'settlement',life,'resolution',p_resolution,'replayed',false);
 insert into dndkeep_private.saved_save_damage_applications(attack_id,outcome) values(a.id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.apply_saved_save_damage(uuid,jsonb,integer) from public,anon,authenticated;


grant execute on function dndkeep_private.apply_saved_save_damage(uuid,jsonb,integer) to authenticated;
create or replace function public.apply_saved_save_damage(p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.apply_saved_save_damage(p_attack_id,p_expected,p_con_modifier);$$;
revoke all on function public.apply_saved_save_damage(uuid,jsonb,integer) from public,anon;
grant execute on function public.apply_saved_save_damage(uuid,jsonb,integer) to authenticated;
create or replace function dndkeep_private.supports_saved_save_damage(p_attack_id uuid)
returns boolean language plpgsql security definer stable set search_path='' as $$
declare a public.pending_attacks;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then raise exception 'Damage settlement is available to the current DM only';end if;
 return a.attack_kind='save' and a.attack_source='monster_action' and exists(select 1 from dndkeep_private.save_batch_declarations where chain_id=a.chain_id and atomic_damage);
end;$$;
revoke all on function dndkeep_private.supports_saved_save_damage(uuid) from public,anon;
grant execute on function dndkeep_private.supports_saved_save_damage(uuid) to authenticated;
create or replace function public.supports_saved_save_damage(p_attack_id uuid)
returns boolean language sql security invoker stable set search_path='' as $$select dndkeep_private.supports_saved_save_damage(p_attack_id);$$;
revoke all on function public.supports_saved_save_damage(uuid) from public,anon;
grant execute on function public.supports_saved_save_damage(uuid) to authenticated;
notify pgrst,'reload schema';
