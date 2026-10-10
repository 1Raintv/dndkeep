-- v2.869: capture movement evidence in the SAME transaction as its source token.
-- This journal does not declare an aura triggered, roll dice, or apply damage.
-- DM review will classify movement/teleport/group edits using this frozen frame.
create table if not exists dndkeep_private.movement_aura_events (
 sequence bigint generated always as identity primary key,
 id uuid not null default gen_random_uuid() unique,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null,
 placement_id uuid not null, -- source row id; context.source identifies its table
 captured_by uuid,
 captured_at timestamptz not null default clock_timestamp(),
 context jsonb not null check (jsonb_typeof(context)='object')
);
-- Preserve evidence when a participant, placement, or scene is removed. Campaign
-- and encounter deletion still clean up all of their private history.
create index if not exists movement_aura_events_encounter_sequence
 on dndkeep_private.movement_aura_events(encounter_id,sequence desc);
alter table dndkeep_private.movement_aura_events enable row level security;
revoke all on dndkeep_private.movement_aura_events from public,anon,authenticated;
revoke all on sequence dndkeep_private.movement_aura_events_sequence_seq from public,anon,authenticated;

create or replace function dndkeep_private.capture_movement_aura_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare s public.scenes; old_scene public.scenes; campaign uuid; e public.combat_encounters;
 frame jsonb; token_frame jsonb; mover_ids jsonb; aura_present boolean; mover_present boolean;
 previous public.scene_token_placements; following public.scene_token_placements; modern boolean; old_raw jsonb; new_raw jsonb;
begin
 modern:=tg_table_name='scene_token_placements';old_raw:=to_jsonb(old);new_raw:=to_jsonb(new);
 if modern then previous:=old;following:=new;
 else
  previous.id:=old.id;previous.scene_id:=old.scene_id;previous.x:=old.x;previous.y:=old.y;previous.size_override:=old_raw->>'size';
  following.id:=new.id;following.scene_id:=new.scene_id;following.x:=new.x;following.y:=new.y;following.size_override:=new_raw->>'size';
 end if;
 if (following.x,following.y,following.scene_id,following.combatant_id,new_raw->>'character_id',new_raw->>'creature_id') is not distinct from
    (previous.x,previous.y,previous.scene_id,previous.combatant_id,old_raw->>'character_id',old_raw->>'creature_id') then return new;end if;
 select * into s from public.scenes where id=following.scene_id;
 select * into old_scene from public.scenes where id=previous.scene_id;
 -- Placement RLS and its existing column guard authorize the write. The trigger
 -- needs definer rights only to retain hidden aura evidence for the DM.
 -- Campaign/encounter locks serialize capture with the authoritative turn clock.
 for campaign in select c.id from public.campaigns c
   where c.id in(s.campaign_id,old_scene.campaign_id) and coalesce(c.use_combatants_for_battlemap,false)=modern order by c.id for share
 loop
  for e in select * from public.combat_encounters ce
    where ce.campaign_id=campaign and ce.status='active' order by ce.id for share
  loop
   select count(*)>0,coalesce(jsonb_agg(cp.id order by cp.id),'[]'::jsonb) into mover_present,mover_ids
   from public.combat_participants cp where cp.encounter_id=e.id and cp.campaign_id=campaign and (
     (modern and cp.combatant_id in(previous.combatant_id,following.combatant_id)) or
     (not modern and (cp.combatant_id in(previous.id,following.id)
       or (cp.participant_type='character' and cp.entity_id in(old_raw->>'character_id',new_raw->>'character_id'))
       or (cp.participant_type in('creature','monster','npc') and cp.entity_id in(old_raw->>'creature_id',new_raw->>'creature_id')))));
   -- Legacy token identity can be ambiguous for repeated creatures. Retain all
   -- candidates for DM review; never invent an exact combatant link.
   if not modern then previous.combatant_id:=null;following.combatant_id:=null;end if;
   if not mover_present then continue;end if;
   select exists(select 1 from public.combat_participants cp
     join public.combatants cb on cb.id=cp.combatant_id and cb.campaign_id=campaign
     where cp.encounter_id=e.id and cp.campaign_id=campaign and not coalesce(cb.is_dead,false)
       and (jsonb_typeof(cb.active_buffs) is distinct from 'array' or exists(select 1 from jsonb_array_elements(
         case when jsonb_typeof(cb.active_buffs)='array' then cb.active_buffs else '[]'::jsonb end) b where b->>'key' like 'aura:%'))) into aura_present;
   if not aura_present then continue;end if;
   if e.psionic_turn_id is null then raise exception 'Review the combat turn before moving through an aura';end if;
   select coalesce(jsonb_agg(jsonb_build_object(
     'participant',jsonb_build_object('id',cp.id,'combatantId',cp.combatant_id,'type',cp.participant_type,
       'entityId',cp.entity_id,'name',cp.name,'hidden',cp.hidden_from_players,'markers',cp.once_per_turn_used),
     'dead',cb.is_dead,'auraStateValid',jsonb_typeof(cb.active_buffs) is not distinct from 'array',
     'unverifiedAuraState',case when jsonb_typeof(cb.active_buffs) is distinct from 'array' then cb.active_buffs else null end,
     'auras',(select coalesce(jsonb_agg(b),'[]'::jsonb) from jsonb_array_elements(
       case when jsonb_typeof(cb.active_buffs)='array' then cb.active_buffs else '[]'::jsonb end) b where b->>'key' like 'aura:%'),
     'placements',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sceneId',p.scene_id,'x',p.x,'y',p.y,
       'size',p.size_override,'visible',p.visible_to_all) order by p.id),'[]'::jsonb)
       from public.scene_token_placements p join public.scenes placed_scene on placed_scene.id=p.scene_id and placed_scene.campaign_id=campaign where modern and p.combatant_id=cp.combatant_id and p.scene_id in(previous.scene_id,following.scene_id))
   ) order by cp.id),'[]'::jsonb) into frame
   from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id and cb.campaign_id=campaign
   where cp.encounter_id=e.id and cp.campaign_id=campaign;
   if modern then
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sceneId',p.scene_id,'combatantId',p.combatant_id,
      'x',p.x,'y',p.y,'size',p.size_override,'visible',p.visible_to_all) order by p.id),'[]'::jsonb) into token_frame
    from public.scene_token_placements p join public.scenes sc on sc.id=p.scene_id and sc.campaign_id=campaign
    where p.scene_id in(previous.scene_id,following.scene_id);
   else
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'sceneId',p.scene_id,'characterId',p.character_id,'creatureId',p.creature_id,
      'x',p.x,'y',p.y,'size',p.size,'visible',p.visible_to_all) order by p.id),'[]'::jsonb) into token_frame
    from public.scene_tokens p join public.scenes sc on sc.id=p.scene_id and sc.campaign_id=campaign
    where p.scene_id in(previous.scene_id,following.scene_id);
   end if;
   insert into dndkeep_private.movement_aura_events(campaign_id,encounter_id,turn_id,placement_id,captured_by,context)
   values(campaign,e.id,e.psionic_turn_id,following.id,auth.uid(),jsonb_build_object(
     'version',1,'geometryVerified',false,'source',tg_table_name,'tokens',token_frame,'moverParticipantIds',mover_ids,
     'kind',case when previous.scene_id<>following.scene_id then 'scene_transfer' when previous.combatant_id is distinct from following.combatant_id or old_raw->>'character_id' is distinct from new_raw->>'character_id' or old_raw->>'creature_id' is distinct from new_raw->>'creature_id' then 'identity_change' else 'position' end,
     'from',case when old_scene.campaign_id=campaign then jsonb_build_object('sceneId',previous.scene_id,'combatantId',previous.combatant_id,'x',previous.x,'y',previous.y,'size',previous.size_override,'characterId',old_raw->'character_id','creatureId',old_raw->'creature_id') else null end,
     'to',case when s.campaign_id=campaign then jsonb_build_object('sceneId',following.scene_id,'combatantId',following.combatant_id,'x',following.x,'y',following.y,'size',following.size_override,'characterId',new_raw->'character_id','creatureId',new_raw->'creature_id') else null end,
     'scenes',(select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'campaignId',sc.campaign_id,'gridType',sc.grid_type,
       'gridSizePx',sc.grid_size_px,'widthCells',sc.width_cells,'heightCells',sc.height_cells) order by sc.id),'[]'::jsonb)
       from public.scenes sc where sc.id in(previous.scene_id,following.scene_id) and sc.campaign_id=campaign),
     'participants',frame));
  end loop;
 end loop;
 return new;
end;
$$;
revoke all on function dndkeep_private.capture_movement_aura_event() from public,anon,authenticated;
drop trigger if exists capture_movement_aura_event on public.scene_token_placements;
create trigger capture_movement_aura_event after update of x,y,scene_id,combatant_id on public.scene_token_placements
 for each row execute function dndkeep_private.capture_movement_aura_event();

drop trigger if exists capture_movement_aura_event on public.scene_tokens;
create trigger capture_movement_aura_event after update of x,y,scene_id,character_id,creature_id on public.scene_tokens
 for each row execute function dndkeep_private.capture_movement_aura_event();

create or replace function dndkeep_private.read_movement_aura_events(p_encounter uuid,p_before bigint default null,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Movement aura history is available only to its DM';end if;
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for share of c;
 if not found then raise exception 'Movement aura history is available only to its DM';end if;
 if p_limit is null or p_limit<1 or p_limit>100 or (p_before is not null and p_before<1) then raise exception 'Invalid movement history page';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'sequence',m.sequence::text,'campaignId',m.campaign_id,
   'encounterId',m.encounter_id,'turnId',m.turn_id,'placementId',m.placement_id,'capturedAt',m.captured_at,'context',m.context)
   order by m.sequence desc),'[]'::jsonb) into result
 from (select * from dndkeep_private.movement_aura_events
   where encounter_id=p_encounter and (p_before is null or sequence<p_before) order by sequence desc limit p_limit) m;
 return result;
end;
$$;
revoke all on function dndkeep_private.read_movement_aura_events(uuid,bigint,integer) from public,anon;
grant execute on function dndkeep_private.read_movement_aura_events(uuid,bigint,integer) to authenticated;
create or replace function public.read_movement_aura_events(p_encounter uuid,p_before bigint default null,p_limit integer default 50)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.read_movement_aura_events(p_encounter,p_before,p_limit);
$$;
revoke all on function public.read_movement_aura_events(uuid,bigint,integer) from public,anon;
grant execute on function public.read_movement_aura_events(uuid,bigint,integer) to authenticated;

notify pgrst, 'reload schema';
