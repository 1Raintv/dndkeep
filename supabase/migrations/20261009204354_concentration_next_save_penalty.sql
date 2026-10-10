-- Persist the consumed next-save penalty with concentration's actual result.
 alter table public.pending_concentration_saves add column if not exists save_penalty jsonb;
create or replace function dndkeep_private.settle_concentration_roll(p_pending_id uuid,p_d20 integer,p_source text,p_second_d20 integer,p_penalty_d4 integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pending_concentration_saves; c public.characters; participant public.combat_participants;
 outcome text; score integer; passed boolean;
 chosen integer; rolls integer[]; penalty_receipt jsonb; penalty_amount integer:=0;
begin
 if auth.uid() is null then raise exception 'Sign in to resolve this save'; end if;
 select * into r from public.pending_concentration_saves where id=p_pending_id;
 if not found then raise exception 'Concentration save is unavailable'; end if;
 -- Consistent character-before-prompt ordering serializes different saves of
 -- one casting and avoids an opposite prompt/character lock order on retries.
 select * into c from public.characters ch where ch.id=r.character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Concentration save is unavailable'; end if;
 select * into r from public.pending_concentration_saves where id=p_pending_id and character_id=c.id for update;
 if not found then raise exception 'Concentration save is unavailable'; end if;
 if r.state<>'offered' then
  return jsonb_build_object('pendingId',r.id,'outcome',coalesce(r.resolution_outcome,r.result,'obsolete'),'d20',r.d20,'total',r.total,'replayed',true,'rolls',r.d20_rolls,'advantage',r.has_advantage,'penalty',r.save_penalty);
 end if;
 if p_source is null or p_source not in('player','timeout') or p_d20 is null or p_d20 not between 1 and 20 then
  raise exception 'Invalid concentration save result';
 end if;
 -- A party damage offer can exist between encounters. Never invent a combat
 -- participant just to roll its save. Encounter offers retain their strict link.
 if r.participant_id is not null then
  select * into participant from public.combat_participants where id=r.participant_id;
  if not found or participant.participant_type<>'character' or participant.entity_id is distinct from c.id::text
   or participant.campaign_id is distinct from r.campaign_id or participant.encounter_id is distinct from r.encounter_id then
   raise exception 'Concentration save context changed';
  end if;
 elsif r.encounter_id is not null then
  raise exception 'Concentration save context changed';
 end if;
 if r.concentration_revision is null or r.concentration_revision<>c.concentration_revision
  or c.concentration_spell is distinct from r.spell_name or coalesce(c.concentration_spell,'')=''
  or c.campaign_id is distinct from r.campaign_id then
  -- Legacy and superseded offers are retired without rolling away a new spell.
  outcome:='obsolete';score:=null;
 else
  if r.has_advantage then
   if p_second_d20 is null or p_second_d20 not between 1 and 20 then
    raise exception 'This concentration save requires two dice. Update the app and confirm again';
   end if;
   chosen:=greatest(p_d20,p_second_d20);rolls:=array[p_d20,p_second_d20];
  else
   if p_second_d20 is not null then raise exception 'This concentration save requires one die';end if;
   chosen:=p_d20;rolls:=array[p_d20];
  end if;
  if p_penalty_d4 is not null and p_penalty_d4 not between 1 and 4 then raise exception 'Invalid saved penalty die';end if;
  if r.encounter_id is not null then
   -- Use the same encounter/target ordering as effect activation/consumption.
   perform 1 from public.combat_encounters where id=r.encounter_id for share;
   perform 1 from public.combat_participants where id=r.participant_id for update;
   if exists(select 1 from dndkeep_private.mind_sliver_effects where encounter_id=r.encounter_id
    and target_id=r.participant_id and status='active' and consumed_by is null) then
    -- Old clients may still resolve saves with no live penalty. The sentinel
    -- never becomes a real die: if needed, missing input aborts/rolls back.
    penalty_receipt:=dndkeep_private.consume_next_save_penalty('concentration',r.id,r.encounter_id,r.participant_id,coalesce(p_penalty_d4,1));
    penalty_amount:=(penalty_receipt->>'penalty')::integer;
    if penalty_amount>0 and p_penalty_d4 is null then raise exception 'This save needs its saved penalty die. Update the app and confirm again';end if;
   end if;
  end if;
  score:=chosen+r.con_bonus-penalty_amount;
  passed:=case when c.nat_1_20_saves is distinct from false and chosen=1 then false
   when c.nat_1_20_saves is distinct from false and chosen=20 then true else score>=r.dc end;
  outcome:=case when passed then 'passed' else 'failed' end;
  if not passed then
   update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id;
   perform dndkeep_private.clear_campaign_concentration_effects(r.campaign_id,c.id,r.spell_name,r.participant_id,r.encounter_id);
  end if;
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_id,target_name,event_type,payload)
  values(r.campaign_id,r.encounter_id,r.chain_id,60,'player',c.id,c.name,'self',c.id,c.name,'save_rolled',
   jsonb_build_object('save_type','concentration','ability','CON','dc',r.dc,'d20',chosen,'rolls',rolls,'advantage',r.has_advantage,'bonus',r.con_bonus,'total',score,'result',outcome,
    'penalty',penalty_receipt,'trigger','damage','damage',r.damage,'concentration_spell',r.spell_name,'casting_revision',r.concentration_revision,'resolution_source',p_source));
  if not passed then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_id,target_name,event_type,payload)
   values(r.campaign_id,r.encounter_id,r.chain_id,61,'system','System','self',c.id,c.name,'concentration_broken',
    jsonb_build_object('spell',r.spell_name,'reason','failed_save','dc',r.dc,'total',score,'casting_revision',r.concentration_revision));
  end if;
 end if;
 update public.pending_concentration_saves set state=case when outcome='obsolete' or p_source='timeout' then 'expired' else 'resolved' end,
  save_penalty=penalty_receipt,decided_at=now(),d20=case when outcome='obsolete' then null else chosen end,total=score,d20_rolls=rolls,
  result=case when outcome='obsolete' then null else outcome end,resolution_outcome=outcome,resolution_source=p_source where id=r.id;
 return jsonb_build_object('pendingId',r.id,'outcome',outcome,'d20',case when outcome='obsolete' then null else chosen end,'total',score,'replayed',false,'rolls',rolls,'advantage',r.has_advantage,'penalty',penalty_receipt);
end;
$$;

revoke all on function dndkeep_private.settle_concentration_roll(uuid,integer,text,integer,integer) from public,anon;
grant execute on function dndkeep_private.settle_concentration_roll(uuid,integer,text,integer,integer) to authenticated;
-- Preserve the legacy private signature without retaining a penalty bypass.
create or replace function dndkeep_private.settle_concentration_roll(p_pending_id uuid,p_d20 integer,p_source text,p_second_d20 integer)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.settle_concentration_roll(p_pending_id,p_d20,p_source,p_second_d20,null);
$$;
drop function if exists public.settle_pending_concentration_save(uuid,integer,text,integer);
create or replace function public.settle_pending_concentration_save(p_pending_id uuid,p_d20 integer,p_source text,p_second_d20 integer default null,p_penalty_d4 integer default null)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.settle_concentration_roll(p_pending_id,p_d20,p_source,p_second_d20,p_penalty_d4);
$$;
revoke all on function public.settle_pending_concentration_save(uuid,integer,text,integer,integer) from public,anon;
grant execute on function public.settle_pending_concentration_save(uuid,integer,text,integer,integer) to authenticated;