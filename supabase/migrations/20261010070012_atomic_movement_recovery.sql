-- v2.869: deterministic movement recovery after the saved outgoing effects.
-- One receipt per actor/turn prevents a lost response from clearing later uses.
create table if not exists dndkeep_private.turn_movement_recoveries(
 participant_id uuid not null references public.combat_participants(id) on delete cascade,
 turn_id uuid not null,result jsonb not null,created_at timestamptz not null default now(),primary key(participant_id,turn_id)
);
alter table dndkeep_private.turn_movement_recoveries enable row level security;
revoke all on dndkeep_private.turn_movement_recoveries from public,anon,authenticated;

create or replace function dndkeep_private.recover_turn_movement_features(p_participant uuid,p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;hero public.characters;enc public.combat_encounters;camp uuid;
 character_id uuid;prior jsonb;result jsonb;uses jsonb;recovered jsonb:='[]';k text;context jsonb;
begin
 -- Resolve first, then lock the character before campaign/encounter like other
 -- character resource writers. Recheck the participant mapping under its lock.
 select p.entity_id::uuid into character_id from public.combat_participants p join public.campaigns c on c.id=p.campaign_id
 where p.id=p_participant and p.participant_type='character' and c.owner_id=auth.uid();
 if character_id is null then raise exception 'Movement recovery is available only to the character campaign DM';end if;
 select * into hero from public.characters where id=character_id for update;
 if not found then raise exception 'Recovery character is unavailable';end if;
 select c.id into camp from public.campaigns c join public.combat_participants p on p.campaign_id=c.id
 where p.id=p_participant and c.owner_id=auth.uid() for share of c;
 if camp is null then raise exception 'Movement recovery is available only to the character campaign DM';end if;
 select e.* into enc from public.combat_encounters e join public.combat_participants p on p.encounter_id=e.id
 where p.id=p_participant and e.campaign_id=camp for share of e;
 select * into cp from public.combat_participants where id=p_participant for update;
 if enc.id is null or cp.encounter_id is distinct from enc.id or cp.campaign_id is distinct from camp
  or cp.participant_type is distinct from 'character' or cp.entity_id is distinct from character_id::text then raise exception 'Recovery participant changed';end if;
 if p_turn is null then raise exception 'Invalid recovery turn';end if;
 select r.result into prior from dndkeep_private.turn_movement_recoveries r where r.participant_id=cp.id and r.turn_id=p_turn;
 if found then return prior||jsonb_build_object('replayed',true);end if;
 -- The end-effect receipt anchors even an actor killed by its outgoing effect.
 if not exists(select 1 from dndkeep_private.turn_effect_batches b where b.participant_id=cp.id and b.turn_id=p_turn and b.timing='turn_end') then raise exception 'Confirm outgoing turn effects before movement recovery';end if;
 context:=dndkeep_private.combat_clock_context(enc.id,p_turn);
 if context->>'outgoingId' is distinct from cp.id::text then raise exception 'Outgoing recovery actor changed';end if;
 if cp.movement_used_ft is null or cp.movement_used_ft<0 then raise exception 'Review movement before recovery';end if;
 uses:=coalesce(hero.feature_uses,'{}'::jsonb);
 if jsonb_typeof(uses)<>'object' then raise exception 'Review feature uses before recovery';end if;
 if cp.movement_used_ft=0 then
  -- Both existing tracker aliases; never copy a browser snapshot or reset a
  -- different feature. This registry matches species.ts recovery: movement.
  foreach k in array array['Feline Agility','species:Feline Agility'] loop
   if uses ? k then
    if jsonb_typeof(uses->k)<>'number' or uses->>k!~'^[0-9]+$' then raise exception 'Review movement feature uses';end if;
    if (uses->>k)::numeric>0 then uses:=jsonb_set(uses,array[k],'0');recovered:=recovered||jsonb_build_array(k);end if;
   end if;
  end loop;
 end if;
 if jsonb_array_length(recovered)>0 then update public.characters set feature_uses=uses where id=hero.id;end if;
 result:=jsonb_build_object('participantId',cp.id,'encounterId',enc.id,'turnId',p_turn,'characterId',hero.id,'recovered',recovered,'replayed',false);
 insert into dndkeep_private.turn_movement_recoveries(participant_id,turn_id,result) values(cp.id,p_turn,result);
 return result;
end;$$;
revoke all on function dndkeep_private.recover_turn_movement_features(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.recover_turn_movement_features(uuid,uuid) to authenticated;
create or replace function public.recover_turn_movement_features(p_participant uuid,p_turn uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.recover_turn_movement_features(p_participant,p_turn);$$;
revoke all on function public.recover_turn_movement_features(uuid,uuid) from public,anon;
grant execute on function public.recover_turn_movement_features(uuid,uuid) to authenticated;
