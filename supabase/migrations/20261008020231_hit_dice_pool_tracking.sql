-- Track the actual die sizes spent without inventing legacy mixed-class history.
-- NULL means the old aggregate does not identify the allocation. No backfill.
alter table public.characters add column if not exists hit_dice_spent_by_type jsonb;

create or replace function public.hit_dice_capacity_internal(c public.characters)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'; names text[]:=array[c.class_name,c.secondary_class];
 levels integer[]:=array[c.level,case when coalesce(c.secondary_class,'')='' then 0 else coalesce(c.secondary_level,0) end];
 i integer; die text;
begin
 if coalesce(c.class_name,'')='' or c.level is null or c.level<1 or levels[2]<0 or c.level+levels[2]>20
  or (levels[2]>0 and c.class_name=c.secondary_class) then raise exception 'Review class levels before using Hit Dice'; end if;
 for i in 1..2 loop
  if levels[i]=0 then continue; end if;
  die:=case names[i] when 'Barbarian' then '12' when 'Fighter' then '10' when 'Paladin' then '10' when 'Ranger' then '10'
   when 'Psion' then '6' when 'Wizard' then '6' when 'Sorcerer' then '6'
   when 'Bard' then '8' when 'Cleric' then '8' when 'Druid' then '8' when 'Monk' then '8' when 'Rogue' then '8' when 'Warlock' then '8' when 'Artificer' then '8' end;
  if die is null then raise exception 'Review the class Hit Die size'; end if;
  result:=jsonb_set(result,array[die],to_jsonb(coalesce((result->>die)::integer,0)+levels[i]));
 end loop;
 return result;
end;
$$;
revoke all on function public.hit_dice_capacity_internal(public.characters) from public,anon,authenticated;

create or replace function public.hit_dice_counts_internal(c public.characters,allocation jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare capacity jsonb:=public.hit_dice_capacity_internal(c); result jsonb:='{}';
 spent integer:=coalesce(c.hit_dice_spent,0); total integer; die text; value jsonb; used integer; sum_used integer:=0;
begin
 select sum(v::integer) into total from jsonb_each_text(capacity) d(k,v);
 if spent<0 or spent>total then raise exception 'Review the total spent Hit Dice'; end if;
 if allocation is null or allocation='null'::jsonb then
  if spent=0 then return '{}'::jsonb; end if;
  if spent<>0 and spent<>total and (select count(*) from jsonb_object_keys(capacity))>1 then
   raise exception 'Review which Hit Die sizes were spent';
  end if;
  for die,value in select * from jsonb_each(capacity) loop
   result:=jsonb_set(result,array[die],to_jsonb(case when spent=0 then 0 when spent=total then (value::text)::integer else spent end));
  end loop;
  return result;
 end if;
 if jsonb_typeof(allocation)<>'object' then raise exception 'Invalid spent Hit Dice by size'; end if;
 for die,value in select * from jsonb_each(allocation) loop
  if not(capacity ? die) or jsonb_typeof(value)<>'number' then raise exception 'Invalid Hit Die size or count'; end if;
  if (value::text)::numeric<>trunc((value::text)::numeric) or (value::text)::numeric<0 or (value::text)::numeric>(capacity->>die)::integer then
   raise exception 'Spent Hit Dice exceed the class pool';
  end if;
  sum_used:=sum_used+(value::text)::integer;
 end loop;
 if sum_used<>spent then raise exception 'Hit Dice by size must match the saved total'; end if;
 if spent=0 then return '{}'::jsonb; end if;
 for die,value in select * from jsonb_each(capacity) loop
  used:=coalesce((allocation->>die)::integer,0);result:=jsonb_set(result,array[die],to_jsonb(used));
 end loop;
 return result;
end;
$$;
revoke all on function public.hit_dice_counts_internal(public.characters,jsonb) from public,anon,authenticated;

-- Preserve old clients: their aggregate-only changes invalidate the allocation.
-- A Long Rest (spent=0) is unambiguous. Class changes invalidate old capacities.
create or replace function public.refresh_psionic_hit_dice_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(new.hit_dice_spent,0)=0 and (new.hit_dice_spent is distinct from old.hit_dice_spent or new.hit_dice_spent_by_type is distinct from old.hit_dice_spent_by_type) then new.hit_dice_spent_by_type:='{}'::jsonb;
 elsif (new.class_name,new.level,new.secondary_class,new.secondary_level) is distinct from
       (old.class_name,old.level,old.secondary_class,old.secondary_level) then new.hit_dice_spent_by_type:=null;
 elsif new.hit_dice_spent is distinct from old.hit_dice_spent and new.hit_dice_spent_by_type is not distinct from old.hit_dice_spent_by_type then
  new.hit_dice_spent_by_type:=null;
 elsif new.hit_dice_spent_by_type is distinct from old.hit_dice_spent_by_type and new.hit_dice_spent_by_type is not null then
  new.hit_dice_spent_by_type:=public.hit_dice_counts_internal(new,new.hit_dice_spent_by_type);
 end if;
 if (new.hit_dice_spent,new.hit_dice_spent_by_type,new.class_name,new.level,new.secondary_class,new.secondary_level) is distinct from
    (old.hit_dice_spent,old.hit_dice_spent_by_type,old.class_name,old.level,old.secondary_class,old.secondary_level) then
  new.psionic_hit_dice_revision:=old.psionic_hit_dice_revision+1;
 else new.psionic_hit_dice_revision:=old.psionic_hit_dice_revision; end if;
 return new;
end;
$$;
revoke all on function public.refresh_psionic_hit_dice_revision() from public,anon,authenticated;

create or replace function public.review_hit_dice_pool(p_character_id uuid,p_expected_revision bigint,p_spent_by_type jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; counts jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to review Hit Dice'; end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Character is unavailable'; end if;
 if p_expected_revision is null or p_expected_revision<0 or p_spent_by_type is null or jsonb_typeof(p_spent_by_type)<>'object' then raise exception 'Invalid Hit Dice review'; end if;
 counts:=public.hit_dice_counts_internal(c,p_spent_by_type);
 -- An exact retry acknowledges the same allocation without modifying resources.
 if c.hit_dice_spent_by_type=counts then return to_jsonb(c); end if;
 if c.psionic_hit_dice_revision<>p_expected_revision then raise exception 'Hit Dice changed. Reload before reviewing their allocation'; end if;
 update public.characters set hit_dice_spent_by_type=counts where id=p_character_id returning * into c;
 return to_jsonb(c);
end;
$$;
revoke all on function public.review_hit_dice_pool(uuid,bigint,jsonb) from public,anon;
grant execute on function public.review_hit_dice_pool(uuid,bigint,jsonb) to authenticated;

-- New name avoids overloaded RPC ambiguity; older clients retain their existing
-- endpoint and aggregate-only spending invalidates unknown mixed allocation.
alter table public.psionic_surge_uses add column if not exists hit_die integer;
create or replace function public.spend_psionic_surge_pool_internal(
 p_character_id uuid,p_request_id uuid,p_rolls integer[],p_source_feature text,p_hit_die integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c public.characters; prior public.psionic_surge_uses; spent integer;
 secondary integer; psion_level integer; sides integer; maximum integer; adjusted integer[]; counts jsonb; capacity jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null then raise exception 'A roll request identifier is required'; end if;
 select * into prior from public.psionic_surge_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from p_character_id or prior.original_rolls is distinct from p_rolls
   or prior.source_feature is distinct from p_source_feature or prior.hit_die is distinct from p_hit_die then raise exception 'Roll request does not match its saved use'; end if;
  return jsonb_build_object('requestId',prior.request_id,'rolls',prior.adjusted_rolls,
   'total',(select sum(d) from unnest(prior.adjusted_rolls) d),'hitDiceSpent',coalesce(c.hit_dice_spent,0),
   'hitDiceSpentByType',c.hit_dice_spent_by_type,'hitDiceRevision',c.psionic_hit_dice_revision,'replayed',true);
 end if;
 secondary:=case when coalesce(c.secondary_class,'')='' then 0 else coalesce(c.secondary_level,0) end;
 psion_level:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if psion_level<7 then raise exception 'Psionic Surge requires Psion level 7'; end if;
 sides:=case when psion_level>=17 then 12 when psion_level>=11 then 10 else 8 end;
 maximum:=case when psion_level=20 then 14 when psion_level>=17 then 12 when psion_level>=13 then 10 when psion_level>=9 then 8 else 6 end;
 if coalesce(cardinality(p_rolls),0) not between 1 and maximum or coalesce(array_ndims(p_rolls),0)<>1
  or exists(select 1 from unnest(p_rolls) d where d is null or d not between 1 and sides)
  or not exists(select 1 from unnest(p_rolls) d where d<4)
  or p_source_feature is null or length(trim(p_source_feature)) not between 1 and 120
 then raise exception 'Invalid Psionic Surge dice'; end if;
 spent:=coalesce(c.hit_dice_spent,0);
 if spent<0 or spent>=c.level+secondary then raise exception 'Not enough Hit Point Dice'; end if;
 if p_hit_die is not null then
  counts:=public.hit_dice_counts_internal(c,c.hit_dice_spent_by_type);
  capacity:=public.hit_dice_capacity_internal(c);
  if not(capacity ? p_hit_die::text) or coalesce((counts->>p_hit_die::text)::integer,0) >= (capacity->>p_hit_die::text)::integer then
   raise exception 'No Hit Dice available in the selected pool';
  end if;
  counts:=jsonb_set(counts,array[p_hit_die::text],to_jsonb(coalesce((counts->>p_hit_die::text)::integer,0)+1));
 else counts:=null; end if;
 select array_agg(greatest(4,d) order by ord) into adjusted from unnest(p_rolls) with ordinality as dice(d,ord);
 insert into public.psionic_surge_uses(request_id,character_id,source_feature,original_rolls,adjusted_rolls,hit_die)
 values(p_request_id,p_character_id,p_source_feature,p_rolls,adjusted,p_hit_die);
 update public.characters set hit_dice_spent=spent+1,hit_dice_spent_by_type=counts where id=p_character_id returning * into c;
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,individual_results,total,notes)
 values(c.campaign_id,c.id,c.name,'roll','Psionic Surge',p_rolls,(select sum(d) from unnest(adjusted) d),
  p_source_feature||': '||array_to_string(p_rolls,', ')||' treated as '||array_to_string(adjusted,', ')
  ||'; spent 1 Hit Point Die. No healing or Energy Die expenditure. Saved result can be recovered without paying again.');
 return jsonb_build_object('requestId',p_request_id,'rolls',adjusted,
  'total',(select sum(d) from unnest(adjusted) d),'hitDiceSpent',c.hit_dice_spent,
  'hitDiceSpentByType',c.hit_dice_spent_by_type,'hitDiceRevision',c.psionic_hit_dice_revision,'replayed',false);
end;
$$;
revoke all on function public.spend_psionic_surge_pool_internal(uuid,uuid,integer[],text,integer) from public,anon,authenticated;

-- Both public entry points use one transaction implementation. Legacy calls
-- omit a size and invalidate allocation; new calls must choose a real pool.
create or replace function public.spend_psionic_surge(
 p_character_id uuid,p_request_id uuid,p_rolls integer[],p_source_feature text
) returns jsonb language sql security definer set search_path='' as $$
 select public.spend_psionic_surge_pool_internal(p_character_id,p_request_id,p_rolls,p_source_feature,null);
$$;
revoke all on function public.spend_psionic_surge(uuid,uuid,integer[],text) from public,anon;
grant execute on function public.spend_psionic_surge(uuid,uuid,integer[],text) to authenticated;

create or replace function public.spend_psionic_surge_from_pool(
 p_character_id uuid,p_request_id uuid,p_rolls integer[],p_source_feature text,p_hit_die integer
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_hit_die is null then raise exception 'Choose a Hit Die pool'; end if;
 return public.spend_psionic_surge_pool_internal(p_character_id,p_request_id,p_rolls,p_source_feature,p_hit_die);
end;
$$;
revoke all on function public.spend_psionic_surge_from_pool(uuid,uuid,integer[],text,integer) from public,anon;
grant execute on function public.spend_psionic_surge_from_pool(uuid,uuid,integer[],text,integer) to authenticated;
