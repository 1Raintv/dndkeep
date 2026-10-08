-- v2.806: manual map HP adjustments preserve temporary HP and cannot apply twice.
-- This is the resource mutation only; combat damage consequences remain separate.
create table if not exists dndkeep_private.manual_hit_point_adjustments(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 outcome jsonb not null,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.manual_hit_point_adjustments enable row level security;
revoke all on dndkeep_private.manual_hit_point_adjustments from public,anon,authenticated;
create index if not exists manual_hit_point_adjustments_character_idx on dndkeep_private.manual_hit_point_adjustments(character_id);

create or replace function dndkeep_private.adjust_character_hit_points(
 p_character_id uuid,p_request_id uuid,p_mode text,p_amount integer,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.manual_hit_point_adjustments;
 req jsonb; outcome jsonb; old_hp integer; old_temp integer; next_hp integer; next_temp integer;
begin
 if auth.uid() is null then raise exception 'Sign in to adjust HP';end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null then raise exception 'An HP adjustment identifier is required';end if;
 req:=jsonb_build_object('mode',p_mode,'amount',p_amount,'revision',p_expected_revision);
 select * into prior from dndkeep_private.manual_hit_point_adjustments where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'HP adjustment request changed';end if;
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if p_mode is null or p_mode not in('damage','heal','set') or p_amount is null or p_amount<0
  or (p_mode<>'set' and p_amount=0) or p_expected_revision is null or p_expected_revision<0
  then raise exception 'Enter a valid whole-number HP adjustment';end if;
 if c.hit_point_revision is distinct from p_expected_revision then raise exception 'HP changed; review the current values before applying';end if;
 if c.current_hp is null or c.max_hp is null or c.current_hp<0 or c.max_hp<0 or (c.current_hp>c.max_hp and p_mode<>'set') or coalesce(c.temp_hp,0)<0
  then raise exception 'Review the character HP pools';end if;
 old_hp:=c.current_hp;old_temp:=coalesce(c.temp_hp,0);next_temp:=old_temp;
 if p_mode='damage' then
  next_temp:=greatest(0,old_temp-p_amount);
  next_hp:=greatest(0,old_hp-greatest(0,p_amount-old_temp));
 elsif p_mode='heal' then next_hp:=least(c.max_hp::bigint,old_hp::bigint+p_amount)::integer;
 else next_hp:=least(c.max_hp,p_amount);end if;
 update public.characters set current_hp=next_hp,temp_hp=next_temp where id=c.id returning * into c;
 outcome:=jsonb_build_object('requestId',p_request_id,'mode',p_mode,'amount',p_amount,
  'beforeHP',old_hp,'beforeTempHP',old_temp,'afterHP',next_hp,'afterTempHP',next_temp);
 insert into dndkeep_private.manual_hit_point_adjustments(request_id,character_id,request,outcome) values(p_request_id,c.id,req,outcome);
 insert into public.character_history(id,character_id,user_id,event_type,field,old_value,new_value,description)
 values(p_request_id,c.id,auth.uid(),'hp_change','current_hp',to_jsonb(old_hp),to_jsonb(next_hp),
  'Manual HP adjustment ('||p_mode||' '||p_amount||'): '||old_hp||' → '||next_hp||' HP; '||old_temp||' → '||next_temp||' temporary HP.');
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end;
$$;
revoke all on function dndkeep_private.adjust_character_hit_points(uuid,uuid,text,integer,bigint) from public,anon;
grant execute on function dndkeep_private.adjust_character_hit_points(uuid,uuid,text,integer,bigint) to authenticated;
create or replace function public.adjust_character_hit_points_atomic(p_character_id uuid,p_request_id uuid,p_mode text,p_amount integer,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.adjust_character_hit_points(p_character_id,p_request_id,p_mode,p_amount,p_expected_revision);
$$;
revoke all on function public.adjust_character_hit_points_atomic(uuid,uuid,text,integer,bigint) from public,anon;
grant execute on function public.adjust_character_hit_points_atomic(uuid,uuid,text,integer,bigint) to authenticated;
