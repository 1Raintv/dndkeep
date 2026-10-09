-- A save belongs to one combat turn and one uninterrupted dying episode.
alter table public.combatants add column if not exists death_state_revision bigint not null default 0;
alter table public.pending_death_saves add column if not exists turn_id uuid,add column if not exists life_revision bigint;
create or replace function public.refresh_death_state_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 new.death_state_revision:=old.death_state_revision+case when
  (new.current_hp=0,new.is_stable,new.is_dead) is distinct from (old.current_hp=0,old.is_stable,old.is_dead) then 1 else 0 end;
 return new;
end;$$;
revoke all on function public.refresh_death_state_revision() from public,anon,authenticated;
drop trigger if exists refresh_death_state_revision on public.combatants;
create trigger refresh_death_state_revision before update on public.combatants for each row execute function public.refresh_death_state_revision();
-- Existing offers have no provable episode identity. Do not attach them to a later downing.
update public.pending_death_saves set state='expired',resolved_at=now() where state='pending' and life_revision is null;
create unique index if not exists pending_death_saves_turn_unique on public.pending_death_saves(participant_id,turn_id) where turn_id is not null;
create or replace function public.bind_death_save_offer()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.turn_id is null then select psionic_turn_id into new.turn_id from public.combat_encounters where id=new.encounter_id;end if;
 if new.life_revision is null then select cb.death_state_revision into new.life_revision from public.combatants cb
  join public.combat_participants cp on cp.combatant_id=cb.id where cp.id=new.participant_id;end if;
 return new;
end;$$;
revoke all on function public.bind_death_save_offer() from public,anon,authenticated;
drop trigger if exists bind_death_save_offer on public.pending_death_saves;
create trigger bind_death_save_offer before insert on public.pending_death_saves for each row execute function public.bind_death_save_offer();

create or replace function dndkeep_private.create_death_save_offer(p_character uuid,p_participant uuid,p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters;cp public.combat_participants;e public.combat_encounters;cb public.combatants;r public.pending_death_saves;
begin
 if auth.uid() is null or p_turn is null then raise exception 'A signed-in current turn is required';end if;
 select * into c from public.characters where id=p_character and (user_id=auth.uid() or exists(select 1 from public.campaigns where id=characters.campaign_id and owner_id=auth.uid())) for update;
 if not found then raise exception 'Death save is unavailable';end if;
 select * into cp from public.combat_participants where id=p_participant and participant_type='character' and entity_id=c.id::text and campaign_id=c.campaign_id;
 if not found then raise exception 'Death save target changed';end if;
 select * into e from public.combat_encounters where id=cp.encounter_id and campaign_id=c.campaign_id for share;
 if not found or e.status<>'active' or e.psionic_turn_id<>p_turn or dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id then raise exception 'Death save turn changed';end if;
 select * into cp from public.combat_participants where id=p_participant and encounter_id=e.id and campaign_id=c.campaign_id
  and participant_type='character' and entity_id=c.id::text for update;
 if not found then raise exception 'Death save target changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=c.campaign_id and definition_type='character' and definition_id=c.id::text for update;
 if not found then raise exception 'Death save combatant changed';end if;
 -- Return the same offer even after it was rolled: retrying creation is not another save.
 select * into r from public.pending_death_saves where participant_id=cp.id and turn_id=p_turn;
 if found then return to_jsonb(r);end if;
 if cb.current_hp<>0 or cb.is_stable or cb.is_dead or cb.death_save_successes>=3 or cb.death_save_failures>=3 then return null;end if;
 update public.pending_death_saves set state='expired',resolved_at=now() where participant_id=cp.id and state='pending';
 insert into public.pending_death_saves(campaign_id,encounter_id,participant_id,character_id,turn_id,life_revision)
 values(c.campaign_id,e.id,cp.id,c.id,p_turn,cb.death_state_revision) returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function dndkeep_private.create_death_save_offer(uuid,uuid,uuid) from public,anon;
grant execute on function dndkeep_private.create_death_save_offer(uuid,uuid,uuid) to authenticated;
create or replace function public.create_death_save_offer(p_character uuid,p_participant uuid,p_turn uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.create_death_save_offer(p_character,p_participant,p_turn);$$;
revoke all on function public.create_death_save_offer(uuid,uuid,uuid) from public,anon;
grant execute on function public.create_death_save_offer(uuid,uuid,uuid) to authenticated;
-- Creation and resolution now require scoped functions; old clients cannot forge offers/results.
revoke insert,update,delete on public.pending_death_saves from authenticated,anon;

create or replace function dndkeep_private.death_save_context(p_pending uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pending_death_saves;c public.characters;cp public.combat_participants;cb public.combatants;e public.combat_encounters;
begin
 if auth.uid() is null then raise exception 'Sign in to resolve this save';end if;
 select * into r from public.pending_death_saves where id=p_pending;
 select * into c from public.characters where id=r.character_id and campaign_id=r.campaign_id and
  (user_id=auth.uid() or exists(select 1 from public.campaigns where id=r.campaign_id and owner_id=auth.uid()));
 if not found then raise exception 'Death save is unavailable';end if;
 select * into cp from public.combat_participants where id=r.participant_id and campaign_id=r.campaign_id
  and encounter_id is not distinct from r.encounter_id and participant_type='character' and entity_id=c.id::text;
 if not found then raise exception 'Death save target changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=r.campaign_id
  and definition_type='character' and definition_id=c.id::text;
 if not found then raise exception 'Death save combatant changed';end if;
 select * into e from public.combat_encounters where id=r.encounter_id and campaign_id=r.campaign_id;
 return jsonb_build_object('pendingId',r.id,'characterId',c.id,'participantId',cp.id,'combatantId',cb.id,
  'turnId',r.turn_id,'lifeRevision',r.life_revision,'currentLifeRevision',cb.death_state_revision,'currentTurnId',e.psionic_turn_id,
  'encounterId',r.encounter_id,'state',r.state,'encounterStatus',e.status,'hp',cb.current_hp,
  'stable',cb.is_stable,'dead',cb.is_dead,'successes',cb.death_save_successes,'failures',cb.death_save_failures,
  'exhaustion',cb.exhaustion_level,'buffs',cb.active_buffs,'conditions',cb.active_conditions);
end;$$;
revoke all on function dndkeep_private.death_save_context(uuid) from public,anon;
grant execute on function dndkeep_private.death_save_context(uuid) to authenticated;
create or replace function public.get_death_save_context(p_pending uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.death_save_context(p_pending);$$;
revoke all on function public.get_death_save_context(uuid) from public,anon;
grant execute on function public.get_death_save_context(uuid) to authenticated;

create or replace function dndkeep_private.settle_death_save(p_pending uuid,p_expected jsonb,p_dice integer[],p_bonus integer,p_advantage boolean,p_disadvantage boolean,p_penalty_d4 integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb;r public.pending_death_saves;c public.characters;cb public.combatants;
 prior dndkeep_private.death_save_receipts;request jsonb;receipt jsonb;penalty jsonb;chosen integer;total integer;
 successes integer;failures integer;stable boolean:=false;dead boolean:=false;hp integer:=0;outcome text;exhaustion integer;visibility text;
begin
 ctx:=dndkeep_private.death_save_context(p_pending);
 -- Match other save paths: character, prompt, encounter, participant, combatant.
 perform 1 from public.characters where id=(ctx->>'characterId')::uuid for update;
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
  update public.combatants set current_hp=hp,is_stable=stable,is_dead=dead,death_save_successes=successes,death_save_failures=failures,
   active_conditions=case when hp>0 then array_remove(active_conditions,'Unconscious') else active_conditions end where id=cb.id;
  update public.characters set current_hp=hp,is_stable=stable,death_saves_successes=successes,death_saves_failures=failures,
   combat_hp_sync_id=r.id,active_conditions=case when hp>0 then array_remove(active_conditions,'Unconscious') else active_conditions end where id=r.character_id;
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
