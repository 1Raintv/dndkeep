-- v2.869: shared declarations must respect a durable outgoing reservation.
-- Real claim creation already holds encounter SHARE via action_turn_context;
-- reservation creation holds UPDATE, so a competing declaration serializes.
create index if not exists outgoing_reservation_turn_text_idx
 on dndkeep_private.outgoing_turn_reservations ((turn_id::text));
create or replace function dndkeep_private.guard_closing_turn_action_claim()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Reactions can be triggered during outgoing effects. Their existing source,
 -- eligibility and resource checks still apply. Historical claim replays do
 -- not insert a row and cannot be mistaken for a new action.
 if new.request->>'kind' in('action','bonusAction') and exists(
  select 1 from dndkeep_private.outgoing_turn_reservations r
  where r.turn_id::text=new.request->>'turnId') then
  raise exception 'This turn is already ending. Finish the saved turn transition before taking another Action or Bonus Action.';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_closing_turn_action_claim() from public,anon,authenticated;
drop trigger if exists guard_closing_turn_action_claim on dndkeep_private.action_claims;
create trigger guard_closing_turn_action_claim before insert on dndkeep_private.action_claims
 for each row execute function dndkeep_private.guard_closing_turn_action_claim();
notify pgrst,'reload schema';
