-- v2.869: opt-in saved post-save movement; private until recovery/UI are wired.
-- Never reinterpret old uses: their map movement may already have happened.
alter table dndkeep_private.propel_declarations
 add column if not exists movement_choice_required boolean not null default false,
 add column if not exists movement_choice jsonb;

create or replace function dndkeep_private.begin_propel_movement_choice(
 p_character uuid,p_request uuid,p_turn text,p_mode text,p_roll integer,p_target jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; result jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_request;
 if found and (d.character_id<>c.id or not d.movement_choice_required) then
  raise exception 'An existing Propel cannot be converted to a new movement choice';end if;
 result:=dndkeep_private.begin_propel(c.id,p_request,p_turn,p_mode,'push',p_roll,p_target);
 update dndkeep_private.propel_declarations set movement_choice_required=true where request_id=p_request;
 return dndkeep_private.read_propel(c.id,p_request)||jsonb_build_object('replayed',result->'replayed');
end;$$;
revoke all on function dndkeep_private.begin_propel_movement_choice(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;

create or replace function dndkeep_private.choose_propel_movement(p_character uuid,p_declaration uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; context jsonb;
 lvl integer; subclass text; original_subclass text; feet integer; receipt jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id for update;
 if not found or not d.movement_choice_required then raise exception 'This Propel has no deferred movement choice';end if;
 if p_choice is null or p_choice not in('push','warp') then raise exception 'Choose push or Warp';end if;
 if d.movement_choice is not null then
  if d.movement_choice->>'choice' is distinct from p_choice then raise exception 'Propel movement is already saved';end if;
  return d.movement_choice||jsonb_build_object('replayed',true);
 end if;
 if d.outcome is distinct from 'failed' or d.result is null or d.roll_result is null then
  raise exception 'Resolve the final failed save before choosing movement';end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 subclass:=case when c.class_name='Psion' then c.subclass else c.secondary_subclass end;
 original_subclass:=case when d.caster_snapshot->>'class_name'='Psion' then d.caster_snapshot->>'subclass' else d.caster_snapshot->>'secondary_subclass' end;
 if lvl is distinct from d.psion_level or subclass is distinct from original_subclass then raise exception 'Original Psion progression changed';end if;
 if p_choice='warp' and (lvl<3 or subclass is distinct from 'Psi Warper') then raise exception 'Warp requires Psi Warper level 3';end if;
 context:=dndkeep_private.action_turn_context(c.id);
 if context->>'turnId' is distinct from d.request->>'turnId' or not coalesce((context->>'isOwnTurn')::boolean,false)
  or public.psionic_turn_context_internal(c.id) is distinct from d.turn_context then
  raise exception 'Choose movement during the original Propel turn';end if;
 if d.turn_context ? 'encounterId' then
  if exists(select 1 from dndkeep_private.outgoing_turn_reservations where encounter_id=(d.turn_context->>'encounterId')::uuid
    and turn_id=(d.turn_context->>'turnId')::uuid) then raise exception 'The original turn is ending';end if;
  if d.participant_bindings is null or d.participant_bindings is distinct from
   dndkeep_private.propel_current_bindings(c.id,(d.turn_context->>'encounterId')::uuid,(d.target->>'participantId')::uuid)
   then raise exception 'The original Propel participants changed';end if;
 end if;
 feet:=case when p_choice='warp' then 30 when d.mode='free' then 5 else 5*(d.roll_result->>'total')::integer end;
 receipt:=jsonb_build_object('declarationId',d.request_id,'characterId',c.id,'choice',p_choice,'feet',feet,
  'target',d.target,'roll',d.roll_result,'replayed',false);
 -- Preserve the immutable declaration/payment evidence, including its source.
 -- The forthcoming client must use this receipt, not the legacy result.feet.
 update dndkeep_private.propel_declarations set movement_choice=receipt where request_id=d.request_id;
 return receipt;
end;$$;
revoke all on function dndkeep_private.choose_propel_movement(uuid,uuid,text) from public,anon,authenticated;
