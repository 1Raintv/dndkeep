-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260407183650 (name 'fix_join_code_trigger_empty_string') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE OR REPLACE FUNCTION set_campaign_join_code()
RETURNS trigger LANGUAGE plpgsql AS $$
declare
  new_code text;
  attempts int := 0;
begin
  if new.join_code is not null and new.join_code != '' then
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
