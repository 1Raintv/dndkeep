-- v2.869: private typed-damage calculation for the eventual full hit transaction.
-- Explicit adjustments/provenance only; a flattened final total cannot prove
-- whether a save, resistance, reaction or DM override has already reduced it.
-- No HP, action, resource, event or public-endpoint changes in this stage.
create or replace function dndkeep_private.resolve_typed_damage_components(
 p_packet jsonb,p_defenses jsonb,p_adjustments jsonb default '{}'::jsonb,p_sharpened jsonb default '{"active":false,"sources":{}}'::jsonb
) returns jsonb language plpgsql immutable set search_path='' as $$
declare allowed text[]:=array['acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder'];
 field text; entry jsonb; component jsonb; normalized jsonb:='{}'::jsonb; types jsonb; n numeric; dice_sum numeric;
 multiplier numeric:=1; active boolean:=false; blanket boolean:=false; dtype text; component_key text;
 immune boolean; resistant boolean; vulnerable boolean; bypass boolean; component_keys text[]:=array[]::text[]; bases integer:=0;
 prepared jsonb:='[]'::jsonb; groups jsonb:='[]'::jsonb; g record; raw_damage numeric; adjusted numeric; final_damage numeric; modifier text;
 total numeric:=0; psychic numeric:=0; limit_n constant numeric:=9007199254740991;
begin
 if jsonb_typeof(p_packet) is distinct from 'object' or p_packet->'version' is distinct from '1'::jsonb
  or jsonb_typeof(p_packet->'components') is distinct from 'array' or jsonb_typeof(p_defenses) is distinct from 'object'
  or jsonb_typeof(p_adjustments) is distinct from 'object' or jsonb_typeof(p_sharpened) is distinct from 'object'
  or jsonb_typeof(p_sharpened->'active') is distinct from 'boolean' or jsonb_typeof(p_sharpened->'sources') is distinct from 'object' then
  raise exception 'Typed damage inputs could not be verified';end if;
 active:=(p_sharpened->>'active')::boolean;
 if p_defenses ? 'resistanceAll' then
  if jsonb_typeof(p_defenses->'resistanceAll') is distinct from 'boolean' then raise exception 'Invalid blanket resistance';end if;
  blanket:=(p_defenses->>'resistanceAll')::boolean;
 end if;
 if p_adjustments ? 'multiplier' then
  if jsonb_typeof(p_adjustments->'multiplier') is distinct from 'number' or (p_adjustments->>'multiplier')::numeric not in(0,0.5,1) then raise exception 'Invalid damage adjustment';end if;
  multiplier:=(p_adjustments->>'multiplier')::numeric;
 end if;
 foreach field in array array['immune','resistant','vulnerable','resistantTypes'] loop
  types:=case when field='resistantTypes' then coalesce(p_adjustments->field,'[]') else p_defenses->field end;
  if jsonb_typeof(types) is distinct from 'array' then raise exception 'Review typed damage defenses';end if;
  for entry in select value from jsonb_array_elements(types) loop
   if jsonb_typeof(entry)<>'string' or not(lower(btrim(entry#>>'{}'))=any(allowed||array['all'])) then raise exception 'Review typed damage defenses';end if;
  end loop;
  select coalesce(jsonb_agg(distinct lower(btrim(value))),'[]') into types from jsonb_array_elements_text(types);
  normalized:=normalized||jsonb_build_object(field,types);
 end loop;
 for component in select value from jsonb_array_elements(p_packet->'components') loop
  component_key:=component->>'key';dtype:=component->>'damageType';
  if jsonb_typeof(component)<>'object' or jsonb_typeof(component->'key') is distinct from 'string' or component_key=''
   or component_key=any(component_keys) or coalesce(component->>'source','') not in('base','rider')
   or jsonb_typeof(component->'label') is distinct from 'string' or jsonb_typeof(component->'expression') is distinct from 'string'
   or not(component ? 'damageType') or (component->'damageType'<>'null'::jsonb and (jsonb_typeof(component->'damageType')<>'string' or not(dtype=any(allowed))))
   or jsonb_typeof(component->'rolls') is distinct from 'array' or jsonb_typeof(component->'dieKinds') is distinct from 'array' then
   raise exception 'Damage component could not be verified';end if;
  component_keys:=array_append(component_keys,component_key);
  if component->>'source'='base' then bases:=bases+1;if bases>1 then raise exception 'Duplicate base damage';end if;end if;
  if jsonb_array_length(component->'rolls')<>jsonb_array_length(component->'dieKinds') then raise exception 'Damage dice evidence changed';end if;
  dice_sum:=0;
  for entry in select value from jsonb_array_elements(component->'rolls') loop
   if jsonb_typeof(entry)<>'number' then raise exception 'Invalid damage die';end if;
   n:=(entry#>>'{}')::numeric;if n<>trunc(n) or n<1 or n>limit_n then raise exception 'Invalid damage die';end if;
   dice_sum:=dice_sum+n;
  end loop;
  for entry in select value from jsonb_array_elements(component->'dieKinds') loop
   if jsonb_typeof(entry)<>'string' or entry#>>'{}' not in('rolled','adjusted','maximum','unknown') then raise exception 'Invalid damage die kind';end if;
  end loop;
  foreach field in array array['modifier','rawTotal'] loop
   if jsonb_typeof(component->field) is distinct from 'number' then raise exception 'Invalid damage amount';end if;
   n:=(component->>field)::numeric;if n<>trunc(n) or abs(n)>limit_n then raise exception 'Damage exceeds supported number range';end if;
  end loop;
  if (component->>'rawTotal')::numeric<>dice_sum+(component->>'modifier')::numeric then raise exception 'Damage total disagrees with dice';end if;
  immune:=dtype is not null and ((normalized->'immune') ? dtype or (normalized->'immune') ? 'all');
  resistant:=blanket or dtype is not null and ((normalized->'resistant') ? dtype or (normalized->'resistant') ? 'all' or (normalized->'resistantTypes') ? dtype or (normalized->'resistantTypes') ? 'all');
  bypass:=not immune and resistant and active and dtype='psychic' and coalesce(p_sharpened->'sources'->>component_key,'unknown') in('weapon-attack','psion-spell','psion-feature');
  prepared:=prepared||jsonb_build_array(jsonb_build_object('type',dtype,'key',component_key,'raw',component->'rawTotal','ignore',coalesce(bypass,false)));
 end loop;
 if multiplier=0.5 and exists(select 1 from jsonb_array_elements(prepared) e group by e->>'type' having count(distinct (e->>'ignore'))>1) then
  raise exception 'Mixed resistance bypass requires explicit adjustment allocation';end if;
 for g in select e->>'type' as dtype,(e->>'ignore')::boolean as ignored,sum((e->>'raw')::numeric) as amount,jsonb_agg(e->'key' order by ord) as keys
  from jsonb_array_elements(prepared) with ordinality as items(e,ord) group by e->>'type',(e->>'ignore')::boolean order by min(ord) loop
  if abs(g.amount)>limit_n then raise exception 'Damage exceeds supported number range';end if;
  raw_damage:=greatest(0,g.amount);adjusted:=floor(raw_damage*multiplier);
  immune:=g.dtype is not null and ((normalized->'immune') ? g.dtype or (normalized->'immune') ? 'all');
  resistant:=blanket or g.dtype is not null and ((normalized->'resistant') ? g.dtype or (normalized->'resistant') ? 'all' or (normalized->'resistantTypes') ? g.dtype or (normalized->'resistantTypes') ? 'all');
  vulnerable:=g.dtype is not null and ((normalized->'vulnerable') ? g.dtype or (normalized->'vulnerable') ? 'all');
  final_damage:=case when immune then 0 else (case when resistant and not g.ignored then floor(adjusted/2) else adjusted end)*case when vulnerable then 2 else 1 end end;
  modifier:=case when adjusted=0 then 'none' when immune then 'immune' when resistant and not g.ignored then case when vulnerable then 'resistant-vulnerable' else 'resistant' end when vulnerable then 'vulnerable' else 'none' end;
  total:=total+final_damage;if g.dtype='psychic' then psychic:=psychic+final_damage;end if;
  if final_damage>limit_n or total>limit_n then raise exception 'Damage exceeds supported number range';end if;
  groups:=groups||jsonb_build_array(jsonb_build_object('damageType',g.dtype,'componentKeys',g.keys,'raw',raw_damage,'adjusted',adjusted,'final',final_damage,'modifier',modifier,
   'resistanceIgnored',g.ignored and resistant and not immune and adjusted>0));
 end loop;
 return jsonb_build_object('groups',groups,'total',total,'psychicDamage',psychic);
end;$$;
revoke all on function dndkeep_private.resolve_typed_damage_components(jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
