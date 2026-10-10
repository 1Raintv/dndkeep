-- Saved Mind Sliver origins. Deliberately independent of short-lived pending
-- casts/attacks: pruning their history must not erase an unconsumed effect.
create table if not exists dndkeep_private.mind_sliver_effects(
 cast_id uuid primary key,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 caster_id uuid not null,target_id uuid not null,
 cast_turn uuid not null,cast_turn_ordinal bigint not null check(cast_turn_ordinal>=1),
 status text not null default 'waiting' check(status in('waiting','active','resisted','countered','expired','canceled')),
 created_at timestamptz not null default now()
);
create index if not exists mind_sliver_effect_target_idx on dndkeep_private.mind_sliver_effects(encounter_id,target_id) where status='active';
alter table dndkeep_private.mind_sliver_effects enable row level security;
revoke all on dndkeep_private.mind_sliver_effects from public,anon,authenticated;
create or replace function dndkeep_private.capture_mind_sliver_origin()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.pending_spell_casts; context jsonb; intent jsonb;
begin
 if new.request->>'spellId' is distinct from 'mind-sliver' then return new;end if;
 if tg_op='UPDATE' then
  if new.outcome='countered' then update dndkeep_private.mind_sliver_effects set status='countered' where cast_id=new.cast_id and status='waiting';end if;
  return new;
 end if;
 intent:=new.request->'context'->'combat';
 -- Non-combat effects still require a separate explicit turn boundary.
 if intent is null then return new;end if;
 if new.slot_level<>0 or new.request->'context'->>'spellLevel' is distinct from '0'
  or intent->>'kind' is distinct from 'save' or intent->>'saveAbility' is distinct from 'INT'
  or intent->>'saveSuccessEffect' is distinct from 'none' then raise exception 'Review Mind Sliver saving throw settings';end if;
 select * into s from public.pending_spell_casts where id=new.cast_id and caster_character_id=new.character_id;
 if not found then raise exception 'Mind Sliver casting is unavailable';end if;
 context:=dndkeep_private.next_save_turn_context(s.encounter_id,s.caster_participant_id);
 insert into dndkeep_private.mind_sliver_effects(cast_id,encounter_id,caster_id,target_id,cast_turn,cast_turn_ordinal)
 values(new.cast_id,s.encounter_id,s.caster_participant_id,(intent->'target'->>'participantId')::uuid,
  (context->>'turnId')::uuid,(context->>'castTurnOrdinal')::bigint);
 return new;
end;$$;
revoke all on function dndkeep_private.capture_mind_sliver_origin() from public,anon,authenticated;
drop trigger if exists capture_mind_sliver_origin on dndkeep_private.declared_spell_payments;
create trigger capture_mind_sliver_origin after insert or update on dndkeep_private.declared_spell_payments
 for each row execute function dndkeep_private.capture_mind_sliver_origin();

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
 update dndkeep_private.mind_sliver_effects set status=outcome where cast_id=new.id and status='waiting';
 return new;
end;$$;
revoke all on function dndkeep_private.finalize_mind_sliver_effect() from public,anon,authenticated;
drop trigger if exists finalize_mind_sliver_effect on public.pending_attacks;
create trigger finalize_mind_sliver_effect after update on public.pending_attacks
 for each row execute function dndkeep_private.finalize_mind_sliver_effect();
