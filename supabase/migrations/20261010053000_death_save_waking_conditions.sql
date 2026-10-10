-- v2.869 audit: waking ends derived incapacity without standing up or removing another parent.
create or replace function dndkeep_private.settle_death_save(p_pending uuid,p_expected jsonb,p_dice integer[],p_bonus integer,p_advantage boolean,p_disadvantage boolean,p_penalty_d4 integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb;r public.pending_death_saves;c public.characters;cb public.combatants;
 prior dndkeep_private.death_save_receipts;request jsonb;receipt jsonb;penalty jsonb;chosen integer;total integer;
 successes integer;failures integer;stable boolean:=false;dead boolean:=false;hp integer:=0;outcome text;exhaustion integer;visibility text;removal jsonb;sheet_removal jsonb;
begin
 ctx:=dndkeep_private.death_save_context(p_pending);
 -- Match other save paths: character, prompt, encounter, participant, combatant.
 select * into c from public.characters where id=(ctx->>'characterId')::uuid for update;
 select * into r from public.pending_death_saves where id=p_pending for update;
 if r.character_id::text is distinct from ctx->>'characterId' or r.participant_id::text is distinct from ctx->>'participantId' or r.encounter_id::text is distinct from ctx->>'encounterId' then raise exception 'Death save identity changed';end if;
 select * into prior from dndkeep_private.death_save_receipts where pending_id=r.id;
 if found then return prior.result||jsonb_build_object('replayed',true);end if;
 perform 1 from public.combat_encounters where id=r.encounter_id for share;
 perform 1 from public.combat_participants where id=r.participant_id for update;
 select * into cb from public.combatants where id=(ctx->>'combatantId')::uuid for update;
 ctx:=dndkeep_private.death_save_context(p_pending);
 if cb.id::text is distinct from ctx->>'combatantId' then raise exception 'Death save combatant changed';end if;
 if r.state<>'pending' then raise exception 'This legacy death save is already resolved';end if;
 request:=jsonb_build_object('expected',p_expected,'dice',p_dice,'bonus',p_bonus,'advantage',p_advantage,'disadvantage',p_disadvantage,'penaltyD4',p_penalty_d4);
 if r.turn_id is null or r.life_revision is null or r.turn_id::text is distinct from ctx->>'currentTurnId' or r.life_revision<>cb.death_state_revision
  or ctx->>'encounterStatus' is distinct from 'active' or cb.current_hp<>0 or cb.is_stable or cb.is_dead
  or cb.death_save_successes>=3 or cb.death_save_failures>=3 then
  outcome:='obsolete';
  update public.pending_death_saves set state='expired',resolved_at=now() where id=r.id;
  receipt:=jsonb_build_object('pendingId',r.id,'outcome',outcome,'d20',null,'total',null,'penalty',null,'replayed',false);
 else
  if p_expected is distinct from ctx then raise exception 'Death save settings changed. Review the saved roll';end if;
  if p_advantage is null or p_disadvantage is null or p_bonus is null or p_bonus not between -100 and 100
   or p_penalty_d4 is null or p_penalty_d4 not between 1 and 4
   or cardinality(p_dice) is distinct from (case when p_advantage<>p_disadvantage then 2 else 1 end)
   or exists(select 1 from unnest(p_dice) d where d is null or d not between 1 and 20)
  then raise exception 'Invalid death save dice or modifiers';end if;
  -- Bonus and advantage are explicitly reviewed effect inputs, never an ability modifier.
  exhaustion:=coalesce(cb.exhaustion_level,0);
  if exhaustion not between 0 and 6 then raise exception 'Review exhaustion';end if;
  select case when p_disadvantage and not p_advantage then min(d) else max(d) end into chosen from unnest(p_dice) d;
  penalty:=dndkeep_private.consume_next_save_penalty('death',r.id,r.encounter_id,r.participant_id,p_penalty_d4);
  total:=chosen+p_bonus-2*exhaustion-(penalty->>'penalty')::integer;
  successes:=coalesce(cb.death_save_successes,0);failures:=coalesce(cb.death_save_failures,0);
  outcome:=case when chosen=20 then 'crit_success' when chosen=1 then 'crit_failure' when total>=10 then 'success' else 'failure' end;
  if chosen=20 then hp:=1;successes:=0;failures:=0;
  elsif chosen=1 then failures:=least(3,failures+2);
  elsif total>=10 then successes:=successes+1;
  else failures:=failures+1;end if;
  stable:=successes>=3;dead:=failures>=3;
  if stable then successes:=0;failures:=0;end if;
  if hp>0 then
   removal:=dndkeep_private.remove_conditions(cb.active_conditions,cb.condition_sources,array['Unconscious']);
   sheet_removal:=dndkeep_private.remove_conditions(c.active_conditions,c.condition_sources,array['Unconscious']);
  end if;
  update public.combatants set current_hp=hp,is_stable=stable,is_dead=dead,death_save_successes=successes,death_save_failures=failures,
   active_conditions=case when hp>0 then array(select jsonb_array_elements_text(removal->'conditions')) else active_conditions end,
   condition_sources=case when hp>0 then removal->'sources' else condition_sources end where id=cb.id;
  update public.characters set current_hp=hp,is_stable=stable,death_saves_successes=successes,death_saves_failures=failures,
   combat_hp_sync_id=r.id,active_conditions=case when hp>0 then array(select jsonb_array_elements_text(sheet_removal->'conditions')) else active_conditions end,
   condition_sources=case when hp>0 then sheet_removal->'sources' else condition_sources end where id=r.character_id;
  update public.pending_death_saves set state='rolled',d20=chosen,result=outcome,successes_after=successes,failures_after=failures,resolved_at=now() where id=r.id;
  select * into c from public.characters where id=r.character_id;
  select case when hidden_from_players then 'hidden_from_players' else 'public' end into visibility from public.combat_participants where id=r.participant_id;
  receipt:=jsonb_build_object('pendingId',r.id,'outcome',outcome,'d20',chosen,'dice',p_dice,'total',total,'bonus',p_bonus,
   'exhaustion',exhaustion,'penalty',penalty,'successes',successes,'failures',failures,'stable',stable,'dead',dead,'hp',hp,'replayed',false);
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_id,target_name,event_type,payload,visibility)
   values(r.campaign_id,r.encounter_id,r.id,0,'player',c.id,c.name,'self',c.id,c.name,'death_save_rolled',receipt,visibility);
 end if;
 insert into dndkeep_private.death_save_receipts(pending_id,request,result) values(r.id,request,receipt);
 return receipt;
end;$$;
revoke all on function dndkeep_private.settle_death_save(uuid,jsonb,integer[],integer,boolean,boolean,integer) from public,anon;
grant execute on function dndkeep_private.settle_death_save(uuid,jsonb,integer[],integer,boolean,boolean,integer) to authenticated;
create or replace function public.settle_pending_death_save(p_pending uuid,p_expected jsonb,p_dice integer[],p_bonus integer,p_advantage boolean,p_disadvantage boolean,p_penalty_d4 integer)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.settle_death_save(p_pending,p_expected,p_dice,p_bonus,p_advantage,p_disadvantage,p_penalty_d4);$$;
revoke all on function public.settle_pending_death_save(uuid,jsonb,integer[],integer,boolean,boolean,integer) from public,anon;
grant execute on function public.settle_pending_death_save(uuid,jsonb,integer[],integer,boolean,boolean,integer) to authenticated;
