-- v2.664.0 — Let a scene choose HOW its fog is decided.
--
-- Until now there was one answer: dynamic line-of-sight. Walls occlude,
-- darkvision and carried light set the radius (v2.663), and the fog
-- follows the tokens automatically. That is the right default and it is
-- what most scenes want.
--
-- It is not what EVERY scene wants. Dynamic fog can only reveal what a
-- token can currently see, so it cannot express "the party has explored
-- this wing and remembers it", or a set piece the DM wants uncovered on
-- a beat, or a cave whose real shape no wall polygon captures cheaply.
-- Every VTT ends up offering both; this is the switch.
--
--   'dynamic' — the v2.224-v2.663 behaviour. Unchanged, and the DEFAULT,
--               so every existing scene keeps rendering exactly as it
--               does today.
--   'manual'  — the DM paints revealed area. Tokens, walls, darkvision
--               and light are ignored for fog purposes; what is revealed
--               is exactly what was painted, and it STAYS revealed.
--
-- REVEALED CELLS
-- Grid cells, not freehand polygons. The map is already a grid, the
-- brush snaps to it, players read position by cell, and a cell list is
-- trivially diffable for realtime. Stored as a JSON array of [row, col]
-- pairs — pairs rather than a linear `row * cols + col` index because
-- width_cells is editable, and a linear index silently reinterprets
-- every stored cell the moment someone resizes the grid.
--
-- Size: a 30x20 scene is 600 cells worst case, a few KB of JSON. Big
-- enough to be worth watching, small enough that a normalised table
-- would cost more in round-trips than it saves in bytes. If maps ever
-- get large enough for this to hurt, a bitset column is the upgrade.
--
-- Idempotent: safe to re-run.

alter table scenes
  add column if not exists fog_mode text not null default 'dynamic';

alter table scenes
  add column if not exists revealed_cells jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scenes_fog_mode_check'
  ) then
    alter table scenes
      add constraint scenes_fog_mode_check
      check (fog_mode in ('dynamic', 'manual'));
  end if;
end $$;

-- Guard the shape too: a bare object or a string here would sail through
-- `jsonb` and only blow up in the renderer, at which point the fog is
-- either missing or covering the whole board mid-session.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scenes_revealed_cells_is_array'
  ) then
    alter table scenes
      add constraint scenes_revealed_cells_is_array
      check (jsonb_typeof(revealed_cells) = 'array');
  end if;
end $$;

comment on column scenes.fog_mode is
  'How fog is decided: ''dynamic'' = line-of-sight from tokens (walls, '
  'darkvision, carried light); ''manual'' = exactly the cells in '
  'revealed_cells, painted by the DM. Default dynamic.';

comment on column scenes.revealed_cells is
  'Manual-fog reveals as a JSON array of [row, col] pairs. Ignored '
  'entirely when fog_mode = ''dynamic''. Pairs not linear indices, '
  'because width_cells is editable.';
