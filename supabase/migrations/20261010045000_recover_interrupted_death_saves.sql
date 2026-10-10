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
  'resolutionMode',r.resolution_mode,'turnId',r.turn_id,'lifeRevision',r.life_revision,'currentLifeRevision',cb.death_state_revision,'currentTurnId',e.psionic_turn_id,
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


-- v2.869 audit: a closed/offline browser must not hide an automatic offer forever.
-- Server time owns the grace period; discovering an offer does not roll or settle it.
create or replace function public.next_recoverable_death_save(p_character uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.characters c where c.id=p_character
  and (c.user_id=auth.uid() or exists(select 1 from public.campaigns g where g.id=c.campaign_id and g.owner_id=auth.uid())))
 then raise exception 'Death save is unavailable';end if;
 select id into result from public.pending_death_saves where character_id=p_character and state='pending'
  and (resolution_mode='prompt' or created_at<=statement_timestamp()-interval '60 seconds')
  order by created_at,id limit 1;
 return result;
end;$$;
revoke all on function public.next_recoverable_death_save(uuid) from public,anon;
grant execute on function public.next_recoverable_death_save(uuid) to authenticated;

-- Use settlement's character-first lock order. Changing the context mode fences
-- late automatic requests; an already committed receipt still wins on replay.
create or replace function dndkeep_private.review_automatic_death_save(p_pending uuid)
returns void language plpgsql security definer set search_path='' as $$
declare ctx jsonb;
begin
 ctx:=dndkeep_private.death_save_context(p_pending);
 perform 1 from public.characters where id=(ctx->>'characterId')::uuid for update;
 perform dndkeep_private.death_save_context(p_pending);
 update public.pending_death_saves set resolution_mode='prompt' where id=p_pending and state='pending';
end;$$;
revoke all on function dndkeep_private.review_automatic_death_save(uuid) from public,anon;
grant execute on function dndkeep_private.review_automatic_death_save(uuid) to authenticated;
