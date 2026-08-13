-- v2.661.0 — Give walls a material type so cover from walls works.
--
-- THE GAP
-- src/rules/cover.ts has scored four wall types since v2.145:
--
--   'wall'   solid          3 points  → alone, total cover
--   'door'   closed door    3 points  → alone, total cover
--   'window' arrow slit     2 points  → alone, three-quarters cover
--   'low'    railing/crate  1 point   → alone, half cover
--   NULL     legacy untyped 1 point   → alone, half cover
--
-- ...but there was nowhere to store the type and no way to author it,
-- so `CoverWall.type` was permanently undefined. Every wall on every
-- live map fell through to the legacy case: a stone wall granted the
-- same half cover as a waist-high railing, and it took three stacked
-- walls to reach total cover. This column is the missing half of the
-- v2.652 cover ship, which covered creatures only.
--
-- NULLABLE ON PURPOSE — NO BACKFILL
-- Existing rows stay NULL and keep scoring as legacy (half cover).
-- Backfilling them to 'wall' would be the "correct" reading of what
-- those walls were always meant to be, but it would also silently
-- upgrade every wall on every live map from half to TOTAL cover in
-- the middle of running campaigns. That is a gameplay change, not a
-- migration, so it is opt-in rather than automatic.
--
-- To convert a scene once the DM is happy to, run:
--
--   update scene_walls
--      set wall_type = 'wall'
--    where scene_id = '<scene-uuid>'
--      and wall_type is null
--      and door_state is null;
--
-- Note `door_state is null` in that filter: door segments are typed
-- from door_state at read time (see coverWalls in
-- battlemap/coverState.ts), so they must not be given a material type
-- as well.
--
-- Walls drawn from v2.661 onward carry a type chosen in the wall
-- toolbar, defaulting to 'wall'.
--
-- Idempotent: safe to re-run.

alter table scene_walls
  add column if not exists wall_type text;

-- Constraint added separately so a re-run against a DB that already
-- has the column (but not the constraint) still converges.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scene_walls_wall_type_check'
  ) then
    alter table scene_walls
      add constraint scene_walls_wall_type_check
      check (wall_type is null or wall_type in ('wall', 'low', 'window', 'door'));
  end if;
end $$;

comment on column scene_walls.wall_type is
  'Material type driving cover contribution (see src/rules/cover.ts). '
  'NULL = legacy untyped, scores as a small obstacle (half cover alone). '
  'Closed doors are typed from door_state at read time, not stored here.';
