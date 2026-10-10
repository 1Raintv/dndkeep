-- v2.869: pending Propel belongs to its captured encounter until settled.
-- VOLATILE obtains fresh evidence after a boundary waits for a declaration lock.
create or replace function dndkeep_private.assert_propel_resolved(p_encounter uuid)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
 if exists(select 1 from dndkeep_private.propel_declarations d
  where d.turn_context->>'encounterId'=p_encounter::text and d.outcome is null) then
  raise exception 'Resolve pending Telekinetic or Warp Propel on the character sheet before advancing combat. Cancel only if no saving throw has been recorded.';
 end if;
end;$$;
revoke all on function dndkeep_private.assert_propel_resolved(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.combat_clock_context(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare camp public.campaigns;enc public.combat_encounters;actors uuid[];
 expected_index integer;expected_round bigint;wrapped boolean;after_clock bigint;
 outgoing uuid;outgoing_order integer;ended_count integer;
begin
 select ca.* into camp from public.campaigns ca join public.combat_encounters e on e.campaign_id=ca.id
 where e.id=p_encounter_id and ca.owner_id=auth.uid();
 if not found then raise exception 'Combat time is available only to its DM';end if;
 select * into enc from public.combat_encounters where id=p_encounter_id and campaign_id=camp.id;
 if p_expected_turn is null then raise exception 'Invalid combat transition request';end if;
 if enc.status<>'active' or enc.psionic_turn_id<>p_expected_turn then raise exception 'Combat turn changed; refresh before advancing';end if;
 perform dndkeep_private.assert_propel_resolved(enc.id);
 if exists(select 1 from public.combat_participants cp left join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and (cp.campaign_id<>camp.id or cb.id is null or cb.campaign_id<>camp.id or cp.turn_order is null)) then
  raise exception 'Repair the initiative roster before advancing';end if;
 if exists(select cp.turn_order from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false) group by cp.turn_order having count(*)>1) then
  raise exception 'Resolve duplicate initiative positions before advancing';end if;
 select array_agg(cp.id order by cp.turn_order,cp.id) into actors from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false);
 if coalesce(cardinality(actors),0)=0 then raise exception 'No living participants can take a turn';end if;
 -- The end-effect receipt survives the outgoing actor dying. The current
 -- filtered index does not: it now points at its successor (or out of bounds).
 select count(*),(array_agg(t.participant_id))[1] into ended_count,outgoing
 from dndkeep_private.turn_effect_batches t join public.combat_participants cp on cp.id=t.participant_id
 where cp.encounter_id=enc.id and t.turn_id=p_expected_turn and t.timing='turn_end';
 if ended_count>1 then raise exception 'Conflicting outgoing actors; review turn effects before advancing';end if;
 if ended_count=1 then
  select turn_order into outgoing_order from public.combat_participants where id=outgoing;
  if exists(select 1 from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
   where cp.encounter_id=enc.id and cp.id<>outgoing and cp.turn_order=outgoing_order and not coalesce(cb.is_dead,false)) then
   raise exception 'Resolve duplicate initiative positions before advancing';end if;
  select count(*) into expected_index from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
   where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false) and cp.turn_order<=outgoing_order;
 else
  if enc.current_turn_index<0 or enc.current_turn_index>=cardinality(actors) then raise exception 'Repair the initiative roster before advancing';end if;
  outgoing:=actors[enc.current_turn_index+1];
  expected_index:=enc.current_turn_index+1;
 end if;
 wrapped:=expected_index>=cardinality(actors);
 if wrapped then expected_index:=0;end if;
 expected_round:=enc.round_number::bigint+case when wrapped then 1 else 0 end;
 if expected_round>2147483647 then raise exception 'Combat round limit reached';end if;
 after_clock:=camp.combat_rounds_elapsed::bigint+case when wrapped then 1 else 0 end;
 if after_clock>2147483647 then raise exception 'Campaign clock limit reached';end if;
 return jsonb_build_object('userId',auth.uid(),'encounterId',enc.id,'expectedTurn',enc.psionic_turn_id,
  'outgoingId',outgoing,'incomingId',actors[expected_index+1],'nextIndex',expected_index,'nextRound',expected_round,
  'roundWrapped',wrapped,'campaignRounds',after_clock);
end;$$;
revoke all on function dndkeep_private.combat_clock_context(uuid,uuid) from public,anon,authenticated;


-- The early clock context stops the normal UI before outgoing effects.
-- These triggers also protect direct/late writes. Replayed receipts do not
-- insert or advance a boundary, so remain recoverable after later actions.
create or replace function dndkeep_private.guard_pending_propel_turn()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='active' and new.status='active' and
  (new.psionic_turn_id is distinct from old.psionic_turn_id or new.current_turn_index is distinct from old.current_turn_index or new.round_number is distinct from old.round_number) then
  perform dndkeep_private.assert_propel_resolved(old.id);
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_pending_propel_turn() from public,anon,authenticated;
drop trigger if exists zz_pending_propel_turn on public.combat_encounters;
create trigger zz_pending_propel_turn before update on public.combat_encounters
 for each row execute function dndkeep_private.guard_pending_propel_turn();

create or replace function dndkeep_private.guard_propel_end_effects()
returns trigger language plpgsql security definer set search_path='' as $$
declare encounter uuid;
begin
 if new.timing='turn_end' then
  select encounter_id into encounter from public.combat_participants where id=new.participant_id;
  perform dndkeep_private.assert_propel_resolved(encounter);
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_propel_end_effects() from public,anon,authenticated;
drop trigger if exists guard_propel_end_effects on dndkeep_private.turn_effect_batches;
create trigger guard_propel_end_effects before insert on dndkeep_private.turn_effect_batches
 for each row execute function dndkeep_private.guard_propel_end_effects();

-- Once end effects have committed, a fresh declaration cannot reopen that turn.
-- begin_propel and outgoing character effects serialize on the caster row.
create or replace function dndkeep_private.guard_propel_after_end_effects()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from dndkeep_private.turn_effect_batches t
  join public.combat_participants cp on cp.id=t.participant_id
  where cp.encounter_id::text=new.turn_context->>'encounterId'
   and t.turn_id::text=new.turn_context->>'turnId' and t.timing='turn_end') then
  raise exception 'This turn is already ending. Finish the saved turn transition before declaring Propel.';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_propel_after_end_effects() from public,anon,authenticated;
drop trigger if exists guard_propel_after_end_effects on dndkeep_private.propel_declarations;
create trigger guard_propel_after_end_effects before insert on dndkeep_private.propel_declarations
 for each row execute function dndkeep_private.guard_propel_after_end_effects();
notify pgrst,'reload schema';
