-- v2.869: completion, carry-over and the combat log commit together.
create table if not exists dndkeep_private.encounter_completions(
 encounter_id uuid primary key references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null, completed_by uuid not null, result jsonb not null
);
alter table dndkeep_private.encounter_completions enable row level security;
revoke all on dndkeep_private.encounter_completions from public,anon,authenticated;

create or replace function dndkeep_private.end_combat_encounter(p_encounter uuid,p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns;enc public.combat_encounters;prior dndkeep_private.encounter_completions;
 target record;immunities jsonb;stamp timestamptz:=clock_timestamp();chain uuid:=gen_random_uuid();
 characters_written integer:=0;templates_written integer:=0;result jsonb;
begin
 select c.* into camp from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for update of c;
 if not found then raise exception 'Combat completion is available only to its DM';end if;
 select * into enc from public.combat_encounters where id=p_encounter for update;
 select * into prior from dndkeep_private.encounter_completions where encounter_id=enc.id;
 if found then
  if prior.turn_id is distinct from p_turn or enc.status<>'ended' then raise exception 'Saved combat completion changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if enc.status<>'active' or enc.psionic_turn_id is distinct from p_turn then raise exception 'Combat changed; review before ending it';end if;
 perform dndkeep_private.assert_movement_aura_reviews_complete(enc.id);
 if exists(select 1 from dndkeep_private.live_turn_transitions where encounter_id=enc.id and not complete) then raise exception 'Finish incoming turn effects before ending combat';end if;
 perform 1 from public.combat_participants where encounter_id=enc.id order by id for update;
 if exists(select 1 from public.combat_participants cp left join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and (cp.campaign_id<>camp.id or cb.id is null or cb.campaign_id<>camp.id)) then raise exception 'Repair combatant links before ending combat';end if;
 if exists(select cp.entity_id from public.combat_participants cp where cp.encounter_id=enc.id and cp.participant_type='character'
  group by cp.entity_id having count(distinct cp.combatant_id)>1) then raise exception 'Review duplicate character combatants before carrying state over';end if;
 if exists(select 1 from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
  left join public.characters c on c.id::text=cp.entity_id and c.campaign_id=camp.id
  where cp.encounter_id=enc.id and cp.participant_type='character' and (c.id is null or cb.definition_type<>'character' or cb.definition_id is distinct from cp.entity_id)) then raise exception 'Repair character identity before carrying state over';end if;
 perform 1 from public.characters c where exists(select 1 from public.combat_participants cp where cp.encounter_id=enc.id and cp.participant_type='character' and cp.entity_id=c.id::text) order by c.id for update;
 perform 1 from public.combatants cb where exists(select 1 from public.combat_participants cp where cp.encounter_id=enc.id and cp.combatant_id=cb.id) order by cb.id for update;
 for target in select distinct c.id,cb.current_hp,cb.temp_hp,cb.death_save_successes,cb.death_save_failures,cb.is_stable,cb.is_dead,cb.active_conditions,cb.active_buffs
  from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id join public.characters c on c.id::text=cp.entity_id
  where cp.encounter_id=enc.id and cp.participant_type='character' order by c.id loop
  if target.active_buffs is not null and jsonb_typeof(target.active_buffs)<>'array' then raise exception 'Review malformed character buffs before ending combat';end if;
  select coalesce(jsonb_agg(jsonb_build_object('source_kind',i.source_kind,'source_id',i.source_id,'source_name','',
   'granted_at_rounds',i.granted_at_rounds,'expires_at_rounds',i.expires_at_rounds,'encounter_id',i.encounter_id) order by i.id),'[]'::jsonb)
  into immunities from public.campaign_condition_immunities i where i.campaign_id=camp.id and i.target_type='character' and i.target_id=target.id;
  update public.characters set current_hp=target.current_hp,temp_hp=coalesce(target.temp_hp,temp_hp),
   death_saves_successes=coalesce(target.death_save_successes,death_saves_successes),
   death_saves_failures=case when target.is_dead then 3 else coalesce(target.death_save_failures,death_saves_failures) end,
   is_stable=coalesce(target.is_stable,false) and not coalesce(target.is_dead,false),
   active_conditions=coalesce(target.active_conditions,active_conditions),active_buffs=coalesce(target.active_buffs,active_buffs),
   active_immunities=immunities,combat_hp_sync_id=chain where id=target.id;
  characters_written:=characters_written+1;
 end loop;
 -- Match the existing homebrew UPDATE policy: only the DM's own templates.
 -- Distinct spawned instances must not arbitrarily overwrite each other's buffs.
 perform 1 from public.homebrew_monsters h where h.user_id=auth.uid() and exists(select 1 from public.combat_participants cp
  join public.combatants cb on cb.id=cp.combatant_id where cp.encounter_id=enc.id and cp.participant_type in('creature','monster')
  and cb.definition_type='homebrew_monster' and cb.definition_id=h.id::text and cp.entity_id=h.id::text) order by h.id for update;
 if exists(select h.id from public.homebrew_monsters h join public.combatants cb on cb.definition_type='homebrew_monster' and cb.definition_id=h.id::text
  join public.combat_participants cp on cp.combatant_id=cb.id and cp.entity_id=h.id::text
  where cp.encounter_id=enc.id and h.user_id=auth.uid() and cp.participant_type in('creature','monster')
  group by h.id having count(distinct coalesce(cb.active_buffs,'null'::jsonb))>1) then raise exception 'Review different buffs on instances of the same creature template before ending combat';end if;
 for target in select distinct h.id,cb.active_buffs from public.homebrew_monsters h join public.combatants cb on cb.definition_type='homebrew_monster' and cb.definition_id=h.id::text
  join public.combat_participants cp on cp.combatant_id=cb.id and cp.entity_id=h.id::text
  where cp.encounter_id=enc.id and h.user_id=auth.uid() and cp.participant_type in('creature','monster') order by h.id loop
  if target.active_buffs is not null and jsonb_typeof(target.active_buffs)<>'array' then raise exception 'Review malformed creature buffs before ending combat';end if;
  select coalesce(jsonb_agg(jsonb_build_object('source_kind',i.source_kind,'source_id',i.source_id,'source_name','',
   'granted_at_rounds',i.granted_at_rounds,'expires_at_rounds',i.expires_at_rounds,'encounter_id',i.encounter_id) order by i.id),'[]'::jsonb)
  into immunities from public.campaign_condition_immunities i where i.campaign_id=camp.id and i.target_type='creature' and i.target_id=target.id;
  update public.homebrew_monsters set active_immunities=immunities,active_buffs=coalesce(target.active_buffs,active_buffs) where id=target.id;
  templates_written:=templates_written+1;
 end loop;
 result:=jsonb_build_object('encounterId',enc.id,'turnId',p_turn,'endedAt',stamp,'characterCount',characters_written,'templateCount',templates_written,'replayed',false);
 insert into dndkeep_private.encounter_completions(encounter_id,turn_id,completed_by,result) values(enc.id,p_turn,auth.uid(),result);
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
 values(camp.id,enc.id,chain,0,'system','System','combat_ended',jsonb_build_object('rounds',enc.round_number,'duration_seconds',greatest(0,floor(extract(epoch from stamp-enc.started_at)))),'public');
 update public.combat_encounters set status='ended',ended_at=stamp where id=enc.id;
 return result;
end;$$;
revoke all on function dndkeep_private.end_combat_encounter(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.end_combat_encounter(uuid,uuid) to authenticated;
create or replace function public.end_combat_encounter(p_encounter uuid,p_turn uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.end_combat_encounter(p_encounter,p_turn);$$;
revoke all on function public.end_combat_encounter(uuid,uuid) from public,anon;
grant execute on function public.end_combat_encounter(uuid,uuid) to authenticated;

create or replace function dndkeep_private.guard_encounter_completion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Database-owner maintenance/fixtures are outside the authenticated app path.
 if session_user='postgres' and auth.uid() is null then return new;end if;
 if old.status='active' and new.status='ended' and not exists(select 1 from dndkeep_private.encounter_completions r
  where r.encounter_id=old.id and r.turn_id=old.psionic_turn_id and (r.result->>'endedAt')::timestamptz=new.ended_at) then
  raise exception 'Use verified combat completion to preserve character state';
 end if;
 if old.status='ended' and new.status<>'ended' and exists(select 1 from dndkeep_private.encounter_completions where encounter_id=old.id) then
  raise exception 'Start a new encounter instead of reopening completed combat';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_encounter_completion() from public,anon,authenticated;
drop trigger if exists zz_guard_encounter_completion on public.combat_encounters;
create trigger zz_guard_encounter_completion before update on public.combat_encounters
 for each row execute function dndkeep_private.guard_encounter_completion();
notify pgrst,'reload schema';

-- Ending combat rotates the live turn identifier. Recover by encounter first.
create or replace function dndkeep_private.read_combat_completion(p_encounter uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb;
begin
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for share of c;
 if not found then raise exception 'Combat completion is available only to its DM';end if;
 select r.result||jsonb_build_object('replayed',true) into saved
  from dndkeep_private.encounter_completions r join public.combat_encounters e on e.id=r.encounter_id
  where r.encounter_id=p_encounter and e.status='ended';
 return saved;
end;$$;
revoke all on function dndkeep_private.read_combat_completion(uuid) from public,anon;
grant execute on function dndkeep_private.read_combat_completion(uuid) to authenticated;
create or replace function public.read_combat_completion(p_encounter uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.read_combat_completion(p_encounter);$$;
revoke all on function public.read_combat_completion(uuid) from public,anon;
grant execute on function public.read_combat_completion(uuid) to authenticated;
notify pgrst,'reload schema';
