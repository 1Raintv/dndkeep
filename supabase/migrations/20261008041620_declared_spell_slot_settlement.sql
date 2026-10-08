-- v2.804: track recovery separately for each slot level. An old interrupted casting
-- must not refund a different spell cast after a rest or manual slot recovery.
alter table public.characters add column if not exists spell_slot_recovery_revisions jsonb not null default '{}';
create or replace function public.advance_spell_slot_recovery_revisions()
returns trigger language plpgsql security invoker set search_path='' as $$
declare level_key text; before_slot jsonb; after_slot jsonb; revisions jsonb; before_used numeric; after_used numeric;
begin
 if tg_op='INSERT' then new.spell_slot_recovery_revisions:='{}';return new;end if;
 revisions:=old.spell_slot_recovery_revisions;
 if new.spell_slots is distinct from old.spell_slots then
  for i in 1..9 loop
   level_key:=i::text;before_slot:=old.spell_slots->level_key;after_slot:=new.spell_slots->level_key;
   before_used:=case when jsonb_typeof(before_slot->'used')='number' then (before_slot->>'used')::numeric else 0 end;
   after_used:=case when jsonb_typeof(after_slot->'used')='number' then (after_slot->>'used')::numeric else 0 end;
   if (before_slot->'total') is distinct from (after_slot->'total') or after_used<before_used then
    revisions:=jsonb_set(revisions,array[level_key],to_jsonb(coalesce((revisions->>level_key)::bigint,0)+1));
   end if;
  end loop;
 end if;
 new.spell_slot_recovery_revisions:=revisions;return new;
end;
$$;
revoke all on function public.advance_spell_slot_recovery_revisions() from public,anon,authenticated;
drop trigger if exists advance_spell_slot_recovery_revisions on public.characters;
create trigger advance_spell_slot_recovery_revisions before insert or update on public.characters
 for each row execute function public.advance_spell_slot_recovery_revisions();

create table if not exists dndkeep_private.declared_spell_payments(
 cast_id uuid primary key references public.pending_spell_casts(id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 slot_level integer not null check(slot_level between 0 and 9),
 recovery_revision bigint not null,
 request jsonb not null,
 outcome text check(outcome in('went_off','saved_through','countered')),
 slot_returned boolean not null default false,
 settled_at timestamptz,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.declared_spell_payments enable row level security;
revoke all on dndkeep_private.declared_spell_payments from public,anon,authenticated;
create index if not exists declared_spell_payment_character_idx on dndkeep_private.declared_spell_payments(character_id);

create or replace function dndkeep_private.declare_paid_spell(
 p_cast_id uuid,p_character_id uuid,p_participant_id uuid,p_spell_id text,p_spell_name text,
 p_slot integer,p_expected_slot jsonb,p_context jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; cp public.combat_participants; cast_row public.pending_spell_casts;
 prior dndkeep_private.declared_spell_payments; req jsonb; slot jsonb; owned jsonb; prepared jsonb;
 source text; base_level integer; chain uuid:=gen_random_uuid(); actor public.combatants; source_class text;
begin
 if auth.uid() is null then raise exception 'Sign in to declare a spell';end if;
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())))
  then raise exception 'Caster is unavailable';end if;
 if p_cast_id is null then raise exception 'A casting request identifier is required';end if;
 -- Same ordering as Counterspell acceptance: existing cast, participant, character.
 perform 1 from public.pending_spell_casts where id=p_cast_id for update;
 select * into cp from public.combat_participants where id=p_participant_id for update;
 select * into c from public.characters where id=p_character_id for update;
 if cp.id is null or cp.entity_id is distinct from c.id::text or cp.participant_type<>'character'
  or c.campaign_id is null or cp.campaign_id is distinct from c.campaign_id
  or not(c.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=c.campaign_id and ca.owner_id=auth.uid()))
  then raise exception 'Caster context changed';end if;
 req:=jsonb_build_object('characterId',p_character_id,'participantId',p_participant_id,'spellId',p_spell_id,
  'spellName',p_spell_name,'slotLevel',p_slot,'expectedSlot',p_expected_slot,'context',p_context);
 select * into prior from dndkeep_private.declared_spell_payments where cast_id=p_cast_id;
 if found then
  if prior.character_id<>c.id or prior.request is distinct from req then raise exception 'Casting request changed';end if;
  select * into cast_row from public.pending_spell_casts where id=p_cast_id;
  return jsonb_build_object('cast',to_jsonb(cast_row),'spellSlots',c.spell_slots,'replayed',true);
 end if;
 if p_spell_id is null or length(p_spell_id) not between 1 and 160 or p_spell_name is null or length(p_spell_name) not between 1 and 160
  or p_slot is null or p_slot not between 0 and 9 or jsonb_typeof(p_context) is distinct from 'object'
  or coalesce(p_context->>'spellLevel','')!~'^[0-9]$' then raise exception 'Invalid spell declaration';end if;
 base_level:=(p_context->>'spellLevel')::integer;source:=p_context->>'source';
 if p_slot<base_level or (base_level=0 and p_slot<>0) then raise exception 'Invalid spell slot level';end if;
 if not exists(select 1 from public.combat_encounters e where e.id=cp.encounter_id and e.campaign_id=c.campaign_id and e.status='active')
  then raise exception 'Encounter is no longer active';end if;
 owned:=c.spell_sources->p_spell_id;prepared:=c.spell_preparation_sources->p_spell_id;
 if source is null or jsonb_typeof(owned) is distinct from 'array' or not(owned ? source) then raise exception 'Review this spell source';end if;
 if source ~ '^(grant:)?class:' then
  source_class:=regexp_replace(source,'^(grant:)?class:','');
  if not((source_class=c.class_name and c.level>0) or coalesce(source_class=c.secondary_class and coalesce(c.secondary_level,0)>0,false))
   then raise exception 'Spell class is unavailable';end if;
 elsif source not in('species','grant:species','feat','other') then raise exception 'Unsupported spell source';end if;
 select * into actor from public.combatants where id=cp.combatant_id;
 if coalesce(actor.is_dead,false) or coalesce(actor.current_hp,c.current_hp,0)<=0
  or exists(select 1 from unnest(coalesce(actor.active_conditions,c.active_conditions,array[]::text[])) condition
   where lower(condition) in('incapacitated','unconscious','paralyzed','petrified','stunned'))
  then raise exception 'This caster cannot cast a spell';end if;
 if base_level>0 and source not like 'grant:%' then
  if prepared is not null then
   if jsonb_typeof(prepared) is distinct from 'array' or not(prepared ? source) then raise exception 'Spell is not prepared';end if;
  elsif not coalesce(p_spell_id=any(coalesce(c.prepared_spells,array[]::text[])),false)
   or (select count(*) from jsonb_array_elements_text(owned) s where s not like 'grant:%')>1
   then raise exception 'Review this spell preparation';end if;
 end if;
 slot:=case when p_slot=0 then null else c.spell_slots->p_slot::text end;
 if slot is distinct from p_expected_slot then raise exception 'Spell slots changed; review before casting';end if;
 if p_slot>0 and (slot is null or coalesce(slot->>'used','')!~'^[0-9]+$' or coalesce(slot->>'total','')!~'^[0-9]+$'
  or (slot->>'used')::integer>=(slot->>'total')::integer) then raise exception 'Spell slot is unavailable';end if;
 insert into public.pending_spell_casts(id,campaign_id,encounter_id,chain_id,caster_participant_id,caster_character_id,caster_name,spell_name,spell_level,is_cantrip,state,declared_at,expires_at)
 values(p_cast_id,c.campaign_id,cp.encounter_id,chain,cp.id,c.id,c.name,p_spell_name,p_slot,p_slot=0,'declared',clock_timestamp(),clock_timestamp()+interval '30 seconds') returning * into cast_row;
 if p_slot>0 then
  update public.characters set spell_slots=jsonb_set(c.spell_slots,array[p_slot::text,'used'],to_jsonb((slot->>'used')::integer+1)) where id=c.id returning * into c;
 end if;
 insert into dndkeep_private.declared_spell_payments(cast_id,character_id,slot_level,recovery_revision,request)
 values(p_cast_id,c.id,p_slot,coalesce((c.spell_slot_recovery_revisions->>p_slot::text)::bigint,0),req);
 insert into public.combat_events(id,campaign_id,encounter_id,chain_id,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload)
 values(p_cast_id,c.campaign_id,cp.encounter_id,chain,'player',c.id,c.name,'self',c.name,'spell_declared',
  jsonb_build_object('spell_id',p_spell_id,'spell_name',p_spell_name,'spell_level',p_slot,'is_cantrip',p_slot=0,'reaction_window_seconds',30,'context',p_context));
 return jsonb_build_object('cast',to_jsonb(cast_row),'spellSlots',c.spell_slots,'replayed',false);
end;
$$;
revoke all on function dndkeep_private.declare_paid_spell(uuid,uuid,uuid,text,text,integer,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.declare_paid_spell(uuid,uuid,uuid,text,text,integer,jsonb,jsonb) to authenticated;
create or replace function public.declare_spell_cast_atomic(p_cast_id uuid,p_character_id uuid,p_participant_id uuid,p_spell_id text,p_spell_name text,p_slot integer,p_expected_slot jsonb,p_context jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.declare_paid_spell(p_cast_id,p_character_id,p_participant_id,p_spell_id,p_spell_name,p_slot,p_expected_slot,p_context);
$$;
revoke all on function public.declare_spell_cast_atomic(uuid,uuid,uuid,text,text,integer,jsonb,jsonb) from public,anon;
grant execute on function public.declare_spell_cast_atomic(uuid,uuid,uuid,text,text,integer,jsonb,jsonb) to authenticated;

create or replace function dndkeep_private.settle_paid_spell(p_cast_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cast_row public.pending_spell_casts; c public.characters; payment dndkeep_private.declared_spell_payments;
 attack public.pending_attacks; resolved_outcome text; returned boolean:=false; current_revision bigint; used integer;
begin
 if auth.uid() is null then raise exception 'Sign in to resolve a spell';end if;
 select s.* into cast_row from public.pending_spell_casts s join public.characters ch on ch.id=s.caster_character_id
 where s.id=p_cast_id and (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=s.campaign_id and ca.owner_id=auth.uid())) for update of s;
 if not found then raise exception 'Spell declaration is unavailable';end if;
 select * into c from public.characters where id=cast_row.caster_character_id for update;
 select * into payment from dndkeep_private.declared_spell_payments where cast_id=cast_row.id for update;
 -- Legacy declarations lack a proven payment. Never infer a refundable debit.
 if not found then return jsonb_build_object('legacy',true,'castId',cast_row.id);end if;
 if payment.character_id<>c.id or c.campaign_id is distinct from cast_row.campaign_id or payment.slot_level<>cast_row.spell_level
  or payment.request->>'participantId' is distinct from cast_row.caster_participant_id::text
  then raise exception 'Spell payment context changed';end if;
 if payment.outcome is not null then return jsonb_build_object('castId',cast_row.id,'outcome',payment.outcome,'slotReturned',payment.slot_returned,'spellSlots',c.spell_slots,'replayed',true);end if;
 if cast_row.counterspell_attack_id is not null then
  select * into attack from public.pending_attacks where id=cast_row.counterspell_attack_id for update;
  if not found or attack.campaign_id is distinct from cast_row.campaign_id or attack.target_participant_id is distinct from cast_row.caster_participant_id
   or attack.attack_kind<>'save' or attack.save_ability<>'CON'
   or not exists(select 1 from dndkeep_private.counterspell_acceptances a where a.outcome->>'castId'=cast_row.id::text and a.outcome->>'attackId'=attack.id::text)
   then raise exception 'Counterspell save is unavailable';end if;
  if attack.save_result is null or attack.save_result not in('passed','failed') or coalesce(attack.pending_lr_decision,false)
   then raise exception 'Counterspell save is not resolved';end if;
  resolved_outcome:=case when attack.save_result='passed' then 'saved_through' else 'countered' end;
 else
  if cast_row.state<>'declared' or cast_row.expires_at>clock_timestamp() then raise exception 'Counterspell window is still open';end if;
  resolved_outcome:='went_off';
 end if;
 if resolved_outcome='countered' and payment.slot_level>0 then
  current_revision:=coalesce((c.spell_slot_recovery_revisions->>payment.slot_level::text)::bigint,0);
  used:=coalesce((c.spell_slots->payment.slot_level::text->>'used')::integer,0);
  if current_revision=payment.recovery_revision and used>0 then
   update public.characters set spell_slots=jsonb_set(c.spell_slots,array[payment.slot_level::text,'used'],to_jsonb(used-1)) where id=c.id returning * into c;
   returned:=true;
   -- This known refund is not a rest. Other pending casts of this same level
   -- retain their own refundable debit across the trigger's recovery increment.
   update dndkeep_private.declared_spell_payments set recovery_revision=coalesce((c.spell_slot_recovery_revisions->>payment.slot_level::text)::bigint,0)
    where character_id=c.id and slot_level=payment.slot_level and outcome is null and recovery_revision=current_revision;
  end if;
 end if;
 update public.pending_spell_casts set state=case when resolved_outcome='countered' then 'countered' else 'resolved' end,outcome=resolved_outcome,resolved_at=clock_timestamp() where id=cast_row.id;
 update dndkeep_private.declared_spell_payments set outcome=resolved_outcome,slot_returned=returned,settled_at=clock_timestamp() where cast_id=cast_row.id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
 values(cast_row.campaign_id,cast_row.encounter_id,cast_row.chain_id,71,'system','System','player',cast_row.caster_name,'spell_counterspell_resolved',
  jsonb_build_object('spell_cast_id',cast_row.id,'outcome',resolved_outcome,'slot_returned',returned,'save_d20',attack.save_d20,'save_total',attack.save_total));
 return jsonb_build_object('castId',cast_row.id,'outcome',resolved_outcome,'slotReturned',returned,'spellSlots',c.spell_slots,'replayed',false);
end;
$$;
revoke all on function dndkeep_private.settle_paid_spell(uuid) from public,anon;
grant execute on function dndkeep_private.settle_paid_spell(uuid) to authenticated;
create or replace function public.settle_declared_spell_atomic(p_cast_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.settle_paid_spell(p_cast_id); $$;
revoke all on function public.settle_declared_spell_atomic(uuid) from public,anon;
grant execute on function public.settle_declared_spell_atomic(uuid) to authenticated;
