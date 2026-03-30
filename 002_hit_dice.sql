-- =============================================================
-- DNDKeep — Migration 002
-- Adds hit_dice_spent to track short-rest HD expenditure.
-- Run in Supabase Dashboard > SQL Editor after migration 001.
-- =============================================================

alter table characters
  add column if not exists hit_dice_spent integer not null default 0
    check (hit_dice_spent >= 0);

comment on column characters.hit_dice_spent is
  'Number of hit dice spent since last long rest. Max = character level.';
