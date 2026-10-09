-- Counterspell shares the same durable reaction budget as other casting.
create or replace function dndkeep_private.accept_counterspell(
 p_offer_id uuid,p_slot integer,p_source text,p_ability text,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pending_reactions; c public.characters; p public.combat_participants;
 cast_row public.pending_spell_casts; prior dndkeep_private.counterspell_acceptances;
 action_context jsonb; req jsonb; snapshot jsonb; outcome jsonb; slot jsonb; owned jsonb; prepared jsonb;
 source_class text; source_level integer; subclass_name text; required_ability text;
 total_level integer; dc integer; attack_id uuid:=gen_random_uuid(); chain uuid:=gen_random_uuid();
 target public.combat_participants; reactor_combatant public.combatants;
begin
 if auth.uid() is null then raise exception 'Sign in to accept Counterspell';end if;
 -- Authorize before locking or returning any saved result. A forged offer for
 -- someone else's participant must not disclose their character/receipt.
 select r.* into o from public.pending_reactions r
 join public.combat_participants cp on cp.id=r.reactor_participant_id
 join public.characters ch on ch.id::text=cp.entity_id
 join public.campaigns ca on ca.id=r.campaign_id
 where r.id=p_offer_id and r.reaction_key='counterspell' and r.reactor_type='character'
 and cp.participant_type='character' and cp.campaign_id=r.campaign_id and ch.campaign_id=r.campaign_id
 and (ch.user_id=auth.uid() or ca.owner_id=auth.uid());
 if not found then raise exception 'Counterspell offer is unavailable';end if;
 -- Keep cast/offer serialization, then lock character/encounter/participant
 -- in the same order as other shared action claims.
 select * into cast_row from public.pending_spell_casts where id=(o.decision_payload->>'spell_cast_id')::uuid for update;
 if not found then raise exception 'Spell declaration is unavailable';end if;
 select * into o from public.pending_reactions where id=p_offer_id for update;
 select ch.* into c from public.characters ch join public.combat_participants cp on ch.id::text=cp.entity_id
  where cp.id=o.reactor_participant_id for update of ch;
 perform 1 from public.combat_encounters e join public.combat_participants cp on cp.encounter_id=e.id
  where cp.id=o.reactor_participant_id for share of e;
 select * into p from public.combat_participants where id=o.reactor_participant_id for update;
 if c.id is null or c.id::text is distinct from p.entity_id or not(c.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=o.campaign_id and ca.owner_id=auth.uid()))
  or c.campaign_id is distinct from o.campaign_id or p.campaign_id is distinct from o.campaign_id
  or cast_row.campaign_id is distinct from o.campaign_id or cast_row.encounter_id is distinct from p.encounter_id
  or cast_row.caster_participant_id=p.id or o.reaction_key<>'counterspell' or o.reactor_type<>'character' or p.participant_type<>'character'
  or (o.decision_payload->>'spell_cast_id') is distinct from cast_row.id::text
  then raise exception 'Counterspell context changed';end if;
 req:=jsonb_build_object('slot',p_slot,'source',p_source,'ability',p_ability,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.counterspell_acceptances where offer_id=o.id;
 if found then
  if prior.character_id<>c.id or prior.request is distinct from req then raise exception 'Counterspell request changed';end if;
  return prior.outcome||jsonb_build_object('spellSlots',c.spell_slots,'replayed',true);
 end if;
 if o.state<>'offered' or o.expires_at<=clock_timestamp() or cast_row.state<>'declared' or cast_row.expires_at<=clock_timestamp()
  then raise exception 'Counterspell window is no longer open';end if;
 if coalesce(p.reaction_used,false) then raise exception 'Reaction is already spent';end if;
 select * into reactor_combatant from public.combatants where id=p.combatant_id;
 if coalesce(reactor_combatant.is_dead,false) or coalesce(reactor_combatant.current_hp,c.current_hp,0)<=0
  or exists(select 1 from unnest(coalesce(reactor_combatant.active_conditions,c.active_conditions,array[]::text[])) condition
   where lower(condition) in('incapacitated','unconscious','paralyzed','petrified','stunned'))
  then raise exception 'This reactor cannot take a reaction';end if;
 if not exists(select 1 from public.combat_encounters e where e.id=p.encounter_id and e.campaign_id=o.campaign_id and e.status='active')
  then raise exception 'Encounter is no longer active';end if;
 if p_slot is null or p_slot not between 3 and 9 or p_modifier is null or p_modifier not between -5 and 10
  or p_ability is null or p_ability not in('intelligence','wisdom','charisma') or p_source is null
  then raise exception 'Invalid Counterspell choice';end if;
 slot:=c.spell_slots->p_slot::text;
 if slot is null or jsonb_typeof(slot)<>'object' or coalesce(slot->>'used','')!~'^[0-9]+$'
  or coalesce(slot->>'total','')!~'^[0-9]+$' or (slot->>'used')::integer>=(slot->>'total')::integer
  then raise exception 'Counterspell slot is unavailable';end if;
 snapshot:=jsonb_build_object('class_name',c.class_name,'level',c.level,'subclass',c.subclass,
  'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,'secondary_subclass',c.secondary_subclass,
  'intelligence',c.intelligence,'wisdom',c.wisdom,'charisma',c.charisma,'inventory',c.inventory,
  'spell_sources',c.spell_sources,'spell_preparation_sources',c.spell_preparation_sources,
  'prepared_spells',c.prepared_spells,'slot',slot);
 if snapshot is distinct from p_expected then raise exception 'Character changed; review Counterspell choices';end if;
 owned:=c.spell_sources->'counterspell';prepared:=c.spell_preparation_sources->'counterspell';
 if jsonb_typeof(owned) is distinct from 'array' or not(owned ? p_source) then raise exception 'Counterspell source is unavailable';end if;
 if p_source not like 'grant:%' then
  if prepared is not null then
   if jsonb_typeof(prepared) is distinct from 'array' or not(prepared ? p_source) then raise exception 'Counterspell is not prepared';end if;
  elsif not('counterspell'=any(coalesce(c.prepared_spells,array[]::text[])))
   or (select count(*) from jsonb_array_elements_text(owned) s where s not like 'grant:%')>1
   then raise exception 'Review Counterspell preparation';end if;
 end if;
 total_level:=c.level+case when c.secondary_class is not null then coalesce(c.secondary_level,0) else 0 end;
 if c.level not between 1 and 20 or total_level not between 1 and 20
  or (c.secondary_class is not null and (coalesce(c.secondary_level,0)<0 or c.secondary_class=c.class_name))
  then raise exception 'Invalid class levels';end if;
 if p_source ~ '^(grant:)?class:' then
  source_class:=regexp_replace(p_source,'^(grant:)?class:','');
  if source_class=c.class_name then source_level:=c.level;subclass_name:=c.subclass;
  elsif source_class=c.secondary_class then source_level:=c.secondary_level;subclass_name:=c.secondary_subclass;
  else raise exception 'Counterspell class is unavailable';end if;
  required_ability:=case when source_class in('Wizard','Artificer','Psion') then 'intelligence'
   when source_class in('Cleric','Druid','Ranger') then 'wisdom'
   when source_class in('Paladin','Bard','Sorcerer','Warlock') then 'charisma'
   when source_level>=3 and ((source_class='Fighter' and subclass_name='Eldritch Knight') or (source_class='Rogue' and subclass_name='Arcane Trickster')) then 'intelligence' end;
  if source_level is null or source_level<1 or required_ability is distinct from p_ability then raise exception 'Counterspell ability does not match its class';end if;
 elsif p_source not in('species','grant:species','feat','other') then raise exception 'Unsupported Counterspell source';end if;
 -- Effective modifier follows the shared item pipeline. Its raw stat/inventory
 -- inputs are captured above, matching other paid rolls; no client-supplied DC.
 dc:=8+2+(total_level-1)/4+p_modifier;
 select * into target from public.combat_participants where id=cast_row.caster_participant_id;
 if not found or target.encounter_id is distinct from p.encounter_id then raise exception 'Caster is unavailable';end if;
 -- The reaction, spell slot, save and offer acceptance are one transaction.
 -- Saved acceptances return above, so an old retry never spends a new turn.
 action_context:=dndkeep_private.action_turn_context(c.id);
 if action_context->>'participantId' is distinct from p.id::text then raise exception 'Counterspell turn context changed';end if;
 perform dndkeep_private.claim_action(c.id,o.id,jsonb_build_object(
  'turnId',action_context->>'turnId','grantId','normal:reaction','kind','reaction',
  'purpose','magic','sourceId','counterspell'));
 insert into public.pending_attacks(id,campaign_id,encounter_id,chain_id,attacker_participant_id,attacker_name,attacker_type,
  target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,save_dc,save_ability,save_success_effect,damage_dice,damage_type,cover_level,state)
 values(attack_id,o.campaign_id,p.encounter_id,chain,p.id,p.name,'character',target.id,target.name,
  case when target.participant_type='character' then 'character' else 'creature' end,'spell',
  'Counterspell vs '||cast_row.spell_name||case when p_slot>3 then ' (L'||p_slot||')' else '' end,'save',dc,'CON','none','','','none','declared');
 update public.characters set spell_slots=jsonb_set(c.spell_slots,array[p_slot::text,'used'],to_jsonb((slot->>'used')::integer+1)) where id=c.id returning * into c;
 update public.combat_participants set reaction_used=true where id=p.id;
 update public.pending_spell_casts set state='counterspell_offered',counterspell_attack_id=attack_id where id=cast_row.id;
 update public.pending_reactions set state='accepted',decided_at=now(),decision_payload=o.decision_payload||jsonb_build_object('spell_level_used',p_slot,'casting_source',p_source,'save_dc',dc) where id=o.id;
 outcome:=jsonb_build_object('offerId',o.id,'castId',cast_row.id,'attackId',attack_id,'slotLevel',p_slot,'source',p_source,'ability',p_ability,'saveDC',dc);
 insert into dndkeep_private.counterspell_acceptances(offer_id,character_id,request,outcome) values(o.id,c.id,req,outcome);
 insert into public.combat_events(id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,campaign_id,encounter_id,payload)
 values(attack_id,chain,0,'player',c.id,c.name,case when target.participant_type='character' then 'player' else 'creature' end,target.name,'attack_declared',o.campaign_id,p.encounter_id,
  jsonb_build_object('attack_name','Counterspell vs '||cast_row.spell_name,'attack_kind','save','save_dc',dc,'save_ability','CON')),
 (o.id,cast_row.chain_id,70,'player',c.id,c.name,case when target.participant_type='character' then 'player' else 'creature' end,target.name,'reaction_used',o.campaign_id,p.encounter_id,
  outcome||jsonb_build_object('reaction','Counterspell','spell_level_used',p_slot,'target_spell',cast_row.spell_name,'save_dc',dc,'save_ability','CON'));
 return outcome||jsonb_build_object('spellSlots',c.spell_slots,'replayed',false);
end;
$$;
revoke all on function dndkeep_private.accept_counterspell(uuid,integer,text,text,integer,jsonb) from public,anon;
grant usage on schema dndkeep_private to authenticated;
grant execute on function dndkeep_private.accept_counterspell(uuid,integer,text,text,integer,jsonb) to authenticated;
