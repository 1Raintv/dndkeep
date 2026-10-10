-- A slotted Misty Step opens its follow-up only when settlement confirms the
-- spell. Interrupted casts remain explicit rather than silently deciding an
-- unresolved UA timing interpretation. Free origins retain their existing path.
alter table dndkeep_private.teleporter_combat_windows drop constraint if exists teleporter_combat_windows_parent_id_fkey;
alter table dndkeep_private.teleporter_combat_windows add column if not exists parent_kind text not null default 'free' check(parent_kind in('free','slot'));
alter table dndkeep_private.teleporter_combat_windows add column if not exists status text not null default 'ready' check(status in('waiting','ready','interrupted','expired'));

create or replace function dndkeep_private.capture_slotted_teleporter_origin()
returns trigger language plpgsql security definer set search_path='' as $$
declare c public.characters; origin dndkeep_private.teleporter_combat_windows; psion_level integer; current_turn uuid;
begin
 if tg_op='INSERT' then
  if new.request->>'spellId' is distinct from 'misty-step' or new.slot_level<2
   or new.request->'context'->>'spellLevel' is distinct from '2' or new.casting_action is distinct from 'bonusAction' then return new;end if;
  select * into c from public.characters where id=new.character_id;
  psion_level:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
  if psion_level<6 or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Psi Warper' then return new;end if;
  insert into dndkeep_private.teleporter_combat_windows(parent_id,character_id,turn_id,action_sequence,psion_level,parent_kind,status)
  select new.cast_id,c.id,new.casting_turn_id::text,a.action_sequence,psion_level,'slot','waiting'
  from dndkeep_private.action_claims a where a.request_id=new.cast_id;
 elsif old.outcome is null and new.outcome is not null then
  select * into origin from dndkeep_private.teleporter_combat_windows where parent_id=new.cast_id and parent_kind='slot' for update;
  if not found then return new;end if;
  select e.psionic_turn_id into current_turn from public.pending_spell_casts s
   join public.combat_encounters e on e.id=s.encounter_id where s.id=new.cast_id and e.status='active';
  if current_turn::text is distinct from origin.turn_id or exists(
   select 1 from dndkeep_private.action_claims a where a.character_id=new.character_id
    and a.action_sequence>origin.action_sequence and a.request->>'kind' is distinct from 'reaction') then
   update dndkeep_private.teleporter_combat_windows set status='expired' where parent_id=new.cast_id;
  else
   -- Reactions taken while resolving the parent do not bank a later turn or
   -- consume the follow-up. After settlement, any new action closes the window.
   update dndkeep_private.teleporter_combat_windows set
    status=case when new.outcome='countered' then 'interrupted' else 'ready' end,
    action_sequence=(select max(a.action_sequence) from dndkeep_private.action_claims a where a.character_id=new.character_id)
   where parent_id=new.cast_id;
  end if;
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.capture_slotted_teleporter_origin() from public,anon,authenticated;
drop trigger if exists capture_slotted_teleporter_origin on dndkeep_private.declared_spell_payments;
create trigger capture_slotted_teleporter_origin after insert or update on dndkeep_private.declared_spell_payments
 for each row execute function dndkeep_private.capture_slotted_teleporter_origin();

create or replace function dndkeep_private.teleporter_combat_origin(p_character uuid,p_parent uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; origin dndkeep_private.teleporter_combat_windows; psion_level integer;
begin
 c:=public.psionic_character_for_update(p_character);
 context:=dndkeep_private.action_turn_context(c.id);
 select * into origin from dndkeep_private.teleporter_combat_windows
  where parent_id=p_parent and character_id=c.id;
 if not found or origin.status<>'ready' then return null;end if;
 psion_level:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if psion_level<6 or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Psi Warper'
  or context->>'turnId' is distinct from origin.turn_id or not (context->>'isOwnTurn')::boolean
  or exists(select 1 from dndkeep_private.action_claims a where a.character_id=c.id and a.action_sequence>origin.action_sequence)
  then return null;end if;
 return jsonb_build_object('parentId',origin.parent_id,'characterId',c.id,'turnId',origin.turn_id,'psionLevel',origin.psion_level);
end;$$;
revoke all on function dndkeep_private.teleporter_combat_origin(uuid,uuid) from public,anon,authenticated;

-- Owner/DM-scoped recovery read, so a reload does not lose the parent casting.
-- Availability is a hint only: the child transaction always revalidates it.
create or replace function dndkeep_private.read_teleporter_followup(p_character uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; origin dndkeep_private.teleporter_combat_windows;
begin
 c:=public.psionic_character_for_update(p_character);
 context:=dndkeep_private.action_turn_context(c.id);
 if public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level)<6
  or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Psi Warper'
  or not (context->>'isOwnTurn')::boolean then return null;end if;
 select w.* into origin from dndkeep_private.teleporter_combat_windows w
 where w.character_id=c.id and w.turn_id=context->>'turnId' and w.status<>'expired'
  and not exists(select 1 from dndkeep_private.teleporter_combat_children ch where ch.parent_id=w.parent_id)
 order by w.action_sequence desc limit 1;
 if not found then return null;end if;
 if exists(select 1 from dndkeep_private.action_claims a where a.character_id=c.id and a.action_sequence>origin.action_sequence
  and (origin.status<>'waiting' or a.request->>'kind' is distinct from 'reaction')) then return null;end if;
 return jsonb_build_object('parentId',origin.parent_id,'characterId',c.id,'turnId',origin.turn_id,
  'psionLevel',origin.psion_level,'kind',origin.parent_kind,'status',origin.status,'encounterId',context->'encounterId');
end;$$;
revoke all on function dndkeep_private.read_teleporter_followup(uuid) from public,anon;
grant execute on function dndkeep_private.read_teleporter_followup(uuid) to authenticated;
create or replace function public.get_teleporter_combat_followup(p_character uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.read_teleporter_followup(p_character);
$$;
revoke all on function public.get_teleporter_combat_followup(uuid) from public,anon;
grant execute on function public.get_teleporter_combat_followup(uuid) to authenticated;
