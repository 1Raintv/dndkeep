-- v2.794 â€” keep casting source with a particular concentration, not a tab preference.
alter table public.characters add column if not exists concentration_casting_context jsonb;
comment on column public.characters.concentration_casting_context is
 'Source/ability and request identity for the active casting. NULL means legacy or unknown; never infer from primary class.';

create or replace function public.advance_concentration_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 new.concentration_revision:=old.concentration_revision+1;
 -- Any ordinary/older-client spell write is a new casting with unknown source.
 -- The atomic function below writes its validated context after this trigger.
 new.concentration_casting_context:=null;
 return new;
end;
$$;
revoke all on function public.advance_concentration_revision() from public,anon,authenticated;

create or replace function public.record_concentration_cast(
 p_character_id uuid,p_request_id uuid,p_expected_revision bigint,p_spell_id text,
 p_slot_level integer,p_rounds integer,p_source text,p_ability text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to record concentration';end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_expected_revision is null or p_expected_revision<0
  or p_spell_id is null or length(p_spell_id) not between 1 and 160
  or p_slot_level is null or p_slot_level not between 0 and 9
  or (p_rounds is not null and p_rounds<1)
  or p_source is null or not(p_source in('species','feat','other','grant:species') or p_source~'^(grant:)?class:[A-Za-z][A-Za-z -]*$')
  or p_ability is null or p_ability not in('intelligence','wisdom','charisma') then
  raise exception 'Invalid concentration casting source';
 end if;
 context:=jsonb_build_object('requestId',p_request_id,'spellId',p_spell_id,'slotLevel',p_slot_level,
  'rounds',p_rounds,'source',p_source,'ability',p_ability);
 if c.concentration_casting_context->>'requestId'=p_request_id::text then
  if c.concentration_casting_context is distinct from context then raise exception 'Casting request changed';end if;
  return to_jsonb(c);
 end if;
 if c.concentration_revision<>p_expected_revision then raise exception 'Concentration changed; reload before recording another cast';end if;
 -- Both writes are one transaction under the character lock. Existing revision
 -- and save-offer invalidation semantics remain intact; retries never restart duration.
 update public.characters set concentration_spell=p_spell_id,concentration_slot_level=p_slot_level,
  concentration_rounds_remaining=p_rounds where id=c.id;
 update public.characters set concentration_casting_context=context where id=c.id returning * into c;
 return to_jsonb(c);
end;
$$;
revoke all on function public.record_concentration_cast(uuid,uuid,bigint,text,integer,integer,text,text) from public,anon;
grant execute on function public.record_concentration_cast(uuid,uuid,bigint,text,integer,integer,text,text) to authenticated;
