-- v2.869 follow-up: persist the free Misty Step origin before offering its
-- Teleporter Combat cantrip. No public grant/spending API is exposed yet.
-- Sequence, not transaction timestamps, orders actions in the same transaction.
alter table dndkeep_private.action_claims add column if not exists action_sequence bigint generated always as identity;
create table if not exists dndkeep_private.teleporter_combat_windows (
 parent_id uuid primary key references public.psionic_energy_uses(request_id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 turn_id text not null,
 action_sequence bigint not null,
 psion_level integer not null check(psion_level between 6 and 20),
 created_at timestamptz not null default clock_timestamp()
);
alter table dndkeep_private.teleporter_combat_windows enable row level security;
revoke all on dndkeep_private.teleporter_combat_windows from public,anon,authenticated;

create or replace function dndkeep_private.claim_free_misty_step_action()
returns trigger language plpgsql security definer set search_path='' as $$
declare context jsonb; c public.characters; psion_level integer; psion_subclass text;
begin
 if new.request->>'operation'='use-misty-step' then
  context:=dndkeep_private.action_turn_context(new.character_id);
  perform dndkeep_private.claim_action(new.character_id,new.request_id,jsonb_build_object(
   'turnId',context->>'turnId','grantId','normal:bonusAction','kind','bonusAction',
   'purpose','magic','sourceId','misty-step'));
  select * into c from public.characters where id=new.character_id;
  psion_level:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
  psion_subclass:=case when c.class_name='Psion' then c.subclass else c.secondary_subclass end;
  if psion_level>=6 and psion_subclass='Psi Warper' then
   insert into dndkeep_private.teleporter_combat_windows(parent_id,character_id,turn_id,action_sequence,psion_level)
   select new.request_id,c.id,context->>'turnId',a.action_sequence,psion_level
   from dndkeep_private.action_claims a where a.request_id=new.request_id;
  end if;
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.claim_free_misty_step_action() from public,anon,authenticated;

-- Private inspection only: a future cantrip declaration must atomically consume
-- the origin, validate canonical spell metadata/source and return a receipt.
-- This reader does NOT authorize casting, including through the ordinary API.
create or replace function dndkeep_private.teleporter_combat_origin(p_character uuid,p_parent uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; origin dndkeep_private.teleporter_combat_windows; psion_level integer;
begin
 c:=public.psionic_character_for_update(p_character);
 context:=dndkeep_private.action_turn_context(c.id);
 select * into origin from dndkeep_private.teleporter_combat_windows
  where parent_id=p_parent and character_id=c.id;
 if not found then return null;end if;
 psion_level:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if psion_level<6 or (case when c.class_name='Psion' then c.subclass else c.secondary_subclass end) is distinct from 'Psi Warper'
  or context->>'turnId' is distinct from origin.turn_id or not (context->>'isOwnTurn')::boolean
  or exists(select 1 from dndkeep_private.action_claims a where a.character_id=c.id and a.action_sequence>origin.action_sequence)
  then return null;end if;
 return jsonb_build_object('parentId',origin.parent_id,'characterId',c.id,'turnId',origin.turn_id,'psionLevel',origin.psion_level);
end;$$;
revoke all on function dndkeep_private.teleporter_combat_origin(uuid,uuid) from public,anon,authenticated;
