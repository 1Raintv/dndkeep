-- v2.691.0 — Reconcile the Artificer tag with its own book.
--
-- The owner supplied "Eberron: Forge of the Artificer" (2026-08-29), the
-- official book the 2024 Artificer is printed in. Until now the class had NO
-- source we held: it appears zero times in SRD 5.2.1 and zero times in the
-- 2024 Player's Handbook, which is why v2.688 switched it off rather than ship
-- it unverified.
--
-- Its spell list is now transcribed from that book's per-level tables
-- (CANTRIPS + LEVEL 1-5 ARTIFICER SPELLS). 80 spells; we carry 79 of them.
-- Each level was verified by checking every spell's school against the school
-- in the matching column position — the tables print names and schools as
-- separate blocks, so a column read that had slipped by one would show up as
-- mismatched schools rather than passing silently. All 80 lined up.
--
-- THIS SETTLES THE 10 OPEN ARTIFICER ROWS in docs/SPELL_DATA_DRIFT.md, and the
-- repo was right about every one of them. The v2.560 "Artificer backfill",
-- whose source was never recorded, matches the book. Production was the copy
-- that had drifted:
--
--   book says Artificer, prod disagreed : Mage Hand, True Strike,
--     Protection from Energy, Secret Chest, Faithful Hound, Private Sanctum,
--     Resilient Sphere, Arcane Hand, Circle of Power
--   book does not, prod said it did     : Mending, Shield of Faith,
--     Death Ward, Greater Invisibility, Tasha's Caustic Brew
--
-- Two naming notes. "Arcane Hand" is the SRD's trademark-free rename of
-- Bigby's Hand — same level, school, components and the same four hand
-- options — so the book's "Bigby's Hand" is our arcane-hand, correctly tagged
-- already. And Homunculus Servant is new in this book; we do not carry it, so
-- 79 rather than 80. Adding it would mean transcribing rules text out of a
-- paid book, which is a separate decision for the owner.
--
-- THE CLASS STAYS SWITCHED OFF. This makes the data correct, not visible.
-- SITE_WIDE_ENABLED['non-srd'] in src/data/contentGates.ts is still false.
--
-- Canonical rows only. Idempotent, and exhaustive in both directions: any row
-- not on the list loses the tag, so this cannot leave a stray behind.

create temporary table _artificer_spells (id text primary key) on commit drop;

insert into _artificer_spells (id) values
  ('acid-splash'), ('aid'), ('alarm'), ('alter-self'), ('animate-objects'),
  ('arcane-eye'), ('arcane-hand'), ('arcane-lock'), ('arcane-vigor'),
  ('blink'), ('blur'), ('circle-of-power'), ('continual-flame'),
  ('create-food-and-water'), ('creation'), ('cure-wounds'),
  ('dancing-lights'), ('darkvision'), ('detect-magic'), ('disguise-self'),
  ('dispel-magic'), ('dragons-breath'), ('elemental-weapon'),
  ('elementalism'), ('enhance-ability'), ('enlarge-reduce'),
  ('expeditious-retreat'), ('fabricate'), ('faerie-fire'),
  ('faithful-hound'), ('false-life'), ('feather-fall'), ('fire-bolt'),
  ('fly'), ('freedom-of-movement'), ('glyph-of-warding'), ('grease'),
  ('greater-restoration'), ('guidance'), ('haste'), ('heat-metal'),
  ('identify'), ('invisibility'), ('jump'), ('lesser-restoration'),
  ('levitate'), ('light'), ('longstrider'), ('mage-hand'), ('magic-mouth'),
  ('magic-weapon'), ('message'), ('poison-spray'), ('prestidigitation'),
  ('private-sanctum'), ('protection-from-energy'),
  ('protection-from-poison'), ('purify-food-and-drink'), ('ray-of-frost'),
  ('resilient-sphere'), ('resistance'), ('revivify'), ('rope-trick'),
  ('sanctuary'), ('secret-chest'), ('see-invisibility'), ('shocking-grasp'),
  ('spare-the-dying'), ('spider-climb'), ('stone-shape'), ('stoneskin'),
  ('summon-construct'), ('thorn-whip'), ('thunderclap'), ('true-strike'),
  ('wall-of-stone'), ('water-breathing'), ('water-walk'), ('web');

update public.spells
   set classes = classes || array['Artificer']
 where owner_id is null
   and id in (select id from _artificer_spells)
   and not ('Artificer' = any(classes));

update public.spells
   set classes = array_remove(classes, 'Artificer')
 where owner_id is null
   and id not in (select id from _artificer_spells)
   and 'Artificer' = any(classes);

-- Skipped on any database without the full catalog (supabase/migrations/README).
do $$
declare
  total integer;
  n     integer;
begin
  select count(*) into total from public.spells where owner_id is null;
  if total < 300 then
    raise notice 'Artificer check skipped: only % canonical spells present.', total;
    return;
  end if;

  select count(*) into n
    from public.spells where owner_id is null and 'Artificer' = any(classes);
  if n <> 79 then
    raise exception 'Artificer spell list is % rows, expected 79 (Forge of the Artificer).', n;
  end if;
end $$;
