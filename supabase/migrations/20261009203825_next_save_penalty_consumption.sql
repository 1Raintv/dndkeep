-- Private transaction component; authorized save RPCs must call this within
-- the transaction that stores the actual save result. No standalone spend API.
alter table dndkeep_private.mind_sliver_effects add column if not exists consumed_by uuid;
alter table dndkeep_private.mind_sliver_effects add column if not exists consumed_kind text;
create table if not exists dndkeep_private.next_save_penalty_receipts(
 save_kind text not null,save_id uuid not null,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 request jsonb not null,result jsonb not null,
 primary key(save_kind,save_id)
);
alter table dndkeep_private.next_save_penalty_receipts enable row level security;
revoke all on dndkeep_private.next_save_penalty_receipts from public,anon,authenticated;
create or replace function dndkeep_private.consume_next_save_penalty(
 p_kind text,p_save uuid,p_encounter uuid,p_target uuid,p_d4 integer,p_auto_fail boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare payload jsonb; prior dndkeep_private.next_save_penalty_receipts; effect dndkeep_private.mind_sliver_effects;
 context jsonb; consumed uuid[]:='{}'; expired uuid[]:='{}'; receipt jsonb; penalty integer:=0;
begin
 if p_kind is null or p_kind not in('attack','concentration','feature','sheet','death') or p_save is null or p_encounter is null or p_target is null
  or p_auto_fail is null or (p_auto_fail and p_d4 is not null) or (not p_auto_fail and (p_d4 is null or p_d4 not between 1 and 4))
 then raise exception 'Invalid next-save penalty request';end if;
 payload:=jsonb_build_object('encounterId',p_encounter,'targetId',p_target,'proposedDie',p_d4,'autoFail',p_auto_fail);
 select * into prior from dndkeep_private.next_save_penalty_receipts where save_kind=p_kind and save_id=p_save;
 if found then
  if prior.request<>payload then raise exception 'Saved penalty request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 perform 1 from public.combat_encounters where id=p_encounter and status='active' for share;
 if not found then raise exception 'Active encounter is unavailable for this save';end if;
 -- All save kinds serialize on one participant. Effect activation takes this
 -- same lock, so it is ordered before or after the save, never lost between.
 perform 1 from public.combat_participants where id=p_target and encounter_id=p_encounter for update;
 if not found then raise exception 'Saving creature is unavailable';end if;
 select * into prior from dndkeep_private.next_save_penalty_receipts where save_kind=p_kind and save_id=p_save;
 if found then
  if prior.request<>payload then raise exception 'Saved penalty request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 for effect in select * from dndkeep_private.mind_sliver_effects where encounter_id=p_encounter and target_id=p_target
  and status='active' and consumed_by is null order by cast_id for update loop
  if p_kind='attack' and effect.cast_id=p_save then raise exception 'A spell cannot penalize its own original save';end if;
  context:=dndkeep_private.next_save_turn_context(p_encounter,effect.caster_id,effect.cast_turn);
  if (context->>'lastEndedTurnOrdinal')::bigint>=effect.cast_turn_ordinal+1 then
   update dndkeep_private.mind_sliver_effects set status='expired' where cast_id=effect.cast_id;
   expired:=array_append(expired,effect.cast_id);
  else
   update dndkeep_private.mind_sliver_effects set consumed_by=p_save,consumed_kind=p_kind where cast_id=effect.cast_id;
   consumed:=array_append(consumed,effect.cast_id);
  end if;
 end loop;
 -- Overlapping copies share the same next-save trigger; only one d4 applies.
 -- An automatic failure still consumes the trigger, without inventing a roll.
 if cardinality(consumed)>0 and not p_auto_fail then penalty:=p_d4;end if;
 receipt:=jsonb_build_object('saveId',p_save,'saveKind',p_kind,'penalty',penalty,
  'die',case when penalty>0 then p_d4 else null end,'consumedIds',to_jsonb(consumed),'expiredIds',to_jsonb(expired),'replayed',false);
 insert into dndkeep_private.next_save_penalty_receipts(save_kind,save_id,encounter_id,request,result)
 values(p_kind,p_save,p_encounter,payload,receipt);
 return receipt;
end;$$;
revoke all on function dndkeep_private.consume_next_save_penalty(text,uuid,uuid,uuid,integer,boolean) from public,anon,authenticated;
create or replace function dndkeep_private.finalize_mind_sliver_effect()
returns trigger language plpgsql security definer set search_path='' as $$
declare origin dndkeep_private.mind_sliver_effects; context jsonb; outcome text;
begin
 select * into origin from dndkeep_private.mind_sliver_effects where cast_id=new.id;
 if not found or origin.status<>'waiting' then return new;end if;
 if not exists(select 1 from dndkeep_private.declared_spell_payments payment where payment.cast_id=new.id
  and payment.outcome in('went_off','saved_through') and payment.attack_receipt->>'attackId'=new.id::text) then
  raise exception 'Mind Sliver delivery has not been verified';end if;
 if new.encounter_id is distinct from origin.encounter_id or new.attacker_participant_id is distinct from origin.caster_id
  or new.target_participant_id is distinct from origin.target_id or new.attack_kind is distinct from 'save'
  or new.attack_source is distinct from 'spell' or new.save_ability is distinct from 'INT' then raise exception 'Mind Sliver target or saving throw changed';end if;
 if new.state='canceled' then outcome:='canceled';
 elsif coalesce(new.pending_lr_decision,false) or new.save_result is null then return new;
 elsif new.save_result='passed' then outcome:='resisted';
 elsif new.save_result='failed' then
  context:=dndkeep_private.next_save_turn_context(origin.encounter_id,origin.caster_id,origin.cast_turn);
  outcome:=case when (context->>'lastEndedTurnOrdinal')::bigint>=origin.cast_turn_ordinal+1 then 'expired' else 'active' end;
 else raise exception 'Mind Sliver save result is unavailable';end if;
 if outcome='active' then
  perform 1 from public.combat_participants where id=origin.target_id and encounter_id=origin.encounter_id for update;
  if not found then raise exception 'Mind Sliver target is unavailable';end if;
 end if;
 update dndkeep_private.mind_sliver_effects set status=outcome where cast_id=new.id and status='waiting';
 return new;
end;$$;
revoke all on function dndkeep_private.finalize_mind_sliver_effect() from public,anon,authenticated;
drop trigger if exists finalize_mind_sliver_effect on public.pending_attacks;
create trigger finalize_mind_sliver_effect after update on public.pending_attacks
 for each row execute function dndkeep_private.finalize_mind_sliver_effect();

