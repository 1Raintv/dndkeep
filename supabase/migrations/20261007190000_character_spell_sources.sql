-- v2.787: explicit learning sources for shared multiclass/feature spells.
-- Legacy rows stay unknown; class-list membership cannot prove ownership.
alter table public.characters add column if not exists spell_sources jsonb not null default '{}'::jsonb;
comment on column public.characters.spell_sources is 'Spell ID to learning source tags; missing keys mean unknown legacy ownership.';
