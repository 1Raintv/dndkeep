-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260330124930 (name 'add_campaign_join_code') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


-- Add join_code to campaigns
alter table campaigns
  add column if not exists join_code text unique;

-- Generate a random 6-character alphanumeric code (no ambiguous chars)
create or replace function generate_join_code()
returns text language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text := '';
  i     int;
begin
  for i in 1..6 loop
    code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
  end loop;
  return code;
end;
$$;

-- Auto-generate a join code on campaign insert if not provided
create or replace function set_campaign_join_code()
returns trigger language plpgsql as $$
declare
  new_code text;
  attempts int := 0;
begin
  if new.join_code is not null then
    return new;
  end if;
  loop
    new_code := generate_join_code();
    begin
      new.join_code := new_code;
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts > 20 then
        raise exception 'Could not generate unique join code';
      end if;
    end;
  end loop;
end;
$$;

create trigger trg_set_campaign_join_code
  before insert on campaigns
  for each row execute procedure set_campaign_join_code();

-- Backfill existing campaigns
update campaigns
set join_code = sub.code
from (
  select id, generate_join_code() as code from campaigns where join_code is null
) sub
where campaigns.id = sub.id;

-- Make it not null now that all rows have a value
alter table campaigns alter column join_code set not null;

-- Security definer function for looking up campaigns by join code
-- (bypasses RLS so anyone can look up a campaign to join it)
create or replace function get_campaign_by_code(code text)
returns table (
  id          uuid,
  name        text,
  description text,
  setting     text,
  owner_id    uuid
) language sql security definer stable as $$
  select id, name, description, setting, owner_id
  from campaigns
  where join_code = upper(trim(code))
    and is_active = true
  limit 1;
$$;
