-- v2.832: incapacitation is a permanent end for that activation. An epoch
-- prevents condition removal or delayed final confirmation from reviving it.
-- No encounter/condition trigger locks a character or Sharpened receipt row.
alter table dndkeep_private.psionic_turn_starts add column if not exists incapacitation_token uuid not null default gen_random_uuid();
alter table dndkeep_private.sharpened_rolls add column if not exists incapacitation_token uuid;
alter table dndkeep_private.sharpened_rolls add column if not exists started_incapacitated boolean not null default false;

create or replace function dndkeep_private.psionic_is_incapacitated(p_character uuid)
returns boolean language sql stable set search_path='' as $$
 select coalesce((select bool_or(coalesce(cb.is_dead,false) or coalesce(cb.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'])
  from public.combat_participants cp join public.combat_encounters ce on ce.id=cp.encounter_id and ce.status='active'
  join public.combatants cb on cb.id=cp.combatant_id and cb.definition_type='character' and cb.definition_id=c.id::text
  where cp.participant_type='character' and cp.entity_id=c.id::text and cp.campaign_id=c.campaign_id and ce.campaign_id=c.campaign_id),
  coalesce(c.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'])
 from public.characters c where c.id=p_character;
$$;
revoke all on function dndkeep_private.psionic_is_incapacitated(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.track_sharpened_roll()
returns trigger language plpgsql security definer set search_path='' as $$
declare epoch uuid; incapacitated boolean;
begin
 if new.discipline='sharpened-mind' then
  select incapacitation_token into epoch from dndkeep_private.psionic_turn_starts where character_id=new.character_id;
  incapacitated:=dndkeep_private.psionic_is_incapacitated(new.character_id);
  insert into dndkeep_private.sharpened_rolls(request_id,character_id,incapacitation_token,started_incapacitated)
   values(new.request_id,new.character_id,epoch,coalesce(incapacitated,true)) on conflict do nothing;
 end if;return new;
end; $$;

create or replace function dndkeep_private.observe_psionic_character_incapacitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if ((new.campaign_id is distinct from old.campaign_id) or (coalesce(new.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned']
  and not(coalesce(old.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'])))
  and dndkeep_private.psionic_is_incapacitated(new.id) then
  update dndkeep_private.psionic_turn_starts set incapacitation_token=gen_random_uuid() where character_id=new.id;
 end if;return new;
end; $$;
revoke all on function dndkeep_private.observe_psionic_character_incapacitation() from public,anon,authenticated;
drop trigger if exists observe_psionic_character_incapacitation on public.characters;
create trigger observe_psionic_character_incapacitation after update of active_conditions,campaign_id on public.characters
 for each row execute function dndkeep_private.observe_psionic_character_incapacitation();

create or replace function dndkeep_private.observe_psionic_combatant_incapacitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (coalesce(new.is_dead,false) or coalesce(new.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'])
  and not(coalesce(old.is_dead,false) or coalesce(old.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned']) then
  update dndkeep_private.psionic_turn_starts t set incapacitation_token=gen_random_uuid()
  where t.character_id in(select c.id from public.characters c join public.combat_participants cp on cp.entity_id=c.id::text and cp.participant_type='character' and cp.campaign_id=c.campaign_id
   join public.combat_encounters ce on ce.id=cp.encounter_id and ce.status='active' and ce.campaign_id=c.campaign_id
   where cp.combatant_id=new.id and new.definition_type='character' and new.definition_id=c.id::text);
 end if;return new;
end; $$;
revoke all on function dndkeep_private.observe_psionic_combatant_incapacitation() from public,anon,authenticated;
drop trigger if exists observe_psionic_combatant_incapacitation on public.combatants;
create trigger observe_psionic_combatant_incapacitation after update of active_conditions,is_dead on public.combatants
 for each row execute function dndkeep_private.observe_psionic_combatant_incapacitation();

-- Joining a roster with an already-incapacitated combatant must also latch.
create or replace function dndkeep_private.observe_psionic_roster_incapacitation()
returns trigger language plpgsql security definer set search_path='' as $$
declare ids text[];
begin
 if tg_op='INSERT' then ids:=case when new.participant_type='character' then array[new.entity_id] else '{}'::text[] end;
 elsif tg_op='DELETE' then ids:=case when old.participant_type='character' then array[old.entity_id] else '{}'::text[] end;
 else ids:=(case when new.participant_type='character' then array[new.entity_id] else '{}'::text[] end)||(case when old.participant_type='character' then array[old.entity_id] else '{}'::text[] end);end if;
 update dndkeep_private.psionic_turn_starts t set incapacitation_token=gen_random_uuid()
 where t.character_id::text=any(ids) and dndkeep_private.psionic_is_incapacitated(t.character_id);
 return null;
end; $$;
revoke all on function dndkeep_private.observe_psionic_roster_incapacitation() from public,anon,authenticated;
drop trigger if exists observe_psionic_roster_incapacitation on public.combat_participants;
create trigger observe_psionic_roster_incapacitation after insert or delete or update of combatant_id,encounter_id,entity_id,participant_type,campaign_id on public.combat_participants
 for each row execute function dndkeep_private.observe_psionic_roster_incapacitation();

create or replace function dndkeep_private.observe_psionic_encounter_incapacitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  update dndkeep_private.psionic_turn_starts t set incapacitation_token=gen_random_uuid()
  where t.character_id in(select c.id from public.characters c join public.combat_participants cp on cp.entity_id=c.id::text and cp.participant_type='character' and cp.campaign_id=c.campaign_id where cp.encounter_id=new.id)
   and dndkeep_private.psionic_is_incapacitated(t.character_id);
 end if;return new;
end; $$;
revoke all on function dndkeep_private.observe_psionic_encounter_incapacitation() from public,anon,authenticated;
drop trigger if exists observe_psionic_encounter_incapacitation on public.combat_encounters;
create trigger observe_psionic_encounter_incapacitation after insert or update of status on public.combat_encounters for each row execute function dndkeep_private.observe_psionic_encounter_incapacitation();

create or replace function dndkeep_private.sharpened_incapacitation_state(p_activation uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('incapacitationTracked',r.incapacitation_token is not null,
  'endedByIncapacitation',r.incapacitation_token is not null and (r.started_incapacitated or r.incapacitation_token is distinct from t.incapacitation_token or coalesce(dndkeep_private.psionic_is_incapacitated(r.character_id),true)))
 from dndkeep_private.sharpened_rolls r left join dndkeep_private.psionic_turn_starts t on t.character_id=r.character_id where r.request_id=p_activation;
$$;
revoke all on function dndkeep_private.sharpened_incapacitation_state(uuid) from public,anon,authenticated;

-- A failed association rolls back the enhancement payment/history in the same
-- transaction. Exact payment replays never insert another association.
create or replace function dndkeep_private.check_sharpened_incapacitation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (dndkeep_private.sharpened_incapacitation_state(new.activation_id)->>'endedByIncapacitation')::boolean then raise exception 'Sharpened Mind ended on incapacitation; no enhancement was spent';end if;
 return new;
end; $$;
revoke all on function dndkeep_private.check_sharpened_incapacitation() from public,anon,authenticated;
drop trigger if exists check_sharpened_incapacitation on dndkeep_private.sharpened_enhancements;
create trigger check_sharpened_incapacitation before insert on dndkeep_private.sharpened_enhancements for each row execute function dndkeep_private.check_sharpened_incapacitation();

create or replace function dndkeep_private.get_sharpened_roll_records(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; result jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 -- All unfinished rolls remain recoverable. Limit only completed history.
 select coalesce(jsonb_agg(value order by activated desc,id),'[]'::jsonb) into result from (
  select coalesce(r.result,dndkeep_private.sharpened_roll_value(r.request_id))||jsonb_build_object('finalized',r.result is not null)||dndkeep_private.sharpened_incapacitation_state(r.request_id) as value,a.created_at as activated,r.request_id as id
  from dndkeep_private.sharpened_rolls r join dndkeep_private.psionic_discipline_uses a on a.request_id=r.request_id
  where r.character_id=c.id and (r.result is null or r.request_id in(
   select recent.request_id from dndkeep_private.sharpened_rolls recent
   join dndkeep_private.psionic_discipline_uses ra on ra.request_id=recent.request_id
   where recent.character_id=c.id and recent.result is not null order by ra.created_at desc,recent.request_id limit 5
  ))
 ) records;
 return result;
end; $$;
revoke all on function dndkeep_private.get_sharpened_roll_records(uuid) from public,anon;
grant execute on function dndkeep_private.get_sharpened_roll_records(uuid) to authenticated;
create or replace function public.get_sharpened_roll_records(p_character_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.get_sharpened_roll_records(p_character_id);
$$;
revoke all on function public.get_sharpened_roll_records(uuid) from public,anon;
grant execute on function public.get_sharpened_roll_records(uuid) to authenticated;
