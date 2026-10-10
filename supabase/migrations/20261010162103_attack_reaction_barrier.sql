-- v2.869: UI waiting state is not a concurrency boundary. Keep open offers
-- and attack advancement serialized on the same attack row.
create or replace function dndkeep_private.guard_attack_reaction_offer()
returns trigger language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks;
begin
 if new.pending_attack_id is null or new.state<>'offered' then return new;end if;
 select * into a from public.pending_attacks where id=new.pending_attack_id for update;
 if not found or a.campaign_id is distinct from new.campaign_id then raise exception 'Reaction attack is unavailable';end if;
 if a.state in('applied','canceled') then raise exception 'Attack reaction window has closed';end if;
 if new.trigger_point='post_attack_roll' and a.state<>'attack_rolled'
  or new.trigger_point in('post_damage_roll','pre_damage_applied') and a.state<>'damage_rolled' then
  raise exception 'Attack moved beyond this reaction window';
 end if;
 if not exists(select 1 from public.combat_participants p where p.id=new.reactor_participant_id and p.campaign_id=a.campaign_id
  and (a.encounter_id is null or p.encounter_id=a.encounter_id)) then raise exception 'Reaction participant is outside this attack';end if;
 return new;
end;$$;
-- RLS on the triggering table authorizes writes. These private trigger bodies
-- cannot be invoked directly; definer reads include other players' open offers.
revoke all on function dndkeep_private.guard_attack_reaction_offer() from public,anon,authenticated;
drop trigger if exists guard_attack_reaction_offer on public.pending_reactions;
create trigger guard_attack_reaction_offer before insert or update on public.pending_reactions
 for each row execute function dndkeep_private.guard_attack_reaction_offer();

create or replace function dndkeep_private.guard_attack_reaction_advance()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state is distinct from old.state and new.state in('damage_rolled','applied') and exists(
  select 1 from public.pending_reactions where pending_attack_id=old.id and state='offered'
 ) then raise exception 'Resolve offered reactions before advancing this attack';end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_attack_reaction_advance() from public,anon,authenticated;
drop trigger if exists guard_attack_reaction_advance on public.pending_attacks;
create trigger guard_attack_reaction_advance before update on public.pending_attacks
 for each row execute function dndkeep_private.guard_attack_reaction_advance();
