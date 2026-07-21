-- v2.622.0 — General class-choice storage. Keyed map of pick-one
-- class feature selections, e.g. {"druid_elemental_fury": "primal_strike"}.
-- First consumer: Druid L7 Elemental Fury (Potent Spellcasting vs
-- Primal Strike, SRD 5.2.1). Future: fighting styles, etc.
alter table public.characters
  add column if not exists class_choices jsonb not null default '{}'::jsonb;
