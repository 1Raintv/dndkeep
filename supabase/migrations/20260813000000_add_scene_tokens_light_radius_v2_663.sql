-- v2.663.0 — Give a token its own light source.
--
-- WHY THIS EXISTS AT ALL
-- Its sibling change makes sight range depend on darkvision instead of
-- the flat 60 ft VisionLayer hardcoded since v2.224. That is the
-- correct rule, and on its own it makes the map WORSE: RAW, a creature
-- with no darkvision standing in darkness sees nothing whatsoever. Every
-- Human, Halfling and Dragonborn would go blind the moment a DM set a
-- scene to Dark.
--
-- Real parties answer that with a torch, so the map needs one too. This
-- column is the torch: the radius, in FEET, that a token's own light
-- reaches. `sightRadiusFt` in src/rules/vision.ts takes the better of
-- this and the creature's darkvision (they overlap; they do not stack).
--
-- FEET, NOT PIXELS
-- Deliberate. Pixels are a rendering detail that changes with
-- scenes.grid_size; a torch is 40 ft on every map. The px conversion
-- happens once, in sightRadiusPx, against the RAW 5 ft square.
--
-- DEFAULT 0
-- No token carries a light until someone says so, which keeps every
-- existing scene rendering exactly as it does today: 0 light + 0
-- darkvision only matters in Dark, and it is the honest answer there.
-- Common values for the picker: 0 (none), 20 (candle), 40 (torch /
-- Light cantrip), 60 (lantern), 120 (daylight).
--
-- Idempotent: safe to re-run.

alter table scene_tokens
  add column if not exists light_radius_ft integer not null default 0;

-- Constraint added separately so a re-run against a DB that already has
-- the column but not the constraint still converges.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scene_tokens_light_radius_ft_check'
  ) then
    alter table scene_tokens
      add constraint scene_tokens_light_radius_ft_check
      check (light_radius_ft >= 0 and light_radius_ft <= 1000);
  end if;
end $$;

comment on column scene_tokens.light_radius_ft is
  'Radius in FEET this token''s own light reaches (0 = carries none). '
  'Combined with the creature''s darkvision by src/rules/vision.ts — '
  'the larger wins, they do not stack. Feet not pixels: a torch is 40ft '
  'on every map regardless of scenes.grid_size.';

-- BOTH TOKEN PATHS NEED IT
-- The map hydrates tokens from one of two tables depending on
-- campaigns.use_combatants_for_battlemap: the legacy scene_tokens, or
-- scene_token_placements (v2.312+). That flag DEFAULTS TO TRUE, so
-- every newly created campaign uses placements — adding the column to
-- scene_tokens alone would ship a light control that silently does
-- nothing for most campaigns, which is precisely the dead-column trap
-- wall_type spent v2.145-v2.661 stuck in.

alter table scene_token_placements
  add column if not exists light_radius_ft integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'scene_token_placements_light_radius_ft_check'
  ) then
    alter table scene_token_placements
      add constraint scene_token_placements_light_radius_ft_check
      check (light_radius_ft >= 0 and light_radius_ft <= 1000);
  end if;
end $$;

comment on column scene_token_placements.light_radius_ft is
  'Mirror of scene_tokens.light_radius_ft for the combatant-backed '
  'placement path (v2.312+). Same units and semantics.';

-- KEEP THE MIRROR IN STEP
-- sync_scene_token_to_placement (v2.389) copies scene_tokens rows into
-- scene_token_placements using an explicit column list, and that list
-- naturally knows nothing about a column added four hundred versions
-- later. Left alone, a legacy-path campaign could set a torch, flip
-- use_combatants_for_battlemap, and find every light silently back at 0.
--
-- Rather than CREATE OR REPLACE that 180-line function — which would
-- mean re-stating logic this migration has no business restating, and
-- risks overwriting prod's definition with a stale copy — this adds a
-- narrow trigger that carries exactly the one new column. It runs after
-- the v2.389 sync (alphabetical order: 'z_' sorts last) so the placement
-- row already exists by the time it fires.

create or replace function public.sync_scene_token_light_to_placement()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.light_radius_ft is distinct from coalesce(old.light_radius_ft, -1) then
    update public.scene_token_placements p
       set light_radius_ft = new.light_radius_ft
     where p.combatant_id in (select id from public.combatants where id = new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists z_scene_tokens_sync_light_trg on scene_tokens;
create trigger z_scene_tokens_sync_light_trg
  after insert or update of light_radius_ft on scene_tokens
  for each row execute function public.sync_scene_token_light_to_placement();

comment on function public.sync_scene_token_light_to_placement() is
  'v2.663 — mirrors scene_tokens.light_radius_ft onto the matching '
  'scene_token_placements row. Companion to sync_scene_token_to_placement '
  '(v2.389), which predates the column and copies a fixed list.';
