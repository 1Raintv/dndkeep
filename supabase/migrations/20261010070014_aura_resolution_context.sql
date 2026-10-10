-- v2.869: authoritative aura preparation, shared with the future atomic commit.
-- Read-only: this does not reserve a save, consume a marker, or prove map geometry.
-- The committing transaction must lock/re-read and compare this context.
create or replace function dndkeep_private.aura_resolution_context(
 p_encounter uuid,p_turn uuid,p_origin uuid,p_target uuid,p_aura text,p_trigger text
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.combat_encounters; origin public.combat_participants; target public.combat_participants;
 ob public.combatants; tb public.combatants; stored jsonb; spec jsonb; n integer;
 party jsonb:='null'; marker text; clock jsonb; target_state jsonb; creature_source jsonb;
begin
 if p_turn is null or p_origin is null or p_target is null or p_origin=p_target
  or p_aura is null or btrim(p_aura)='' or p_trigger is null
  or p_trigger not in('creature_entered','emanation_entered','turn_end') then raise exception 'Invalid aura identity';end if;
 select * into e from public.combat_encounters where id=p_encounter;
 if not found or e.status is distinct from 'active' or e.psionic_turn_id is distinct from p_turn then raise exception 'Aura turn changed';end if;
 select * into origin from public.combat_participants where id=p_origin and encounter_id=e.id and campaign_id=e.campaign_id;
 if not found then raise exception 'Aura origin changed';end if;
 select * into target from public.combat_participants where id=p_target and encounter_id=e.id and campaign_id=e.campaign_id;
 if not found or origin.combatant_id=target.combatant_id then raise exception 'Aura target changed';end if;
 select * into ob from public.combatants where id=origin.combatant_id and campaign_id=e.campaign_id;
 if not found or coalesce(ob.is_dead,false) then raise exception 'Aura origin is unavailable';end if;
 select * into tb from public.combatants where id=target.combatant_id and campaign_id=e.campaign_id;
 if not found or coalesce(tb.is_dead,false) then raise exception 'Aura target is unavailable';end if;
 if jsonb_typeof(ob.active_buffs) is distinct from 'array' then raise exception 'Review origin aura effects';end if;
 select count(*),(jsonb_agg(b))->0 into n,stored from jsonb_array_elements(ob.active_buffs) b where b->>'key'='aura:'||p_aura;
 if n<>1 then raise exception 'Aura is missing or ambiguous';end if;
 spec:=stored->'aura';
 if (jsonb_typeof(spec)='object' and spec->>'key'=p_aura and jsonb_typeof(spec->'name')='string'
  and btrim(spec->>'name')<>'' and stored->>'casterParticipantId'=origin.id::text
  and spec->>'saveAbility' in('STR','DEX','CON','INT','WIS','CHA')
  and jsonb_typeof(spec->'saveDC')='number' and spec->>'saveDC' ~ '^[0-9]+$'
  and jsonb_typeof(spec->'radiusFt')='number' and jsonb_typeof(spec->'halfOnSave')='boolean'
  and jsonb_typeof(spec->'triggers')='array' and jsonb_typeof(spec->'exemptParticipantIds')='array'
  and spec->>'affects' in('all','enemies')
  and spec ? 'damageDice' and (spec->'damageDice'='null'::jsonb or (jsonb_typeof(spec->'damageDice')='string' and btrim(spec->>'damageDice')<>''))
  and spec ? 'damageType' and (spec->'damageType'='null'::jsonb or spec->>'damageType' in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'))
  and spec ? 'speedInside' and (spec->'speedInside'='null'::jsonb or spec->>'speedInside'='half')) is not true then
  raise exception 'Review stored aura configuration';
 end if;
 if (spec->>'saveDC')::numeric>1000 or (spec->>'radiusFt')::numeric<0 then raise exception 'Review stored aura numbers';end if;
 if exists(select 1 from jsonb_array_elements(spec->'triggers') t where jsonb_typeof(t)<>'string' or t#>>'{}' not in('creature_entered','emanation_entered','turn_end'))
  or exists(select 1 from jsonb_array_elements(spec->'exemptParticipantIds') t where jsonb_typeof(t)<>'string' or t#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Review stored aura eligibility';end if;
 if not (spec->'triggers' ? p_trigger) then raise exception 'Aura does not use this trigger';end if;
 if exists(select 1 from jsonb_array_elements_text(spec->'exemptParticipantIds') t where t::uuid=target.id) then raise exception 'Target is exempt from this aura';end if;
 -- Preserve the current engine's character/non-character grouping. This is
 -- not a general hostility model; a future faction model must replace both.
 if spec->>'affects'='enemies' and (origin.participant_type='character')=(target.participant_type='character') then raise exception 'Target is outside this aura group';end if;
 if p_trigger='turn_end' then
  clock:=dndkeep_private.combat_clock_context(e.id,p_turn);
  if clock->>'outgoingId' is distinct from target.id::text then raise exception 'Aura target is not ending its turn';end if;
 end if;
 marker:='aura_save:'||origin.id::text||':'||p_aura;
 if target.once_per_turn_used is null then raise exception 'Review target per-turn markers';end if;
 if marker=any(target.once_per_turn_used) then raise exception 'Aura save already used this turn';end if;
 -- The legacy save helper reads homebrew stats. Include every other source
 -- revision too; custom/catalog stat changes must invalidate a prepared save.
 target_state:=dndkeep_private.pending_damage_participant_context(target.id,e.campaign_id,e.id);
 if target_state->>'definitionType' in('homebrew_monster','narrative_npc','roster_npc') then
  select to_jsonb(m) into creature_source from public.homebrew_monsters m where m.id::text=target.entity_id;
 elsif target_state->>'definitionType'='srd_monster' then
  select to_jsonb(m) into creature_source from public.monsters m where m.id=target.entity_id;
 elsif target_state->>'definitionType'='custom' then creature_source:=tb.stat_block_snapshot;
 end if;
 if target.participant_type='character' then
  party:=dndkeep_private.party_damage_context(e.campaign_id,target.entity_id::uuid);
  if party#>>'{participant,id}' is distinct from target.id::text then raise exception 'Aura damage target changed';end if;
 end if;
 return jsonb_build_object('encounterId',e.id,'campaignId',e.campaign_id,'turnId',p_turn,'trigger',p_trigger,
  'aura',stored,'marker',marker,'markers',to_jsonb(target.once_per_turn_used),
  'origin',dndkeep_private.pending_damage_participant_context(origin.id,e.campaign_id,e.id),
  'target',target_state,'creatureRevision',pg_catalog.md5(coalesce(creature_source,'null'::jsonb)::text),
  'save',dndkeep_private.saving_target_context(e.campaign_id,e.id,target.id,spec->>'saveAbility'),
  'partyDamage',party,'geometryVerified',false);
end;$$;
revoke all on function dndkeep_private.aura_resolution_context(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;

create or replace function dndkeep_private.get_aura_resolution_context(
 p_encounter uuid,p_turn uuid,p_origin uuid,p_target uuid,p_aura text,p_trigger text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.combat_encounters e join public.campaigns c on c.id=e.campaign_id
  where e.id=p_encounter and c.owner_id=auth.uid()) then raise exception 'Aura preparation is available only to its DM';end if;
 return dndkeep_private.aura_resolution_context(p_encounter,p_turn,p_origin,p_target,p_aura,p_trigger);
end;$$;
revoke all on function dndkeep_private.get_aura_resolution_context(uuid,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function dndkeep_private.get_aura_resolution_context(uuid,uuid,uuid,uuid,text,text) to authenticated;
create or replace function public.get_aura_resolution_context(
 p_encounter uuid,p_turn uuid,p_origin uuid,p_target uuid,p_aura text,p_trigger text
) returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.get_aura_resolution_context(p_encounter,p_turn,p_origin,p_target,p_aura,p_trigger);
$$;
revoke all on function public.get_aura_resolution_context(uuid,uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.get_aura_resolution_context(uuid,uuid,uuid,uuid,text,text) to authenticated;
