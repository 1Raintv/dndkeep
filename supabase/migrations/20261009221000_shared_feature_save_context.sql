-- Shared target-state reader keeps attack and feature save conditions aligned.
create or replace function dndkeep_private.saving_target_context(p_campaign uuid,p_encounter uuid,p_target uuid,p_ability text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cp public.combat_participants; cb public.combatants; c public.characters;
 target jsonb:='null'; conditions text[]:='{}'; buffs jsonb:='[]'; exhaustion integer:=0;
 natural_extremes boolean:=false; guards boolean:=false; automatic boolean; disadvantage boolean;
begin
 if p_target is not null then
  select * into cp from public.combat_participants where id=p_target and campaign_id=p_campaign
   and encounter_id is not distinct from p_encounter;
  if not found then raise exception 'Saving target changed';end if;
  select * into cb from public.combatants where id=cp.combatant_id and campaign_id=p_campaign;
  if not found or cb.definition_id is distinct from cp.entity_id then raise exception 'Saving target definition changed';end if;
  conditions:=coalesce(cb.active_conditions,'{}');buffs:=coalesce(cb.active_buffs,'[]');exhaustion:=coalesce(cb.exhaustion_level,0);
  if jsonb_typeof(buffs)<>'array' or exhaustion not between 0 and 6 then raise exception 'Review saving target effects';end if;
  if cp.participant_type='character' then
   select * into c from public.characters where id::text=cp.entity_id and campaign_id=p_campaign;
   if not found then raise exception 'Saving character is unavailable';end if;
   natural_extremes:=c.nat_1_20_saves is distinct from false;
   guards:=p_ability='INT' and dndkeep_private.psionic_guards_effect(c.id) is not null;
  elsif cp.participant_type not in('creature','monster','npc') then raise exception 'Unsupported saving target';end if;
  target:=jsonb_build_object('id',cp.id,'entityId',cp.entity_id,'type',cp.participant_type,'combatantId',cp.combatant_id);
 end if;
 automatic:=coalesce(p_ability in('STR','DEX') and conditions&&array['Paralyzed','Petrified','Stunned','Unconscious'],false);
 disadvantage:=not automatic and (coalesce(p_ability='DEX' and 'Restrained'=any(conditions),false)
  or coalesce(p_ability in('STR','DEX','CON') and conditions&&array['Encumbered','HeavilyEncumbered'],false));
 return jsonb_build_object('target',target,'conditions',to_jsonb(conditions),'buffs',buffs,'exhaustion',exhaustion,'naturalExtremes',natural_extremes,
  'autoFail',automatic,'advantage',not automatic and guards,'disadvantage',disadvantage);
end;$$;
revoke all on function dndkeep_private.saving_target_context(uuid,uuid,uuid,text) from public,anon,authenticated;
create or replace function dndkeep_private.attack_save_context(p_attack uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.pending_attacks;
begin
 select * into a from public.pending_attacks where id=p_attack;
 if not found then raise exception 'Saving throw is unavailable';end if;
 return dndkeep_private.saving_target_context(a.campaign_id,a.encounter_id,a.target_participant_id,a.save_ability)||
  jsonb_build_object('attack',jsonb_build_object('id',a.id,'state',a.state,'kind',a.attack_kind,'ability',a.save_ability,
  'dc',a.save_dc,'result',a.save_result,'targetId',a.target_participant_id,'targetType',a.target_type,'encounterId',a.encounter_id,'campaignId',a.campaign_id,'cover',a.cover_level));
end;$$;
revoke all on function dndkeep_private.attack_save_context(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.get_propel_save_context(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; e public.combat_encounters;
 cp public.combat_participants; state jsonb; cap integer; remaining integer;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Propel declaration unavailable';end if;
 if d.outcome is not null then raise exception 'Propel is already resolved. Refresh the saved use';end if;
 if d.roll_result is null then raise exception 'Finalize the Propel power roll first';end if;
 if d.target->>'participantId' is null or d.turn_context->>'encounterId' is null then raise exception 'This tabletop target requires manual resolution';end if;
 select * into e from public.combat_encounters where id=(d.turn_context->>'encounterId')::uuid
  and campaign_id=(d.caster_snapshot->>'campaign_id')::uuid for share;
 if not found or e.status<>'active' or c.campaign_id is distinct from e.campaign_id then raise exception 'The declared encounter is no longer active';end if;
 select * into cp from public.combat_participants where id=(d.target->>'participantId')::uuid and encounter_id=e.id and campaign_id=e.campaign_id;
 if not found then raise exception 'The declared target is unavailable';end if;
 state:=dndkeep_private.saving_target_context(e.campaign_id,e.id,cp.id,'STR');
 cap:=coalesce(cp.legendary_resistance,0);
 if cap<0 or coalesce(cp.legendary_resistance_used,0)<0 then raise exception 'Review Legendary Resistance charges';end if;
 if cap>0 and e.in_lair then cap:=cap+1;end if;
 remaining:=case when cp.participant_type in('creature','monster','npc') then greatest(0,cap-coalesce(cp.legendary_resistance_used,0)) else 0 end;
 return jsonb_build_object('declarationId',d.request_id,'characterId',c.id,'encounterId',e.id,'participantId',cp.id,
  'state',state,'legendaryResistanceRemaining',remaining);
end;$$;
revoke all on function dndkeep_private.get_propel_save_context(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.get_propel_save_context(uuid,uuid) to authenticated;
create or replace function public.get_propel_save_context(p_character uuid,p_declaration uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.get_propel_save_context(p_character,p_declaration);$$;
revoke all on function public.get_propel_save_context(uuid,uuid) from public,anon;
grant execute on function public.get_propel_save_context(uuid,uuid) to authenticated;
