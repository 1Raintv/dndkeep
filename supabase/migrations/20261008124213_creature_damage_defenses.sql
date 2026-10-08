-- v2.843: preserve imported/catalog and custom creature damage defenses.
-- NULL means unrecorded (legacy rows); an empty array explicitly means none.
-- Do not backfill from source_monster_id: an edited copy may differ from its source.
alter table public.homebrew_monsters
 add column if not exists damage_resistances text[],
 add column if not exists damage_immunities text[],
 add column if not exists damage_vulnerabilities text[];
comment on column public.homebrew_monsters.damage_resistances is 'Saved creature defenses; NULL unknown, empty array none. Entries may include conditions requiring adjudication.';
comment on column public.homebrew_monsters.damage_immunities is 'Saved creature defenses; NULL unknown, empty array none. Entries may include conditions requiring adjudication.';
comment on column public.homebrew_monsters.damage_vulnerabilities is 'Saved creature defenses; NULL unknown, empty array none. Entries may include conditions requiring adjudication.';
