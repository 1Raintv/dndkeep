-- v2.869: Connection declarations bind paid enhancements to one original roll.
-- Private lifecycle first; UI rollout uses the public dispatcher in a later step.
create table if not exists dndkeep_private.connection_declarations (
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 turn_context jsonb not null,
 action_receipt jsonb not null,
 energy_receipt jsonb not null,
 source_feature text not null default 'Telepathic Connection',
 base_roll integer not null,
 psion_level integer not null,
 base_range integer not null,
 start_seconds bigint not null,
 elapsed_adjustment bigint not null default 0,
 ended_by_rest boolean not null default false,
 roll_result jsonb,
 created_at timestamptz not null default now()
);
create index if not exists connection_character_idx on dndkeep_private.connection_declarations(character_id);
create table if not exists dndkeep_private.connection_enhancements (
 request_id uuid primary key,
 declaration_id uuid not null references dndkeep_private.connection_declarations(request_id) on delete cascade,
 kind text not null check(kind in('enkindled','surge')),
 request jsonb not null,
 unique(declaration_id,kind)
);
alter table dndkeep_private.connection_declarations enable row level security;
alter table dndkeep_private.connection_enhancements enable row level security;
revoke all on dndkeep_private.connection_declarations,dndkeep_private.connection_enhancements from public,anon,authenticated;

create or replace function dndkeep_private.begin_connection(p_character uuid,p_request uuid,p_turn text,p_roll integer,p_free boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.connection_declarations; req jsonb; lvl integer; sides integer;
 action jsonb; payment jsonb; clock_seconds bigint; context jsonb; base integer;
begin
 c:=public.psionic_character_for_update(p_character);
 if p_request is null or p_turn is null or p_roll is null or p_free is null then raise exception 'Invalid Connection declaration';end if;
 req:=jsonb_build_object('turnId',p_turn,'roll',p_roll,'free',p_free);
 select * into d from dndkeep_private.connection_declarations where request_id=p_request;
 if found then
  if d.character_id<>c.id or d.request<>req then raise exception 'Connection declaration identity changed';end if;
  return to_jsonb(d)||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from public.psionic_energy_uses where request_id=p_request)
  or exists(select 1 from public.psionic_feature_uses where request_id=p_request)
  or exists(select 1 from public.psionic_surge_uses where request_id=p_request)
  or exists(select 1 from dndkeep_private.action_claims where request_id=p_request)
  then raise exception 'Connection identity already used';end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if lvl<1 then raise exception 'Connection requires a valid Psion level';end if;
 sides:=case when lvl>=17 then 12 when lvl>=11 then 10 when lvl>=5 then 8 else 6 end;
 if p_roll not between 1 and sides then raise exception 'Invalid Connection base roll';end if;
 base:=case when lvl>=6 and (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end)='Telepath' then 60 else 30 end;
 select elapsed_seconds into clock_seconds from dndkeep_private.psionic_duration_clocks where character_id=c.id;
 if clock_seconds is null then raise exception 'Connection game clock unavailable';end if;
 context:=public.psionic_turn_context_internal(c.id);
 action:=dndkeep_private.claim_action(c.id,p_request,jsonb_build_object('turnId',p_turn,'grantId','normal:bonusAction','kind','bonusAction','purpose','feature','sourceId','Telepathic Connection'));
 payment:=public.settle_psionic_energy(c.id,p_request,'connection',case when p_free then 0 else 1 end,array[p_roll],'Telepathic Connection');
 insert into dndkeep_private.connection_declarations(request_id,character_id,request,turn_context,action_receipt,energy_receipt,base_roll,psion_level,base_range,start_seconds)
 values(p_request,c.id,req,context,action,payment,p_roll,lvl,base,clock_seconds) returning * into d;
 return to_jsonb(d)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.begin_connection(uuid,uuid,text,integer,boolean) from public,anon,authenticated;

create or replace function dndkeep_private.enhance_connection(p_character uuid,p_declaration uuid,p_request uuid,p_kind text,p_extra integer[],p_hit_die integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.connection_declarations; prior dndkeep_private.connection_enhancements;
 req jsonb; rolls integer[]; extra integer[]; payment jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.connection_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Connection declaration unavailable';end if;
 if p_request is null or p_request=p_declaration or p_kind is null or p_kind not in('enkindled','surge') then raise exception 'Invalid Connection enhancement';end if;
 req:=jsonb_build_object('declarationId',p_declaration,'kind',p_kind,'extraRolls',p_extra,'hitDie',p_hit_die);
 select * into prior from dndkeep_private.connection_enhancements where request_id=p_request;
 if found then
  if prior.declaration_id<>p_declaration or prior.request<>req then raise exception 'Connection enhancement identity changed';end if;
 else
  if not exists(select 1 from dndkeep_private.psionic_duration_clocks where character_id=c.id and elapsed_seconds>=d.start_seconds and elapsed_seconds-d.start_seconds<3600-d.elapsed_adjustment) then raise exception 'Connection duration ended or clock changed';end if;
  if d.roll_result is not null or d.ended_by_rest then raise exception 'Connection roll is already closed';end if;
  if public.psionic_turn_context_internal(c.id)<>d.turn_context then raise exception 'Connection turn changed; no enhancement spent';end if;
  if public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level)<>d.psion_level then raise exception 'Psion level changed; review the saved roll';end if;
  if exists(select 1 from dndkeep_private.connection_enhancements where declaration_id=p_declaration and kind=p_kind) then raise exception 'Connection already has this enhancement';end if;
  if p_kind='enkindled' and exists(select 1 from dndkeep_private.connection_enhancements where declaration_id=p_declaration and kind='surge') then raise exception 'Choose extra dice before Surge';end if;
  if exists(select 1 from dndkeep_private.psionic_discipline_uses where request_id=p_request)
   or exists(select 1 from public.psionic_feature_uses where request_id=p_request) or exists(select 1 from public.psionic_surge_uses where request_id=p_request)
   or exists(select 1 from public.psionic_energy_uses where request_id=p_request) or exists(select 1 from dndkeep_private.action_claims where request_id=p_request)
   then raise exception 'Enhancement payment identity is already used';end if;
 end if;
 rolls:=array[d.base_roll];
 if p_kind='enkindled' then
  if p_hit_die is not null then raise exception 'Enkindled does not select a Hit Die pool';end if;
  payment:=public.spend_enkindled_life_force(c.id,p_request,d.turn_context,cardinality(p_extra),rolls,p_extra,d.source_feature);
 else
  if p_extra is not null or p_hit_die is null then raise exception 'Select a Surge Hit Die pool';end if;
  select f.extra_rolls into extra from dndkeep_private.connection_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
   where e.declaration_id=p_declaration and e.kind='enkindled';
  rolls:=rolls||coalesce(extra,'{}'::integer[]);
  payment:=public.spend_psionic_surge_from_pool(c.id,p_request,rolls,d.source_feature,p_hit_die);
 end if;
 if prior.request_id is null then insert into dndkeep_private.connection_enhancements values(p_request,p_declaration,p_kind,req);end if;
 return payment||jsonb_build_object('declarationId',p_declaration,'kind',p_kind);
end;$$;
revoke all on function dndkeep_private.enhance_connection(uuid,uuid,uuid,text,integer[],integer) from public,anon,authenticated;

create or replace function dndkeep_private.finalize_connection_roll(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.connection_declarations; extra integer[]; adjusted integer[]; original integer[]; saved jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.connection_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Connection declaration unavailable';end if;
 if d.roll_result is not null then return d.roll_result;end if;
 select f.extra_rolls into extra from dndkeep_private.connection_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
  where e.declaration_id=p_declaration and e.kind='enkindled';
 original:=array[d.base_roll]||coalesce(extra,'{}'::integer[]);
 select s.adjusted_rolls into adjusted from dndkeep_private.connection_enhancements e join public.psionic_surge_uses s on s.request_id=e.request_id
  where e.declaration_id=p_declaration and e.kind='surge';
 saved:=jsonb_build_object('declarationId',d.request_id,'originalRolls',original,'enkindledRolls',coalesce(extra,'{}'::integer[]),
  'usedSurge',adjusted is not null,'rolls',coalesce(adjusted,original),'total',coalesce((select sum(n) from unnest(coalesce(adjusted,original)) n),0));
 update dndkeep_private.connection_declarations set roll_result=saved where request_id=d.request_id;
 return saved;
end;$$;
revoke all on function dndkeep_private.finalize_connection_roll(uuid,uuid) from public,anon,authenticated;


-- Restoration takes one minute, not the whole one-hour Connection. A completed
-- rest lasts at least the remaining hour under the supported rest model.
create or replace function dndkeep_private.observe_connection_recovery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.request->>'operation'='rest' then
  update dndkeep_private.connection_declarations set ended_by_rest=true where character_id=new.character_id and not ended_by_rest;
 elsif new.request->>'operation'='restore' then
  update dndkeep_private.connection_declarations set elapsed_adjustment=least(3600,elapsed_adjustment+60) where character_id=new.character_id and not ended_by_rest;
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.observe_connection_recovery() from public,anon,authenticated;
drop trigger if exists observe_connection_recovery on public.psionic_energy_uses;
create trigger observe_connection_recovery after insert on public.psionic_energy_uses for each row execute function dndkeep_private.observe_connection_recovery();

create or replace function dndkeep_private.read_connection(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.connection_declarations; clock_seconds bigint; remaining bigint;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.connection_declarations where request_id=p_declaration and character_id=c.id;
 if not found then return null;end if;
 select elapsed_seconds into clock_seconds from dndkeep_private.psionic_duration_clocks where character_id=c.id;
 remaining:=case when clock_seconds is null or clock_seconds<d.start_seconds then null when d.ended_by_rest then 0 else greatest(0,3600-(clock_seconds-d.start_seconds)-d.elapsed_adjustment) end;
 return to_jsonb(d)||jsonb_build_object('remainingSeconds',remaining);
end;$$;
revoke all on function dndkeep_private.read_connection(uuid,uuid) from public,anon,authenticated;
