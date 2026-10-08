-- v2.813 groundwork: one shared discipline use/roll identity per turn.
-- UA Update pp.3-5: conditional failed bonuses still use the discipline.
-- Guards and Sharpened Mind are distinct start-of-turn exceptions; each may
-- precede one ordinary discipline. Their spell/action timing remains a tabletop
-- declaration until the full turn-action pipeline records that timing.
create table if not exists dndkeep_private.psionic_discipline_uses(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 turn_context jsonb not null,
 discipline text not null,
 request jsonb not null,
 receipt jsonb not null,
 conditional boolean not null,
 outcome jsonb,
 created_at timestamptz not null default now(),
 unique(character_id,turn_context,discipline)
);
alter table dndkeep_private.psionic_discipline_uses enable row level security;
revoke all on dndkeep_private.psionic_discipline_uses from public,anon,authenticated;
create index if not exists psionic_discipline_pending_idx on dndkeep_private.psionic_discipline_uses(character_id,created_at) where conditional and outcome is null;

create or replace function dndkeep_private.begin_psionic_discipline(
 p_character_id uuid,p_request_id uuid,p_turn jsonb,p_discipline text,p_rolls integer[],p_count integer,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.psionic_discipline_uses; req jsonb; snapshot jsonb; context jsonb; result jsonb; energy jsonb;
 lvl integer; sides integer; maximum integer; remaining integer; pool jsonb; chosen jsonb; feature_name text; conditional_use boolean; special boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to use a discipline';end if;
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null or p_turn is null or jsonb_typeof(p_turn)<>'object' or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid discipline request';end if;
 req:=jsonb_build_object('turn',p_turn,'discipline',p_discipline,'rolls',p_rolls,'count',p_count,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.psionic_discipline_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Discipline request changed';end if;
  return prior.receipt||jsonb_build_object('outcome',prior.outcome,'character',to_jsonb(c),'replayed',true);
 end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if lvl<2 then raise exception 'Requires Psion level 2';end if;
 feature_name:=case p_discipline when 'biofeedback' then 'Biofeedback' when 'bolstering-precognition' then 'Bolstering Precognition'
  when 'destructive-thoughts' then 'Destructive Thoughts' when 'devilish-tongue' then 'Devilish Tongue'
  when 'expanded-awareness' then 'Expanded Awareness' when 'id-insinuation' then 'Id Insinuation' when 'inerrant-aim' then 'Inerrant Aim'
  when 'observant-mind' then 'Observant Mind' when 'psionic-backlash' then 'Psionic Backlash' when 'psionic-guards' then 'Psionic Guards' when 'sharpened-mind' then 'Sharpened Mind' end;
 if feature_name is null then raise exception 'Unknown Psionic Discipline';end if;
 chosen:=c.class_resources->'psion-disciplines';
 if jsonb_typeof(chosen) is distinct from 'array' then raise exception 'Choose this discipline first';end if;
 if not exists(select 1 from jsonb_array_elements_text(chosen) k where lower(trim(k)) in(p_discipline,lower(feature_name))) then raise exception 'Choose this discipline first';end if;
 snapshot:=jsonb_build_object('class_name',c.class_name,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,
  'intelligence',c.intelligence,'inventory',c.inventory,'disciplines',chosen);
 if snapshot is distinct from p_expected then raise exception 'Psion abilities changed; review the discipline';end if;
 if p_modifier is null or p_modifier not between -5 and 20 then raise exception 'Invalid Intelligence modifier';end if;
 sides:=case when lvl>=17 then 12 when lvl>=11 then 10 when lvl>=5 then 8 else 6 end;
 maximum:=case when lvl>=17 then 12 when lvl>=13 then 10 when lvl>=9 then 8 when lvl>=5 then 6 else 4 end;
 pool:=c.class_resources->'psionic-energy-dice';
 if pool is null then remaining:=maximum;
 elsif jsonb_typeof(pool)<>'number' or (pool::text)::numeric<>trunc((pool::text)::numeric) or (pool::text)::numeric not between 0 and maximum then raise exception 'Check Psionic Energy Dice';
 else remaining:=(pool::text)::integer;end if;
 conditional_use:=p_discipline in('devilish-tongue','expanded-awareness','inerrant-aim','observant-mind');
 special:=p_discipline in('psionic-guards','sharpened-mind');
 if p_count is null or p_count<1 or p_count>remaining or p_count>(case when p_discipline in('biofeedback','destructive-thoughts') then greatest(0,p_modifier) else 1 end)
  or p_rolls is null or (p_discipline='psionic-guards' and cardinality(p_rolls)<>0)
  or (p_discipline<>'psionic-guards' and (cardinality(p_rolls)<>p_count or array_ndims(p_rolls)<>1))
  or exists(select 1 from unnest(p_rolls) n where n is null or n not between 1 and sides) then raise exception 'Invalid discipline dice';end if;
 context:=public.psionic_turn_context_internal(c.id);
 if context is distinct from p_turn then raise exception 'Turn changed; choose the discipline again';end if;
 if exists(select 1 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context and discipline=p_discipline) then raise exception 'This discipline was already used this turn';end if;
 -- Start-of-turn exceptions must be claimed before ordinary disciplines.
 if exists(select 1 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context and discipline not in('psionic-guards','sharpened-mind')) then
  if special then raise exception 'Use start-of-turn disciplines before other disciplines';else raise exception 'A discipline was already used this turn';end if;
 end if;
 if exists(select 1 from public.psionic_energy_uses where request_id=p_request_id) then raise exception 'The resource identity is already in use';end if;
 if not conditional_use then energy:=public.settle_psionic_energy(c.id,p_request_id,'spend',p_count,p_rolls,feature_name);end if;
 result:=jsonb_build_object('requestId',p_request_id,'turn',context,'discipline',p_discipline,'sourceFeature',feature_name,'rolls',p_rolls,'count',p_count,'conditional',conditional_use,'energy',energy);
 insert into dndkeep_private.psionic_discipline_uses(request_id,character_id,turn_context,discipline,request,receipt,conditional,outcome)
 values(p_request_id,c.id,context,p_discipline,req,result,conditional_use,case when conditional_use then null else jsonb_build_object('spent',true) end);
 -- The stored attempt, not expenditure, owns the turn limit. A failed bonus
 -- keeps the Energy Die but must not become another free attempt this turn.
 insert into public.character_history(id,character_id,user_id,event_type,description)
 values(p_request_id,c.id,auth.uid(),'feature_used',feature_name||': discipline used this turn. Base rolls: '||coalesce(array_to_string(p_rolls,', '),'none')||case when conditional_use then '. Energy Die outcome pending.' else '. Base Energy Dice paid.' end);
 select * into c from public.characters where id=c.id;
 return result||jsonb_build_object('outcome',case when conditional_use then null else jsonb_build_object('spent',true) end,'character',to_jsonb(c),'replayed',false);
end; $$;

create or replace function dndkeep_private.finish_psionic_discipline(p_character_id uuid,p_request_id uuid,p_changed_outcome boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.psionic_discipline_uses; result jsonb; energy jsonb; rolls integer[];
begin
 if auth.uid() is null then raise exception 'Sign in to resolve a discipline';end if;
 c:=public.psionic_character_for_update(p_character_id);
 select * into prior from dndkeep_private.psionic_discipline_uses where request_id=p_request_id and character_id=c.id for update;
 if not found or not prior.conditional or p_changed_outcome is null then raise exception 'Conditional discipline is unavailable';end if;
 if prior.outcome is not null then
  if (prior.outcome->>'spent')::boolean is distinct from p_changed_outcome then raise exception 'The saved discipline outcome changed';end if;
  return prior.receipt||jsonb_build_object('outcome',prior.outcome,'character',to_jsonb(c),'replayed',true);
 end if;
 if p_changed_outcome then
  select array_agg(value::integer order by ordinal) into rolls from jsonb_array_elements_text(prior.receipt->'rolls') with ordinality t(value,ordinal);
  energy:=public.settle_psionic_energy(c.id,p_request_id,'spend',1,rolls,prior.receipt->>'sourceFeature');
 end if;
 result:=jsonb_build_object('spent',p_changed_outcome,'energy',energy);
 update dndkeep_private.psionic_discipline_uses set outcome=result where request_id=p_request_id;
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,notes)
 values(c.campaign_id,c.id,c.name,'roll',prior.receipt->>'sourceFeature',case when p_changed_outcome then 'Bonus changed the outcome. One Energy Die spent.' else 'Bonus did not change the outcome. Energy Die kept; discipline still used this turn.' end);
 select * into c from public.characters where id=c.id;
 return prior.receipt||jsonb_build_object('outcome',result,'character',to_jsonb(c),'replayed',false);
end; $$;

create or replace function dndkeep_private.get_psionic_discipline_turn(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; uses jsonb; pending jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to read discipline uses';end if;
 c:=public.psionic_character_for_update(p_character_id);context:=public.psionic_turn_context_internal(c.id);
 select coalesce(jsonb_agg(receipt||jsonb_build_object('outcome',outcome) order by created_at,request_id),'[]'::jsonb) into uses
 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context;
 select coalesce(jsonb_agg(receipt||jsonb_build_object('outcome',outcome) order by created_at,request_id),'[]'::jsonb) into pending
 from dndkeep_private.psionic_discipline_uses where character_id=c.id and conditional and outcome is null;
 return jsonb_build_object('turn',context,'uses',uses,'pending',pending);
end; $$;

revoke all on function dndkeep_private.begin_psionic_discipline(uuid,uuid,jsonb,text,integer[],integer,integer,jsonb) from public,anon;
grant execute on function dndkeep_private.begin_psionic_discipline(uuid,uuid,jsonb,text,integer[],integer,integer,jsonb) to authenticated;
create or replace function public.begin_psionic_discipline(p_character_id uuid,p_request_id uuid,p_turn jsonb,p_discipline text,p_rolls integer[],p_count integer,p_modifier integer,p_expected jsonb) returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.begin_psionic_discipline(p_character_id,p_request_id,p_turn,p_discipline,p_rolls,p_count,p_modifier,p_expected); $$;
revoke all on function public.begin_psionic_discipline(uuid,uuid,jsonb,text,integer[],integer,integer,jsonb) from public,anon;
grant execute on function public.begin_psionic_discipline(uuid,uuid,jsonb,text,integer[],integer,integer,jsonb) to authenticated;

revoke all on function dndkeep_private.finish_psionic_discipline(uuid,uuid,boolean) from public,anon;
grant execute on function dndkeep_private.finish_psionic_discipline(uuid,uuid,boolean) to authenticated;
create or replace function public.finish_psionic_discipline(p_character_id uuid,p_request_id uuid,p_changed_outcome boolean) returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.finish_psionic_discipline(p_character_id,p_request_id,p_changed_outcome); $$;
revoke all on function public.finish_psionic_discipline(uuid,uuid,boolean) from public,anon;
grant execute on function public.finish_psionic_discipline(uuid,uuid,boolean) to authenticated;

revoke all on function dndkeep_private.get_psionic_discipline_turn(uuid) from public,anon;
grant execute on function dndkeep_private.get_psionic_discipline_turn(uuid) to authenticated;
create or replace function public.get_psionic_discipline_turn(p_character_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.get_psionic_discipline_turn(p_character_id); $$;
revoke all on function public.get_psionic_discipline_turn(uuid) from public,anon;
grant execute on function public.get_psionic_discipline_turn(uuid) to authenticated;
