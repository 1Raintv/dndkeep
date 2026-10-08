-- v2.796: ordinary authenticated character saves execute the revision trigger
-- as the caller. Keep RLS and the trigger SECURITY INVOKER; grant only the
-- pure validators in the existing non-exposed schema. They inspect supplied
-- values, never query another character or write data.
create schema if not exists dndkeep_private;
revoke all on schema dndkeep_private from public,anon;
grant usage on schema dndkeep_private to authenticated;

create or replace function dndkeep_private.hit_dice_capacity_internal(c public.characters)
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
revoke all on function dndkeep_private.hit_dice_capacity_internal(public.characters) from public,anon,authenticated;

create or replace function dndkeep_private.hit_dice_counts_internal(c public.characters,allocation jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare capacity jsonb:=dndkeep_private.hit_dice_capacity_internal(c); result jsonb:='{}';
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
revoke all on function dndkeep_private.hit_dice_counts_internal(public.characters,jsonb) from public,anon,authenticated;

grant execute on function dndkeep_private.hit_dice_capacity_internal(public.characters) to authenticated;
grant execute on function dndkeep_private.hit_dice_counts_internal(public.characters,jsonb) to authenticated;

-- Existing protected transaction functions keep their names and one canonical
-- implementation. These public forwarding helpers remain inaccessible to clients.
create or replace function public.hit_dice_capacity_internal(c public.characters)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select dndkeep_private.hit_dice_capacity_internal(c);
$$;
create or replace function public.hit_dice_counts_internal(c public.characters,allocation jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select dndkeep_private.hit_dice_counts_internal(c,allocation);
$$;
revoke all on function public.hit_dice_capacity_internal(public.characters) from public,anon,authenticated;
revoke all on function public.hit_dice_counts_internal(public.characters,jsonb) from public,anon,authenticated;

create or replace function public.refresh_psionic_hit_dice_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(new.hit_dice_spent,0)=0 and (new.hit_dice_spent is distinct from old.hit_dice_spent or new.hit_dice_spent_by_type is distinct from old.hit_dice_spent_by_type) then new.hit_dice_spent_by_type:='{}'::jsonb;
 elsif (new.class_name,new.level,new.secondary_class,new.secondary_level) is distinct from
       (old.class_name,old.level,old.secondary_class,old.secondary_level) then new.hit_dice_spent_by_type:=null;
 elsif new.hit_dice_spent is distinct from old.hit_dice_spent and new.hit_dice_spent_by_type is not distinct from old.hit_dice_spent_by_type then
  new.hit_dice_spent_by_type:=null;
 elsif new.hit_dice_spent_by_type is distinct from old.hit_dice_spent_by_type and new.hit_dice_spent_by_type is not null then
  new.hit_dice_spent_by_type:=dndkeep_private.hit_dice_counts_internal(new,new.hit_dice_spent_by_type);
 end if;
 if (new.hit_dice_spent,new.hit_dice_spent_by_type,new.class_name,new.level,new.secondary_class,new.secondary_level) is distinct from
    (old.hit_dice_spent,old.hit_dice_spent_by_type,old.class_name,old.level,old.secondary_class,old.secondary_level) then
  new.psionic_hit_dice_revision:=old.psionic_hit_dice_revision+1;
 else new.psionic_hit_dice_revision:=old.psionic_hit_dice_revision; end if;
 return new;
end;
$$;
revoke all on function public.refresh_psionic_hit_dice_revision() from public,anon,authenticated;

