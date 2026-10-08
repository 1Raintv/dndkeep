-- Tag the same HP update that pays damage so realtime observers refresh the
-- server queue instead of rolling a second local save for the HP delta.
alter table public.characters add column if not exists last_standalone_damage_id uuid;
create or replace function dndkeep_private.clear_standalone_damage_marker()
returns trigger language plpgsql set search_path='' as $$ begin
 if (new.current_hp,new.max_hp,new.temp_hp) is distinct from (old.current_hp,old.max_hp,old.temp_hp)
  and new.last_standalone_damage_id is not distinct from old.last_standalone_damage_id then new.last_standalone_damage_id:=null;end if;
 return new;
end; $$;
revoke all on function dndkeep_private.clear_standalone_damage_marker() from public,anon,authenticated;
drop trigger if exists clear_standalone_damage_marker on public.characters;
create trigger clear_standalone_damage_marker before update of current_hp,max_hp,temp_hp on public.characters
 for each row execute function dndkeep_private.clear_standalone_damage_marker();
create or replace function dndkeep_private.adjust_character_hit_points(
 p_character_id uuid,p_request_id uuid,p_mode text,p_amount integer,p_expected_revision bigint,p_standalone boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.manual_hit_point_adjustments;
 req jsonb; outcome jsonb; old_hp integer; old_temp integer; next_hp integer; next_temp integer;
begin
 if auth.uid() is null then raise exception 'Sign in to adjust HP';end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null then raise exception 'An HP adjustment identifier is required';end if;
 req:=jsonb_build_object('mode',p_mode,'amount',p_amount,'revision',p_expected_revision);
 select * into prior from dndkeep_private.manual_hit_point_adjustments where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'HP adjustment request changed';end if;
  if prior.outcome->>'canceled'='true' then raise exception 'This HP adjustment was canceled';end if;
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if p_mode is null or p_mode not in('damage','heal','set') or p_amount is null or p_amount<0
  or (p_mode<>'set' and p_amount=0) or p_expected_revision is null or p_expected_revision<0
  then raise exception 'Enter a valid whole-number HP adjustment';end if;
 if c.hit_point_revision is distinct from p_expected_revision then raise exception 'HP changed; review the current values before applying';end if;
 if c.current_hp is null or c.max_hp is null or c.current_hp<0 or c.max_hp<0 or (c.current_hp>c.max_hp and p_mode<>'set') or coalesce(c.temp_hp,0)<0
  then raise exception 'Review the character HP pools';end if;
 old_hp:=c.current_hp;old_temp:=coalesce(c.temp_hp,0);next_temp:=old_temp;
 if p_mode='damage' then
  next_temp:=greatest(0,old_temp-p_amount);
  next_hp:=greatest(0,old_hp-greatest(0,p_amount-old_temp));
 elsif p_mode='heal' then next_hp:=least(c.max_hp::bigint,old_hp::bigint+p_amount)::integer;
 else next_hp:=least(c.max_hp,p_amount);end if;
 update public.characters set current_hp=next_hp,temp_hp=next_temp,last_standalone_damage_id=case when p_standalone then p_request_id else null end where id=c.id returning * into c;
 outcome:=jsonb_build_object('requestId',p_request_id,'mode',p_mode,'amount',p_amount,
  'beforeHP',old_hp,'beforeTempHP',old_temp,'afterHP',next_hp,'afterTempHP',next_temp);
 insert into dndkeep_private.manual_hit_point_adjustments(request_id,character_id,request,outcome) values(p_request_id,c.id,req,outcome);
 insert into public.character_history(id,character_id,user_id,event_type,field,old_value,new_value,description)
 values(p_request_id,c.id,auth.uid(),'hp_change','current_hp',to_jsonb(old_hp),to_jsonb(next_hp),
  'Manual HP adjustment ('||p_mode||' '||p_amount||'): '||old_hp||' → '||next_hp||' HP; '||old_temp||' → '||next_temp||' temporary HP.');
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end;
$$;

revoke all on function dndkeep_private.adjust_character_hit_points(uuid,uuid,text,integer,bigint,boolean) from public,anon;
grant execute on function dndkeep_private.adjust_character_hit_points(uuid,uuid,text,integer,bigint,boolean) to authenticated;
-- Keep one arithmetic implementation. Existing callers retain the five-argument
-- entry point, which delegates without marking the operation as standalone.
create or replace function dndkeep_private.adjust_character_hit_points(p_character_id uuid,p_request_id uuid,p_mode text,p_amount integer,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.adjust_character_hit_points(p_character_id,p_request_id,p_mode,p_amount,p_expected_revision,false);
$$;
-- v2.810: one damage identity pays HP and creates at most one concentration check.
-- Separate save/history identity avoids colliding with the existing HP receipt.
alter table dndkeep_private.standalone_concentration_saves add column if not exists automation_mode text not null default 'prompt';
create table if not exists dndkeep_private.standalone_damage_events(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 request jsonb not null,
 outcome jsonb not null,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.standalone_damage_events enable row level security;
revoke all on dndkeep_private.standalone_damage_events from public,anon,authenticated;
create unique index if not exists standalone_damage_save_identity_idx on dndkeep_private.standalone_damage_events((request->>'saveRequestId'));
create index if not exists standalone_damage_character_idx on dndkeep_private.standalone_damage_events(character_id);

create or replace function dndkeep_private.apply_standalone_damage(
 p_character_id uuid,p_request_id uuid,p_save_request_id uuid,p_damage integer,p_expected_hp_revision bigint,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.standalone_damage_events;
 req jsonb; snapshot jsonb; hp jsonb; pending jsonb; resolution jsonb; outcome jsonb; mode text:='prompt'; needs_check boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to apply damage';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_request_id is null or p_request_id=p_save_request_id or p_damage is null or p_damage<1
  or p_expected_hp_revision is null or p_expected_hp_revision<0 or p_modifier is null or p_modifier not between -5 and 20
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid damage request';end if;
 req:=jsonb_build_object('saveRequestId',p_save_request_id,'damage',p_damage,'hpRevision',p_expected_hp_revision,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.standalone_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Damage request changed';end if;
  if prior.outcome->>'canceled'='true' then raise exception 'This damage request was canceled';end if;
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if c.campaign_id is not null then raise exception 'Use campaign damage for this character';end if;
 if exists(select 1 from dndkeep_private.manual_hit_point_adjustments where request_id=p_request_id)
  or exists(select 1 from dndkeep_private.standalone_concentration_saves where request_id=p_save_request_id) then raise exception 'A damage identity is already in use';end if;
 snapshot:=jsonb_build_object('concentration_spell',c.concentration_spell,'concentration_revision',c.concentration_revision,
  'constitution',c.constitution,'inventory',c.inventory,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,
  'saving_throw_proficiencies',c.saving_throw_proficiencies,'gained_feats',c.gained_feats,'nat_1_20_saves',c.nat_1_20_saves);
 if snapshot is distinct from p_expected then raise exception 'Character changed; review damage before applying';end if;
 if c.advanced_automations_unlocked and c.automation_overrides->>'concentration_on_damage' in('off','prompt','auto') then
  mode:=c.automation_overrides->>'concentration_on_damage';
 end if;
 needs_check:=coalesce(c.concentration_spell,'')<>'';
 -- Queue under the pre-damage casting snapshot before HP changes. Any failure
 -- in either operation rolls the other one back with the parent transaction.
 if needs_check then
  pending:=dndkeep_private.queue_standalone_concentration_save(c.id,p_save_request_id,p_damage,p_modifier,p_expected);
  update dndkeep_private.standalone_concentration_saves set automation_mode=mode where request_id=p_save_request_id;
  pending:=pending||jsonb_build_object('automation_mode',mode);
 end if;
 hp:=dndkeep_private.adjust_character_hit_points(c.id,p_request_id,'damage',p_damage,p_expected_hp_revision,true);
 select * into c from public.characters where id=c.id;
 if needs_check and (c.current_hp<=0 or coalesce(c.active_conditions,array[]::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned']) then
  resolution:=dndkeep_private.settle_standalone_concentration_save(c.id,p_save_request_id,null)-'character'-'replayed';
  pending:=null;
 elsif needs_check and mode='off' then
  -- Off suppresses a save, but zero HP/incapacitation above still ends the spell.
  update dndkeep_private.standalone_concentration_saves set outcome=jsonb_build_object('outcome','skipped','reason','automation_off') where request_id=p_save_request_id;
  pending:=null;
 end if;
 select * into c from public.characters where id=c.id;
 outcome:=jsonb_build_object('requestId',p_request_id,'saveRequestId',p_save_request_id,'hp',hp-'character'-'replayed',
  'check',pending,'resolution',resolution,'automation',mode);
 insert into dndkeep_private.standalone_damage_events(request_id,character_id,request,outcome) values(p_request_id,c.id,req,outcome);
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end;
$$;

create or replace function dndkeep_private.cancel_standalone_damage(
 p_character_id uuid,p_request_id uuid,p_save_request_id uuid,p_damage integer,p_expected_hp_revision bigint,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.standalone_damage_events; req jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to cancel damage';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_request_id is null or p_request_id=p_save_request_id or p_damage is null or p_damage<1
  or p_expected_hp_revision is null or p_expected_hp_revision<0 or p_modifier is null or p_modifier not between -5 and 20
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid damage request';end if;
 req:=jsonb_build_object('saveRequestId',p_save_request_id,'damage',p_damage,'hpRevision',p_expected_hp_revision,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.standalone_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Damage request changed';end if;
  return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',coalesce(prior.outcome->>'canceled'='true',false),'replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.manual_hit_point_adjustments where request_id=p_request_id)
  or exists(select 1 from dndkeep_private.standalone_concentration_saves where request_id=p_save_request_id) then raise exception 'A damage identity is already in use';end if;
 perform dndkeep_private.cancel_hit_point_adjustment(c.id,p_request_id,'damage',p_damage,p_expected_hp_revision);
 perform dndkeep_private.cancel_standalone_concentration_request(c.id,p_save_request_id,p_damage,p_modifier,p_expected);
 insert into dndkeep_private.standalone_damage_events(request_id,character_id,request,outcome)
 values(p_request_id,c.id,req,jsonb_build_object('canceled',true));
 return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',true,'replayed',false);
end;
$$;
revoke all on function dndkeep_private.apply_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) from public,anon;
revoke all on function dndkeep_private.cancel_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) from public,anon;
grant execute on function dndkeep_private.apply_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) to authenticated;
grant execute on function dndkeep_private.cancel_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) to authenticated;
create or replace function public.apply_standalone_damage(p_character_id uuid,p_request_id uuid,p_save_request_id uuid,p_damage integer,p_expected_hp_revision bigint,p_modifier integer,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.apply_standalone_damage(p_character_id,p_request_id,p_save_request_id,p_damage,p_expected_hp_revision,p_modifier,p_expected); $$;
create or replace function public.cancel_standalone_damage(p_character_id uuid,p_request_id uuid,p_save_request_id uuid,p_damage integer,p_expected_hp_revision bigint,p_modifier integer,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.cancel_standalone_damage(p_character_id,p_request_id,p_save_request_id,p_damage,p_expected_hp_revision,p_modifier,p_expected); $$;
revoke all on function public.apply_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) from public,anon;
revoke all on function public.cancel_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) from public,anon;
grant execute on function public.apply_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) to authenticated;
grant execute on function public.cancel_standalone_damage(uuid,uuid,uuid,integer,bigint,integer,jsonb) to authenticated;
