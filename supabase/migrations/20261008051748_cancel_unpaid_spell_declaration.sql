-- v2.804: a canceled local request must never become a delayed slot payment.
-- Keep a private tombstone, not a fabricated paid/canceled pending_spell_casts row.
create table if not exists dndkeep_private.canceled_spell_requests(
 cast_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.canceled_spell_requests enable row level security;
revoke all on dndkeep_private.canceled_spell_requests from public,anon,authenticated;
create index if not exists canceled_spell_requests_character_idx on dndkeep_private.canceled_spell_requests(character_id);

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
 -- Serialize cancellation and declaration, including absent rows and changed character IDs.
 perform pg_advisory_xact_lock(hashtextextended(p_cast_id::text,0));
 -- Same ordering as Counterspell acceptance: existing cast, participant, character.
 perform 1 from public.pending_spell_casts where id=p_cast_id for update;
 select * into cp from public.combat_participants where id=p_participant_id for update;
 select * into c from public.characters where id=p_character_id for update;
 if cp.id is null or cp.entity_id is distinct from c.id::text or cp.participant_type<>'character'
  or c.campaign_id is null or cp.campaign_id is distinct from c.campaign_id
  or not(c.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=c.campaign_id and ca.owner_id=auth.uid()))
  then raise exception 'Caster context changed';end if;
 if exists(select 1 from dndkeep_private.canceled_spell_requests where cast_id=p_cast_id)
  then raise exception 'This casting request was canceled; start a new casting';end if;
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

create or replace function dndkeep_private.cancel_unpaid_spell(p_cast_id uuid,p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; cast_row public.pending_spell_casts; prior dndkeep_private.canceled_spell_requests;
begin
 if auth.uid() is null then raise exception 'Sign in to cancel a casting';end if;
 if p_cast_id is null or p_character_id is null then raise exception 'Casting identity is required';end if;
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())))
  then raise exception 'Caster is unavailable';end if;
 -- Both operations take this first, then cast and character locks. It also closes
 -- the absent-row race when a caller supplies the same cast ID for another character.
 perform pg_advisory_xact_lock(hashtextextended(p_cast_id::text,0));
 select * into cast_row from public.pending_spell_casts where id=p_cast_id for update;
 select * into c from public.characters where id=p_character_id for update;
 if c.id is null or not(c.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=c.campaign_id and ca.owner_id=auth.uid()))
  then raise exception 'Caster is unavailable';end if;
 if cast_row.id is not null then
  if cast_row.caster_character_id is distinct from c.id then raise exception 'Casting identity changed';end if;
  -- A recorded declaration (including legacy) cannot be erased as unpaid.
  return jsonb_build_object('castId',p_cast_id,'characterId',c.id,'canceled',false,'replayed',false);
 end if;
 select * into prior from dndkeep_private.canceled_spell_requests where cast_id=p_cast_id;
 if found then
  if prior.character_id<>c.id then raise exception 'Casting identity changed';end if;
  return jsonb_build_object('castId',p_cast_id,'characterId',c.id,'canceled',true,'replayed',true);
 end if;
 insert into dndkeep_private.canceled_spell_requests(cast_id,character_id) values(p_cast_id,c.id);
 return jsonb_build_object('castId',p_cast_id,'characterId',c.id,'canceled',true,'replayed',false);
end;
$$;
revoke all on function dndkeep_private.cancel_unpaid_spell(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.cancel_unpaid_spell(uuid,uuid) to authenticated;
create or replace function public.cancel_unpaid_spell_atomic(p_cast_id uuid,p_character_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.cancel_unpaid_spell(p_cast_id,p_character_id);
$$;
revoke all on function public.cancel_unpaid_spell_atomic(uuid,uuid) from public,anon;
grant execute on function public.cancel_unpaid_spell_atomic(uuid,uuid) to authenticated;
