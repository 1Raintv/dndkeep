-- Private complete Propel lifecycle. Public wrappers/UI will be added only
-- after target review, recovery and all action writers use the shared budget.
create table if not exists dndkeep_private.propel_declarations (
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 turn_context jsonb not null,
 action_receipt jsonb not null,
 source_feature text not null,
 mode text not null check(mode in('free','powered','technique')),
 movement text not null check(movement in('push','warp')),
 base_roll integer not null,
 psion_level integer not null,
 target jsonb not null,
 roll_result jsonb,
 outcome text check(outcome in('passed','failed','cancelled')),
 result jsonb,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.propel_declarations add column if not exists caster_snapshot jsonb;
create index if not exists propel_declarations_character_idx on dndkeep_private.propel_declarations(character_id);
create table if not exists dndkeep_private.propel_enhancements (
 request_id uuid primary key,
 declaration_id uuid not null references dndkeep_private.propel_declarations(request_id) on delete cascade,
 kind text not null check(kind in('enkindled','surge')),
 request jsonb not null,
 unique(declaration_id,kind)
);
alter table dndkeep_private.propel_declarations enable row level security;
alter table dndkeep_private.propel_enhancements enable row level security;
revoke all on dndkeep_private.propel_declarations,dndkeep_private.propel_enhancements from public,anon,authenticated;

create or replace function dndkeep_private.begin_propel(p_character uuid,p_request uuid,p_turn text,p_mode text,p_movement text,p_roll integer,p_target jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.propel_declarations; req jsonb; context jsonb; action jsonb;
 lvl integer; subclass text; sides integer; maximum integer; pool jsonb; feature text; target jsonb; participant public.combat_participants;
begin
 c:=public.psionic_character_for_update(p_character);
 if p_request is null or p_turn is null or p_mode is null or p_mode not in('free','powered','technique')
  or p_movement is null or p_movement not in('push','warp') or p_roll is null
  then raise exception 'Invalid Propel declaration';end if;
 req:=jsonb_build_object('turnId',p_turn,'mode',p_mode,'movement',p_movement,'roll',p_roll,'target',p_target);
 select * into prior from dndkeep_private.propel_declarations where request_id=p_request;
 if found then
  if prior.character_id<>c.id or prior.request<>req then raise exception 'Propel declaration identity changed';end if;
  return to_jsonb(prior)||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.psionic_discipline_uses where request_id=p_request)
  or exists(select 1 from public.psionic_energy_uses where request_id=p_request)
  or exists(select 1 from public.psionic_feature_uses where request_id=p_request)
  or exists(select 1 from public.psionic_surge_uses where request_id=p_request)
  or exists(select 1 from dndkeep_private.action_claims where request_id=p_request)
  then raise exception 'Propel identity is already in use';end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 subclass:=case when c.class_name='Psion' then c.subclass else c.secondary_subclass end;
 if lvl<1 then raise exception 'Propel requires a valid Psion level';end if;
 if p_movement='warp' and (subclass is distinct from 'Psi Warper' or lvl<3) then raise exception 'Warp requires Psi Warper level 3';end if;
 if p_mode='technique' and (subclass is distinct from 'Psykinetic' or lvl<3) then raise exception 'Free d4 requires Psykinetic level 3';end if;
 sides:=case when lvl>=17 then 12 when lvl>=11 then 10 when lvl>=5 then 8 else 6 end;
 maximum:=case when lvl>=17 then 12 when lvl>=13 then 10 when lvl>=9 then 8 when lvl>=5 then 6 else 4 end;
 if (p_mode='free' and p_roll<>0) or (p_mode='technique' and p_roll not between 1 and 4) or (p_mode='powered' and p_roll not between 1 and sides)
  then raise exception 'Invalid Propel base roll';end if;
 if c.class_resources is not null and jsonb_typeof(c.class_resources)<>'object' then raise exception 'Check Psion resources';end if;
 pool:=c.class_resources->'psionic-energy-dice';
 if pool is not null and (jsonb_typeof(pool)<>'number' or (pool::text)::numeric<>trunc((pool::text)::numeric) or (pool::text)::numeric not between 0 and maximum)
  then raise exception 'Check Psionic Energy Dice';end if;
 if p_mode='powered' and coalesce((pool::text)::integer,maximum)<1 then raise exception 'No Energy Die available to roll';end if;
 context:=dndkeep_private.action_turn_context(c.id);
 -- Until map visibility/size/distance are authoritative, require explicit
 -- tabletop legality confirmation. This never moves a token automatically.
 if p_target is null or jsonb_typeof(p_target)<>'object' or p_target->'legalTargetConfirmed' is distinct from 'true'::jsonb
  or p_target-array['participantId','name','legalTargetConfirmed']<>'{}'::jsonb then raise exception 'Confirm a visible other Large-or-smaller target within 30 feet';end if;
 if p_target->>'participantId' is not null then
  select * into participant from public.combat_participants where id=(p_target->>'participantId')::uuid
   and encounter_id=(context->>'encounterId')::uuid for share;
  if not found or (participant.participant_type='character' and participant.entity_id=c.id::text) then raise exception 'Propel target is unavailable or is the caster';end if;
  target:=jsonb_build_object('participantId',participant.id,'name',participant.name,'legalTargetConfirmed',true);
 else
  if context->>'encounterId' is not null then raise exception 'Choose the target in this encounter';end if;
  if jsonb_typeof(p_target->'name') is distinct from 'string' or length(btrim(p_target->>'name')) not between 1 and 120 then raise exception 'Name the tabletop target';end if;
  target:=p_target;
 end if;
 feature:=case when p_movement='warp' then 'Warp Propel' else 'Telekinetic Propel' end;
 action:=dndkeep_private.claim_action(c.id,p_request,jsonb_build_object('turnId',p_turn,'grantId','normal:bonusAction','kind','bonusAction','purpose','feature','sourceId',feature));
 insert into dndkeep_private.propel_declarations(request_id,character_id,request,turn_context,action_receipt,source_feature,mode,movement,base_roll,psion_level,target,caster_snapshot)
 values(p_request,c.id,req,public.psionic_turn_context_internal(c.id),action,feature,p_mode,p_movement,p_roll,lvl,target,to_jsonb(c)) returning * into prior;
 return to_jsonb(prior)||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.begin_propel(uuid,uuid,text,text,text,integer,jsonb) from public,anon,authenticated;

create or replace function dndkeep_private.enhance_propel(p_character uuid,p_declaration uuid,p_request uuid,p_kind text,p_extra integer[],p_hit_die integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; prior dndkeep_private.propel_enhancements;
 req jsonb; rolls integer[]; extra integer[]; payment jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found or d.mode<>'powered' then raise exception 'Only a powered Propel roll can be enhanced';end if;
 if p_request is null or p_request=p_declaration or p_kind is null or p_kind not in('enkindled','surge') then raise exception 'Invalid Propel enhancement';end if;
 req:=jsonb_build_object('declarationId',p_declaration,'kind',p_kind,'extraRolls',p_extra,'hitDie',p_hit_die);
 select * into prior from dndkeep_private.propel_enhancements where request_id=p_request;
 if found then
  if prior.declaration_id<>p_declaration or prior.request<>req then raise exception 'Propel enhancement identity changed';end if;
 else
  if d.roll_result is not null or d.outcome is not null then raise exception 'Propel roll is already closed';end if;
  if public.psionic_turn_context_internal(c.id)<>d.turn_context then raise exception 'Propel turn changed; no enhancement spent';end if;
  if d.movement='warp' and (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Psi Warper' then raise exception 'Psi Warper eligibility changed';end if;
  if public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level)<>d.psion_level then raise exception 'Psion level changed; review the saved roll';end if;
  if exists(select 1 from dndkeep_private.propel_enhancements where declaration_id=p_declaration and kind=p_kind) then raise exception 'Propel already has this enhancement';end if;
  if p_kind='enkindled' and exists(select 1 from dndkeep_private.propel_enhancements where declaration_id=p_declaration and kind='surge') then raise exception 'Choose extra dice before Surge';end if;
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
  select f.extra_rolls into extra from dndkeep_private.propel_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
   where e.declaration_id=p_declaration and e.kind='enkindled';
  rolls:=rolls||coalesce(extra,'{}'::integer[]);
  payment:=public.spend_psionic_surge_from_pool(c.id,p_request,rolls,d.source_feature,p_hit_die);
 end if;
 if prior.request_id is null then insert into dndkeep_private.propel_enhancements values(p_request,p_declaration,p_kind,req);end if;
 return payment||jsonb_build_object('declarationId',p_declaration,'kind',p_kind);
end;$$;
revoke all on function dndkeep_private.enhance_propel(uuid,uuid,uuid,text,integer[],integer) from public,anon,authenticated;

create or replace function dndkeep_private.finalize_propel_roll(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; extra integer[]; adjusted integer[]; original integer[]; saved jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found then raise exception 'Propel declaration unavailable';end if;
 if d.roll_result is not null then return d.roll_result;end if;
 if d.outcome is not null then raise exception 'Propel is already closed';end if;
 select f.extra_rolls into extra from dndkeep_private.propel_enhancements e join public.psionic_feature_uses f on f.request_id=e.request_id
  where e.declaration_id=p_declaration and e.kind='enkindled';
 original:=case when d.mode='free' then '{}'::integer[] else array[d.base_roll] end||coalesce(extra,'{}'::integer[]);
 select s.adjusted_rolls into adjusted from dndkeep_private.propel_enhancements e join public.psionic_surge_uses s on s.request_id=e.request_id
  where e.declaration_id=p_declaration and e.kind='surge';
 saved:=jsonb_build_object('declarationId',d.request_id,'originalRolls',original,'enkindledRolls',coalesce(extra,'{}'::integer[]),
  'usedSurge',adjusted is not null,'rolls',coalesce(adjusted,original),'total',coalesce((select sum(n) from unnest(coalesce(adjusted,original)) n),0));
 update dndkeep_private.propel_declarations set roll_result=saved where request_id=d.request_id;
 return saved;
end;$$;
revoke all on function dndkeep_private.finalize_propel_roll(uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.finish_propel(p_character uuid,p_declaration uuid,p_outcome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; cost integer; feet integer; payment jsonb; saved jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id;
 if not found or p_outcome is null or p_outcome not in('passed','failed','cancelled') then raise exception 'Invalid Propel outcome';end if;
 if d.outcome is not null then
  if d.outcome<>p_outcome then raise exception 'Propel outcome is already saved';end if;
  return d.result||jsonb_build_object('replayed',true);
 end if;
 if p_outcome<>'cancelled' and d.roll_result is null then raise exception 'Finalize the roll before resolving the save';end if;
 cost:=case when p_outcome='failed' and d.mode='powered' then 1 else 0 end;
 if cost=1 then payment:=public.settle_psionic_energy(c.id,d.request_id,'spend',1,array[d.base_roll],d.source_feature);end if;
 feet:=case when p_outcome<>'failed' then 0 when d.movement='warp' then 30 when d.mode='free' then 5 else 5*(d.roll_result->>'total')::integer end;
 saved:=jsonb_build_object('declarationId',d.request_id,'outcome',p_outcome,'energyCost',cost,'energy',payment,
  'movement',d.movement,'feet',feet,'target',d.target,'roll',d.roll_result,'action',d.action_receipt,'replayed',false);
 update dndkeep_private.propel_declarations set outcome=p_outcome,result=saved where request_id=d.request_id;
 return saved;
end;$$;
revoke all on function dndkeep_private.finish_propel(uuid,uuid,text) from public,anon,authenticated;

-- Recover without browser storage. Cursor paging never hides older unfinished
-- declarations behind a fixed latest-N window. Point reads also retain receipts.
create or replace function dndkeep_private.read_propel(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; saved jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select to_jsonb(d) into saved from dndkeep_private.propel_declarations d where d.character_id=c.id and d.request_id=p_declaration;
 if saved is null then raise exception 'Propel declaration unavailable';end if;
 return saved;
end;$$;
revoke all on function dndkeep_private.read_propel(uuid,uuid) from public,anon,authenticated;
create or replace function dndkeep_private.list_propel(p_character uuid,p_before_time timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; items jsonb; last_item jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 if (p_before_time is null)<>(p_before_id is null) then raise exception 'Invalid Propel recovery cursor';end if;
 select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.request_id desc),'[]'::jsonb) into items from (
  select d.* from dndkeep_private.propel_declarations d where d.character_id=c.id and d.outcome is null
   and (p_before_time is null or (d.created_at,d.request_id)<(p_before_time,p_before_id))
  order by d.created_at desc,d.request_id desc limit 25
 ) page;
 if jsonb_array_length(items)=25 then last_item:=items->24;end if;
 return jsonb_build_object('items',items,'nextCursor',case when last_item is not null then jsonb_build_object('createdAt',last_item->'created_at','requestId',last_item->'request_id') else null end);
end;$$;
revoke all on function dndkeep_private.list_propel(uuid,timestamptz,uuid) from public,anon,authenticated;
