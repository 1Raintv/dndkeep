-- Shared action context reuses the existing Psion own-turn observer.
-- Its effect token also expires on rests; action budgets must NOT follow those
-- effect-expiry writes. Advance action_epoch only when turn context changes.
alter table dndkeep_private.psionic_turn_starts add column if not exists action_epoch uuid not null default gen_random_uuid();
create or replace function dndkeep_private.observe_action_epoch()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.context is distinct from old.context then new.action_epoch:=gen_random_uuid();
 else new.action_epoch:=old.action_epoch;end if;
 return new;
end;$$;
revoke all on function dndkeep_private.observe_action_epoch() from public,anon,authenticated;
drop trigger if exists observe_action_epoch on dndkeep_private.psionic_turn_starts;
create trigger observe_action_epoch before update on dndkeep_private.psionic_turn_starts
 for each row execute function dndkeep_private.observe_action_epoch();

-- One actor selector for class-feature expiry and action-budget eligibility.
-- Matches CombatProvider: dead combatants do not occupy initiative indices.
create or replace function dndkeep_private.current_action_participant(p_encounter uuid,p_index integer)
returns uuid language sql stable set search_path='' as $$
 with living as (
  select cp.id,cp.turn_order from public.combat_participants cp
  left join public.combatants cb on cb.id=cp.combatant_id
  left join lateral (
   select recovered.is_dead from public.combatants recovered
   where cp.combatant_id is null and recovered.campaign_id=cp.campaign_id
    and recovered.definition_type=cp.participant_type and recovered.definition_id=cp.entity_id limit 1
  ) fallback on true
  where cp.encounter_id=p_encounter and not coalesce(cb.is_dead,fallback.is_dead,false)
 )
 select id from living where p_index>=0 and not exists(select 1 from living group by turn_order having count(*)>1)
 order by turn_order offset greatest(0,p_index) limit 1;
$$;
revoke all on function dndkeep_private.current_action_participant(uuid,integer) from public,anon,authenticated;
create or replace function dndkeep_private.current_psionic_character(p_encounter uuid,p_index integer) returns uuid
language sql stable set search_path='' as $$
 select c.id from public.combat_participants p join public.characters c
  on p.participant_type='character' and p.entity_id=c.id::text and p.campaign_id=c.campaign_id
 where p.id=dndkeep_private.current_action_participant(p_encounter,p_index);
$$;
revoke all on function dndkeep_private.current_psionic_character(uuid,integer) from public,anon,authenticated;

create or replace function dndkeep_private.action_turn_context(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; e public.combat_encounters; ids uuid[]; participant uuid; actor uuid; own_epoch uuid; solo bigint;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select array_agg(p.id) into ids from public.combat_participants p
 join public.combat_encounters ce on ce.id=p.encounter_id
 where p.participant_type='character' and p.entity_id=c.id::text
  and ce.campaign_id=c.campaign_id and ce.status='active';
 if coalesce(cardinality(ids),0)>1 then raise exception 'Resolve duplicate active combat participation before taking an action';end if;
 if coalesce(cardinality(ids),0)=0 then
  select turn_number into solo from public.psionic_solo_turns where character_id=c.id;
  return jsonb_build_object('actorId',c.id,'turnId','solo:'||c.id||':'||coalesce(solo,0),
   'ownerTurnId','solo:'||c.id||':'||coalesce(solo,0),'isOwnTurn',true,'encounterId',null,'participantId',null);
 end if;
 participant:=ids[1];
 select ce.* into e from public.combat_encounters ce join public.combat_participants p on p.encounter_id=ce.id
  where p.id=participant for share of ce;
 if not found or e.status<>'active' or e.campaign_id is distinct from c.campaign_id then raise exception 'Combat changed; retry the action';end if;
 perform 1 from public.combat_participants p where p.id=participant and p.encounter_id=e.id
  and p.participant_type='character' and p.entity_id=c.id::text for share;
 if not found then raise exception 'Combat participation changed; retry the action';end if;
 actor:=dndkeep_private.current_action_participant(e.id,e.current_turn_index);
 if actor is null then raise exception 'Combat has no unambiguous current actor; resolve tied or missing initiative positions';end if;
 -- The existing observer handles encounter, roster, death and solo changes.
 -- Calling it also initializes the currently active actor during rollout.
 perform dndkeep_private.observe_psionic_turn_start(e.id);
 select action_epoch into own_epoch from dndkeep_private.psionic_turn_starts where character_id=c.id;
 if own_epoch is null then raise exception 'Own-turn state is unavailable';end if;
 return jsonb_build_object('actorId',c.id,'turnId',e.psionic_turn_id,'ownerTurnId',e.id||':'||own_epoch,
  'isOwnTurn',actor=participant,'encounterId',e.id,'participantId',participant);
end;$$;
revoke all on function dndkeep_private.action_turn_context(uuid) from public,anon,authenticated;
