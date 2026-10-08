-- Settlement groundwork: one consistent read of attack, roster, runtime pools,
-- current definitions and reactions. Not yet called by the HP application path.
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
   'class_resources','feature_uses','gained_feats','weapon_masteries','damage_resistances','damage_immunities','damage_vulnerabilities',
   'current_hp','max_hp','temp_hp','concentration_spell','concentration_revision','automation_overrides','advanced_automations_unlocked','nat_1_20_saves','hit_point_revision']);
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
revoke all on function dndkeep_private.pending_damage_participant_context(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.get_pending_damage_context(p_attack_id uuid)
returns jsonb language plpgsql security definer stable set search_path='' as $$
declare a public.pending_attacks; ca public.campaigns; encounter jsonb; reactions jsonb;
begin
 if auth.uid() is null then raise exception 'Damage settlement is available to the current DM only';end if;
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found then raise exception 'Damage attack is unavailable';end if;
 select * into ca from public.campaigns where id=a.campaign_id and owner_id=auth.uid();
 if not found then raise exception 'Damage settlement is available to the current DM only';end if;
 if a.encounter_id is not null then
  select to_jsonb(e) into encounter from public.combat_encounters e where e.id=a.encounter_id and e.campaign_id=a.campaign_id;
  if not found then raise exception 'Damage encounter changed';end if;
 end if;
 if exists(select 1 from public.pending_reactions r where r.pending_attack_id=a.id and (
  r.campaign_id is distinct from a.campaign_id or r.reactor_participant_id is not null and not exists(
   select 1 from public.combat_participants cp where cp.id=r.reactor_participant_id and cp.campaign_id=a.campaign_id
    and cp.encounter_id is not distinct from a.encounter_id))) then raise exception 'Damage reaction context changed';end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into reactions from public.pending_reactions r where r.pending_attack_id=a.id;
 return jsonb_build_object('attack',to_jsonb(a),'campaign',jsonb_build_object('id',ca.id,'automation_defaults',ca.automation_defaults),
  'encounter',encounter,'reactions',reactions,
  'attacker',dndkeep_private.pending_damage_participant_context(a.attacker_participant_id,a.campaign_id,a.encounter_id),
  'target',dndkeep_private.pending_damage_participant_context(a.target_participant_id,a.campaign_id,a.encounter_id));
end;$$;
revoke all on function dndkeep_private.get_pending_damage_context(uuid) from public,anon;
grant execute on function dndkeep_private.get_pending_damage_context(uuid) to authenticated;
create or replace function public.get_pending_damage_context(p_attack_id uuid)
returns jsonb language sql security invoker stable set search_path='' as $$ select dndkeep_private.get_pending_damage_context(p_attack_id); $$;
revoke all on function public.get_pending_damage_context(uuid) from public,anon;
grant execute on function public.get_pending_damage_context(uuid) to authenticated;
