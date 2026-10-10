-- v2.869: preserve exact catalog save modifiers on editable creature copies.
-- NULL leaves existing proficiency-based homebrew unchanged. No inferred backfill:
-- existing copies may have been edited independently of their catalog source.
alter table public.homebrew_monsters add column if not exists saving_throws jsonb;
comment on column public.homebrew_monsters.saving_throws is
 'Explicit final saving throw modifiers, keyed by ability. NULL uses verified proficiency data; empty object means no listed save bonuses.';
notify pgrst, 'reload schema';
