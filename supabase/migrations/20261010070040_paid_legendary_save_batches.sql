-- v2.869: charge and declare together, before any legendary-save effects.
create table if not exists dndkeep_private.legendary_save_payments(
 chain_id uuid primary key references dndkeep_private.save_batch_declarations(chain_id) on delete cascade,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.legendary_save_payments enable row level security;
revoke all on dndkeep_private.legendary_save_payments from public,anon,authenticated;
create or replace function dndkeep_private.declare_paid_legendary_saves(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns;e public.combat_encounters;actor public.combat_participants;cb public.combatants;
 chain uuid:=(p_request->>'p_chain_id')::uuid;expected uuid:=(p_request->>'p_turn_id')::uuid;
 cost integer:=(p_request->>'p_legendary_cost')::integer;prior dndkeep_private.legendary_save_payments;
 rows jsonb;result jsonb;current_actor uuid;
begin
 select * into camp from public.campaigns where id=(p_request->>'p_campaign_id')::uuid and owner_id=auth.uid() for share;
 if camp.id is null then raise exception 'Only the campaign DM can declare legendary saves' using errcode='42501';end if;
 select * into e from public.combat_encounters where id=(p_request->>'p_encounter_id')::uuid and campaign_id=camp.id for update;
 if e.id is null or chain is null then raise exception 'Legendary save encounter is unavailable';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('save-batch:'||chain::text,0));
 select * into prior from dndkeep_private.legendary_save_payments where chain_id=chain;
 if found then
  if prior.request is distinct from p_request then raise exception 'Saved legendary save request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.save_batch_declarations where chain_id=chain) then raise exception 'Review this existing declaration before charging legendary actions';end if;
 if e.status<>'active' or expected is distinct from e.psionic_turn_id then raise exception 'Review legendary saves after this combat turn changed';end if;
 if exists(select 1 from dndkeep_private.outgoing_turn_reservations where encounter_id=e.id and turn_id=expected) then raise exception 'Finish the pending turn transition before a legendary action';end if;
 select * into actor from public.combat_participants where id=(p_request->>'p_attacker_id')::uuid and encounter_id=e.id and campaign_id=camp.id for update;
 select * into cb from public.combatants where id=actor.combatant_id and campaign_id=camp.id for update;
 if actor.id is null or cb.id is null or cb.definition_id::text is distinct from actor.entity_id then raise exception 'Legendary save actor is unavailable';end if;
 if coalesce(cb.is_dead,false) or coalesce(cb.current_hp,0)<=0 or coalesce(cb.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'] then raise exception 'Legendary actions are unavailable while incapacitated';end if;
 select cp.id into current_actor from public.combat_participants cp join public.combatants body on body.id=cp.combatant_id
 where cp.encounter_id=e.id and not coalesce(body.is_dead,false) order by cp.turn_order,cp.id offset e.current_turn_index limit 1;
 if current_actor is null or current_actor=actor.id then raise exception 'Legendary actions require another creature’s turn';end if;
 if cost is null or cost<1 or coalesce(actor.legendary_actions_total,0)<cost or coalesce(actor.legendary_actions_remaining,0)<cost then raise exception 'Not enough legendary action points';end if;
 if jsonb_typeof(p_request->'p_targets') is distinct from 'array' or jsonb_array_length(p_request->'p_targets')=0 then raise exception 'Select a legendary save target';end if;
 select jsonb_agg(to_jsonb(r)) into rows from dndkeep_private.declare_save_batch(
 camp.id,e.id,chain,actor.id,p_request->>'p_attacker_name',p_request->>'p_attacker_type',p_request->>'p_attack_name',
 (p_request->>'p_save_dc')::integer,p_request->>'p_save_ability',p_request->>'p_save_success_effect',p_request->>'p_damage_dice',
 p_request->>'p_damage_type',p_request->>'p_inferred_condition',p_request->'p_targets') r;
 update public.combat_participants set legendary_actions_remaining=actor.legendary_actions_remaining-cost where id=actor.id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
 values(camp.id,e.id,chain,0,case when actor.participant_type='character' then 'player' else 'creature' end,actor.name,'self',actor.name,'legendary_action_used',
 jsonb_build_object('action_name',p_request->>'p_attack_name','action_cost',cost,'remaining_before',actor.legendary_actions_remaining,'remaining_after',actor.legendary_actions_remaining-cost,'total',actor.legendary_actions_total),
 case when actor.hidden_from_players then 'hidden_from_players' else 'public' end);
 result:=jsonb_build_object('chainId',chain,'turnId',expected,'cost',cost,'remaining',actor.legendary_actions_remaining-cost,'rows',rows,'replayed',false);
 insert into dndkeep_private.legendary_save_payments(chain_id,request,result) values(chain,p_request,result);
 return result;
end;$$;
revoke all on function dndkeep_private.declare_paid_legendary_saves(jsonb) from public,anon;
grant execute on function dndkeep_private.declare_paid_legendary_saves(jsonb) to authenticated;
create or replace function public.declare_paid_legendary_saves(p_request jsonb)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.declare_paid_legendary_saves(p_request);$$;
revoke all on function public.declare_paid_legendary_saves(jsonb) from public,anon;
grant execute on function public.declare_paid_legendary_saves(jsonb) to authenticated;
notify pgrst,'reload schema';
