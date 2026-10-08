-- UA2025 Psion Update pp.4-5: Guards and Sharpened Mind start on YOUR turn.
-- Preserve the existing ledger transaction/replay contract. Exact start-phase
-- timing remains a tabletop declaration; the action pipeline is not complete.
create or replace function dndkeep_private.begin_psionic_discipline(
 p_character_id uuid,p_request_id uuid,p_turn jsonb,p_discipline text,p_rolls integer[],p_count integer,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.psionic_discipline_uses; req jsonb; snapshot jsonb; context jsonb; result jsonb; energy jsonb;
 lvl integer; sides integer; maximum integer; remaining integer; pool jsonb; chosen jsonb; feature_name text; conditional_use boolean; special boolean; actor record;
begin
 if auth.uid() is null then raise exception 'Sign in to use a discipline';end if;
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null or p_turn is null or jsonb_typeof(p_turn)<>'object' or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid discipline request';end if;
 req:=jsonb_build_object('turn',p_turn,'discipline',p_discipline,'rolls',p_rolls,'count',p_count,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.psionic_discipline_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Discipline request changed';end if;
  return prior.receipt||jsonb_build_object('outcome',prior.outcome,'character',to_jsonb(c),'replayed',true);
 end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if lvl<2 then raise exception 'Requires Psion level 2';end if;
 feature_name:=case p_discipline when 'biofeedback' then 'Biofeedback' when 'bolstering-precognition' then 'Bolstering Precognition'
  when 'destructive-thoughts' then 'Destructive Thoughts' when 'devilish-tongue' then 'Devilish Tongue'
  when 'expanded-awareness' then 'Expanded Awareness' when 'id-insinuation' then 'Id Insinuation' when 'inerrant-aim' then 'Inerrant Aim'
  when 'observant-mind' then 'Observant Mind' when 'psionic-backlash' then 'Psionic Backlash' when 'psionic-guards' then 'Psionic Guards' when 'sharpened-mind' then 'Sharpened Mind' end;
 if feature_name is null then raise exception 'Unknown Psionic Discipline';end if;
 chosen:=c.class_resources->'psion-disciplines';
 if jsonb_typeof(chosen) is distinct from 'array' then raise exception 'Choose this discipline first';end if;
 if not exists(select 1 from jsonb_array_elements_text(chosen) k where lower(trim(k)) in(p_discipline,lower(feature_name))) then raise exception 'Choose this discipline first';end if;
 snapshot:=jsonb_build_object('class_name',c.class_name,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,
  'intelligence',c.intelligence,'inventory',c.inventory,'disciplines',chosen);
 if snapshot is distinct from p_expected then raise exception 'Psion abilities changed; review the discipline';end if;
 if p_modifier is null or p_modifier not between -5 and 20 then raise exception 'Invalid Intelligence modifier';end if;
 sides:=case when lvl>=17 then 12 when lvl>=11 then 10 when lvl>=5 then 8 else 6 end;
 maximum:=case when lvl>=17 then 12 when lvl>=13 then 10 when lvl>=9 then 8 when lvl>=5 then 6 else 4 end;
 pool:=c.class_resources->'psionic-energy-dice';
 if pool is null then remaining:=maximum;
 elsif jsonb_typeof(pool)<>'number' or (pool::text)::numeric<>trunc((pool::text)::numeric) or (pool::text)::numeric not between 0 and maximum then raise exception 'Check Psionic Energy Dice';
 else remaining:=(pool::text)::integer;end if;
 conditional_use:=p_discipline in('devilish-tongue','expanded-awareness','inerrant-aim','observant-mind');
 special:=p_discipline in('psionic-guards','sharpened-mind');
 if p_count is null or p_count<1 or p_count>remaining or p_count>(case when p_discipline in('biofeedback','destructive-thoughts') then greatest(0,p_modifier) else 1 end)
  or p_rolls is null or (p_discipline='psionic-guards' and cardinality(p_rolls)<>0)
  or (p_discipline<>'psionic-guards' and (cardinality(p_rolls)<>p_count or array_ndims(p_rolls)<>1))
  or exists(select 1 from unnest(p_rolls) n where n is null or n not between 1 and sides) then raise exception 'Invalid discipline dice';end if;
 context:=public.psionic_turn_context_internal(c.id);
 if context is distinct from p_turn then raise exception 'Turn changed; choose the discipline again';end if;
 -- v2.816 — these exceptions say YOUR turn. Ordinary disciplines can be
 -- used on another actor's turn when their individual trigger permits it.
 -- Replays return above: advancing combat cannot invalidate an already-paid use.
 if special and context ? 'encounterId' then
  select cp.participant_type,cp.entity_id into actor
  from public.combat_participants cp
  left join public.combatants cb on cb.id=cp.combatant_id
  -- Match CombatProvider's definition-based recovery for legacy orphan rows.
  left join lateral (
   select recovered.is_dead from public.combatants recovered
   where cp.combatant_id is null and recovered.campaign_id=cp.campaign_id
    and recovered.definition_type=cp.participant_type and recovered.definition_id=cp.entity_id
   limit 1
  ) fallback on true
  where cp.encounter_id=(context->>'encounterId')::uuid
   and not coalesce(cb.is_dead,fallback.is_dead,false)
  order by cp.turn_order
  offset (context->>'index')::integer limit 1;
  if not found or actor.participant_type is distinct from 'character' or actor.entity_id is distinct from c.id::text then
   raise exception 'Use this discipline at the start of your own turn';
  end if;
 end if;
 if exists(select 1 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context and discipline=p_discipline) then raise exception 'This discipline was already used this turn';end if;
 -- Start-of-turn exceptions must be claimed before ordinary disciplines.
 if exists(select 1 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context and discipline not in('psionic-guards','sharpened-mind')) then
  if special then raise exception 'Use start-of-turn disciplines before other disciplines';else raise exception 'A discipline was already used this turn';end if;
 end if;
 if exists(select 1 from public.psionic_energy_uses where request_id=p_request_id) then raise exception 'The resource identity is already in use';end if;
 if not conditional_use then energy:=public.settle_psionic_energy(c.id,p_request_id,'spend',p_count,p_rolls,feature_name);end if;
 result:=jsonb_build_object('requestId',p_request_id,'turn',context,'discipline',p_discipline,'sourceFeature',feature_name,'rolls',p_rolls,'count',p_count,'conditional',conditional_use,'energy',energy);
 insert into dndkeep_private.psionic_discipline_uses(request_id,character_id,turn_context,discipline,request,receipt,conditional,outcome)
 values(p_request_id,c.id,context,p_discipline,req,result,conditional_use,case when conditional_use then null else jsonb_build_object('spent',true) end);
 -- The stored attempt, not expenditure, owns the turn limit. A failed bonus
 -- keeps the Energy Die but must not become another free attempt this turn.
 insert into public.character_history(id,character_id,user_id,event_type,description)
 values(p_request_id,c.id,auth.uid(),'feature_used',feature_name||': discipline used this turn. Base rolls: '||coalesce(array_to_string(p_rolls,', '),'none')||case when conditional_use then '. Energy Die outcome pending.' else '. Base Energy Dice paid.' end);
 select * into c from public.characters where id=c.id;
 return result||jsonb_build_object('outcome',case when conditional_use then null else jsonb_build_object('spent',true) end,'character',to_jsonb(c),'replayed',false);
end; $$;
