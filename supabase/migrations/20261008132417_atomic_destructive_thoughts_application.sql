-- v2.844: complete automatic-hit Destructive Thoughts application. This path
-- cannot trigger melee retaliation or weapon mastery. Other attacks keep their
-- existing pipeline until those additional effects have transactional handling.
create table if not exists dndkeep_private.psionic_damage_applications(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 outcome jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.psionic_damage_applications enable row level security;
revoke all on dndkeep_private.psionic_damage_applications from public,anon,authenticated;
create or replace function dndkeep_private.apply_psionic_pending_damage(
 p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; prior dndkeep_private.psionic_damage_applications;
 result jsonb; life jsonb; damage integer; conditions jsonb; actor_kind text; target_kind text;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid())
  then raise exception 'Psionic damage application is available to the current DM only';end if;
 select * into prior from dndkeep_private.psionic_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 -- A null expected snapshot only looks for a committed receipt, never writes.
 if p_expected is null then return null;end if;
 if a.attack_kind<>'auto_hit' or a.attack_name<>'Destructive Thoughts' or a.psionic_damage_dice is null or a.damage_group_id is not null
  then raise exception 'This damage requires the normal attack pipeline';end if;
 if a.damage_final is null or a.damage_final<0 then raise exception 'Record the damage dice before applying';end if;
 -- Use the exact captured roll. The nested locked comparison rejects any
 -- intervening change rather than applying damage from an earlier read.
 if p_expected->'attack' is distinct from to_jsonb(a) then
  raise exception 'Attack changed; refresh before applying damage';end if;
 damage:=a.damage_final;
 -- Preserve the current condition-resistance behavior. Typed affinity and
 -- Sharpened replacement integration remain separate unfinished work.
 conditions:=p_expected->'target'->'combatant'->'active_conditions';
 if conditions ? 'Petrified' then damage:=damage/2;end if;
 life:=dndkeep_private.settle_pending_damage_life(a.id,p_expected,damage,p_con_modifier,
  coalesce(p_expected->'target'->>'definitionType'='character',false));
 -- The nested stage locks the attack. A competing request may have committed
 -- the entire application while we waited; return its winner without new events.
 select * into prior from dndkeep_private.psionic_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 target_kind:=case when a.target_type='character' then 'player' else a.target_type end;
 actor_kind:=case when a.attacker_type='character' then 'player' when a.attacker_type='system' then 'system' else 'monster' end;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
 values(a.campaign_id,a.encounter_id,a.chain_id,3,actor_kind,a.attacker_name,target_kind,a.target_name,'damage_applied',
  jsonb_build_object('action_name',a.attack_name,'total',damage,'damage_type',a.damage_type,'attack_id',a.id,
   'hp_after',life->'afterHP','temp_hp_after',life->'afterTempHP'));
 if damage<>a.damage_final then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,2,'system','System',target_kind,a.target_name,'resistance_applied',
   jsonb_build_object('source','condition','conditions',jsonb_build_array('Petrified'),'original_damage',a.damage_final,'reduced_damage',damage));
 end if;
 if (life->>'dead')::boolean and not coalesce((p_expected->'target'->'combatant'->>'is_dead')::boolean,false) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'participant_died',jsonb_build_object('massive_damage',life->'massiveDamage','damage',damage));
 elsif (life->>'beforeHP')::integer>0 and (life->>'afterHP')::integer=0 then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'dropped_to_0_hp',jsonb_build_object('damage',damage));
 end if;
 if (life->>'concentrationBroken')::boolean then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,6,'system','System',target_kind,a.target_name,'concentration_broken',jsonb_build_object('reason','incapacitated','spell',p_expected->'target'->'definition'->'concentration_spell'));
 elsif life->>'concentrationCheckId' is not null then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,59,'system','System',target_kind,a.target_name,'concentration_save_prompted',jsonb_build_object('damage',damage,'dc',least(30,greatest(10,damage/2)),'automation_setting',life->'concentrationMode'));
 end if;
 update public.pending_attacks set state='applied',damage_final=damage,applied_at=now() where id=a.id returning * into a;
 result:=jsonb_build_object('attack',to_jsonb(a),'settlement',life,'replayed',false);
 insert into dndkeep_private.psionic_damage_applications(attack_id,outcome) values(a.id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.apply_psionic_pending_damage(uuid,jsonb,integer) from public,anon;
grant execute on function dndkeep_private.apply_psionic_pending_damage(uuid,jsonb,integer) to authenticated;
create or replace function public.apply_psionic_pending_damage(p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.apply_psionic_pending_damage(p_attack_id,p_expected,p_con_modifier); $$;
revoke all on function public.apply_psionic_pending_damage(uuid,jsonb,integer) from public,anon;
grant execute on function public.apply_psionic_pending_damage(uuid,jsonb,integer) to authenticated;
