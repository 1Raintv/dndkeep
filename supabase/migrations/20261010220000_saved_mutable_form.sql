-- v2.869: private Mutable Form lifecycle. No public activation until effect
-- application, effective INT, history, enhancement UI and recovery are wired.
create table if not exists dndkeep_private.mutable_form_declarations (
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 turn_context jsonb not null,
 action_receipt jsonb not null,
 energy_receipt jsonb not null,
 source_feature text not null default 'Mutable Form',
 base_roll integer not null,
 psion_level integer not null,
 ability_context jsonb not null,
 duration_seconds integer not null check(duration_seconds in(60,600)),
 start_seconds bigint not null,
 elapsed_adjustment bigint not null default 0,
 ended_reason text check(ended_reason in('rest','replaced')),
 roll_result jsonb,
 created_at timestamptz not null default now()
);
create index if not exists mutable_form_character_idx on dndkeep_private.mutable_form_declarations(character_id);
create table if not exists dndkeep_private.mutable_form_enhancements (
 request_id uuid primary key,
 declaration_id uuid not null references dndkeep_private.mutable_form_declarations(request_id) on delete cascade,
 kind text not null check(kind in('enkindled','surge')),
 request jsonb not null,
 unique(declaration_id,kind)
);
alter table dndkeep_private.mutable_form_declarations enable row level security;
alter table dndkeep_private.mutable_form_enhancements enable row level security;
revoke all on dndkeep_private.mutable_form_declarations,dndkeep_private.mutable_form_enhancements from public,anon,authenticated;

create or replace function dndkeep_private.begin_mutable_form(p_character uuid,p_request uuid,p_turn text,p_roll integer,p_flesh boolean,p_improvement jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.mutable_form_declarations; req jsonb; lvl integer; sides integer;
 action jsonb; payment jsonb; clock_seconds bigint; context jsonb; choice text; cost integer;
begin
 c:=public.psionic_character_for_update(p_character);
 if p_request is null or p_turn is null or p_roll is null or p_flesh is null or p_improvement is null then raise exception 'Invalid Mutable Form declaration';end if;
 req:=jsonb_build_object('turnId',p_turn,'roll',p_roll,'fleshWeaver',p_flesh,'improvement',p_improvement);
 select * into d from dndkeep_private.mutable_form_declarations where request_id=p_request;
 if found then
  if d.character_id<>c.id or d.request<>req then raise exception 'Mutable Form declaration identity changed';end if;
  return to_jsonb(d)||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from public.psionic_energy_uses where request_id=p_request)
  or exists(select 1 from public.psionic_feature_uses where request_id=p_request)
  or exists(select 1 from public.psionic_surge_uses where request_id=p_request)
  or exists(select 1 from dndkeep_private.action_claims where request_id=p_request)
  then raise exception 'Mutable Form identity already used';end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if lvl<3 or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Metamorph' then raise exception 'Mutable Form requires Metamorph level 3';end if;
 if p_flesh and lvl<6 then raise exception 'Flesh Weaver requires Psion level 6';end if;
 if lvl<10 then
  if p_improvement<>'null'::jsonb then raise exception 'Improved Mutable Form requires Psion level 10';end if;
 else
  if jsonb_typeof(p_improvement)<>'object' then raise exception 'Choose an Improved Mutable Form benefit';end if;
  choice:=p_improvement->>'kind';
  if choice='stony' then
   if p_improvement-array['kind','resistance']<>'{}'::jsonb or coalesce(p_improvement->>'resistance','') not in('Acid','Bludgeoning','Cold','Fire','Lightning','Piercing','Poison','Slashing','Thunder') then raise exception 'Choose a valid Stony Epidermis resistance';end if;
  elsif choice in('stride','flexibility') then
   if p_improvement-array['kind']<>'{}'::jsonb then raise exception 'Unexpected Mutable Form choice fields';end if;
  else raise exception 'Choose an Improved Mutable Form benefit';end if;
 end if;
 sides:=case when lvl>=17 then 12 when lvl>=11 then 10 when lvl>=5 then 8 else 6 end;
 if p_roll not between 1 and sides then raise exception 'Invalid Mutable Form base roll';end if;
 select elapsed_seconds into clock_seconds from dndkeep_private.psionic_duration_clocks where character_id=c.id;
 if clock_seconds is null then raise exception 'Mutable Form game clock unavailable';end if;
 context:=public.psionic_turn_context_internal(c.id);
 action:=dndkeep_private.claim_action(c.id,p_request,jsonb_build_object('turnId',p_turn,'grantId','normal:bonusAction','kind','bonusAction','purpose','feature','sourceId','Mutable Form'));
 cost:=case when p_flesh then 2 else 1 end;
 -- Flesh Weaver is a second payment, NOT a second rolled die. Original face is
 -- bound in this declaration; the generic ledger receives no fabricated rolls.
 payment:=public.settle_psionic_energy(c.id,p_request,'spend',cost,'{}'::integer[],'Mutable Form');
 update dndkeep_private.mutable_form_declarations set ended_reason='replaced' where character_id=c.id and ended_reason is null;
 insert into dndkeep_private.mutable_form_declarations(request_id,character_id,request,turn_context,action_receipt,energy_receipt,base_roll,psion_level,ability_context,duration_seconds,start_seconds)
 values(p_request,c.id,req,context,action,payment,p_roll,lvl,jsonb_build_object('intelligence',c.intelligence,'inventory',c.inventory),case when lvl>=10 then 600 else 60 end,clock_seconds) returning * into d;
 return to_jsonb(d)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.begin_mutable_form(uuid,uuid,text,integer,boolean,jsonb) from public,anon,authenticated;

create or replace function dndkeep_private.enhance_mutable_form(p_character uuid,p_declaration uuid,p_request uuid,p_kind text,p_extra integer[],p_hit_die integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.mutable_form_declarations; prior dndkeep_private.mutable_form_enhancements;
 req jsonb; rolls integer[]; extra integer[]; payment jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.mutable_form_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Mutable Form declaration unavailable';end if;
 if p_request is null or p_request=p_declaration or p_kind is null or p_kind not in('enkindled','surge') then raise exception 'Invalid Mutable Form enhancement';end if;
 req:=jsonb_build_object('declarationId',p_declaration,'kind',p_kind,'extraRolls',p_extra,'hitDie',p_hit_die);
 select * into prior from dndkeep_private.mutable_form_enhancements where request_id=p_request;
 if found then
  if prior.declaration_id<>p_declaration or prior.request<>req then raise exception 'Mutable Form enhancement identity changed';end if;
 else
  if not exists(select 1 from dndkeep_private.psionic_duration_clocks where character_id=c.id and elapsed_seconds>=d.start_seconds and elapsed_seconds-d.start_seconds<d.duration_seconds-d.elapsed_adjustment) then raise exception 'Mutable Form duration ended or clock changed';end if;
  if d.roll_result is not null or d.ended_reason is not null then raise exception 'Mutable Form roll is already closed';end if;
  if public.psionic_turn_context_internal(c.id)<>d.turn_context then raise exception 'Mutable Form turn changed; no enhancement spent';end if;
  if public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level)<>d.psion_level then raise exception 'Psion level changed; review the saved roll';end if;
  if exists(select 1 from dndkeep_private.mutable_form_enhancements where declaration_id=p_declaration and kind=p_kind) then raise exception 'Mutable Form already has this enhancement';end if;
  if p_kind='enkindled' and exists(select 1 from dndkeep_private.mutable_form_enhancements where declaration_id=p_declaration and kind='surge') then raise exception 'Choose extra dice before Surge';end if;
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
  select f.extra_rolls into extra from dndkeep_private.mutable_form_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
   where e.declaration_id=p_declaration and e.kind='enkindled';
  rolls:=rolls||coalesce(extra,'{}'::integer[]);
  payment:=public.spend_psionic_surge_from_pool(c.id,p_request,rolls,d.source_feature,p_hit_die);
 end if;
 if prior.request_id is null then insert into dndkeep_private.mutable_form_enhancements values(p_request,p_declaration,p_kind,req);end if;
 return payment||jsonb_build_object('declarationId',p_declaration,'kind',p_kind);
end;$$;
revoke all on function dndkeep_private.enhance_mutable_form(uuid,uuid,uuid,text,integer[],integer) from public,anon,authenticated;

create or replace function dndkeep_private.finalize_mutable_form_roll(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.mutable_form_declarations; extra integer[]; adjusted integer[]; original integer[]; saved jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.mutable_form_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Mutable Form declaration unavailable';end if;
 if d.roll_result is not null then return d.roll_result;end if;
 select f.extra_rolls into extra from dndkeep_private.mutable_form_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
  where e.declaration_id=p_declaration and e.kind='enkindled';
 original:=array[d.base_roll]||coalesce(extra,'{}'::integer[]);
 select s.adjusted_rolls into adjusted from dndkeep_private.mutable_form_enhancements e join public.psionic_surge_uses s on s.request_id=e.request_id
  where e.declaration_id=p_declaration and e.kind='surge';
 saved:=jsonb_build_object('declarationId',d.request_id,'originalRolls',original,'enkindledRolls',coalesce(extra,'{}'::integer[]),
  'usedSurge',adjusted is not null,'rolls',coalesce(adjusted,original),'total',coalesce((select sum(n) from unnest(coalesce(adjusted,original)) n),0));
 update dndkeep_private.mutable_form_declarations set roll_result=saved where request_id=d.request_id;
 return saved;
end;$$;
revoke all on function dndkeep_private.finalize_mutable_form_roll(uuid,uuid) from public,anon,authenticated;


-- A rest ends either duration; Restoration consumes precisely one minute.
create or replace function dndkeep_private.observe_mutable_form_recovery()
returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.request->>'operation'='rest' then
  update dndkeep_private.mutable_form_declarations set ended_reason='rest' where character_id=new.character_id and ended_reason is null;
 elsif new.request->>'operation'='restore' then
  update dndkeep_private.mutable_form_declarations set elapsed_adjustment=least(duration_seconds,elapsed_adjustment+60) where character_id=new.character_id and ended_reason is null;
 end if;return new;
end;$$;
revoke all on function dndkeep_private.observe_mutable_form_recovery() from public,anon,authenticated;
drop trigger if exists observe_mutable_form_recovery on public.psionic_energy_uses;
create trigger observe_mutable_form_recovery after insert on public.psionic_energy_uses for each row execute function dndkeep_private.observe_mutable_form_recovery();

create or replace function dndkeep_private.read_mutable_form(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.mutable_form_declarations; clock_seconds bigint; remaining bigint;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.mutable_form_declarations where request_id=p_declaration and character_id=c.id;
 if not found then return null;end if;
 select elapsed_seconds into clock_seconds from dndkeep_private.psionic_duration_clocks where character_id=c.id;
 remaining:=case when clock_seconds is null or clock_seconds<d.start_seconds then null when d.ended_reason is not null then 0 else greatest(0,d.duration_seconds-(clock_seconds-d.start_seconds)-d.elapsed_adjustment) end;
 return to_jsonb(d)||jsonb_build_object('remainingSeconds',remaining);
end;$$;
revoke all on function dndkeep_private.read_mutable_form(uuid,uuid) from public,anon,authenticated;
