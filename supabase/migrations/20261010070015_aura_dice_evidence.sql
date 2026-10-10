-- v2.869: PostgreSQL evidence checks for the atomic aura transaction.
-- No randomness or writes. Grammar/bounds mirror the canonical rules/dice.ts
-- parser; DB parity tests exercise both implementations with identical evidence.
create or replace function dndkeep_private.dice_evidence_total(p_expression text,p_roll jsonb)
returns numeric language plpgsql immutable security invoker set search_path='' as $$
declare expression text; part text; matches text[]; sides integer[]:='{}'; count_n numeric; die_n numeric;
 flat numeric:=0; expected numeric; face jsonb; value_n numeric; i integer; j integer;
begin
 if p_expression is null or jsonb_typeof(p_roll) is distinct from 'object'
  or jsonb_typeof(p_roll->'dice') is distinct from 'array'
  or jsonb_typeof(p_roll->'modifier') is distinct from 'number'
  or jsonb_typeof(p_roll->'total') is distinct from 'number' then raise exception 'Invalid dice evidence';end if;
 expression:=lower(regexp_replace(p_expression,'\s','','g'));
 if expression!~'^(\d+d\d+|\d+)([+](\d+d\d+|\d+)|-\d+)*$' then raise exception 'Unsupported dice expression';end if;
 for part in select m[1] from regexp_matches(expression,'[+-]?[^+-]+','g') m loop
  matches:=regexp_match(part,'^\+?(\d+)d(\d+)$');
  if matches is not null then
   count_n:=matches[1]::numeric;die_n:=matches[2]::numeric;
   if count_n not between 1 and 100 or die_n not between 1 and 1000 then raise exception 'Invalid dice group bounds';end if;
   for j in 1..count_n::integer loop sides:=array_append(sides,die_n::integer);end loop;
  else
   value_n:=part::numeric;
   if abs(value_n)>9007199254740991 then raise exception 'Unsafe dice modifier';end if;
   flat:=flat+value_n;
   if abs(flat)>9007199254740991 then raise exception 'Unsafe dice modifier';end if;
  end if;
 end loop;
 if abs(flat+cardinality(sides))>9007199254740991
  or abs(flat+coalesce((select sum(n) from unnest(sides)n),0))>9007199254740991 then raise exception 'Unsafe dice total';end if;
 if (p_roll->>'modifier')::numeric<>flat or jsonb_array_length(p_roll->'dice')<>cardinality(sides) then raise exception 'Dice evidence does not match expression';end if;
 expected:=flat;
 for i in 1..cardinality(sides) loop
  face:=p_roll->'dice'->(i-1);
  if jsonb_typeof(face) is distinct from 'object' or jsonb_typeof(face->'die') is distinct from 'number'
   or jsonb_typeof(face->'value') is distinct from 'number' then raise exception 'Invalid saved die';end if;
  value_n:=(face->>'value')::numeric;
  if (face->>'die')::numeric<>sides[i] or value_n<>trunc(value_n) or value_n not between 1 and sides[i] then raise exception 'Invalid saved die face';end if;
  expected:=expected+value_n;
 end loop;
 if (p_roll->>'total')::numeric<>expected then raise exception 'Saved dice total changed';end if;
 return expected;
end;$$;
revoke all on function dndkeep_private.dice_evidence_total(text,jsonb) from public,anon,authenticated;

-- Named Bless/Bane normalization and signed dice follow rules/saveBonuses.ts.
-- Match every relevant current buff in order; callers cannot omit a penalty,
-- add a bonus, or replace its faces while keeping an apparently valid total.
create or replace function dndkeep_private.save_bonus_evidence_total(p_buffs jsonb,p_rolls jsonb,p_automatic boolean)
returns integer language plpgsql immutable security invoker set search_path='' as $$
declare buff jsonb; evidence jsonb; name text; spell text; expression text; bonus_value jsonb;
 seen text[]:='{}'; idx integer:=0; total_n numeric:=0; amount numeric; negative boolean;
begin
 if p_automatic is null or jsonb_typeof(p_rolls) is distinct from 'array' then raise exception 'Invalid save bonus evidence';end if;
 if p_automatic then
  if p_rolls<>'[]'::jsonb then raise exception 'Automatic failure does not roll save bonuses';end if;
  return 0;
 end if;
 if jsonb_typeof(p_buffs) is distinct from 'array' then raise exception 'Review active save effects';end if;
 for buff in select value from jsonb_array_elements(p_buffs) loop
  if jsonb_typeof(buff) is distinct from 'object' then raise exception 'Review active save effects';end if;
  name:=case when jsonb_typeof(buff->'name')='string' then buff->>'name' else 'Saving throw effect' end;
  spell:=lower(regexp_replace(name,'^\s+|\s+$','','g'));
  if spell in('bless','bane') then
   if spell=any(seen) then continue;end if;
   seen:=array_append(seen,spell);expression:=case when spell='bless' then '1d4' else '-1d4' end;
  else
   if not(buff ? 'saveBonus') or buff->>'saveBonus'='' then continue;end if;
   bonus_value:=buff->'saveBonus';
   if jsonb_typeof(bonus_value)='number' then
    amount:=(buff->>'saveBonus')::numeric;
    if amount<>trunc(amount) or abs(amount)>9007199254740991 then raise exception 'Invalid flat save bonus';end if;
    expression:=amount::bigint::text;
   elsif jsonb_typeof(bonus_value)='string' then expression:=buff->>'saveBonus';
   else raise exception 'Unsupported save bonus';end if;
  end if;
  evidence:=p_rolls->idx;idx:=idx+1;
  if jsonb_typeof(evidence) is distinct from 'object' or jsonb_typeof(evidence->'name') is distinct from 'string' or evidence->>'name' is distinct from name
   or jsonb_typeof(evidence->'expression') is distinct from 'string' or evidence->>'expression' is distinct from expression
   or jsonb_typeof(evidence->'total') is distinct from 'number'
   or jsonb_typeof(evidence->'modifier') is distinct from 'number'
   or jsonb_typeof(evidence->'dice') is distinct from 'array' then raise exception 'Save bonus evidence changed';end if;
  negative:=regexp_replace(expression,'^\s+|\s+$','','g')~*'^-\d+d\d+$';
  if negative then
   if evidence->'multiplier' is distinct from '-1'::jsonb then raise exception 'Negative save dice lost their sign';end if;
   amount:=-dndkeep_private.dice_evidence_total(substr(regexp_replace(expression,'^\s+|\s+$','','g'),2),evidence||jsonb_build_object('total',-(evidence->>'total')::numeric));
  elsif regexp_replace(expression,'^\s+|\s+$','','g')~'^-?\d+$' then
   amount:=regexp_replace(expression,'^\s+|\s+$','','g')::numeric;
   if evidence ? 'multiplier' or evidence->'dice'<>'[]'::jsonb or amount<>trunc(amount) or abs(amount)>9007199254740991
    or (evidence->>'total')::numeric<>amount or (evidence->>'modifier')::numeric<>amount then raise exception 'Flat save bonus evidence changed';end if;
  else
   if evidence ? 'multiplier' then raise exception 'Unexpected save bonus multiplier';end if;
   amount:=dndkeep_private.dice_evidence_total(expression,evidence);
  end if;
  total_n:=total_n+amount;
 end loop;
 if idx<>jsonb_array_length(p_rolls) then raise exception 'Unexpected save bonus evidence';end if;
 if total_n not between -100 and 100 then raise exception 'Review combined save bonus';end if;
 return total_n::integer;
end;$$;
revoke all on function dndkeep_private.save_bonus_evidence_total(jsonb,jsonb,boolean) from public,anon,authenticated;


-- Assemble the original save from verified state and physical faces. The caller
-- supplies a consumed next-save penalty, never a browser-selected success flag.
create or replace function dndkeep_private.aura_save_evidence(p_context jsonb,p_proposal jsonb,p_penalty integer)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare state jsonb:=p_context->'save'; spec jsonb:=p_context#>'{aura,aura}';
 automatic boolean; advantage boolean; disadvantage boolean; extremes boolean; exhaustion integer;
 base integer; dc integer; buff_total integer; bonus integer; chosen integer; total_n integer; passed boolean;
begin
 if jsonb_typeof(p_proposal) is distinct from 'object'
  or p_proposal-array['baseBonus','dice','effectRolls']<>'{}'::jsonb
  or jsonb_typeof(p_proposal->'baseBonus') is distinct from 'number'
  or jsonb_typeof(p_proposal->'dice') is distinct from 'array'
  or p_penalty is null or p_penalty not between 0 and 4 then raise exception 'Invalid aura save proposal';end if;
 if (jsonb_typeof(state)='object' and jsonb_typeof(state->'autoFail')='boolean'
  and jsonb_typeof(state->'advantage')='boolean' and jsonb_typeof(state->'disadvantage')='boolean'
  and jsonb_typeof(state->'naturalExtremes')='boolean' and jsonb_typeof(state->'exhaustion')='number'
  and jsonb_typeof(spec->'saveDC')='number') is not true then raise exception 'Invalid authoritative aura save state';end if;
 if (state->>'exhaustion')::numeric<>trunc((state->>'exhaustion')::numeric) or (state->>'exhaustion')::numeric not between 0 and 6
  or (spec->>'saveDC')::numeric<>trunc((spec->>'saveDC')::numeric) or (spec->>'saveDC')::numeric not between 0 and 1000
  or (p_proposal->>'baseBonus')::numeric<>trunc((p_proposal->>'baseBonus')::numeric) or (p_proposal->>'baseBonus')::numeric not between -1000 and 1000 then raise exception 'Invalid aura save numbers';end if;
 automatic:=(state->>'autoFail')::boolean;advantage:=(state->>'advantage')::boolean;disadvantage:=(state->>'disadvantage')::boolean;
 extremes:=(state->>'naturalExtremes')::boolean;exhaustion:=(state->>'exhaustion')::integer;
 base:=(p_proposal->>'baseBonus')::integer;dc:=(spec->>'saveDC')::integer;
 if jsonb_array_length(p_proposal->'dice')<>(case when automatic then 0 when advantage<>disadvantage then 2 else 1 end)
  or exists(select 1 from jsonb_array_elements(p_proposal->'dice') d where jsonb_typeof(d)<>'number' or d::text::numeric<>trunc(d::text::numeric) or d::text::numeric not between 1 and 20)
  then raise exception 'Aura saving dice changed';end if;
 buff_total:=dndkeep_private.save_bonus_evidence_total(state->'buffs',p_proposal->'effectRolls',automatic);
 if automatic then
  if base<>0 or p_penalty<>0 then raise exception 'Automatic failure does not use saving modifiers';end if;
  bonus:=0;passed:=false;
 else
  chosen:=case when advantage and not disadvantage then (select max(n::text::integer) from jsonb_array_elements(p_proposal->'dice')n)
   when disadvantage and not advantage then (select min(n::text::integer) from jsonb_array_elements(p_proposal->'dice')n)
   else (p_proposal->'dice'->>0)::integer end;
  bonus:=base+buff_total-2*exhaustion-p_penalty;
  if bonus not between -1000 and 1000 then raise exception 'Combined aura save modifier is out of range';end if;
  total_n:=chosen+bonus;
  passed:=case when extremes and chosen=1 then false when extremes and chosen=20 then true else total_n>=dc end;
 end if;
 return jsonb_build_object('participantId',p_context#>>'{target,participant,id}','ability',spec->>'saveAbility','dc',dc,
  'dice',p_proposal->'dice','d20',chosen,'bonus',bonus,'total',total_n,'passed',passed,'automaticFailure',automatic,
  'advantage',advantage,'disadvantage',disadvantage,'naturalExtremes',extremes,'exhaustion',exhaustion,
  'baseBonus',base,'effectRolls',p_proposal->'effectRolls','buffTotal',buff_total,'penalty',p_penalty);
end;$$;
revoke all on function dndkeep_private.aura_save_evidence(jsonb,jsonb,integer) from public,anon,authenticated;
