-- v2.810 groundwork: character-owned concentration checks outside campaigns.
-- Creation and settlement are separate, replayable transactions. No HP write is
-- performed here; the UI/damage pipeline must retain the same request identity.
create table if not exists dndkeep_private.standalone_concentration_saves(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 spell_name text not null,
 casting_revision bigint not null,
 damage integer not null,
 dc integer not null,
 save_bonus integer not null,
 has_advantage boolean not null,
 natural_extremes boolean not null,
 outcome jsonb,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.standalone_concentration_saves enable row level security;
revoke all on dndkeep_private.standalone_concentration_saves from public,anon,authenticated;
create index if not exists standalone_concentration_character_idx
 on dndkeep_private.standalone_concentration_saves(character_id,created_at) where outcome is null;

create or replace function dndkeep_private.queue_standalone_concentration_save(
 p_character_id uuid,p_request_id uuid,p_damage integer,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.standalone_concentration_saves;
 req jsonb; snapshot jsonb; total_level integer; bonus integer; proficient boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to record a concentration check';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null then raise exception 'A concentration check identifier is required';end if;
 req:=jsonb_build_object('damage',p_damage,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.standalone_concentration_saves where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Concentration check request changed';end if;
  if prior.outcome->>'outcome'='canceled' then raise exception 'This concentration check request was canceled';end if;
  return to_jsonb(prior)-'request'||jsonb_build_object('replayed',true);
 end if;
 if c.campaign_id is not null then raise exception 'Use campaign concentration checks for this character';end if;
 if p_damage is null or p_damage<1 or p_modifier is null or p_modifier not between -5 and 20
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid concentration check';end if;
 snapshot:=jsonb_build_object('concentration_spell',c.concentration_spell,'concentration_revision',c.concentration_revision,
  'constitution',c.constitution,'inventory',c.inventory,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,
  'saving_throw_proficiencies',c.saving_throw_proficiencies,'gained_feats',c.gained_feats,'nat_1_20_saves',c.nat_1_20_saves);
 if snapshot is distinct from p_expected then raise exception 'Character changed; review the concentration check';end if;
 if coalesce(c.concentration_spell,'')='' then raise exception 'There is no active concentration spell';end if;
 total_level:=c.level+case when c.secondary_class is not null then coalesce(c.secondary_level,0) else 0 end;
 if c.level not between 1 and 20 or total_level not between 1 and 20
  or (c.secondary_class is not null and coalesce(c.secondary_level,0)<0) then raise exception 'Invalid class levels';end if;
 proficient:=exists(select 1 from unnest(coalesce(c.saving_throw_proficiencies,array[]::text[])) p where lower(p) in('con','constitution'));
 -- Effective CON modifier comes from the shared item pipeline, as with existing
 -- paid casting rolls. Its raw score/inventory inputs must match the snapshot.
 bonus:=p_modifier+case when proficient then 2+(total_level-1)/4 else 0 end;
 insert into dndkeep_private.standalone_concentration_saves(request_id,character_id,request,spell_name,casting_revision,
  damage,dc,save_bonus,has_advantage,natural_extremes)
 values(p_request_id,c.id,req,c.concentration_spell,c.concentration_revision,p_damage,least(30,greatest(10,p_damage/2)),bonus,
  exists(select 1 from unnest(coalesce(c.gained_feats,array[]::text[])) f where lower(btrim(f))='war caster'),c.nat_1_20_saves is distinct from false)
 returning * into prior;
 return to_jsonb(prior)-'request'||jsonb_build_object('replayed',false);
end;
$$;

create or replace function dndkeep_private.get_standalone_concentration_saves(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; pending jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to read concentration checks';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid();
 if not found then raise exception 'Character is unavailable';end if;
 select coalesce(jsonb_agg(to_jsonb(r)-'request' order by r.created_at,r.request_id),'[]'::jsonb) into pending
  from dndkeep_private.standalone_concentration_saves r where r.character_id=c.id and r.outcome is null;
 return jsonb_build_object('character',to_jsonb(c),'pending',pending);
end;
$$;

create or replace function dndkeep_private.settle_standalone_concentration_save(p_character_id uuid,p_request_id uuid,p_rolls integer[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; r dndkeep_private.standalone_concentration_saves;
 result text; reason text; chosen integer; score integer; rolls integer[]; receipt jsonb; passed boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to resolve concentration';end if;
 -- Character-before-request matches creation and serializes separate hits.
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 select * into r from dndkeep_private.standalone_concentration_saves where request_id=p_request_id and character_id=c.id for update;
 if not found then raise exception 'Concentration check is unavailable';end if;
 if r.outcome is not null then return r.outcome||jsonb_build_object('replayed',true,'character',to_jsonb(c));end if;
 if c.campaign_id is not null or c.concentration_revision is distinct from r.casting_revision or c.concentration_spell is distinct from r.spell_name then
  result:='obsolete';reason:='casting_changed';
 elsif coalesce(c.current_hp,0)<=0 or coalesce(c.active_conditions,array[]::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'] then
  result:='failed';reason:='incapacitated';
 else
  if p_rolls is null or array_ndims(p_rolls)<>1 or cardinality(p_rolls)<>(case when r.has_advantage then 2 else 1 end)
   or exists(select 1 from unnest(p_rolls) d where d is null or d not between 1 and 20) then raise exception 'Invalid concentration dice';end if;
  select max(d) into chosen from unnest(p_rolls) d;rolls:=p_rolls;score:=chosen+r.save_bonus;
  passed:=case when r.natural_extremes and chosen=1 then false when r.natural_extremes and chosen=20 then true else score>=r.dc end;
  result:=case when passed then 'passed' else 'failed' end;reason:='save';
 end if;
 if result='failed' then
  update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id returning * into c;
 end if;
 receipt:=jsonb_build_object('requestId',r.request_id,'characterId',c.id,'spell',r.spell_name,'castingRevision',r.casting_revision,
  'outcome',result,'reason',reason,'rolls',rolls,'d20',chosen,'total',score,'dc',r.dc,'bonus',r.save_bonus,'advantage',r.has_advantage);
 update dndkeep_private.standalone_concentration_saves set outcome=receipt where request_id=r.request_id;
 if result<>'obsolete' then
  insert into public.action_logs(id,character_id,character_name,action_type,action_name,dice_expression,individual_results,total,notes)
  values(r.request_id,c.id,c.name,'save','Concentration Check',case when rolls is null then '' when r.has_advantage then '2d20kh1' else '1d20' end,
   coalesce(rolls,array[]::integer[]),score,'DC '||r.dc||' · '||result||' · '||reason||case when r.has_advantage then ' · War Caster advantage' else '' end);
  insert into public.character_history(id,character_id,user_id,event_type,field,new_value,description)
  values(r.request_id,c.id,auth.uid(),'roll','concentration_spell',receipt,'Concentration '||result||' ('||reason||') for '||r.spell_name||'.');
 end if;
 return receipt||jsonb_build_object('replayed',false,'character',to_jsonb(c));
end;
$$;

revoke all on function dndkeep_private.queue_standalone_concentration_save(uuid,uuid,integer,integer,jsonb) from public,anon;
revoke all on function dndkeep_private.get_standalone_concentration_saves(uuid) from public,anon;
revoke all on function dndkeep_private.settle_standalone_concentration_save(uuid,uuid,integer[]) from public,anon;
grant execute on function dndkeep_private.queue_standalone_concentration_save(uuid,uuid,integer,integer,jsonb) to authenticated;
grant execute on function dndkeep_private.get_standalone_concentration_saves(uuid) to authenticated;
grant execute on function dndkeep_private.settle_standalone_concentration_save(uuid,uuid,integer[]) to authenticated;
create or replace function public.queue_standalone_concentration_save(p_character_id uuid,p_request_id uuid,p_damage integer,p_modifier integer,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.queue_standalone_concentration_save(p_character_id,p_request_id,p_damage,p_modifier,p_expected); $$;
create or replace function public.get_standalone_concentration_saves(p_character_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.get_standalone_concentration_saves(p_character_id); $$;
create or replace function public.settle_standalone_concentration_save(p_character_id uuid,p_request_id uuid,p_rolls integer[] default null)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.settle_standalone_concentration_save(p_character_id,p_request_id,p_rolls); $$;
revoke all on function public.queue_standalone_concentration_save(uuid,uuid,integer,integer,jsonb) from public,anon;
revoke all on function public.get_standalone_concentration_saves(uuid) from public,anon;
revoke all on function public.settle_standalone_concentration_save(uuid,uuid,integer[]) from public,anon;
grant execute on function public.queue_standalone_concentration_save(uuid,uuid,integer,integer,jsonb) to authenticated;
grant execute on function public.get_standalone_concentration_saves(uuid) to authenticated;
grant execute on function public.settle_standalone_concentration_save(uuid,uuid,integer[]) to authenticated;

-- Cancel only an unconfirmed creation, never a recorded pending/result row.
-- The same character lock seals late requests, including lost cancel responses.
create or replace function dndkeep_private.cancel_standalone_concentration_request(
 p_character_id uuid,p_request_id uuid,p_damage integer,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; r dndkeep_private.standalone_concentration_saves; req jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to cancel a concentration request';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_damage is null or p_damage<1 or p_modifier is null or p_modifier not between -5 and 20
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid concentration request';end if;
 req:=jsonb_build_object('damage',p_damage,'modifier',p_modifier,'expected',p_expected);
 select * into r from dndkeep_private.standalone_concentration_saves where request_id=p_request_id;
 if found then
  if r.character_id is distinct from c.id or r.request is distinct from req then raise exception 'Concentration check request changed';end if;
  return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',coalesce(r.outcome->>'outcome'='canceled',false),'replayed',true);
 end if;
 insert into dndkeep_private.standalone_concentration_saves(request_id,character_id,request,spell_name,casting_revision,damage,dc,save_bonus,has_advantage,natural_extremes,outcome)
 values(p_request_id,c.id,req,'',0,0,0,0,false,false,jsonb_build_object('outcome','canceled'));
 return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',true,'replayed',false);
end;
$$;
revoke all on function dndkeep_private.cancel_standalone_concentration_request(uuid,uuid,integer,integer,jsonb) from public,anon;
grant execute on function dndkeep_private.cancel_standalone_concentration_request(uuid,uuid,integer,integer,jsonb) to authenticated;
create or replace function public.cancel_standalone_concentration_request(p_character_id uuid,p_request_id uuid,p_damage integer,p_modifier integer,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.cancel_standalone_concentration_request(p_character_id,p_request_id,p_damage,p_modifier,p_expected); $$;
revoke all on function public.cancel_standalone_concentration_request(uuid,uuid,integer,integer,jsonb) from public,anon;
grant execute on function public.cancel_standalone_concentration_request(uuid,uuid,integer,integer,jsonb) to authenticated;
