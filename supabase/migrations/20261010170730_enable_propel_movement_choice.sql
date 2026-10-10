create or replace function dndkeep_private.list_propel(p_character uuid,p_before_time timestamptz,p_before_id uuid,p_include_deferred boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; items jsonb; last_item jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 if (p_before_time is null)<>(p_before_id is null) then raise exception 'Invalid Propel recovery cursor';end if;
 select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.request_id desc),'[]'::jsonb) into items from (
  select d.* from dndkeep_private.propel_declarations d where d.character_id=c.id and d.outcome is null and (p_include_deferred or not d.movement_choice_required)
   and (p_before_time is null or (d.created_at,d.request_id)<(p_before_time,p_before_id))
  order by d.created_at desc,d.request_id desc limit 25
 ) page;
 if jsonb_array_length(items)=25 then last_item:=items->24;end if;
 return jsonb_build_object('items',items,'nextCursor',case when last_item is not null then jsonb_build_object('createdAt',last_item->'created_at','requestId',last_item->'request_id') else null end);
end;$$;
revoke all on function dndkeep_private.list_propel(uuid,timestamptz,uuid,boolean) from public,anon,authenticated;

-- v2.869: opt-in player declarations and truthful movement history.
-- A scoped authenticated facade; generic action/grant helpers stay private.
create or replace function dndkeep_private.propel_api(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; result jsonb; declaration uuid; extra integer[]; used boolean;
begin
 c:=public.psionic_character_for_update(p_character);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid Propel request';end if;
 -- Older tabs do not know that a failed deferred save is not permission to
 -- move yet. Hide those unfinished uses from their lists and reject point writes.
 if p_operation not in('context','begin','begin_deferred','list') and exists(
  select 1 from dndkeep_private.propel_declarations d where d.request_id=(p_payload->>'declarationId')::uuid
   and d.character_id=c.id and d.movement_choice_required)
  and p_payload->'movementProtocol' is distinct from '1'::jsonb then
  raise exception 'Reload DNDKeep to resolve this saved movement choice';
 end if;
 case p_operation
 when 'context' then
  context:=dndkeep_private.action_turn_context(c.id);
  select exists(select 1 from dndkeep_private.action_claims a where a.character_id=c.id
   and a.owner_turn_id=context->>'ownerTurnId' and a.grant_id='normal:bonusAction') into used;
  if context->>'participantId' is not null then
   used:=used or coalesce((select bonus_used from public.combat_participants where id=(context->>'participantId')::uuid),true);
  end if;
  return context||jsonb_build_object('bonusAvailable',not used and (context->>'isOwnTurn')::boolean and not coalesce(dndkeep_private.psionic_is_incapacitated(c.id),true));
 when 'begin_deferred' then
  if p_payload->'deferred' is distinct from 'true'::jsonb or p_payload->>'movement' is distinct from 'push' then raise exception 'Invalid deferred movement declaration';end if;
  return dndkeep_private.begin_propel_movement_choice(c.id,(p_payload->>'requestId')::uuid,p_payload->>'turnId',p_payload->>'mode',(p_payload->>'roll')::integer,p_payload->'target');
 when 'begin' then
  if p_payload ? 'deferred' then raise exception 'Use the deferred movement operation';end if;
  return dndkeep_private.begin_propel(c.id,(p_payload->>'requestId')::uuid,p_payload->>'turnId',p_payload->>'mode',p_payload->>'movement',(p_payload->>'roll')::integer,p_payload->'target');
 when 'enhance' then
  declaration:=(p_payload->>'declarationId')::uuid;
  if p_payload->'extraRolls' is not null and p_payload->'extraRolls'<>'null'::jsonb then
   extra:=array(select jsonb_array_elements_text(p_payload->'extraRolls')::integer);
  end if;
  result:=dndkeep_private.enhance_propel(c.id,declaration,(p_payload->>'requestId')::uuid,p_payload->>'kind',extra,(p_payload->>'hitDie')::integer);
  return result||jsonb_build_object('activationId',declaration);
 when 'enhancements' then
  declaration:=(p_payload->>'declarationId')::uuid;
  perform dndkeep_private.read_propel(c.id,declaration);
  select f.extra_rolls into extra from dndkeep_private.propel_enhancements e
   join public.psionic_feature_uses f on f.request_id=e.request_id
   where e.declaration_id=declaration and e.kind='enkindled';
  return jsonb_build_object('declarationId',declaration,'extraRolls',coalesce(extra,'{}'::integer[]),
   'usedSurge',exists(select 1 from dndkeep_private.propel_enhancements e where e.declaration_id=declaration and e.kind='surge'));
 when 'finalize' then
  declaration:=(p_payload->>'declarationId')::uuid;
  perform dndkeep_private.finalize_propel_roll(c.id,declaration);
  return dndkeep_private.read_propel(c.id,declaration);
 when 'finish' then
  declaration:=(p_payload->>'declarationId')::uuid;
  result:=dndkeep_private.resolve_propel(c.id,declaration,p_payload->>'outcome',p_payload->'save');
  return dndkeep_private.read_propel(c.id,declaration)||jsonb_build_object('replayed',result->'replayed');
 when 'read' then return dndkeep_private.read_propel(c.id,(p_payload->>'declarationId')::uuid);
 when 'list' then return dndkeep_private.list_propel(c.id,(p_payload->>'beforeTime')::timestamptz,(p_payload->>'beforeId')::uuid,coalesce(p_payload->'movementProtocol'='1'::jsonb,false));
 else raise exception 'Unknown Propel operation';end case;
end;$$;
revoke all on function dndkeep_private.propel_api(uuid,text,jsonb) from public,anon;
grant execute on function dndkeep_private.propel_api(uuid,text,jsonb) to authenticated;
create or replace function public.psionic_propel(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.propel_api(p_character,p_operation,p_payload);
$$;
revoke all on function public.psionic_propel(uuid,text,jsonb) from public,anon;
grant execute on function public.psionic_propel(uuid,text,jsonb) to authenticated;

-- v2.869 follow-up: combat completion must use the authoritative save pipeline.
create or replace function dndkeep_private.resolve_propel(p_character uuid,p_declaration uuid,p_outcome text,p_save jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; result jsonb; details jsonb:=nullif(p_save,'null'::jsonb);
 face integer; bonus integer; total integer; dc integer; rolls integer[]; advantage boolean; disadvantage boolean; automatic boolean; extremes boolean; passed boolean; note text; live jsonb; target_row public.combat_participants; saved_throw dndkeep_private.propel_save_receipts;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Propel declaration unavailable';end if;
 if d.outcome is not null then
  if d.outcome is distinct from p_outcome or d.save_details is distinct from details then raise exception 'Propel resolution is already saved';end if;
  return d.result||jsonb_build_object('replayed',true);
 end if;
 select * into saved_throw from dndkeep_private.propel_save_receipts where declaration_id=d.request_id;
 if found then
  if saved_throw.final_outcome is null then raise exception 'The DM must decide Legendary Resistance first';end if;
  if p_outcome is distinct from saved_throw.final_outcome or details is distinct from
   (case when saved_throw.accepted then null::jsonb else saved_throw.save end) then
   raise exception 'Use the recorded Propel save result';
  end if;
 end if;
 if details is not null then
  if jsonb_typeof(details)<>'object' or p_outcome='cancelled'
   or details-array['participantId','outcome','dc','d20','bonus','total','rolls','advantage','disadvantage','automaticFailure','naturalExtremes']<>'{}'::jsonb
   or details->>'participantId' is distinct from coalesce(d.target->>'participantId','manual')
   or details->>'outcome' is null or details->>'outcome' not in('passed','failed','auto-failed')
   or (case when details->>'outcome'='passed' then 'passed' else 'failed' end) is distinct from p_outcome
   or jsonb_typeof(details->'dc') is distinct from 'number' then raise exception 'Invalid Propel save details';end if;
  dc:=(details->>'dc')::integer;
  if (details->>'dc')::numeric<>dc or dc not between 0 and 1000 then raise exception 'Invalid save DC';end if;
  if details ? 'd20' then
   if details->>'outcome'='auto-failed' or jsonb_typeof(details->'d20') is distinct from 'number'
    or jsonb_typeof(details->'bonus') is distinct from 'number' or jsonb_typeof(details->'total') is distinct from 'number'
    or jsonb_typeof(details->'rolls') is distinct from 'array' or jsonb_typeof(details->'advantage') is distinct from 'boolean'
    or jsonb_typeof(details->'naturalExtremes') is distinct from 'boolean' then raise exception 'Invalid rolled save details';end if;
   face:=(details->>'d20')::integer;bonus:=(details->>'bonus')::integer;total:=(details->>'total')::integer;
   if (details ? 'disadvantage' and jsonb_typeof(details->'disadvantage')<>'boolean') or (details ? 'automaticFailure' and jsonb_typeof(details->'automaticFailure')<>'boolean') then raise exception 'Invalid save condition flags';end if;
   disadvantage:=coalesce((details->>'disadvantage')::boolean,false);automatic:=coalesce((details->>'automaticFailure')::boolean,false);
   advantage:=(details->>'advantage')::boolean;extremes:=(details->>'naturalExtremes')::boolean;
   if (details->>'d20')::numeric<>face or (details->>'bonus')::numeric<>bonus or (details->>'total')::numeric<>total
    or face not between 1 and 20 or bonus not between -1000 and 1000 or total<>face+bonus
    or jsonb_array_length(details->'rolls')<>(case when automatic then 0 when advantage<>disadvantage then 2 else 1 end)
    or exists(select 1 from jsonb_array_elements(details->'rolls') n where jsonb_typeof(n)<>'number' or n::text::numeric<>trunc(n::text::numeric) or n::text::numeric not between 1 and 20)
    then raise exception 'Invalid rolled save arithmetic';end if;
   rolls:=array(select jsonb_array_elements_text(details->'rolls')::integer);
   passed:=case when automatic then false when extremes and face=1 then false when extremes and face=20 then true else total>=dc end;
   if face<>(case when automatic then 1 when disadvantage and not advantage then (select min(n) from unnest(rolls) n) when advantage and not disadvantage then (select max(n) from unnest(rolls) n) else rolls[1] end) or passed<>(p_outcome='passed') then raise exception 'Invalid rolled save outcome';end if;
  elsif details ?| array['bonus','total','rolls','advantage','disadvantage','automaticFailure','naturalExtremes'] then raise exception 'Manual save cannot invent dice';end if;
 end if;
 -- The UI read is advisory. Hold the target rows through payment so a new
 -- condition cannot turn a stale passed/failed roll into a resource charge.
 -- Manual tabletop outcomes remain explicit adjudication without invented dice.
 if saved_throw.declaration_id is null and details ? 'd20' and d.target->>'participantId' is not null then
  select * into target_row from public.combat_participants where id=(d.target->>'participantId')::uuid;
  if not found then raise exception 'The declared target is unavailable';end if;
  -- Character precedes encounter/participant locks, matching ordinary saves.
  -- Concurrent cross-character resolutions can be retried after PG deadlock
  -- rollback; no payment is committed by a rejected transaction.
  if target_row.participant_type='character' then
   perform 1 from public.characters where id::text=target_row.entity_id for share;
  end if;
  live:=dndkeep_private.get_propel_save_context(c.id,d.request_id);
  perform 1 from public.combat_participants where id=target_row.id for update;
  perform 1 from public.combatants where id=(select combatant_id from public.combat_participants where id=target_row.id) for update;
  live:=dndkeep_private.get_propel_save_context(c.id,d.request_id)->'state';
  if automatic is distinct from (live->>'autoFail')::boolean
   or advantage is distinct from (live->>'advantage')::boolean
   or disadvantage is distinct from (live->>'disadvantage')::boolean
   or extremes is distinct from (live->>'naturalExtremes')::boolean then
   raise exception 'Target save conditions changed. Review the save before confirming Propel';
  end if;
 end if;
 -- A legacy client cannot skip next-save effects or the DM resistance choice.
 -- Completed pre-migration receipts were returned above without charging again.
 if saved_throw.declaration_id is null and p_outcome<>'cancelled'
  and (d.turn_context ? 'encounterId' or d.target->>'participantId' is not null) then
  raise exception 'Combat Propel requires its recorded saving throw. Reload Propel and use Resolve combat save';
 end if;
 result:=dndkeep_private.finish_propel(c.id,d.request_id,p_outcome);
 update dndkeep_private.propel_declarations set save_details=details where request_id=d.request_id;
 note:='STR save: '||p_outcome||'. Bonus Action spent. Energy Dice spent: '||(result->>'energyCost')||'. ';
 if details is not null then
  note:=note||case when disadvantage and not advantage then 'Disadvantage. ' else '' end||'DC '||dc||case when automatic then '; automatic failure from condition (no dice)' when face is not null then '; dice '||array_to_string(rolls,', ')||case when automatic then '; automatic failure from condition; cosmetic face ' else '; kept ' end||face||' + bonus '||bonus||' = '||total||case when extremes then ' (natural-extremes house rule)' else '' end
   when details->>'outcome'='auto-failed' then '; willingly failed' else '; manually recorded' end||'. ';
 end if;
 if d.roll_result is not null and jsonb_array_length(d.roll_result->'originalRolls')>0 then
  note:=note||'Power dice '||(d.roll_result->'originalRolls')::text||'; resolved total '||(d.roll_result->>'total')||'; Enkindled extras '||(d.roll_result->'enkindledRolls')::text||'; Surge applied: '||(d.roll_result->>'usedSurge')||'. ';
 end if;
 note:=note||case when p_outcome<>'failed' then 'No movement.' when d.movement_choice_required then 'Movement choice pending; do not move the target yet.' when d.movement='warp' then 'Teleport to a visible unoccupied space within 30 ft of the caster, horizontal to the caster. No Prone condition.'
  else (result->>'feet')||' ft straight toward or away from the caster.' end||' Map movement is manual. Paid Hit Dice remain spent.';
 if saved_throw.declaration_id is not null then
  note:=note||'Mind Sliver deduction: '||(saved_throw.penalty->>'penalty')||'. ';
  if saved_throw.accepted then note:=note||'Legendary Resistance changed the recorded failed save to a success. ';end if;
 end if;
 insert into public.action_logs(id,campaign_id,character_id,character_name,action_type,action_name,target_name,individual_results,total,notes)
 values(d.request_id,(select id from public.campaigns where id=(d.caster_snapshot->>'campaign_id')::uuid),c.id,coalesce(d.caster_snapshot->>'name',c.name),'roll',d.source_feature,coalesce(d.target->>'name','Selected target'),
  array(select jsonb_array_elements_text(coalesce(d.roll_result->'originalRolls','[]'::jsonb))::integer),coalesce((d.roll_result->>'total')::integer,0),note);
 return result;
end;$$;
revoke all on function dndkeep_private.resolve_propel(uuid,uuid,text,jsonb) from public,anon,authenticated;


-- A single receipt transition appends history in the same transaction. Replays
-- never rewrite the receipt or duplicate the history entry.
create or replace function dndkeep_private.log_propel_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare note text;
begin
 if old.movement_choice is not null or new.movement_choice is null then return new;end if;
 note:=case new.movement_choice->>'choice'
  when 'none' then 'Movement closed. Do not move the target.'
  when 'warp' then 'Warp chosen: teleport to an unoccupied space you can see within 30 ft of the caster, horizontal to the caster. No Prone condition. Apply movement on the map.'
  else 'Push/pull chosen: move the target '||(new.movement_choice->>'feet')||' ft straight toward or away from the caster. Apply movement on the map.' end;
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,target_name,individual_results,total,notes)
 values((select id from public.campaigns where id=(new.caster_snapshot->>'campaign_id')::uuid),new.character_id,
  new.caster_snapshot->>'name','roll','Propel movement',coalesce(new.target->>'name','Selected creature'),'{}'::integer[],0,
  note||' No additional action, dice roll or Energy Die cost. Declaration: '||new.request_id);
 return new;
end;$$;
revoke all on function dndkeep_private.log_propel_movement() from public,anon,authenticated;
drop trigger if exists log_propel_movement on dndkeep_private.propel_declarations;
create trigger log_propel_movement after update of movement_choice on dndkeep_private.propel_declarations
 for each row execute function dndkeep_private.log_propel_movement();
notify pgrst,'reload schema';
