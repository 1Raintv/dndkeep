-- v2.862 / SRD 5.2.1 p.105: one slot expended to cast per current turn.
-- Receipts are the payment boundary: trigger failure rolls back the whole RPC.
-- No FK to mutable public casts/offers: deleting one must not erase its cost.
create table if not exists dndkeep_private.spell_turn_slot_spends (
 request_kind text not null check(request_kind in ('declaration','counterspell')),
 request_id uuid not null,
 character_id uuid not null references public.characters(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null,
 released boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(request_kind,request_id)
);
alter table dndkeep_private.spell_turn_slot_spends enable row level security;
revoke all on dndkeep_private.spell_turn_slot_spends from public,anon,authenticated;
create unique index if not exists spell_turn_slot_one_per_turn
 on dndkeep_private.spell_turn_slot_spends(character_id,turn_id) where not released;
create index if not exists spell_turn_slot_encounter_idx on dndkeep_private.spell_turn_slot_spends(encounter_id);

-- Called only by triggers on private payment receipts. The originating RPC
-- already holds the character lock; repeat that lock explicitly for clarity.
-- Read the actual current encounter turn, not the caster's most recent turn.
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
 select e.psionic_turn_id into current_turn from public.combat_encounters e where e.id=encounter_id and e.status='active';
 if current_turn is null then raise exception 'Encounter is no longer active';end if;
 if exists(select 1 from dndkeep_private.spell_turn_slot_spends s where s.character_id=new.character_id and s.turn_id=current_turn and not s.released)
  then raise exception 'Only one spell slot can be expended to cast a spell on the current turn';end if;
 insert into dndkeep_private.spell_turn_slot_spends(request_kind,request_id,character_id,encounter_id,turn_id)
 values(kind,request_id,new.character_id,encounter_id,current_turn);
 return new;
end;$$;
revoke all on function dndkeep_private.record_spell_turn_slot_spend() from public,anon,authenticated;
drop trigger if exists record_declared_spell_turn_slot on dndkeep_private.declared_spell_payments;
create trigger record_declared_spell_turn_slot after insert or update of outcome on dndkeep_private.declared_spell_payments
 for each row execute function dndkeep_private.record_spell_turn_slot_spend();
drop trigger if exists record_counterspell_turn_slot on dndkeep_private.counterspell_acceptances;
create trigger record_counterspell_turn_slot after insert on dndkeep_private.counterspell_acceptances
 for each row execute function dndkeep_private.record_spell_turn_slot_spend();
