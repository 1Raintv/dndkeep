-- v2.869 follow-up: feature save, next-save consumption and conditional payment.
-- A failed roll remains immutable even if the DM later uses Legendary Resistance.
create table if not exists dndkeep_private.propel_save_receipts (
 declaration_id uuid primary key references dndkeep_private.propel_declarations(request_id) on delete cascade,
 request jsonb not null, context jsonb not null, save jsonb not null, penalty jsonb not null,
 final_outcome text check(final_outcome in('passed','failed')),accepted boolean,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.propel_save_receipts enable row level security;
revoke all on dndkeep_private.propel_save_receipts from public,anon,authenticated;
-- Recheck rolled condition evidence under target locks before conditional payment.
-- The confirmed outcome, conditional cost and one history entry commit together.
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
 note:=note||case when p_outcome<>'failed' then 'No movement.' when d.movement='warp' then 'Teleport to a visible unoccupied space within 30 ft of the caster, horizontal to the caster. No Prone condition.'
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

create or replace function dndkeep_private.propel_save_result(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r dndkeep_private.propel_save_receipts;
begin
 select * into r from dndkeep_private.propel_save_receipts where declaration_id=p_declaration;
 if not found then return null;end if;
 return jsonb_build_object('declarationId',r.declaration_id,'save',r.save,'penalty',r.penalty,
  'pendingResistance',r.final_outcome is null,'accepted',r.accepted,'finalOutcome',r.final_outcome,
  'request',r.request,'record',dndkeep_private.read_propel(p_character,p_declaration));
end;$$;
revoke all on function dndkeep_private.propel_save_result(uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.get_propel_save(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform dndkeep_private.read_propel(p_character,p_declaration);
 return dndkeep_private.propel_save_result(p_character,p_declaration);
end;$$;
revoke all on function dndkeep_private.get_propel_save(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.get_propel_save(uuid,uuid) to authenticated;
create or replace function public.get_propel_save(p_character uuid,p_declaration uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.get_propel_save(p_character,p_declaration);$$;
revoke all on function public.get_propel_save(uuid,uuid) from public,anon;
grant execute on function public.get_propel_save(uuid,uuid) to authenticated;

create or replace function dndkeep_private.settle_propel_save(p_character uuid,p_declaration uuid,p_expected jsonb,
 p_dc integer,p_dice integer[],p_base_bonus integer,p_buff_total integer,p_buff_contributions jsonb,p_penalty_d4 integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; cp public.combat_participants;
 live jsonb; state jsonb; penalty jsonb; evidence jsonb; request jsonb; outcome text;
 automatic boolean; advantage boolean; disadvantage boolean; extremes boolean; passed boolean; pending boolean;
 chosen integer; bonus integer; score integer; contribution jsonb; buff_sum integer:=0; expected_buffs jsonb; submitted_buffs jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Propel declaration unavailable';end if;
 if exists(select 1 from dndkeep_private.propel_save_receipts where declaration_id=d.request_id) then
  return dndkeep_private.propel_save_result(c.id,d.request_id)||jsonb_build_object('replayed',true);
 end if;
 select * into cp from public.combat_participants where id=(d.target->>'participantId')::uuid;
 if cp.participant_type='character' then perform 1 from public.characters where id::text=cp.entity_id for update;end if;
 live:=dndkeep_private.get_propel_save_context(c.id,d.request_id);
 perform 1 from public.combat_participants where id=cp.id for update;
 perform 1 from public.combatants where id=(select combatant_id from public.combat_participants where id=cp.id) for update;
 live:=dndkeep_private.get_propel_save_context(c.id,d.request_id);
 if p_expected is distinct from live then raise exception 'Saving throw settings changed. Review the saved roll before retrying';end if;
 state:=live->'state';automatic:=(state->>'autoFail')::boolean;advantage:=(state->>'advantage')::boolean;
 disadvantage:=(state->>'disadvantage')::boolean;extremes:=(state->>'naturalExtremes')::boolean;
 if p_dc is null or p_dc not between 0 and 1000 or p_base_bonus is null or p_base_bonus not between -1000 and 1000
  or p_buff_total is null or p_buff_total not between -1000 and 1000 or jsonb_typeof(p_buff_contributions) is distinct from 'array'
  or p_dice is null or cardinality(p_dice)<>(case when automatic then 0 when advantage<>disadvantage then 2 else 1 end)
  or exists(select 1 from unnest(p_dice) n where n is null or n not between 1 and 20)
  or (automatic and p_penalty_d4 is not null) or (not automatic and (p_penalty_d4 is null or p_penalty_d4 not between 1 and 4))
 then raise exception 'Invalid Propel saving dice or modifiers';end if;
 if not automatic then
  select coalesce(jsonb_agg(jsonb_build_object('key',value->'key','dice',value->'saveBonus') order by ord),'[]') into expected_buffs
   from jsonb_array_elements(state->'buffs') with ordinality b(value,ord) where coalesce(value->>'saveBonus','')<>'';
  select coalesce(jsonb_agg(jsonb_build_object('key',value->'key','dice',value->'dice') order by ord),'[]') into submitted_buffs
   from jsonb_array_elements(p_buff_contributions) with ordinality b(value,ord);
  if expected_buffs<>submitted_buffs then raise exception 'Save buff contributions changed';end if;
 elsif p_buff_total<>0 or p_buff_contributions<>'[]' then raise exception 'Automatic failures do not roll bonus dice';end if;
 for contribution in select value from jsonb_array_elements(p_buff_contributions) loop
  if jsonb_typeof(contribution)<>'object' or coalesce(contribution->>'total','')!~'^-?[0-9]+$'
   or jsonb_typeof(contribution->'rolls') is distinct from 'array' then raise exception 'Invalid save buff contribution';end if;
  buff_sum:=buff_sum+(contribution->>'total')::integer;
 end loop;
 if buff_sum<>p_buff_total then raise exception 'Save buff total does not match its contributions';end if;
 chosen:=case when automatic then 1 when advantage and not disadvantage then (select max(n) from unnest(p_dice)n)
  when disadvantage and not advantage then (select min(n) from unnest(p_dice)n) else p_dice[1] end;
 penalty:=dndkeep_private.consume_next_save_penalty('feature',d.request_id,(live->>'encounterId')::uuid,cp.id,p_penalty_d4,automatic);
 bonus:=p_base_bonus+p_buff_total-2*(state->>'exhaustion')::integer-(penalty->>'penalty')::integer;
 if bonus not between -1000 and 1000 then raise exception 'Combined save modifier is out of range';end if;
 score:=chosen+bonus;
 passed:=case when automatic then false when extremes and chosen=1 then false when extremes and chosen=20 then true else score>=p_dc end;
 outcome:=case when passed then 'passed' else 'failed' end;
 pending:=not passed and (live->>'legendaryResistanceRemaining')::integer>0;
 evidence:=jsonb_build_object('participantId',cp.id,'outcome',outcome,'dc',p_dc,'d20',chosen,'bonus',bonus,'total',score,
  'rolls',to_jsonb(p_dice),'advantage',advantage,'disadvantage',disadvantage,'automaticFailure',automatic,'naturalExtremes',extremes);
 request:=jsonb_build_object('expected',p_expected,'dc',p_dc,'dice',to_jsonb(p_dice),'baseBonus',p_base_bonus,
  'buffTotal',p_buff_total,'buffContributions',p_buff_contributions,'penaltyD4',p_penalty_d4);
 insert into dndkeep_private.propel_save_receipts(declaration_id,request,context,save,penalty,final_outcome)
 values(d.request_id,request,live,evidence,penalty,case when pending then null else outcome end);
 if not pending then perform dndkeep_private.resolve_propel(c.id,d.request_id,outcome,evidence);end if;
 return dndkeep_private.propel_save_result(c.id,d.request_id)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.settle_propel_save(uuid,uuid,jsonb,integer,integer[],integer,integer,jsonb,integer) from public,anon;
grant execute on function dndkeep_private.settle_propel_save(uuid,uuid,jsonb,integer,integer[],integer,integer,jsonb,integer) to authenticated;
create or replace function public.settle_propel_save(p_character uuid,p_declaration uuid,p_expected jsonb,p_dc integer,p_dice integer[],p_base_bonus integer,p_buff_total integer,p_buff_contributions jsonb,p_penalty_d4 integer)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.settle_propel_save(p_character,p_declaration,p_expected,p_dc,p_dice,p_base_bonus,p_buff_total,p_buff_contributions,p_penalty_d4);$$;
revoke all on function public.settle_propel_save(uuid,uuid,jsonb,integer,integer[],integer,integer,jsonb,integer) from public,anon;
grant execute on function public.settle_propel_save(uuid,uuid,jsonb,integer,integer[],integer,integer,jsonb,integer) to authenticated;

create or replace function dndkeep_private.decide_propel_resistance(p_character uuid,p_declaration uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; r dndkeep_private.propel_save_receipts;
 cp public.combat_participants; e public.combat_encounters; cap integer; used integer; outcome text;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found or p_accept is null or not exists(select 1 from public.campaigns where id=(d.caster_snapshot->>'campaign_id')::uuid and owner_id=auth.uid())
 then raise exception 'Only this campaign DM can decide Legendary Resistance';end if;
 select * into r from dndkeep_private.propel_save_receipts where declaration_id=d.request_id;
 if not found then raise exception 'This Propel save is not awaiting Legendary Resistance';end if;
 if r.accepted is not null then
  if r.accepted<>p_accept then raise exception 'Legendary Resistance was already decided differently';end if;
  return dndkeep_private.propel_save_result(c.id,d.request_id);
 end if;
 if r.final_outcome is not null then raise exception 'This Propel save is not awaiting Legendary Resistance';end if;
 select * into e from public.combat_encounters where id=(r.context->>'encounterId')::uuid and campaign_id=c.campaign_id for share;
 if not found or e.status<>'active' then raise exception 'The encounter is no longer active';end if;
 select * into cp from public.combat_participants where id=(r.context->>'participantId')::uuid and encounter_id=e.id and campaign_id=e.campaign_id for update;
 if not found or cp.participant_type not in('creature','monster','npc') or cp.entity_id is distinct from r.context->'state'->'target'->>'entityId'
  or cp.combatant_id::text is distinct from r.context->'state'->'target'->>'combatantId' then raise exception 'Legendary Resistance target changed';end if;
 cap:=coalesce(cp.legendary_resistance,0);used:=coalesce(cp.legendary_resistance_used,0);
 if cap<0 or used<0 then raise exception 'Review Legendary Resistance charges';end if;
 if cap>0 and e.in_lair then cap:=cap+1;end if;
 if p_accept then
  if used>=cap then raise exception 'No Legendary Resistance charges remain';end if;
  update public.combat_participants set legendary_resistance_used=used+1 where id=cp.id;
 end if;
 outcome:=case when p_accept then 'passed' else 'failed' end;
 update dndkeep_private.propel_save_receipts set accepted=p_accept,final_outcome=outcome where declaration_id=d.request_id;
 perform dndkeep_private.resolve_propel(c.id,d.request_id,outcome,case when p_accept then null else r.save end);
 if p_accept then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
  values(e.campaign_id,e.id,d.request_id,0,'creature',cp.name,'legendary_resistance_used',
   jsonb_build_object('save_ability','STR','save_dc',r.save->'dc','save_d20',r.save->'d20','save_total',r.save->'total','uses_after',used+1,'dm_user',auth.uid(),'feature',d.source_feature),
   case when coalesce(cp.hidden_from_players,false) then 'hidden_from_players' else 'public' end);
 end if;
 return dndkeep_private.propel_save_result(c.id,d.request_id);
end;$$;
revoke all on function dndkeep_private.decide_propel_resistance(uuid,uuid,boolean) from public,anon;
grant execute on function dndkeep_private.decide_propel_resistance(uuid,uuid,boolean) to authenticated;
create or replace function public.decide_propel_resistance(p_character uuid,p_declaration uuid,p_accept boolean)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.decide_propel_resistance(p_character,p_declaration,p_accept);$$;
revoke all on function public.decide_propel_resistance(uuid,uuid,boolean) from public,anon;
grant execute on function public.decide_propel_resistance(uuid,uuid,boolean) to authenticated;
