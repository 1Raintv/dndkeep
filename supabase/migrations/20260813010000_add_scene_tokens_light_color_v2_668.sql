-- v2.668.0 — Give a token's light a colour.
--
-- v2.666 split the light into bright and dim bands, so the map can now
-- say how MUCH a lamp lights. This says what KIND: a torch is warm, a
-- Continual Flame is cold blue, a moonbeam is pale, and a brazier in a
-- cultist's shrine is green because that tells the players something
-- before anyone rolls anything.
--
-- NULL = no tint (the existing behaviour, which is neutral white light).
-- Every scene that exists today keeps rendering exactly as it does now,
-- and a DM has to opt a specific lamp in.
--
-- STORED AS AN INTEGER RGB, matching scene_token_placements.color_override
-- rather than inventing a hex-text convention alongside it. 0xRRGGBB, so
-- the range check is a plain 0..16777215.
--
-- Idempotent: safe to re-run.

alter table scene_tokens
  add column if not exists light_color integer;

-- Constraint added separately so a re-run against a DB that already has
-- the column but not the constraint still converges.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scene_tokens_light_color_check'
  ) then
    alter table scene_tokens
      add constraint scene_tokens_light_color_check
      check (light_color is null or (light_color >= 0 and light_color <= 16777215));
  end if;
end $$;

comment on column scene_tokens.light_color is
  'Colour of this token''s own light as 0xRRGGBB, or NULL for untinted '
  '(neutral) light. Only meaningful when light_radius_ft > 0. Same '
  'encoding as scene_token_placements.color_override.';

-- BOTH TOKEN PATHS NEED IT
-- The map hydrates tokens from one of two tables depending on
-- campaigns.use_combatants_for_battlemap: the legacy scene_tokens, or
-- scene_token_placements (v2.312+). That flag DEFAULTS TO TRUE, so
-- every newly created campaign uses placements — adding the column to
-- scene_tokens alone would ship a colour control that silently does
-- nothing for most campaigns. That is exactly the trap light_radius_ft
-- fell into in v2.663 (the column existed everywhere except the SELECT).

alter table scene_token_placements
  add column if not exists light_color integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'scene_token_placements_light_color_check'
  ) then
    alter table scene_token_placements
      add constraint scene_token_placements_light_color_check
      check (light_color is null or (light_color >= 0 and light_color <= 16777215));
  end if;
end $$;

comment on column scene_token_placements.light_color is
  'Mirror of scene_tokens.light_color for the combatant-backed '
  'placement path (v2.312+). Same encoding and semantics.';

-- KEEP THE MIRROR IN STEP
-- Same reasoning as v2.663's light trigger: sync_scene_token_to_placement
-- (v2.389) copies rows using an explicit column list that knows nothing
-- about columns added later, and CREATE OR REPLACE-ing that 180-line
-- function from here risks overwriting prod's definition with a stale
-- copy. A narrow trigger carrying exactly the one new column is the
-- cheaper, safer shape.
--
-- 'z_' prefix so it sorts after the v2.389 sync and the placement row
-- already exists by the time it fires.
--
-- NOTE the NULL handling: v2.663's trigger compares against
-- `coalesce(old.light_radius_ft, -1)`, which works because that column
-- is NOT NULL with a sentinel default. This column IS nullable, so the
-- comparison is a plain IS DISTINCT FROM — that operator already treats
-- NULL as a value, and a coalesce sentinel here would wrongly skip the
-- update that CLEARS a colour back to NULL.

create or replace function public.sync_scene_token_light_color_to_placement()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if tg_op = 'INSERT' or new.light_color is distinct from old.light_color then
    update public.scene_token_placements p
       set light_color = new.light_color
     where p.combatant_id in (select id from public.combatants where id = new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists z_scene_tokens_sync_light_color_trg on scene_tokens;
create trigger z_scene_tokens_sync_light_color_trg
  after insert or update of light_color on scene_tokens
  for each row execute function public.sync_scene_token_light_color_to_placement();

comment on function public.sync_scene_token_light_color_to_placement() is
  'v2.668 — mirrors scene_tokens.light_color onto the matching '
  'scene_token_placements row. Companion to sync_scene_token_to_placement '
  '(v2.389), which predates the column and copies a fixed list.';
