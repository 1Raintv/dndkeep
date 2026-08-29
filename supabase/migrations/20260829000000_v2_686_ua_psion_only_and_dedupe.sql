-- v2.686.0 — Two owner decisions, 2026-08-29.
--
-- 1. UA content is Psion-only. "Anything in the PDFs that I've given you are
--    specific to the Psion because we need to keep that locked down. Anything
--    in the SRD we can use and make sure every class has access to."
--
--    UA-ONLY means the spell is in this app solely because the Psion Unearthed
--    Arcana prints it — the 14 rows with source = 'ua'. Ten of them had drifted
--    onto published class lists (Psychic Scream was on Bard/Sorcerer/Warlock,
--    Intellect Fortress on five classes, and so on). This is the v2.559 "Psion
--    hygiene" rule finally applied to all 14 instead of the six that happened
--    to be wrong when it was written.
--
--    NOTE the distinction this migration does NOT blur: spells the UA merely
--    ADDS to the Psion list — Sanctuary, Power Word Kill, Abi-Dalzim's Horrid
--    Wilting — are SRD content. They keep their own class lists and simply gain
--    Psion. v2.685 did that; nothing here touches them.
--
-- 2. Deduplicate three spells that render twice. "If the SRD has two, let's
--    verify that they're both the same and if they are let's go with Otto's
--    Irresistible Dance" — i.e. keep the version carrying the wizard's name.
--
--    Verified same-spell before removing: identical level, school, casting
--    time, range, components and concentration in each pair; the descriptions
--    differ only in wording length. Snapshots of every removed row are in the
--    commit message for this migration.
--
-- Canonical rows only (owner_id IS NULL). No character in production holds any
-- of these spell IDs in known_spells, prepared_spells or pinned_spells
-- (checked 2026-08-29), and no foreign key references public.spells, so
-- nothing is orphaned by the deletes below.
--
-- Idempotent: every statement is guarded on current state.

-- ── 1. UA-only spells: Psion and nobody else ─────────────────────────────
update public.spells
   set classes = array['Psion']
 where owner_id is null
   and source = 'ua'
   and classes <> array['Psion'];

-- ── 2a. Duplicate pair: keep the wizard-named row, drop the bare one ─────
-- Otto's Irresistible Dance (kept) vs Irresistible Dance (dropped).
-- Rary's Telepathic Bond (kept)   vs Telepathic Bond (dropped).
delete from public.spells
 where owner_id is null
   and id in ('irresistible-dance', 'telepathic-bond');

-- ── 2b. Same duplicate, different shape ──────────────────────────────────
-- Instant Summons had no bare/prefixed PAIR in this table — the DB row was the
-- bare id while src/data/spells.ts carried the prefixed one, and useSpells()
-- unions the two sources, so the app rendered both. Renaming the row in place
-- collapses them to one AND keeps the spell canonical (a delete would have
-- left it living only in the static fallback, which is the drift
-- docs/SPELL_DATA_DRIFT.md exists to stop). The prefixed name is the repo's
-- settled position — scripts/raw-regression.mjs already asserts it.
update public.spells
   set id   = 'drawmijs-instant-summons',
       name = 'Drawmij''s Instant Summons'
 where owner_id is null
   and id = 'instant-summons'
   and not exists (
     select 1 from public.spells x where x.id = 'drawmijs-instant-summons'
   );

-- ── Guards ───────────────────────────────────────────────────────────────
-- Skipped on any database without the full catalog: a fresh DB built from this
-- chain gets schema but not the spell data (supabase/migrations/README.md), and
-- the local Docker stack carries ~32 seed spells.
do $$
declare
  total integer;
  n     integer;
begin
  select count(*) into total from public.spells where owner_id is null;
  if total < 300 then
    raise notice 'checks skipped: only % canonical spells present, not a full catalog.', total;
    return;
  end if;

  select count(*) into n
    from public.spells
   where owner_id is null and source = 'ua' and classes <> array['Psion'];
  if n <> 0 then
    raise exception 'UA spells still on published class lists: % rows.', n;
  end if;

  select count(*) into n
    from public.spells
   where owner_id is null
     and id in ('irresistible-dance', 'telepathic-bond', 'instant-summons');
  if n <> 0 then
    raise exception 'Duplicate spell rows still present: % rows.', n;
  end if;

  -- v2.685's list must survive untouched: none of the above is a Psion-list
  -- change, so a different number here means something above overreached.
  select count(*) into n
    from public.spells
   where owner_id is null and 'Psion' = any(classes);
  if n <> 143 then
    raise exception 'Psion spell list is % rows, expected 143 (UA2025-Psion-v2).', n;
  end if;
end $$;
