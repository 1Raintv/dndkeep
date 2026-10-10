-- v2.869: first-roll AC must include current Mutable Form protection. This
-- trigger covers old/new RPCs and direct writes; later reaction changes retain
-- immutable original evidence and must not be revalidated as a fresh roll.
create or replace function dndkeep_private.guard_mutable_form_attack_ac()
returns trigger language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants; cb public.combatants; form jsonb; bonus integer:=0; buffs numeric:=0; expected numeric;
begin
 if old.attack_roll_snapshot is not null or new.attack_roll_snapshot is null or old.state<>'declared' then return new;end if;
 if new.target_participant_id is null then return new;end if;
 select * into cp from public.combat_participants where id=new.target_participant_id and campaign_id=new.campaign_id and encounter_id is not distinct from new.encounter_id;
 if not found then raise exception 'Target roster changed before recording the attack';end if;
 if cp.participant_type<>'character' then return new;end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=new.campaign_id and definition_type='character' and definition_id=cp.entity_id;
 if not found then raise exception 'Target character combatant is unavailable';end if;
 form:=dndkeep_private.get_mutable_form_active(cp.entity_id::uuid);
 if form is not null then
  bonus:=case when (form->>'fleshWeaver')::boolean then 2 else 0 end
   +case when form->'improvement'->>'kind'='flexibility' then 1 else 0 end;
 end if;
 if jsonb_typeof(coalesce(cb.active_buffs,'[]'::jsonb))<>'array' then raise exception 'Review target defense effects';end if;
 select coalesce(sum((b->>'acBonus')::numeric),0) into buffs from jsonb_array_elements(coalesce(cb.active_buffs,'[]'::jsonb)) b where jsonb_typeof(b->'acBonus')='number';
 expected:=coalesce(old.target_ac,10)+case new.cover_level when 'half' then 2 when 'three_quarters' then 5 else 0 end+buffs+bonus;
 if new.target_ac::numeric is distinct from expected then raise exception 'Target defenses changed; refresh before resolving this attack';end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_mutable_form_attack_ac() from public,anon,authenticated;
drop trigger if exists guard_mutable_form_attack_ac on public.pending_attacks;
create trigger guard_mutable_form_attack_ac before update of attack_roll_snapshot on public.pending_attacks for each row execute function dndkeep_private.guard_mutable_form_attack_ac();
