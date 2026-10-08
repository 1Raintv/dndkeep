-- v2.831: every new Sharpened activation remains discoverable after closing
-- the sheet, including a base-only roll with no enhancement payment.
create or replace function dndkeep_private.track_sharpened_roll()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.discipline='sharpened-mind' then
  insert into dndkeep_private.sharpened_rolls(request_id,character_id) values(new.request_id,new.character_id) on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function dndkeep_private.track_sharpened_roll() from public,anon,authenticated;
drop trigger if exists track_sharpened_roll on dndkeep_private.psionic_discipline_uses;
create trigger track_sharpened_roll after insert on dndkeep_private.psionic_discipline_uses for each row execute function dndkeep_private.track_sharpened_roll();

-- Shared computation: preview and finalization read the same paid dice.
create or replace function dndkeep_private.sharpened_roll_value(p_activation_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',a.request_id,'characterId',a.character_id,
  'originalRolls',d.original,'rolls',coalesce(s.adjusted_rolls,d.original),
  'total',(select sum(n) from unnest(coalesce(s.adjusted_rolls,d.original)) n),
  'activatedAt',a.created_at,'turn',a.turn_context)
 from dndkeep_private.psionic_discipline_uses a
 left join dndkeep_private.sharpened_enhancements e on e.activation_id=a.request_id and e.kind='enkindled'
 left join public.psionic_feature_uses f on f.request_id=e.request_id
 left join dndkeep_private.sharpened_enhancements se on se.activation_id=a.request_id and se.kind='surge'
 left join public.psionic_surge_uses s on s.request_id=se.request_id
 cross join lateral (select (select array_agg(n::integer order by ord) from jsonb_array_elements_text(a.request->'rolls') with ordinality r(n,ord))||coalesce(f.extra_rolls,'{}'::integer[]) as original) d
 where a.request_id=p_activation_id and a.discipline='sharpened-mind';
$$;
revoke all on function dndkeep_private.sharpened_roll_value(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.finalize_sharpened_roll(p_character_id uuid,p_activation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; activation dndkeep_private.psionic_discipline_uses; saved jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select * into activation from dndkeep_private.psionic_discipline_uses where request_id=p_activation_id;
 if not found or activation.character_id<>c.id or activation.discipline<>'sharpened-mind' then raise exception 'Sharpened activation is unavailable';end if;
 select result into saved from dndkeep_private.sharpened_rolls where request_id=p_activation_id;
 if saved is not null then return saved||jsonb_build_object('replayed',true);end if;
 saved:=dndkeep_private.sharpened_roll_value(p_activation_id);
 insert into dndkeep_private.sharpened_rolls(request_id,character_id,result,finalized_at) values(p_activation_id,c.id,saved,now())
 on conflict(request_id) do update set result=excluded.result,finalized_at=excluded.finalized_at;
 return saved||jsonb_build_object('replayed',false);
end; $$;

create or replace function dndkeep_private.get_sharpened_roll_records(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; result jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 -- All unfinished rolls remain recoverable. Limit only completed history.
 select coalesce(jsonb_agg(value order by activated desc,id),'[]'::jsonb) into result from (
  select coalesce(r.result,dndkeep_private.sharpened_roll_value(r.request_id))||jsonb_build_object('finalized',r.result is not null) as value,a.created_at as activated,r.request_id as id
  from dndkeep_private.sharpened_rolls r join dndkeep_private.psionic_discipline_uses a on a.request_id=r.request_id
  where r.character_id=c.id and (r.result is null or r.request_id in(
   select recent.request_id from dndkeep_private.sharpened_rolls recent
   join dndkeep_private.psionic_discipline_uses ra on ra.request_id=recent.request_id
   where recent.character_id=c.id and recent.result is not null order by ra.created_at desc,recent.request_id limit 5
  ))
 ) records;
 return result;
end; $$;
revoke all on function dndkeep_private.get_sharpened_roll_records(uuid) from public,anon;
grant execute on function dndkeep_private.get_sharpened_roll_records(uuid) to authenticated;
create or replace function public.get_sharpened_roll_records(p_character_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.get_sharpened_roll_records(p_character_id);
$$;
revoke all on function public.get_sharpened_roll_records(uuid) from public,anon;
grant execute on function public.get_sharpened_roll_records(uuid) to authenticated;
