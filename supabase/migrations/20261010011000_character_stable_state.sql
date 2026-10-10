-- v2.869 audit: stable is a life state, not three retained successes.
alter table public.characters add column if not exists is_stable boolean not null default false;
update public.characters set is_stable=true,death_saves_successes=0,death_saves_failures=0
 where current_hp=0 and death_saves_successes=3 and death_saves_failures<3;

create or replace function public.normalize_character_death_state()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.current_hp>0 then
  new.is_stable:=false;new.death_saves_successes:=0;new.death_saves_failures:=0;
 elsif new.death_saves_failures>=3 then new.is_stable:=false;
 else
  if TG_OP='UPDATE' and old.is_stable and (
    new.death_saves_failures>old.death_saves_failures or coalesce(new.temp_hp,0)<coalesce(old.temp_hp,0)
    or new.last_campaign_damage_id is distinct from old.last_campaign_damage_id and new.last_campaign_damage_id is not null
  ) then new.is_stable:=false;end if;
  -- Old clients still mark the third success; convert at the persistence boundary.
  if new.death_saves_successes>=3 then new.is_stable:=true;end if;
  if new.is_stable then new.death_saves_successes:=0;new.death_saves_failures:=0;end if;
 end if;
 return new;
end;$$;
revoke all on function public.normalize_character_death_state() from public,anon,authenticated;
drop trigger if exists normalize_character_death_state on public.characters;
create trigger normalize_character_death_state before insert or update on public.characters
 for each row execute function public.normalize_character_death_state();

-- New combat instances must inherit dying/stable state from their character.
create or replace function public.seed_combatant_death_state()
returns trigger language plpgsql set search_path='' as $$
declare c public.characters;
begin
 if new.definition_type='character' then
  select * into c from public.characters where id::text=new.definition_id;
  if found then
   new.death_save_successes:=c.death_saves_successes;new.death_save_failures:=c.death_saves_failures;
   new.is_stable:=c.is_stable and new.current_hp=0;
   new.is_dead:=c.death_saves_failures>=3 and new.current_hp=0;
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.seed_combatant_death_state() from public,anon,authenticated;
drop trigger if exists seed_combatant_death_state on public.combatants;
create trigger seed_combatant_death_state before insert on public.combatants
 for each row execute function public.seed_combatant_death_state();

-- Stable changes invalidate previously reviewed damage previews.
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
   'active_conditions',cb.active_conditions,'death_save_successes',cb.death_save_successes,'death_save_failures',cb.death_save_failures,
   'is_stable',cb.is_stable,'is_dead',cb.is_dead);
 end if;
 select jsonb_object_agg(key,value) into attrs from jsonb_each(to_jsonb(c)) where key=any(array[
  'id','name','species','species_choices','class_name','subclass','level','secondary_class','secondary_level',
  'current_hp','max_hp','temp_hp','hit_point_revision','strength','dexterity','constitution','intelligence','wisdom','charisma','inventory',
  'damage_resistances','damage_vulnerabilities','damage_immunities','active_conditions','is_stable','death_saves_successes','death_saves_failures',
  'concentration_spell','concentration_revision','saving_throw_proficiencies','gained_feats','nat_1_20_saves',
  'automation_overrides','advanced_automations_unlocked']);
 pools:=jsonb_build_object('current_hp',case when combat is null then c.current_hp else cb.current_hp end,
  'max_hp',case when combat is null then c.max_hp else cb.max_hp end,'temp_hp',coalesce(case when combat is null then c.temp_hp else cb.temp_hp end,0));
 return jsonb_build_object('character',attrs,'campaign',jsonb_build_object('id',ca.id,'automation_defaults',ca.automation_defaults),
  'participant',participant,'combatant',combat,'pools',pools);
end; $$;
revoke all on function dndkeep_private.party_damage_context(uuid,uuid) from public,anon,authenticated;

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
