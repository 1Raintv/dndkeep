-- v2.787: automatic grants have separate tags from deliberately learned copies.
-- Both learned and prepared source constraints reuse this predicate.
create or replace function public.valid_character_spell_sources(value jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare spell_id text; sources jsonb; item jsonb; tag text;
begin
 if value is null or jsonb_typeof(value)<>'object' then return false;end if;
 for spell_id,sources in select * from jsonb_each(value) loop
  if spell_id='' or jsonb_typeof(sources)<>'array' then return false;end if;
  for item in select * from jsonb_array_elements(sources) loop
   if jsonb_typeof(item)<>'string' then return false;end if;
   tag:=item#>>'{}';
   if tag not in('feat','species','other','grant:species') and tag !~ '^(grant:)?class:[A-Za-z]([A-Za-z -]*[A-Za-z])?$' then return false;end if;
  end loop;
 end loop;
 return true;
end;
$$;
