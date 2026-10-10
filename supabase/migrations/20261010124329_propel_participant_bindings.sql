-- v2.869: capture original roster/map identities for new declarations only.
-- Older rows cannot be backfilled reliably after roster edits.
alter table dndkeep_private.propel_declarations add column if not exists participant_bindings jsonb;

create or replace function dndkeep_private.propel_current_bindings(p_character uuid,p_encounter uuid,p_target uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare campaign uuid; actor public.combat_participants; target public.combat_participants;
 actor_piece public.combatants; target_piece public.combatants;
begin
 select campaign_id into campaign from public.characters where id=p_character;
 if campaign is null or not exists(select 1 from public.combat_encounters where id=p_encounter and campaign_id=campaign) then
  raise exception 'The original Propel encounter changed';end if;
 select * into strict actor from public.combat_participants where encounter_id=p_encounter and campaign_id=campaign
  and participant_type='character' and entity_id=p_character::text;
 perform 1 from public.combat_participants where id in(actor.id,p_target) order by id for share;
 select * into actor from public.combat_participants where id=actor.id and encounter_id=p_encounter and campaign_id=campaign
  and participant_type='character' and entity_id=p_character::text;
 if not found then raise exception 'The original Propel actor changed';end if;
 select * into target from public.combat_participants where id=p_target and encounter_id=p_encounter and campaign_id=campaign;
 if not found or target.id=actor.id then raise exception 'The original Propel target changed';end if;
 perform 1 from public.combatants where id in(actor.combatant_id,target.combatant_id) order by id for share;
 select * into actor_piece from public.combatants where id=actor.combatant_id and campaign_id=campaign;
 select * into target_piece from public.combatants where id=target.combatant_id and campaign_id=campaign;
 return jsonb_build_object('campaignId',campaign,'encounterId',p_encounter,
  'actor',jsonb_build_object('id',actor.id,'participantType',actor.participant_type,'entityId',actor.entity_id,'combatantId',actor.combatant_id,
   'definitionType',actor_piece.definition_type,'definitionId',actor_piece.definition_id),
  'target',jsonb_build_object('id',target.id,'participantType',target.participant_type,'entityId',target.entity_id,'combatantId',target.combatant_id,
   'definitionType',target_piece.definition_type,'definitionId',target_piece.definition_id));
end;$$;
revoke all on function dndkeep_private.propel_current_bindings(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.guard_propel_bindings()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.participant_bindings:=null;
  if new.target->>'participantId' is not null and new.turn_context->>'encounterId' is not null then
   new.participant_bindings:=dndkeep_private.propel_current_bindings(new.character_id,(new.turn_context->>'encounterId')::uuid,(new.target->>'participantId')::uuid);
  end if;
 else
  if new.participant_bindings is distinct from old.participant_bindings then raise exception 'Original Propel participants cannot be rewritten';end if;
  -- Cancellation remains possible after roster edits; completed retries do not
  -- update this row. A rejected settlement rolls its payment/save back as well.
  if old.participant_bindings is not null and old.outcome is null and new.outcome is distinct from 'cancelled'
   and (new.roll_result is distinct from old.roll_result or new.outcome is distinct from old.outcome) then
   if old.participant_bindings is distinct from dndkeep_private.propel_current_bindings(old.character_id,(old.turn_context->>'encounterId')::uuid,(old.target->>'participantId')::uuid)
    then raise exception 'The original Propel participants changed. Cancel this saved use and review the target';end if;
  end if;
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_propel_bindings() from public,anon,authenticated;
drop trigger if exists propel_participant_bindings on dndkeep_private.propel_declarations;
create trigger propel_participant_bindings before insert or update of participant_bindings,roll_result,outcome
 on dndkeep_private.propel_declarations for each row execute function dndkeep_private.guard_propel_bindings();
