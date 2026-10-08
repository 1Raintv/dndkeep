-- v2.842: finalized is not expired. Keep every tracked, unexpired activation
-- discoverable; only inactive finalized history is limited to five records.
-- This lookup does not choose between overlapping effects or apply damage.
create or replace function dndkeep_private.get_sharpened_roll_records(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; result jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 with states as materialized (
  select r.request_id,r.result,a.created_at,
   dndkeep_private.sharpened_incapacitation_state(r.request_id)||dndkeep_private.sharpened_duration_state(r.request_id) as state
  from dndkeep_private.sharpened_rolls r
  join dndkeep_private.psionic_discipline_uses a on a.request_id=r.request_id
  where r.character_id=c.id
 ), classified as materialized (
  select *,states.result is null or coalesce(
   (state->>'incapacitationTracked')::boolean and not (state->>'endedByIncapacitation')::boolean
   and (state->>'durationTracked')::boolean and (state->>'remainingSeconds')::integer>0,false) as keep
  from states
 ), selected as (
  select * from classified where keep or request_id in (
   select request_id from classified where not keep order by created_at desc,request_id limit 5
  )
 )
 select coalesce(jsonb_agg(
  coalesce(s.result,dndkeep_private.sharpened_roll_value(s.request_id))
  ||jsonb_build_object('finalized',s.result is not null)||s.state
  order by s.created_at desc,s.request_id),'[]'::jsonb) into result from selected s;
 return result;
end; $$;
revoke all on function dndkeep_private.get_sharpened_roll_records(uuid) from public,anon;
grant execute on function dndkeep_private.get_sharpened_roll_records(uuid) to authenticated;
