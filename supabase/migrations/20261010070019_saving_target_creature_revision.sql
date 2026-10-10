-- v2.869: all linked creature save sources invalidate stale proposals.
-- Only the revision is exposed, never the source stat block or private notes.
create or replace function dndkeep_private.saving_target_context(p_campaign uuid,p_encounter uuid,p_target uuid,p_ability text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cp public.combat_participants; cb public.combatants; c public.characters;
 save_inputs jsonb:='null';target jsonb:='null'; conditions text[]:='{}'; buffs jsonb:='[]'; exhaustion integer:=0;
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
   save_inputs:=jsonb_build_object('inventory',c.inventory,'level',c.level,'secondaryClass',c.secondary_class,'secondaryLevel',c.secondary_level,
    'strength',c.strength,'dexterity',c.dexterity,'constitution',c.constitution,'intelligence',c.intelligence,'wisdom',c.wisdom,'charisma',c.charisma,'proficiencies',c.saving_throw_proficiencies);
   natural_extremes:=c.nat_1_20_saves is distinct from false;
   guards:=p_ability='INT' and dndkeep_private.psionic_guards_effect(c.id) is not null;
  elsif cp.participant_type in('creature','monster','npc') then
   if cb.definition_type in('homebrew_monster','narrative_npc','roster_npc') then
    select to_jsonb(m) into save_inputs from public.homebrew_monsters m where m.id::text=cp.entity_id
     and (m.campaign_id=p_campaign or m.campaign_id is null and (m.owner_id=cb.owner_id or m.user_id=cb.owner_id));
    if not found then raise exception 'Saving creature is unavailable';end if;
   elsif cb.definition_type='srd_monster' then
    select to_jsonb(m) into save_inputs from public.monsters m where m.id=cp.entity_id and m.owner_id is null;
    if not found then raise exception 'Saving catalog creature is unavailable';end if;
   elsif cb.definition_type='custom' then
    save_inputs:=cb.stat_block_snapshot;
    if jsonb_typeof(save_inputs) is distinct from 'object' then raise exception 'Review custom saving throw data';end if;
   else raise exception 'Unsupported saving creature definition';end if;
   -- Include every input used by creatureSaveBonus, while unrelated descriptive
   -- edits need not invalidate a saved roll. Source identity is part of the hash.
   select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into save_inputs from jsonb_each(save_inputs)
    where key=any(array['str','dex','con','int','wis','cha','ability_scores','save_proficiencies','saving_throws','cr']);
   save_inputs:=jsonb_build_object('kind',cb.definition_type,'definitionId',cb.definition_id,'stats',save_inputs);
  else raise exception 'Unsupported saving target';end if;
  target:=jsonb_build_object('id',cp.id,'entityId',cp.entity_id,'type',cp.participant_type,'combatantId',cp.combatant_id);
 end if;
 automatic:=coalesce(p_ability in('STR','DEX') and conditions&&array['Paralyzed','Petrified','Stunned','Unconscious'],false);
 disadvantage:=not automatic and (coalesce(p_ability='DEX' and 'Restrained'=any(conditions),false)
  or coalesce(p_ability in('STR','DEX','CON') and conditions&&array['Encumbered','HeavilyEncumbered'],false));
 return jsonb_build_object('bonusRevision',pg_catalog.md5(coalesce(save_inputs,'null'::jsonb)::text),'target',target,'conditions',to_jsonb(conditions),'buffs',buffs,'exhaustion',exhaustion,'naturalExtremes',natural_extremes,
  'autoFail',automatic,'advantage',not automatic and guards,'disadvantage',disadvantage);
end;$$;
revoke all on function dndkeep_private.saving_target_context(uuid,uuid,uuid,text) from public,anon,authenticated;
