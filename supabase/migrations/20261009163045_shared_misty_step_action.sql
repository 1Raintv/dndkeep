-- Free Psi Warper teleportation still costs a Bonus Action. Compose the claim
-- with the existing authorized energy receipt; exact replay never inserts again.
create or replace function dndkeep_private.claim_free_misty_step_action()
returns trigger language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
 if new.request->>'operation'='use-misty-step' then
  context:=dndkeep_private.action_turn_context(new.character_id);
  perform dndkeep_private.claim_action(new.character_id,new.request_id,jsonb_build_object(
   'turnId',context->>'turnId','grantId','normal:bonusAction','kind','bonusAction',
   'purpose','magic','sourceId','misty-step'));
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.claim_free_misty_step_action() from public,anon,authenticated;
drop trigger if exists claim_free_misty_step_action on public.psionic_energy_uses;
create trigger claim_free_misty_step_action after insert on public.psionic_energy_uses
 for each row execute function dndkeep_private.claim_free_misty_step_action();
