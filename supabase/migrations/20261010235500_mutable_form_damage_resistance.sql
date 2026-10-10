-- v2.869: project timed Stony resistance into damage snapshots, never stored
-- character defenses. Existing context equality rejects expiry before a new
-- application; completed receipts replay before rebuilding the live context.
create or replace function dndkeep_private.mutable_form_damage_resistances(p_character uuid,p_resistances jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare form jsonb; resistance text; base jsonb;
begin
 form:=dndkeep_private.read_mutable_form_active_internal(p_character);
 if form is null or form->'improvement'->>'kind' is distinct from 'stony' then
  return coalesce(p_resistances,'null'::jsonb);
 end if;
 resistance:=lower(form->'improvement'->>'resistance');
 if resistance is null or resistance not in('acid','bludgeoning','cold','fire','lightning','piercing','poison','slashing','thunder') then
  raise exception 'Review the active Stony resistance';
 end if;
 base:=coalesce(nullif(p_resistances,'null'::jsonb),'[]'::jsonb);
 if jsonb_typeof(base)<>'array' then raise exception 'Review character damage resistances';end if;
 if exists(select 1 from jsonb_array_elements(base) item where jsonb_typeof(item)<>'string') then
  raise exception 'Review character damage resistances';
 end if;
 if exists(select 1 from jsonb_array_elements_text(base) item where lower(btrim(item))=resistance) then return base;end if;
 return base||jsonb_build_array(resistance);
end;$$;
revoke all on function dndkeep_private.mutable_form_damage_resistances(uuid,jsonb) from public,anon,authenticated;

create or replace function dndkeep_private.party_damage_context(p_campaign_id uuid,p_character_id uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare c public.characters; ca public.campaigns; cp public.combat_participants; cb public.combatants;
 ids uuid[]; attrs jsonb; combat jsonb:=null; participant jsonb:=null; pools jsonb;
begin
 select * into c from public.characters where id=p_character_id and campaign_id=p_campaign_id;
 if not found then raise exception 'Character is unavailable';end if;
 select * into ca from public.campaigns where id=p_campaign_id;
 select array_agg(p.id order by p.id) into ids from public.combat_participants p
  join public.combat_encounters e on e.id=p.encounter_id and e.campaign_id=p_campaign_id and e.status='active'
  where p.campaign_id=p_campaign_id and p.participant_type='character' and p.entity_id=c.id::text;
 if cardinality(ids)>1 then raise exception 'This character has multiple active combat entries';end if;
 if cardinality(ids)=1 then
  select * into cp from public.combat_participants where id=ids[1];
  select * into cb from public.combatants where id=cp.combatant_id and campaign_id=p_campaign_id;
  if not found or cb.definition_type<>'character' or cb.definition_id is distinct from c.id::text then raise exception 'Combat character link is unavailable';end if;
  participant:=jsonb_build_object('id',cp.id,'encounter_id',cp.encounter_id,'combatant_id',cp.combatant_id);
  combat:=jsonb_build_object('id',cb.id,'current_hp',cb.current_hp,'max_hp',cb.max_hp,'temp_hp',coalesce(cb.temp_hp,0),
   'active_conditions',cb.active_conditions,'active_buffs',coalesce(cb.active_buffs,'[]'::jsonb),'exhaustion_level',coalesce(cb.exhaustion_level,0),'death_save_successes',cb.death_save_successes,'death_save_failures',cb.death_save_failures,
   'is_stable',cb.is_stable,'is_dead',cb.is_dead);
 end if;
 select jsonb_object_agg(key,value) into attrs from jsonb_each(to_jsonb(c)) where key=any(array[
  'id','name','species','species_choices','class_name','subclass','level','secondary_class','secondary_level',
  'current_hp','max_hp','temp_hp','hit_point_revision','strength','dexterity','constitution','intelligence','wisdom','charisma','inventory',
  'damage_resistances','damage_vulnerabilities','damage_immunities','active_conditions','is_stable','death_saves_successes','death_saves_failures',
  'active_buffs','exhaustion_level','concentration_spell','concentration_revision','saving_throw_proficiencies','gained_feats','nat_1_20_saves',
  'automation_overrides','advanced_automations_unlocked']);
 attrs:=jsonb_set(attrs,'{damage_resistances}',dndkeep_private.mutable_form_damage_resistances(c.id,attrs->'damage_resistances'));
 pools:=jsonb_build_object('current_hp',case when combat is null then c.current_hp else cb.current_hp end,
  'max_hp',case when combat is null then c.max_hp else cb.max_hp end,'temp_hp',coalesce(case when combat is null then c.temp_hp else cb.temp_hp end,0));
 return jsonb_build_object('character',attrs,'campaign',jsonb_build_object('id',ca.id,'automation_defaults',ca.automation_defaults),
  'participant',participant,'combatant',combat,'pools',pools);
end; $$;

create or replace function dndkeep_private.pending_damage_participant_context(
 p_participant_id uuid,p_campaign_id uuid,p_encounter_id uuid
) returns jsonb language plpgsql stable set search_path='' as $$
declare cp public.combat_participants; cb public.combatants; definition jsonb; kind text;
begin
 if p_participant_id is null then return null;end if;
 select * into cp from public.combat_participants where id=p_participant_id and campaign_id=p_campaign_id
  and encounter_id is not distinct from p_encounter_id;
 if not found then raise exception 'Damage participant roster changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=p_campaign_id;
 if not found then raise exception 'Damage participant combatant is unavailable';end if;
 if cb.definition_id is distinct from cp.entity_id then raise exception 'Damage participant definition changed';end if;
 kind:=cb.definition_type;
 if cp.participant_type='character' then
  if kind<>'character' then raise exception 'Damage participant definition changed';end if;
  select to_jsonb(c) into definition from public.characters c where c.id::text=cp.entity_id and c.campaign_id=p_campaign_id;
  if not found then raise exception 'Damage character is unavailable';end if;
  -- Select only fields required to verify damage, defenses, concentration and
  -- Psion eligibility. Private biography and sheet notes are not part of a hit.
  select jsonb_object_agg(key,value) into definition from jsonb_each(definition) where key=any(array[
   'id','user_id','campaign_id','name','species','species_choices','class_name','level','secondary_class','secondary_level',
   'strength','dexterity','constitution','intelligence','wisdom','charisma','inventory','saving_throw_proficiencies',
   'active_buffs','class_resources','feature_uses','gained_feats','weapon_masteries','damage_resistances','damage_immunities','damage_vulnerabilities',
   'is_stable','current_hp','max_hp','temp_hp','concentration_spell','concentration_revision','automation_overrides','advanced_automations_unlocked','nat_1_20_saves','hit_point_revision']);
  definition:=jsonb_set(definition,'{damage_resistances}',dndkeep_private.mutable_form_damage_resistances((definition->>'id')::uuid,definition->'damage_resistances'));
 elsif kind in('homebrew_monster','narrative_npc','roster_npc') then
  select jsonb_build_object('id',m.id,'name',m.name,'damage_resistances',m.damage_resistances,
   'damage_immunities',m.damage_immunities,'damage_vulnerabilities',m.damage_vulnerabilities)
   into definition from public.homebrew_monsters m where m.id::text=cp.entity_id and
    (m.campaign_id=p_campaign_id or m.campaign_id is null and (m.owner_id=cb.owner_id or m.user_id=cb.owner_id));
  if not found then raise exception 'Damage creature is unavailable';end if;
 elsif kind='srd_monster' then
  select jsonb_build_object('id',m.id,'name',m.name,'damage_resistances',coalesce(m.damage_resistances,array[]::text[]),
   'damage_immunities',coalesce(m.damage_immunities,array[]::text[]),'damage_vulnerabilities',coalesce(m.damage_vulnerabilities,array[]::text[]))
   into definition from public.monsters m where m.id=cp.entity_id and m.owner_id is null;
  if not found then raise exception 'Damage catalog creature is unavailable';end if;
 elsif kind='custom' then
  -- No name-based catalog fallback. Unknown custom defenses remain unknown.
  definition:=jsonb_build_object('damage_resistances',cb.stat_block_snapshot->'damage_resistances',
   'damage_immunities',cb.stat_block_snapshot->'damage_immunities','damage_vulnerabilities',cb.stat_block_snapshot->'damage_vulnerabilities');
 else raise exception 'Unsupported damage participant definition';end if;
 return jsonb_build_object('participant',jsonb_build_object('id',cp.id,'entity_id',cp.entity_id,'participant_type',cp.participant_type,
  'combatant_id',cp.combatant_id,'campaign_id',cp.campaign_id,'encounter_id',cp.encounter_id),
  'combatant',to_jsonb(cb)-'stat_block_snapshot','definitionType',kind,'definition',definition);
end;$$;
revoke all on function dndkeep_private.party_damage_context(uuid,uuid) from public,anon,authenticated;
revoke all on function dndkeep_private.pending_damage_participant_context(uuid,uuid,uuid) from public,anon,authenticated;
