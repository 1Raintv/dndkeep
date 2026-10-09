-- Old browser bundles must not bypass penalty consumption with direct updates.
-- Invoker security is intentional: definer settlement functions execute as their
-- database owner; browser writes retain their authenticated/anon role here.
create or replace function public.guard_attack_save_writes()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in('authenticated','anon') then
  if tg_op='INSERT' then
   if new.save_result is not null or new.save_d20 is not null or new.save_total is not null or new.save_penalty is not null or coalesce(new.pending_lr_decision,false) then
    raise exception 'Saving throws require the current save controls. Reload the app';end if;
  elsif new.save_result is distinct from old.save_result or new.save_d20 is distinct from old.save_d20
   or new.save_total is distinct from old.save_total or new.save_penalty is distinct from old.save_penalty
   or new.pending_lr_decision is distinct from old.pending_lr_decision then
   raise exception 'Saving throws require the current save controls. Reload the app';
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.guard_attack_save_writes() from public,anon,authenticated;
drop trigger if exists guard_attack_save_writes on public.pending_attacks;
create trigger guard_attack_save_writes before insert or update on public.pending_attacks
 for each row execute function public.guard_attack_save_writes();
