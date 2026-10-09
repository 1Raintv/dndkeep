-- Built-in spell IDs only: immutable server metadata, never client spellLevel.
-- Produce Flame is Bonus Action (legacy catalog repair pending); exclude it.
-- Mending takes one minute and is excluded. Catalog parity is regression tested.
create or replace function dndkeep_private.teleporter_cantrip_id(p_id text)
returns boolean language sql immutable security invoker set search_path='' as $$
 select p_id=any(array['acid-splash','blade-ward','chill-touch','dancing-lights','druidcraft','eldritch-blast','elementalism','fire-bolt','friends','frostbite','guidance','light','mage-hand','message','mind-sliver','minor-illusion','poison-spray','prestidigitation','ray-of-frost','resistance','sacred-flame','shocking-grasp','sorcerous-burst','spare-the-dying','starry-wisp','telekinetic-fling','thaumaturgy','thorn-whip','thunderclap','toll-the-dead','true-strike','vicious-mockery','word-of-radiance']);
$$;
revoke all on function dndkeep_private.teleporter_cantrip_id(text) from public,anon,authenticated;
create table if not exists dndkeep_private.teleporter_combat_children (
 parent_id uuid primary key references dndkeep_private.teleporter_combat_windows(parent_id) on delete cascade,
 -- Keep consumption if a pending cast is later pruned or canceled.
 cast_id uuid not null unique,
 character_id uuid not null references public.characters(id) on delete cascade
);
alter table dndkeep_private.teleporter_combat_children enable row level security;
revoke all on dndkeep_private.teleporter_combat_children from public,anon,authenticated;

-- New spell declarations reserve their casting action in the payment transaction.
-- Counterspell may refund a slot, but never the action used to attempt the spell.
create or replace function dndkeep_private.capture_declared_spell_action()
returns trigger language plpgsql security invoker set search_path='' as $$
declare ctx jsonb; parent uuid;
begin
 if tg_op='UPDATE' then
  new.casting_turn_id:=old.casting_turn_id;new.casting_action:=old.casting_action;return new;
 end if;
 select e.psionic_turn_id into new.casting_turn_id from public.pending_spell_casts c
 join public.combat_encounters e on e.id=c.encounter_id where c.id=new.cast_id and e.status='active';
 if new.casting_turn_id is null then raise exception 'Encounter is no longer active';end if;
 new.casting_action:=new.request->'context'->>'actionKind';
 if new.casting_action is null or (new.casting_action not in('action','bonusAction','reaction')
  or (new.request->'context'->>'isBonusAction')::boolean is distinct from (new.casting_action='bonusAction'))
  then raise exception 'Casting action context is invalid';end if;
 ctx:=dndkeep_private.action_turn_context(new.character_id);
 if ctx->>'turnId' is distinct from new.casting_turn_id::text
  or ctx->>'participantId' is distinct from new.request->>'participantId' then raise exception 'Casting turn changed';end if;
 if new.request->'context' ? 'teleporterCombatParent' then
  if coalesce(new.request->'context'->>'teleporterCombatParent','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then raise exception 'Teleporter Combat parent is invalid';end if;
  parent:=(new.request->'context'->>'teleporterCombatParent')::uuid;
  if new.slot_level<>0 or new.request->'context'->>'spellLevel' is distinct from '0'
   or new.casting_action<>'bonusAction'
   or coalesce(new.request->'context'->>'source','') not in('class:Psion','grant:class:Psion')
   or not coalesce(dndkeep_private.teleporter_cantrip_id(new.request->>'spellId'),false)
   then raise exception 'Teleporter Combat requires your Psion cantrip with a one-Action casting time';end if;
  if dndkeep_private.teleporter_combat_origin(new.character_id,parent) is null
   then raise exception 'Teleporter Combat follow-up is no longer available';end if;
  if exists(select 1 from dndkeep_private.teleporter_combat_children where parent_id=parent)
   then raise exception 'Teleporter Combat follow-up already used';end if;
  insert into dndkeep_private.teleporter_combat_children(parent_id,cast_id,character_id) values(parent,new.cast_id,new.character_id);
  -- This is part of the parent's Bonus Action. Never claim another Action,
  -- another Bonus Action, or refund this child when Counterspell succeeds.
  return new;
 end if;
 perform dndkeep_private.claim_action(new.character_id,new.cast_id,jsonb_build_object(
  'turnId',ctx->>'turnId','grantId','normal:'||new.casting_action,
  'kind',new.casting_action,'purpose','magic','sourceId',new.request->>'spellId'));
 return new;
end;$$;
revoke all on function dndkeep_private.capture_declared_spell_action() from public,anon,authenticated;

