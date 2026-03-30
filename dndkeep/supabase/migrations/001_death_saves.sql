-- =============================================================
-- DNDKeep — Migration 001
-- Adds proper death saves columns to the characters table.
-- Run in Supabase Dashboard > SQL Editor after the initial schema.
-- =============================================================

alter table characters
  add column if not exists death_saves_successes integer not null default 0
    check (death_saves_successes between 0 and 3),
  add column if not exists death_saves_failures  integer not null default 0
    check (death_saves_failures between 0 and 3);

comment on column characters.death_saves_successes is
  'Number of successful death saving throws (0-3). Only relevant when current_hp = 0.';
comment on column characters.death_saves_failures is
  'Number of failed death saving throws (0-3). Three failures = character is dead.';
