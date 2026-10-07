-- v2.786 — distinguish a new casting even when it uses the same spell ID.
-- This is the identity foundation for atomic campaign save settlement.
alter table public.characters add column if not exists concentration_revision bigint not null default 0;
alter table public.pending_concentration_saves add column if not exists concentration_revision bigint;

-- Ordinary edits cannot move the revision themselves. PostgreSQL runs BEFORE
-- triggers alphabetically; the cast trigger below runs after this guard when
-- a statement explicitly updates both the spell and revision columns.
create or replace function public.guard_concentration_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 new.concentration_revision:=old.concentration_revision;
 return new;
end;
$$;
revoke all on function public.guard_concentration_revision() from public,anon,authenticated;
drop trigger if exists concentration_a_guard_revision on public.characters;
create trigger concentration_a_guard_revision before update of concentration_revision
 on public.characters for each row execute function public.guard_concentration_revision();

create or replace function public.advance_concentration_revision()
returns trigger language plpgsql set search_path='' as $$
begin
 -- UPDATE OF observes the written column, not value equality: recasting the
 -- same spell invalidates its predecessor. HP edits/duration ticks do not.
 new.concentration_revision:=old.concentration_revision+1;
 return new;
end;
$$;
revoke all on function public.advance_concentration_revision() from public,anon,authenticated;
drop trigger if exists concentration_z_advance_revision on public.characters;
create trigger concentration_z_advance_revision before update of concentration_spell
 on public.characters for each row execute function public.advance_concentration_revision();

-- Existing offers deliberately retain NULL: their original casting cannot be
-- reconstructed safely. The new resolver must retire these rather than guess.
comment on column public.pending_concentration_saves.concentration_revision is
 'Casting revision captured when damage occurs. NULL legacy offers cannot safely clear concentration.';
