-- Owner/DM-only equipment snapshot invalidates a save when its item bonuses change.
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
  'inventory',coalesce(c.inventory,'[]'::jsonb),'exhaustion',cb.exhaustion_level,'buffs',cb.active_buffs,'conditions',cb.active_conditions);
end;$$;
revoke all on function dndkeep_private.death_save_context(uuid) from public,anon;
grant execute on function dndkeep_private.death_save_context(uuid) to authenticated;
create or replace function public.get_death_save_context(p_pending uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.death_save_context(p_pending);$$;
revoke all on function public.get_death_save_context(uuid) from public,anon;
grant execute on function public.get_death_save_context(uuid) to authenticated;


alter table public.pending_death_saves add column if not exists resolution_mode text not null default 'prompt' check(resolution_mode in('prompt','auto'));
create or replace function dndkeep_private.create_death_save_offer(p_character uuid,p_participant uuid,p_turn uuid,p_automatic boolean)
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
 insert into public.pending_death_saves(campaign_id,encounter_id,participant_id,character_id,turn_id,life_revision,resolution_mode)
 values(c.campaign_id,e.id,cp.id,c.id,p_turn,cb.death_state_revision,case when p_automatic then 'auto' else 'prompt' end) returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function dndkeep_private.create_death_save_offer(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function dndkeep_private.create_death_save_offer(uuid,uuid,uuid,boolean) to authenticated;
create or replace function public.create_death_save_offer(p_character uuid,p_participant uuid,p_turn uuid,p_automatic boolean)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.create_death_save_offer(p_character,p_participant,p_turn,p_automatic);$$;
revoke all on function public.create_death_save_offer(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.create_death_save_offer(uuid,uuid,uuid,boolean) to authenticated;

create or replace function dndkeep_private.create_death_save_offer(p_character uuid,p_participant uuid,p_turn uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.create_death_save_offer(p_character,p_participant,p_turn,false);$$;

create or replace function dndkeep_private.review_automatic_death_save(p_pending uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform dndkeep_private.death_save_context(p_pending);
 update public.pending_death_saves set resolution_mode='prompt' where id=p_pending and state='pending';
end;$$;
revoke all on function dndkeep_private.review_automatic_death_save(uuid) from public,anon;
grant execute on function dndkeep_private.review_automatic_death_save(uuid) to authenticated;
create or replace function public.review_automatic_death_save(p_pending uuid)
returns void language sql security invoker set search_path='' as $$select dndkeep_private.review_automatic_death_save(p_pending);$$;
revoke all on function public.review_automatic_death_save(uuid) from public,anon;
grant execute on function public.review_automatic_death_save(uuid) to authenticated;
