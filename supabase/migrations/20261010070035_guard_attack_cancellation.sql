-- v2.869: cancellation must not hide a saved resistance decision or rewrite
-- already-applied damage history. Enforce this for older browser bundles too.
create or replace function public.guard_attack_cancellation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.state='canceled' and old.state is distinct from 'canceled' then
  if old.state='applied' then raise exception 'This attack was already applied. Cancellation cannot undo its effects.';end if;
  if coalesce(old.pending_lr_decision,false) then raise exception 'Decide Legendary Resistance before canceling this attack.';end if;
 end if;
 return new;
end;$$;
revoke all on function public.guard_attack_cancellation() from public,anon,authenticated;
drop trigger if exists guard_attack_cancellation on public.pending_attacks;
create trigger guard_attack_cancellation before update on public.pending_attacks
 for each row execute function public.guard_attack_cancellation();
notify pgrst,'reload schema';
