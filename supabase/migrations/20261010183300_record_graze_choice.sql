-- v2.869: explicit new-client opt-in avoids adopting legacy Graze HP writes.
alter table public.pending_attacks add column if not exists graze_resolution_version integer
 check (graze_resolution_version is null or graze_resolution_version=1);
create or replace function dndkeep_private.guard_graze_resolution_version()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.graze_resolution_version is distinct from old.graze_resolution_version then
  raise exception 'Graze resolution version cannot be changed after declaration';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_graze_resolution_version() from public,anon,authenticated;
drop trigger if exists guard_graze_resolution_version on public.pending_attacks;
create trigger guard_graze_resolution_version before update on public.pending_attacks
 for each row execute function dndkeep_private.guard_graze_resolution_version();

create or replace function dndkeep_private.record_graze_damage(p_attack_id uuid,p_expected jsonb,p_use_graze boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; cp public.combat_participants; cb public.combatants;
 prior dndkeep_private.damage_roll_records; mastery text; amount integer; components jsonb; damage_type text;
begin
 select * into a from public.pending_attacks where id=p_attack_id for update;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then
  raise exception 'Graze damage recording is available to the current DM only';end if;
 if p_use_graze is null then raise exception 'Choose whether to use Graze';end if;
 select * into prior from dndkeep_private.damage_roll_records where attack_id=a.id;
 if found then
  if prior.request->>'kind' is distinct from 'graze' or prior.request->'useGraze' is distinct from to_jsonb(p_use_graze) then
   raise exception 'The saved damage choice cannot be replaced';end if;
  return jsonb_build_object('attack',to_jsonb(a),'replayed',true);
 end if;
 if a.graze_resolution_version is distinct from 1 then raise exception 'Review legacy Graze damage before continuing';end if;
 if p_expected is distinct from to_jsonb(a) then raise exception 'Attack changed; refresh the Graze choice';end if;
 if a.state<>'attack_rolled' or a.attack_kind<>'attack_roll' or a.hit_result is null or a.hit_result not in('miss','fumble')
  or a.attack_source is distinct from 'weapon' or a.attacker_type<>'character' or a.cover_level='total' then
  raise exception 'Graze requires a final missed weapon attack against a creature';end if;
 if not exists(select 1 from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id and status='active') then
  raise exception 'Graze encounter is no longer active';end if;
 if not exists(select 1 from public.combat_participants where id=a.target_participant_id and campaign_id=a.campaign_id
  and encounter_id=a.encounter_id and participant_type in('character','creature')) then raise exception 'Graze requires a current creature target';end if;
 select * into cp from public.combat_participants where id=a.attacker_participant_id and campaign_id=a.campaign_id and encounter_id=a.encounter_id;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=a.campaign_id;
 mastery:=case when a.attack_name ~* '^greatsword($|[ +\(])' then 'Greatsword' when a.attack_name ~* '^glaive($|[ +\(])' then 'Glaive' else null end;
 if mastery is null or cp.participant_type is distinct from 'character' or cb.definition_type is distinct from 'character'
  or cp.entity_id is distinct from cb.definition_id or not exists(select 1 from public.characters c where c.id::text=cp.entity_id
   and c.campaign_id=a.campaign_id and mastery=any(c.weapon_masteries)) then raise exception 'Review Graze weapon mastery';end if;
 if a.attack_ability_modifier is null then raise exception 'Review the ability modifier used for this attack';end if;
 damage_type:=lower(trim(a.damage_type));
 if damage_type is null or damage_type not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder') then
  raise exception 'Review the weapon damage type';end if;
 amount:=case when p_use_graze then greatest(0,a.attack_ability_modifier) else 0 end;
 components:=jsonb_build_object('version',1,'components',case when p_use_graze then jsonb_build_array(jsonb_build_object(
  'key','base','source','base','label','Graze','damageType',damage_type,'expression',amount::text,'rolls','[]'::jsonb,
  'dieKinds','[]'::jsonb,'modifier',amount,'rawTotal',amount)) else '[]'::jsonb end);
 -- The shared reaction barrier checks the saved post-attack window and pending
 -- choices before this update. Failure rolls back both damage and receipt.
 update public.pending_attacks set damage_rolls=array[]::integer[],damage_raw=amount,damage_final=amount,
  damage_components=components,state='damage_rolled' where id=a.id returning * into a;
 insert into dndkeep_private.damage_roll_records(attack_id,request) values(a.id,jsonb_build_object(
  'kind','graze','useGraze',p_use_graze,'abilityModifier',a.attack_ability_modifier,'components',components,'consumedKeys','[]'::jsonb));
 return jsonb_build_object('attack',to_jsonb(a),'replayed',false);
end;$$;
revoke all on function dndkeep_private.record_graze_damage(uuid,jsonb,boolean) from public,anon;
grant execute on function dndkeep_private.record_graze_damage(uuid,jsonb,boolean) to authenticated;
create or replace function public.record_graze_damage(p_attack_id uuid,p_expected jsonb,p_use_graze boolean)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.record_graze_damage(p_attack_id,p_expected,p_use_graze);$$;
revoke all on function public.record_graze_damage(uuid,jsonb,boolean) from public,anon;
grant execute on function public.record_graze_damage(uuid,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
