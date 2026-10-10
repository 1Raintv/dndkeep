-- v2.869: absence of offers is not evidence that eligibility was checked.
-- Serialize with the offer dispatcher on the pending attack row. Legacy tabs
-- must recover the window through the current app before advancing its state.
create or replace function dndkeep_private.guard_attack_reaction_advance()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state is not distinct from old.state or new.state not in('damage_rolled','applied') then return new;end if;
 if exists(select 1 from public.pending_reactions where pending_attack_id=old.id and state='offered') then
  raise exception 'Resolve offered reactions before advancing this attack';end if;
 if old.attack_kind='attack_roll' and old.state in('declared','attack_rolled') and not exists(select 1 from dndkeep_private.attack_reaction_offer_batches
  where attack_id=old.id and trigger_point='post_attack_roll') then
  raise exception 'Recover the attack reaction check before advancing this attack';end if;
 if new.state='applied' and not exists(select 1 from dndkeep_private.attack_reaction_offer_batches
  where attack_id=old.id and trigger_point='post_damage_roll') then
  raise exception 'Recover the damage reaction check before applying damage';end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_attack_reaction_advance() from public,anon,authenticated;
