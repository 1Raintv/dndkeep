-- v2.863: immutable action context belongs to the verified casting payment,
-- including cantrips. Legacy receipts stay unknown rather than guessing a turn.
alter table dndkeep_private.declared_spell_payments add column if not exists casting_turn_id uuid;
alter table dndkeep_private.declared_spell_payments add column if not exists casting_action text
 check(casting_action in('action','bonusAction','reaction'));
create or replace function dndkeep_private.capture_declared_spell_action()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  new.casting_turn_id:=old.casting_turn_id;new.casting_action:=old.casting_action;return new;
 end if;
 select e.psionic_turn_id into new.casting_turn_id from public.pending_spell_casts c
 join public.combat_encounters e on e.id=c.encounter_id where c.id=new.cast_id and e.status='active';
 if new.casting_turn_id is null then raise exception 'Encounter is no longer active';end if;
 new.casting_action:=new.request->'context'->>'actionKind';
 if new.casting_action is not null and (new.casting_action not in('action','bonusAction','reaction')
  or (new.request->'context'->>'isBonusAction')::boolean is distinct from (new.casting_action='bonusAction'))
  then raise exception 'Casting action context is invalid';end if;
 return new;
end;$$;
revoke all on function dndkeep_private.capture_declared_spell_action() from public,anon,authenticated;
drop trigger if exists capture_declared_spell_action on dndkeep_private.declared_spell_payments;
create trigger capture_declared_spell_action before insert or update on dndkeep_private.declared_spell_payments
 for each row execute function dndkeep_private.capture_declared_spell_action();

create or replace function dndkeep_private.declared_spell_action_context(p_cast_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payment dndkeep_private.declared_spell_payments; cast_row public.pending_spell_casts; current_turn uuid;
begin
 select c.* into cast_row from public.pending_spell_casts c join public.characters ch on ch.id=c.caster_character_id
 where c.id=p_cast_id and (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid()));
 if not found then raise exception 'Casting context is unavailable';end if;
 select * into payment from dndkeep_private.declared_spell_payments where cast_id=p_cast_id;
 if not found then return null;end if;
 if payment.character_id is distinct from cast_row.caster_character_id then raise exception 'Casting identity changed';end if;
 if payment.casting_turn_id is null or payment.casting_action is null then return null;end if;
 select e.psionic_turn_id into current_turn from public.combat_encounters e where e.id=cast_row.encounter_id and e.status='active';
 return jsonb_build_object('encounterId',cast_row.encounter_id,'turnId',payment.casting_turn_id,'kind',payment.casting_action,'currentTurnId',current_turn);
end;$$;
revoke all on function dndkeep_private.declared_spell_action_context(uuid) from public,anon;
grant execute on function dndkeep_private.declared_spell_action_context(uuid) to authenticated;
create or replace function public.declare_spell_cast_atomic(p_cast_id uuid,p_character_id uuid,p_participant_id uuid,p_spell_id text,p_spell_name text,p_slot integer,p_expected_slot jsonb,p_context jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt jsonb;
begin
 receipt:=dndkeep_private.declare_paid_spell(p_cast_id,p_character_id,p_participant_id,p_spell_id,p_spell_name,p_slot,p_expected_slot,p_context);
 return receipt||jsonb_build_object('actionContext',dndkeep_private.declared_spell_action_context(p_cast_id));
end;$$;
revoke all on function public.declare_spell_cast_atomic(uuid,uuid,uuid,text,text,integer,jsonb,jsonb) from public,anon;
grant execute on function public.declare_spell_cast_atomic(uuid,uuid,uuid,text,text,integer,jsonb,jsonb) to authenticated;

create or replace function dndkeep_private.record_spell_turn_slot_spend()
returns trigger language plpgsql security invoker set search_path='' as $$
declare kind text; request_id uuid; encounter_id uuid; current_turn uuid;
begin
 if tg_table_name='declared_spell_payments' then
  if tg_op='UPDATE' then
   -- Counterspell says the interrupted slot is not expended. Releasing this
   -- historical turn never clears a newer turn's spell or another request.
   if new.outcome='countered' then
    update dndkeep_private.spell_turn_slot_spends s set released=true
     where s.request_kind='declaration' and s.request_id=new.cast_id;
   end if;
   return new;
  end if;
  if new.slot_level=0 then return new;end if;
  kind:='declaration';request_id:=new.cast_id;
  select p.encounter_id into encounter_id from public.pending_spell_casts p where p.id=new.cast_id and p.caster_character_id=new.character_id;
 elsif tg_table_name='counterspell_acceptances' then
  kind:='counterspell';request_id:=new.offer_id;
  select cp.encounter_id into encounter_id from public.pending_reactions r join public.combat_participants cp on cp.id=r.reactor_participant_id
   where r.id=new.offer_id and cp.entity_id=new.character_id::text and cp.participant_type='character';
 else raise exception 'Unsupported spell payment record';end if;
 perform 1 from public.characters c where c.id=new.character_id for update;
 if kind='declaration' then current_turn:=new.casting_turn_id;
 else select e.psionic_turn_id into current_turn from public.combat_encounters e where e.id=encounter_id and e.status='active';end if;
 if current_turn is null then raise exception 'Encounter is no longer active';end if;
 if exists(select 1 from dndkeep_private.spell_turn_slot_spends s where s.character_id=new.character_id and s.turn_id=current_turn and not s.released)
  then raise exception 'Only one spell slot can be expended to cast a spell on the current turn';end if;
 insert into dndkeep_private.spell_turn_slot_spends(request_kind,request_id,character_id,encounter_id,turn_id)
 values(kind,request_id,new.character_id,encounter_id,current_turn);
 return new;
end;$$;
revoke all on function dndkeep_private.record_spell_turn_slot_spend() from public,anon,authenticated;
