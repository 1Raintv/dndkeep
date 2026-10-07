-- v2.787: independently prepared copies of a shared spell.
-- No backfill: a missing entry means unknown legacy readiness; [] is reviewed
-- and explicitly unprepared. Existing ownership RLS also protects this field.
alter table public.characters add column if not exists spell_preparation_sources jsonb not null default '{}'::jsonb;
comment on column public.characters.spell_preparation_sources is 'Spell ID to prepared source tags. Missing = unreviewed legacy readiness; empty array = reviewed, no prepared source.';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.characters'::regclass and conname='characters_spell_preparation_sources_valid') then
  alter table public.characters add constraint characters_spell_preparation_sources_valid check(public.valid_character_spell_sources(spell_preparation_sources));
 end if;
end $$;
