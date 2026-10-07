-- v2.784 — Energy Dice payments lock the character and remember their request.
-- The ledger is private; only owner/DM-authorized functions may access it.
alter table public.characters add column if not exists psionic_energy_revision bigint not null default 0;
create or replace function public.refresh_psionic_energy_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 if (new.class_resources->'psionic-energy-dice',new.class_resources->'psionic-restoration',new.feature_uses->'Psionic Restoration',new.feature_uses->'Telepathic Connection',new.feature_uses->'Free Misty Step (Teleportation)') is distinct from
    (old.class_resources->'psionic-energy-dice',old.class_resources->'psionic-restoration',old.feature_uses->'Psionic Restoration',old.feature_uses->'Telepathic Connection',old.feature_uses->'Free Misty Step (Teleportation)') then
  new.psionic_energy_revision:=old.psionic_energy_revision+1;
 else new.psionic_energy_revision:=old.psionic_energy_revision;
 end if;
 return new;
end;
$$;
revoke all on function public.refresh_psionic_energy_revision() from public,anon,authenticated;
drop trigger if exists refresh_psionic_energy_revision on public.characters;
create trigger refresh_psionic_energy_revision before update on public.characters for each row execute function public.refresh_psionic_energy_revision();

create table if not exists public.psionic_energy_uses(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists psionic_energy_character_idx on public.psionic_energy_uses(character_id);
alter table public.psionic_energy_uses enable row level security;
revoke all on public.psionic_energy_uses from public,anon,authenticated;

create or replace function public.settle_psionic_energy(
 p_character_id uuid,p_request_id uuid,p_operation text,p_count integer,p_rolls integer[],p_source_feature text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior public.psionic_energy_uses; payload jsonb;
 connection_uses integer; maximum integer; sides integer; remaining integer; pool jsonb; resources jsonb; uses jsonb; replay boolean:=false;
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null then raise exception 'A resource request identifier is required'; end if;
 payload:=jsonb_build_object('operation',p_operation,'count',p_count,'rolls',p_rolls,'sourceFeature',p_source_feature);
 select * into prior from public.psionic_energy_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from p_character_id or prior.request is distinct from payload then
   raise exception 'Resource request does not match its saved use';
  end if;
  replay:=true;
 else
  if c.class_name is distinct from 'Psion' or c.level is null or c.level not between 1 and 20
   or (coalesce(c.secondary_class,'')<>'' and (coalesce(c.secondary_level,0)<0 or c.level+coalesce(c.secondary_level,0)>20)) then
   raise exception 'Requires a valid Psion level';
  end if;
  maximum:=case when c.level>=17 then 12 when c.level>=13 then 10 when c.level>=9 then 8 when c.level>=5 then 6 else 4 end;
  sides:=case when c.level>=17 then 12 when c.level>=11 then 10 when c.level>=5 then 8 else 6 end;
  resources:=coalesce(c.class_resources,'{}'::jsonb);uses:=coalesce(c.feature_uses,'{}'::jsonb);
  if jsonb_typeof(resources)<>'object' or jsonb_typeof(uses)<>'object' then raise exception 'Check Psion resources'; end if;
  pool:=resources->'psionic-energy-dice';
  if pool is null then remaining:=maximum;
  elsif jsonb_typeof(pool)<>'number' or (pool::text)::numeric<>trunc((pool::text)::numeric)
   or (pool::text)::numeric not between 0 and maximum then raise exception 'Check Psionic Energy Dice';
  else remaining:=(pool::text)::integer;
  end if;
  if p_source_feature is null or length(trim(p_source_feature)) not between 1 and 120 then raise exception 'Invalid Psion feature'; end if;
  if p_operation='spend' then
   if p_count is null or p_count not between 1 and maximum or p_rolls is null
    or (cardinality(p_rolls)<>0 and (array_ndims(p_rolls)<>1 or cardinality(p_rolls)<>p_count))
    or exists(select 1 from unnest(p_rolls) die where die is null or die not between 1 and sides)
   then raise exception 'Invalid Energy Dice payment'; end if;
   if remaining<p_count then raise exception 'Not enough Psionic Energy Dice'; end if;
   remaining:=remaining-p_count;
  elsif p_operation='recover-die' then
   if p_count is distinct from 1 or p_rolls is null or cardinality(p_rolls)<>0
    or p_source_feature is distinct from 'Manual Energy Die recovery' then raise exception 'Invalid manual recovery'; end if;
   if remaining>=maximum then raise exception 'Psionic Energy Dice are already full'; end if;
   remaining:=remaining+1;
  elsif p_operation in('refresh-misty-step','use-misty-step','recover-misty-step') then
   if c.subclass is distinct from 'Psi Warper' or c.level<3 then raise exception 'Requires Psi Warper level 3'; end if;
   if p_source_feature is distinct from 'Free Misty Step (Teleportation)' or p_rolls is null or cardinality(p_rolls)<>0
    or p_count is distinct from (case when p_operation='refresh-misty-step' then 1 else 0 end)
   then raise exception 'Invalid teleportation use'; end if;
   if uses ? 'Free Misty Step (Teleportation)' and (jsonb_typeof(uses->'Free Misty Step (Teleportation)')<>'number'
    or (uses->>'Free Misty Step (Teleportation)')::numeric not in(0,1)) then raise exception 'Check teleportation uses'; end if;
   if p_operation in('refresh-misty-step','recover-misty-step') then
    if coalesce((uses->>'Free Misty Step (Teleportation)')::integer,0)<>1 then raise exception 'Teleportation is already available'; end if;
    if remaining<p_count then raise exception 'Not enough Psionic Energy Dice'; end if;
    remaining:=remaining-p_count;uses:=jsonb_set(uses,'{Free Misty Step (Teleportation)}','0'::jsonb);
   else
    if coalesce((uses->>'Free Misty Step (Teleportation)')::integer,0)<>0 then raise exception 'Teleportation is already used'; end if;
    uses:=jsonb_set(uses,'{Free Misty Step (Teleportation)}','1'::jsonb);
   end if;
  elsif p_operation='connection' then
   if p_source_feature is distinct from 'Telepathic Connection' or p_count is null or p_count not in(0,1)
    or p_rolls is null or cardinality(p_rolls)<>1 or array_ndims(p_rolls)<>1
    or exists(select 1 from unnest(p_rolls) die where die is null or die not between 1 and sides)
   then raise exception 'Invalid Telepathic Connection request'; end if;
   if uses ? 'Telepathic Connection' and (jsonb_typeof(uses->'Telepathic Connection')<>'number'
    or (uses->>'Telepathic Connection')::numeric not between 0 and 2147483646
    or (uses->>'Telepathic Connection')::numeric<>trunc((uses->>'Telepathic Connection')::numeric))
   then raise exception 'Check Telepathic Connection uses'; end if;
   connection_uses:=coalesce((uses->>'Telepathic Connection')::integer,0);
   if p_count<>(case when connection_uses=0 then 0 else 1 end) then
    raise exception 'Telepathic Connection free use changed; choose the power again';
   end if;
   -- Even a free extension rolls an available Energy Die (without expending it).
   if remaining<1 then raise exception 'Not enough Psionic Energy Dice'; end if;
   remaining:=remaining-p_count;
   uses:=jsonb_set(uses,'{Telepathic Connection}',to_jsonb(connection_uses+1));
  elsif p_operation='restore' then
   if c.level<5 then raise exception 'Psionic Restoration requires Psion level 5'; end if;
   if p_count is distinct from 0 or p_rolls is null or cardinality(p_rolls)<>0
    or p_source_feature is distinct from 'Psionic Restoration' then raise exception 'Invalid Restoration request'; end if;
   if (resources ? 'psionic-restoration' and (jsonb_typeof(resources->'psionic-restoration')<>'number'
     or (resources->>'psionic-restoration')::numeric not in(0,1)))
    or (uses ? 'Psionic Restoration' and (jsonb_typeof(uses->'Psionic Restoration')<>'number'
     or (uses->>'Psionic Restoration')::numeric<0
     or (uses->>'Psionic Restoration')::numeric<>trunc((uses->>'Psionic Restoration')::numeric)))
   then raise exception 'Check Psionic Restoration uses'; end if;
   if resources->'psionic-restoration'='0'::jsonb or coalesce((uses->>'Psionic Restoration')::numeric,0)>0 then
    raise exception 'Psionic Restoration already used until Long Rest';
   end if;
   if remaining=maximum then raise exception 'Psionic Energy Dice are already full'; end if;
   remaining:=maximum;
   resources:=jsonb_set(resources,'{psionic-restoration}','0'::jsonb);
   uses:=jsonb_set(uses,'{Psionic Restoration}','1'::jsonb);
  else raise exception 'Invalid Energy Dice operation';
  end if;
  insert into public.psionic_energy_uses(request_id,character_id,request) values(p_request_id,p_character_id,payload);
  update public.characters set class_resources=jsonb_set(resources,'{psionic-energy-dice}',to_jsonb(remaining)),feature_uses=uses
   where id=p_character_id returning * into c;
  insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,individual_results,total,notes)
  values(c.campaign_id,c.id,c.name,'roll',case when p_operation in('spend','connection') then p_source_feature||' (Energy Dice cost)' else p_source_feature end,p_rolls,(select coalesce(sum(d),0) from unnest(p_rolls) d),
   case when p_operation='recover-die' then 'Manually restored one Energy Die. No feature effect applied.'
   when p_operation='recover-misty-step' then 'Manually restored the teleportation use. No Energy Dice spent or teleportation performed.'
   when p_operation='refresh-misty-step' then 'Spent one Energy Die to restore the teleportation use. No teleportation performed.'
   when p_operation='use-misty-step' then 'Marked the free teleportation use as spent. Resolve Misty Step at the table.'
   when p_operation='restore' then 'Completed 1-minute meditation; all Energy Dice restored. Psionic Restoration used until Long Rest.'
   else 'Spent '||p_count||' Psionic Energy Dice. Base rolls saved for recovery; resolve the feature separately without spending again.' end);
 end if;
 return jsonb_build_object('requestId',p_request_id,'remaining',c.class_resources->'psionic-energy-dice',
  'restorationResource',c.class_resources->'psionic-restoration','restorationUsed',c.feature_uses->'Psionic Restoration',
  'mistyStepUsed',c.feature_uses->'Free Misty Step (Teleportation)','connectionUsed',c.feature_uses->'Telepathic Connection','energyRevision',c.psionic_energy_revision,'rolls',p_rolls,'replayed',replay);
end;
$$;
revoke all on function public.settle_psionic_energy(uuid,uuid,text,integer,integer[],text) from public,anon;
grant execute on function public.settle_psionic_energy(uuid,uuid,text,integer,integer[],text) to authenticated;

-- Ordinary sheet edits preserve transaction-owned Psion keys under the same
-- row lock. SECURITY INVOKER keeps the existing character UPDATE RLS boundary.
-- The frontend will adopt this only after all intentional resource edits have
-- explicit transaction paths; do not silently route legacy cost writes here.
create or replace function public.patch_character_preserving_psion(p_character_id uuid,p_updates jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.characters; patch jsonb:=p_updates; column_list text; select_list text;
 field text; protected_key text; incoming jsonb; existing jsonb; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to update this character'; end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Character is unavailable'; end if;
 if patch is null or jsonb_typeof(patch)<>'object' then raise exception 'Invalid character patch'; end if;
 if exists(select 1 from jsonb_object_keys(patch) key where key in('id','user_id','psionic_energy_revision','psionic_hit_dice_revision')
  or not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.characters'::regclass and a.attname=key and a.attnum>0 and not a.attisdropped))
 then raise exception 'Unsupported character field'; end if;
 if c.class_name='Psion' then
  foreach field in array array['class_resources','feature_uses'] loop
   if not(patch ? field) then continue; end if;
   incoming:=patch->field;
   if incoming='null'::jsonb then incoming:='{}'::jsonb; end if;
   if jsonb_typeof(incoming)<>'object' then raise exception 'Invalid resource patch'; end if;
   existing:=coalesce(to_jsonb(c)->field,'{}'::jsonb);
   foreach protected_key in array case when field='class_resources' then array['psionic-energy-dice','psionic-restoration'] else array['Psionic Restoration','Telepathic Connection','Free Misty Step (Teleportation)'] end loop
    if existing ? protected_key then incoming:=jsonb_set(incoming,array[protected_key],existing->protected_key);
    else incoming:=incoming-protected_key; end if;
   end loop;
   patch:=jsonb_set(patch,array[field],incoming);
  end loop;
 end if;
 select string_agg(format('%I',key),',' order by key),string_agg(format('u.%I',key),',' order by key)
 into column_list,select_list from jsonb_object_keys(patch) key;
 if column_list is null then return to_jsonb(c); end if;
 execute 'update public.characters set ('||column_list||')=(select '||select_list||' from jsonb_populate_record(null::public.characters,$1) u) where id=$2 returning to_jsonb(characters)'
 into result using patch,p_character_id;
 if result is null then raise exception 'Character could not be updated'; end if;
 return result;
end;
$$;
revoke all on function public.patch_character_preserving_psion(uuid,jsonb) from public,anon;
grant execute on function public.patch_character_preserving_psion(uuid,jsonb) to authenticated;

-- A completed rest saves its entire captured patch atomically. Expected values
-- reject concurrent sheet edits; a lost response replays the original request,
-- never recharges items or restores dice a second time.
create or replace function public.complete_psionic_rest(
 p_character_id uuid,p_request_id uuid,p_rest_kind text,p_expected jsonb,p_updates jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior public.psionic_energy_uses; payload jsonb; snapshot jsonb;
 patch jsonb:=p_updates; resources jsonb; uses jsonb; maximum integer; remaining integer;
 allowed text[]; key text; columns_sql text; values_sql text;
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null then raise exception 'A rest request identifier is required'; end if;
 payload:=jsonb_build_object('operation','rest','kind',p_rest_kind,'expected',p_expected,'updates',p_updates);
 select * into prior from public.psionic_energy_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from p_character_id or prior.request is distinct from payload then raise exception 'Rest request does not match its saved use'; end if;
  return jsonb_build_object('requestId',p_request_id,'character',to_jsonb(c),'replayed',true);
 end if;
 if c.class_name is distinct from 'Psion' or c.level is null or c.level not between 1 and 20
  or (coalesce(c.secondary_class,'')<>'' and (coalesce(c.secondary_level,0)<0 or c.level+coalesce(c.secondary_level,0)>20)) then raise exception 'Requires a valid Psion level'; end if;
 if p_rest_kind is null or p_rest_kind not in('short','long') then raise exception 'Invalid rest kind'; end if;
 if patch is null or jsonb_typeof(patch)<>'object' or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid rest snapshot'; end if;
 allowed:=case when p_rest_kind='short' then array['spell_slots','class_resources','feature_uses'] else
  array['current_hp','temp_hp','spell_slots','active_conditions','exhaustion_level','death_saves_successes','death_saves_failures','hit_dice_spent','class_resources','feature_uses','inventory','concentration_spell','concentration_rounds_remaining','concentration_slot_level'] end;
 if not(patch ?& allowed) or exists(select 1 from jsonb_object_keys(patch) k where not(k=any(allowed))) then raise exception 'Invalid rest fields'; end if;
 if not(p_expected ?& (allowed||array['class_name','level','secondary_class','secondary_level','max_hp','long_rest_clears_combat_conditions'])) then raise exception 'Incomplete rest snapshot'; end if;
 snapshot:=to_jsonb(c);
 for key in select jsonb_object_keys(p_expected) loop
  if not(snapshot ? key) or snapshot->key is distinct from p_expected->key then raise exception 'Character changed before the rest was saved. Reload and review the rest.'; end if;
 end loop;
 if jsonb_typeof(patch->'class_resources')<>'object' or jsonb_typeof(patch->'feature_uses')<>'object' then raise exception 'Invalid rest resources'; end if;
 maximum:=case when c.level>=17 then 12 when c.level>=13 then 10 when c.level>=9 then 8 when c.level>=5 then 6 else 4 end;
 resources:=patch->'class_resources';uses:=patch->'feature_uses';
 if p_rest_kind='short' then
  if c.class_resources ? 'psionic-energy-dice' then
   if jsonb_typeof(c.class_resources->'psionic-energy-dice')<>'number'
    or (c.class_resources->>'psionic-energy-dice')::numeric<>trunc((c.class_resources->>'psionic-energy-dice')::numeric)
    or (c.class_resources->>'psionic-energy-dice')::numeric not between 0 and maximum then raise exception 'Check Psionic Energy Dice before a Short Rest'; end if;
   remaining:=(c.class_resources->>'psionic-energy-dice')::integer;
  else remaining:=maximum; end if;
  remaining:=least(maximum,remaining+1);
  if c.class_resources ? 'psionic-restoration' then resources:=jsonb_set(resources,'{psionic-restoration}',c.class_resources->'psionic-restoration');else resources:=resources-'psionic-restoration';end if;
  foreach key in array array['Psionic Restoration','Telepathic Connection','Free Misty Step (Teleportation)'] loop
   if c.feature_uses ? key then uses:=jsonb_set(uses,array[key],c.feature_uses->key);else uses:=uses-key;end if;
  end loop;
 else
  remaining:=maximum;
  if c.level>=5 then resources:=jsonb_set(resources,'{psionic-restoration}','1'::jsonb);else resources:=resources-'psionic-restoration';end if;
  uses:='{}'::jsonb;
  patch:=patch||jsonb_build_object('current_hp',c.max_hp,'temp_hp',0,'hit_dice_spent',0,
   'exhaustion_level',greatest(0,coalesce(c.exhaustion_level,0)-1),'death_saves_successes',0,'death_saves_failures',0,
   'concentration_spell','','concentration_rounds_remaining',null,'concentration_slot_level',null);
 end if;
 patch:=patch||jsonb_build_object('class_resources',jsonb_set(resources,'{psionic-energy-dice}',to_jsonb(remaining)),'feature_uses',uses);
 select string_agg(format('%I',k),',' order by k),string_agg(format('u.%I',k),',' order by k)
 into columns_sql,values_sql from jsonb_object_keys(patch) k;
 insert into public.psionic_energy_uses(request_id,character_id,request) values(p_request_id,p_character_id,payload);
 execute 'update public.characters set ('||columns_sql||')=(select '||values_sql||' from jsonb_populate_record(null::public.characters,$1) u) where id=$2 returning *'
 into c using patch,p_character_id;
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,notes)
 values(c.campaign_id,c.id,c.name,'roll',case when p_rest_kind='long' then 'Long Rest' else 'Short Rest' end,
  'Rest recovery saved. Energy Dice remaining: '||remaining||'. Reconfirming this request does not repeat recovery.');
 return jsonb_build_object('requestId',p_request_id,'character',to_jsonb(c),'replayed',false);
end;
$$;
revoke all on function public.complete_psionic_rest(uuid,uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.complete_psionic_rest(uuid,uuid,text,jsonb,jsonb) to authenticated;
