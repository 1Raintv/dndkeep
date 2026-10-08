-- v2.856: retain the spell's paid combat intent through reload and Counterspell.
-- Only the private payment record may provide delivery data; callers pass an ID.
alter table dndkeep_private.declared_spell_payments add column if not exists attack_receipt jsonb;

create or replace function dndkeep_private.validate_spell_combat_context(p_context jsonb,p_actor public.combat_participants)
returns void language plpgsql security invoker set search_path='' as $$
declare intent jsonb:=p_context->'combat'; destination jsonb; target public.combat_participants; b public.combatants; parts text[];
begin
 if intent is null then return;end if;
 destination:=intent->'target';
 if jsonb_typeof(intent) is distinct from 'object' or coalesce(intent->>'kind','') not in('attack_roll','save','auto_hit')
  or jsonb_typeof(destination) is distinct from 'object'
  or coalesce(length(intent->>'damageDice'),0) not between 1 and 100
  or coalesce(length(intent->>'damageType'),0) not between 1 and 40 then raise exception 'Invalid combat spell intent';end if;
 -- Combat currently accepts a single bounded dice group plus a flat modifier.
 -- Reject unsupported syntax before spending, rather than silently rolling zero.
 parts:=regexp_match(intent->>'damageDice','^([0-9]{1,3})[dD]([0-9]{1,4})([+-][0-9]{1,4})?$');
 if parts is not null then
  if parts[1]::integer not between 1 and 100 or parts[2]::integer not between 1 and 1000 then raise exception 'Invalid spell damage dice';end if;
 elsif coalesce(intent->>'damageDice','')!~'^[0-9]{1,5}$' then raise exception 'Unsupported spell damage dice';end if;
 if intent->>'kind'='attack_roll' then
  if coalesce(intent->>'attackBonus','')!~'^-?[0-9]{1,3}$' or coalesce(intent->>'targetAC','')!~'^[0-9]{1,3}$'
   or (intent->>'attackBonus')::integer not between -100 and 100 or (intent->>'targetAC')::integer not between 0 and 100
   then raise exception 'Invalid spell attack values';end if;
 else
  if intent->>'attackBonus' is not null or intent->>'targetAC' is not null then raise exception 'Unexpected spell attack values';end if;
 end if;
 if intent->>'kind'='save' then
  if coalesce(intent->>'saveAbility','') not in('STR','DEX','CON','INT','WIS','CHA') or coalesce(intent->>'saveSuccessEffect','') not in('half','none','other')
   or coalesce(p_context->>'saveDC','')!~'^[0-9]{1,3}$' or (p_context->>'saveDC')::integer not between 1 and 100
   then raise exception 'Invalid spell saving throw';end if;
 elsif intent->>'saveAbility' is not null or intent->>'saveSuccessEffect' is not null then raise exception 'Unexpected spell saving throw';end if;
 if intent->>'actorCombatantId' is distinct from p_actor.combatant_id::text then raise exception 'The original caster piece changed';end if;
 select * into target from public.combat_participants where id=(destination->>'participantId')::uuid
  and campaign_id=p_actor.campaign_id and encounter_id=p_actor.encounter_id;
 if not found or target.participant_type not in('character','creature') or destination->>'entityId' is distinct from target.entity_id
  or destination->>'type' is distinct from target.participant_type or destination->>'combatantId' is distinct from target.combatant_id::text
  then raise exception 'The original spell target changed';end if;
 if target.hidden_from_players and not exists(select 1 from public.campaigns where id=p_actor.campaign_id and owner_id=auth.uid())
  then raise exception 'The spell target is hidden';end if;
 if p_actor.combatant_id is not null then
  select * into b from public.combatants where id=p_actor.combatant_id and campaign_id=p_actor.campaign_id;
  if not found or b.definition_type<>'character' or b.definition_id is distinct from p_actor.entity_id then raise exception 'The caster map piece changed';end if;
 end if;
 if target.combatant_id is not null then
  select * into b from public.combatants where id=target.combatant_id and campaign_id=p_actor.campaign_id;
  if not found or b.definition_id is distinct from target.entity_id or (b.definition_type='character') is distinct from (target.participant_type='character')
   then raise exception 'The spell target map piece changed';end if;
 end if;
end; $$;
revoke all on function dndkeep_private.validate_spell_combat_context(jsonb,public.combat_participants) from public,anon,authenticated;

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
 perform dndkeep_private.validate_spell_combat_context(p_context,cp);
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
create or replace function dndkeep_private.queue_declared_spell_attack(p_cast_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cast_row public.pending_spell_casts; payment dndkeep_private.declared_spell_payments;
 actor public.combat_participants; target public.combat_participants; intent jsonb; delivery_receipt jsonb; c public.characters;
begin
 if auth.uid() is null then raise exception 'Sign in to deliver a spell';end if;
 select s.* into cast_row from public.pending_spell_casts s join public.characters ch on ch.id=s.caster_character_id
 where s.id=p_cast_id and (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update of s;
 if not found then raise exception 'Spell declaration is unavailable';end if;
 select * into payment from dndkeep_private.declared_spell_payments where cast_id=p_cast_id for update;
 if not found or payment.outcome is null then raise exception 'Settle the original casting before delivering damage';end if;
 if payment.outcome not in('went_off','saved_through') then raise exception 'An interrupted spell has no damage to deliver';end if;
 -- Preserve receipts even if the DM canceled/deleted an already queued attack.
 if payment.attack_receipt is not null then return payment.attack_receipt||jsonb_build_object('replayed',true);end if;
 select * into c from public.characters where id=payment.character_id;
 if c.id is distinct from cast_row.caster_character_id or c.campaign_id is distinct from cast_row.campaign_id
  or payment.request->>'participantId' is distinct from cast_row.caster_participant_id::text then raise exception 'Spell payment context changed';end if;
 intent:=payment.request->'context'->'combat';
 if intent is null then raise exception 'This casting has no saved combat target';end if;
 perform 1 from public.combat_encounters where id=cast_row.encounter_id and campaign_id=cast_row.campaign_id and status='active' for share;
 if not found then raise exception 'The encounter ended; review the saved spell with the DM';end if;
 perform 1 from public.combat_participants where id in(cast_row.caster_participant_id,(intent->'target'->>'participantId')::uuid) order by id for share;
 select * into actor from public.combat_participants where id=cast_row.caster_participant_id and campaign_id=cast_row.campaign_id and encounter_id=cast_row.encounter_id;
 if not found or actor.participant_type<>'character' or actor.entity_id is distinct from c.id::text then raise exception 'The original spell caster changed';end if;
 select * into target from public.combat_participants where id=(intent->'target'->>'participantId')::uuid;
 perform 1 from public.combatants where id in(actor.combatant_id,target.combatant_id) order by id for share;
 perform dndkeep_private.validate_spell_combat_context(payment.request->'context',actor);
 if exists(select 1 from public.pending_attacks where id=p_cast_id) then raise exception 'This attack identity is already in use';end if;
 insert into public.pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,
  target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,attack_bonus,target_ac,save_dc,save_ability,save_success_effect,damage_dice,damage_type,state,chain_id)
 values(p_cast_id,cast_row.campaign_id,cast_row.encounter_id,actor.id,actor.name,'character',target.id,target.name,target.participant_type,'spell',cast_row.spell_name,
  intent->>'kind',(intent->>'attackBonus')::integer,(intent->>'targetAC')::integer,
  case when intent->>'kind'='save' then (payment.request->'context'->>'saveDC')::integer else null end,intent->>'saveAbility',intent->>'saveSuccessEffect',
  intent->>'damageDice',intent->>'damageType','declared',cast_row.chain_id);
 delivery_receipt:=jsonb_build_object('castId',p_cast_id,'attackId',p_cast_id,'characterId',c.id,'kind',intent->>'kind');
 update dndkeep_private.declared_spell_payments set attack_receipt=delivery_receipt where cast_id=p_cast_id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload)
 values(cast_row.campaign_id,cast_row.encounter_id,cast_row.chain_id,72,'player',c.id,actor.name,case when target.participant_type='character' then 'player' else 'creature' end,target.name,'attack_declared',
  jsonb_build_object('attack_name',cast_row.spell_name,'attack_kind',intent->>'kind','attack_source','spell','spell_cast_id',p_cast_id,
   'casting_source',payment.request->'context'->>'source','spell_id',payment.request->>'spellId','pending_attack_id',p_cast_id,
   'damage_dice',intent->>'damageDice','damage_type',intent->>'damageType'));
 return delivery_receipt||jsonb_build_object('replayed',false);
end; $$;
revoke all on function dndkeep_private.queue_declared_spell_attack(uuid) from public,anon;
grant execute on function dndkeep_private.queue_declared_spell_attack(uuid) to authenticated;
create or replace function public.queue_declared_spell_attack(p_cast_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.queue_declared_spell_attack(p_cast_id); $$;
revoke all on function public.queue_declared_spell_attack(uuid) from public,anon;
grant execute on function public.queue_declared_spell_attack(uuid) to authenticated;
