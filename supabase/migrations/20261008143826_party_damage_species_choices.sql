-- v2.848: capture Fiendish Legacy so previews use the saved choice and changes
-- between preview and application invalidate the existing snapshot.
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
  'damage_resistances','damage_vulnerabilities','damage_immunities','active_conditions','death_saves_successes','death_saves_failures',
  'concentration_spell','concentration_revision','saving_throw_proficiencies','gained_feats','nat_1_20_saves',
  'automation_overrides','advanced_automations_unlocked']);
 pools:=jsonb_build_object('current_hp',case when combat is null then c.current_hp else cb.current_hp end,
  'max_hp',case when combat is null then c.max_hp else cb.max_hp end,'temp_hp',coalesce(case when combat is null then c.temp_hp else cb.temp_hp end,0));
 return jsonb_build_object('character',attrs,'campaign',jsonb_build_object('id',ca.id,'automation_defaults',ca.automation_defaults),
  'participant',participant,'combatant',combat,'pools',pools);
end; $$;
revoke all on function dndkeep_private.party_damage_context(uuid,uuid) from public,anon,authenticated;
