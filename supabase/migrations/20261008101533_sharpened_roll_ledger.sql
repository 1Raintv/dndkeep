-- v2.829: a Sharpened activation owns its paid enhancements and final number.
-- This records rolls only; duration, damage replacement and resistance bypass
-- are connected separately. Recovery must never restart the activation clock.
create table if not exists dndkeep_private.sharpened_rolls(
 request_id uuid primary key references dndkeep_private.psionic_discipline_uses(request_id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 result jsonb,
 finalized_at timestamptz
);
create index if not exists sharpened_rolls_character_idx on dndkeep_private.sharpened_rolls(character_id);
alter table dndkeep_private.sharpened_rolls enable row level security;
revoke all on dndkeep_private.sharpened_rolls from public,anon,authenticated;
create table if not exists dndkeep_private.sharpened_enhancements(
 request_id uuid primary key,
 activation_id uuid not null references dndkeep_private.sharpened_rolls(request_id) on delete cascade,
 kind text not null check(kind in('enkindled','surge')),
 request jsonb not null,
 unique(activation_id,kind)
);
alter table dndkeep_private.sharpened_enhancements enable row level security;
revoke all on dndkeep_private.sharpened_enhancements from public,anon,authenticated;

create or replace function dndkeep_private.enhance_sharpened_roll(
 p_character_id uuid,p_activation_id uuid,p_request_id uuid,p_kind text,p_extra_rolls integer[],p_hit_die integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; activation dndkeep_private.psionic_discipline_uses;
 prior dndkeep_private.sharpened_enhancements; req jsonb; rolls integer[]; extra integer[];
 receipt jsonb; linked uuid; context jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null or p_activation_id is null or p_request_id=p_activation_id
  or p_kind is null or p_kind not in('enkindled','surge') then raise exception 'Invalid Sharpened enhancement';end if;
 select * into activation from dndkeep_private.psionic_discipline_uses where request_id=p_activation_id;
 if not found or activation.character_id<>c.id or activation.discipline<>'sharpened-mind' then raise exception 'Sharpened activation is unavailable';end if;
 req:=jsonb_build_object('characterId',c.id,'activationId',p_activation_id,'kind',p_kind,'extraRolls',p_extra_rolls,'hitDie',p_hit_die);
 select * into prior from dndkeep_private.sharpened_enhancements where request_id=p_request_id;
 if found then
  if prior.activation_id<>p_activation_id or prior.request<>req then raise exception 'Saved enhancement changed';end if;
 else
  -- Never attach an old generic payment to a new activation, even when its
  -- rolled values happen to match. Payment and association commit together.
  if exists(select 1 from public.psionic_feature_uses where request_id=p_request_id)
   or exists(select 1 from public.psionic_surge_uses where request_id=p_request_id)
   or exists(select 1 from dndkeep_private.psionic_discipline_uses where request_id=p_request_id)
   or exists(select 1 from public.psionic_energy_uses where request_id=p_request_id)
   then raise exception 'Enhancement identity already used';end if;
  insert into dndkeep_private.sharpened_rolls(request_id,character_id) values(p_activation_id,c.id) on conflict do nothing;
  if exists(select 1 from dndkeep_private.sharpened_rolls where request_id=p_activation_id and result is not null) then raise exception 'Sharpened roll is already finalized';end if;
  context:=public.psionic_turn_context_internal(c.id);
  if context<>activation.turn_context then raise exception 'Activation turn changed; no enhancement was spent';end if;
  if exists(select 1 from dndkeep_private.sharpened_enhancements where activation_id=p_activation_id and kind=p_kind) then raise exception 'This enhancement is already attached';end if;
  if p_kind='enkindled' and exists(select 1 from dndkeep_private.sharpened_enhancements where activation_id=p_activation_id and kind='surge') then raise exception 'Choose extra dice before Surge';end if;
 end if;
 select array_agg(n::integer order by ord) into rolls from jsonb_array_elements_text(activation.request->'rolls') with ordinality a(n,ord);
 if p_kind='enkindled' then
  if p_hit_die is not null then raise exception 'Enkindled does not select a Hit Die pool';end if;
  receipt:=public.spend_enkindled_life_force(c.id,p_request_id,activation.turn_context,cardinality(p_extra_rolls),rolls,p_extra_rolls,'Sharpened Mind');
 else
  if p_extra_rolls is not null or p_hit_die is null then raise exception 'Choose a Surge Hit Die pool';end if;
  select request_id into linked from dndkeep_private.sharpened_enhancements where activation_id=p_activation_id and kind='enkindled';
  if linked is not null then
   select extra_rolls into extra from public.psionic_feature_uses where request_id=linked;
   rolls:=rolls||extra;
  end if;
  receipt:=public.spend_psionic_surge_from_pool(c.id,p_request_id,rolls,'Sharpened Mind',p_hit_die);
 end if;
 if prior.request_id is null then
  insert into dndkeep_private.sharpened_enhancements(request_id,activation_id,kind,request) values(p_request_id,p_activation_id,p_kind,req);
 end if;
 return receipt||jsonb_build_object('activationId',p_activation_id,'kind',p_kind);
end; $$;
revoke all on function dndkeep_private.enhance_sharpened_roll(uuid,uuid,uuid,text,integer[],integer) from public,anon;
grant execute on function dndkeep_private.enhance_sharpened_roll(uuid,uuid,uuid,text,integer[],integer) to authenticated;
create or replace function public.enhance_sharpened_roll(
 p_character_id uuid,p_activation_id uuid,p_request_id uuid,p_kind text,p_extra_rolls integer[],p_hit_die integer
) returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.enhance_sharpened_roll(p_character_id,p_activation_id,p_request_id,p_kind,p_extra_rolls,p_hit_die);
$$;
revoke all on function public.enhance_sharpened_roll(uuid,uuid,uuid,text,integer[],integer) from public,anon;
grant execute on function public.enhance_sharpened_roll(uuid,uuid,uuid,text,integer[],integer) to authenticated;

create or replace function dndkeep_private.finalize_sharpened_roll(p_character_id uuid,p_activation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; activation dndkeep_private.psionic_discipline_uses;
 saved jsonb; original integer[]; adjusted integer[]; linked uuid; extra integer[];
begin
 c:=public.psionic_character_for_update(p_character_id);
 select * into activation from dndkeep_private.psionic_discipline_uses where request_id=p_activation_id;
 if not found or activation.character_id<>c.id or activation.discipline<>'sharpened-mind' then raise exception 'Sharpened activation is unavailable';end if;
 select result into saved from dndkeep_private.sharpened_rolls where request_id=p_activation_id;
 if saved is not null then return saved||jsonb_build_object('replayed',true);end if;
 select array_agg(n::integer order by ord) into original from jsonb_array_elements_text(activation.request->'rolls') with ordinality a(n,ord);
 select request_id into linked from dndkeep_private.sharpened_enhancements where activation_id=p_activation_id and kind='enkindled';
 if linked is not null then
  select extra_rolls into extra from public.psionic_feature_uses where request_id=linked;
  original:=original||extra;
 end if;
 adjusted:=original;
 select request_id into linked from dndkeep_private.sharpened_enhancements where activation_id=p_activation_id and kind='surge';
 if linked is not null then select adjusted_rolls into adjusted from public.psionic_surge_uses where request_id=linked;end if;
 saved:=jsonb_build_object('requestId',p_activation_id,'characterId',c.id,'originalRolls',original,'rolls',adjusted,
  'total',(select sum(n) from unnest(adjusted) n),'activatedAt',activation.created_at,'turn',activation.turn_context);
 insert into dndkeep_private.sharpened_rolls(request_id,character_id,result,finalized_at) values(p_activation_id,c.id,saved,now())
 on conflict(request_id) do update set result=excluded.result,finalized_at=excluded.finalized_at;
 return saved||jsonb_build_object('replayed',false);
end; $$;
revoke all on function dndkeep_private.finalize_sharpened_roll(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.finalize_sharpened_roll(uuid,uuid) to authenticated;
create or replace function public.finalize_sharpened_roll(p_character_id uuid,p_activation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.finalize_sharpened_roll(p_character_id,p_activation_id);
$$;
revoke all on function public.finalize_sharpened_roll(uuid,uuid) from public,anon;
grant execute on function public.finalize_sharpened_roll(uuid,uuid) to authenticated;
