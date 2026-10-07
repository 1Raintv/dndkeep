-- v2.786 — one locked result, spell clear, dependent cleanup and history.
alter table public.pending_concentration_saves add column if not exists resolution_outcome text;
create or replace function public.settle_pending_concentration_save(p_pending_id uuid,p_d20 integer,p_source text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pending_concentration_saves; c public.characters; participant public.combat_participants;
 target public.combatants; outcome text; score integer; passed boolean; replay boolean:=false;
 needle text; removed text[]; extra text[]; sources jsonb; buffs jsonb;
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
  return jsonb_build_object('pendingId',r.id,'outcome',coalesce(r.resolution_outcome,r.result,'obsolete'),'d20',r.d20,'total',r.total,'replayed',true);
 end if;
 if p_source is null or p_source not in('player','timeout') or p_d20 is null or p_d20 not between 1 and 20 then
  raise exception 'Invalid concentration save result';
 end if;
 select * into participant from public.combat_participants where id=r.participant_id;
 if not found or participant.participant_type<>'character' or participant.entity_id is distinct from c.id::text
  or participant.campaign_id is distinct from r.campaign_id or participant.encounter_id is distinct from r.encounter_id then
  raise exception 'Concentration save context changed';
 end if;
 if r.concentration_revision is null or r.concentration_revision<>c.concentration_revision
  or c.concentration_spell is distinct from r.spell_name or coalesce(c.concentration_spell,'')=''
  or c.campaign_id is distinct from r.campaign_id then
  -- Legacy and superseded offers are retired without rolling away a new spell.
  outcome:='obsolete';score:=null;
 else
  score:=p_d20+r.con_bonus;
  passed:=case when c.nat_1_20_saves is distinct from false and p_d20=1 then false
   when c.nat_1_20_saves is distinct from false and p_d20=20 then true else score>=r.dc end;
  outcome:=case when passed then 'passed' else 'failed' end;
  if not passed then
   update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id;
   needle:='spell:'||lower(r.spell_name);
   -- Lock shared combatant rows in a stable order. Filtering the locked JSON
   -- preserves other casters' effects and unrelated updates; all cleanup rolls
   -- back if any part of settlement or history fails.
   for target in select cb.* from public.combatants cb where cb.campaign_id=r.campaign_id and exists(
    select 1 from public.combat_participants cp where cp.combatant_id=cb.id and cp.campaign_id=r.campaign_id
     and (r.encounter_id is null or cp.encounter_id=r.encounter_id)) order by cb.id for update of cb loop
    sources:=coalesce(target.condition_sources,'{}');buffs:=coalesce(target.active_buffs,'[]');
    if jsonb_typeof(sources)<>'object' or jsonb_typeof(buffs)<>'array' then raise exception 'Check combatant effect data';end if;
    select coalesce(array_agg(key),array[]::text[]) into removed from jsonb_each(sources)
     where value->>'source'=needle and value->>'casterParticipantId'=r.participant_id::text and key=any(coalesce(target.active_conditions,array[]::text[]));
    loop
     select coalesce(array_agg(key),array[]::text[]) into extra from jsonb_each(sources)
      where value->>'source'=any(select 'cascade:'||x from unnest(removed) x) and not(key=any(removed));
     exit when cardinality(extra)=0;removed:=removed||extra;
    end loop;
    select coalesce(jsonb_agg(b),'[]') into buffs from jsonb_array_elements(buffs) b
     where not(coalesce(b->>'source','')=needle and coalesce(b->>'casterParticipantId','')=r.participant_id::text);
    if cardinality(removed)>0 or buffs is distinct from coalesce(target.active_buffs,'[]') then
     update public.combatants set active_conditions=array(select x from unnest(coalesce(target.active_conditions,array[]::text[])) x where not(x=any(removed))),
      condition_sources=sources-removed,active_buffs=buffs,
      exhaustion_level=case when 'Exhaustion'=any(removed) then 0 else exhaustion_level end where id=target.id;
    end if;
   end loop;
  end if;
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_id,target_name,event_type,payload)
  values(r.campaign_id,r.encounter_id,r.chain_id,60,'player',c.id,c.name,'self',c.id,c.name,'save_rolled',
   jsonb_build_object('save_type','concentration','ability','CON','dc',r.dc,'d20',p_d20,'bonus',r.con_bonus,'total',score,'result',outcome,
    'trigger','damage','damage',r.damage,'concentration_spell',r.spell_name,'casting_revision',r.concentration_revision,'resolution_source',p_source));
  if not passed then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_id,target_name,event_type,payload)
   values(r.campaign_id,r.encounter_id,r.chain_id,61,'system','System','self',c.id,c.name,'concentration_broken',
    jsonb_build_object('spell',r.spell_name,'reason','failed_save','dc',r.dc,'total',score,'casting_revision',r.concentration_revision));
  end if;
 end if;
 update public.pending_concentration_saves set state=case when outcome='obsolete' or p_source='timeout' then 'expired' else 'resolved' end,
  decided_at=now(),d20=case when outcome='obsolete' then null else p_d20 end,total=score,
  result=case when outcome='obsolete' then null else outcome end,resolution_outcome=outcome,resolution_source=p_source where id=r.id;
 return jsonb_build_object('pendingId',r.id,'outcome',outcome,'d20',case when outcome='obsolete' then null else p_d20 end,'total',score,'replayed',false);
end;
$$;
revoke all on function public.settle_pending_concentration_save(uuid,integer,text) from public,anon;
grant execute on function public.settle_pending_concentration_save(uuid,integer,text) to authenticated;
