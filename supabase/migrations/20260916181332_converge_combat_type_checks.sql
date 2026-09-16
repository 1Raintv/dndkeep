-- v2.696 — Fresh-chain/test constraints still reject the unified creature
-- vocabulary used by production. Preserve historical monster/npc rows while
-- accepting creature on every tier. No data rewrite, dropped table or RLS change.
-- Transactional replacement: an incompatible row rolls the whole migration back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.combat_participants
  drop constraint if exists combat_participants_participant_type_check,
  add constraint combat_participants_participant_type_check
    check (participant_type in ('character', 'creature', 'monster', 'npc'));
alter table public.combat_events
  drop constraint if exists combat_events_actor_type_check,
  add constraint combat_events_actor_type_check
    check (actor_type in ('player', 'dm', 'creature', 'npc', 'monster', 'system')),
  drop constraint if exists combat_events_target_type_check,
  add constraint combat_events_target_type_check
    check (target_type is null or target_type in ('player', 'creature', 'monster', 'npc', 'object', 'area', 'self'));
alter table public.pending_attacks
  drop constraint if exists pending_attacks_attacker_type_check,
  add constraint pending_attacks_attacker_type_check
    check (attacker_type in ('character', 'creature', 'monster', 'npc', 'system')),
  drop constraint if exists pending_attacks_target_type_check,
  add constraint pending_attacks_target_type_check
    check (target_type is null or target_type in ('character', 'creature', 'monster', 'npc', 'object', 'area', 'self'));
alter table public.pending_reactions
  drop constraint if exists pending_reactions_reactor_type_check,
  add constraint pending_reactions_reactor_type_check
    check (reactor_type in ('character', 'creature', 'monster', 'npc'));
commit;
