-- Preserve condition-based save evidence; no new resource spending rule.
-- The confirmed outcome, conditional cost and one history entry commit together.
create or replace function dndkeep_private.resolve_propel(p_character uuid,p_declaration uuid,p_outcome text,p_save jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; result jsonb; details jsonb:=nullif(p_save,'null'::jsonb);
 face integer; bonus integer; total integer; dc integer; rolls integer[]; advantage boolean; disadvantage boolean; automatic boolean; extremes boolean; passed boolean; note text;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Propel declaration unavailable';end if;
 if d.outcome is not null then
  if d.outcome is distinct from p_outcome or d.save_details is distinct from details then raise exception 'Propel resolution is already saved';end if;
  return d.result||jsonb_build_object('replayed',true);
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
 insert into public.action_logs(id,campaign_id,character_id,character_name,action_type,action_name,target_name,individual_results,total,notes)
 values(d.request_id,(select id from public.campaigns where id=(d.caster_snapshot->>'campaign_id')::uuid),c.id,coalesce(d.caster_snapshot->>'name',c.name),'roll',d.source_feature,coalesce(d.target->>'name','Selected target'),
  array(select jsonb_array_elements_text(coalesce(d.roll_result->'originalRolls','[]'::jsonb))::integer),coalesce((d.roll_result->>'total')::integer,0),note);
 return result;
end;$$;
revoke all on function dndkeep_private.resolve_propel(uuid,uuid,text,jsonb) from public,anon,authenticated;
