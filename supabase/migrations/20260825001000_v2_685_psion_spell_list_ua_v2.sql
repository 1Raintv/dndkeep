-- v2.685.0 — Reconcile the Psion tag on public.spells with UA2025-Psion-v2.
--
-- WHY THIS EXISTS
-- `useSpells` merges the DB list with the static SPELLS array and lets the DB
-- row win outright on an ID collision. So a correction made in
-- src/data/spells.ts to a spell the DB also carries never reaches a player —
-- it is live in the repo and dead in the app. The v2.659 Psion audit landed
-- in the repo only, which is why production still offered Psions Animate Dead
-- (dropped by UA v2) and still hid Sanctuary and Abi-Dalzim's Horrid Wilting
-- (added by it). See docs/SPELL_DATA_DRIFT.md § "The `classes` drift".
--
-- SOURCE
-- Every row below was checked against the Psion spell-list tables and the
-- per-spell stat blocks in UA2025-Psion-v2.pdf on 2026-08-25 (pdftotext, no
-- -layout, per docs/PSION_UA_SOURCES.md). v2 reprints the base spell list in
-- full, so v2 governs it outright — absence from v2 IS removal here, which is
-- the rule that file settles. After this migration the DB's Psion tag matches
-- that list exactly at 143 spells, and matches src/data/spells.ts.
--
-- Canonical rows only (owner_id IS NULL). Homebrew is left alone.
-- Idempotent: every statement is a set operation guarded on current state.

-- ── ON the UA v2 base list, untagged in the DB ───────────────────────────
-- floating-disk / hideous-laughter / sanctuary  — Level 1 table
-- locate-object                                 — Level 2 table
-- abi-dalzims-horrid-wilting                    — Level 8 table + stat block
-- antimagic-field                               — Level 8 table
-- power-word-kill                               — Level 9 table
update public.spells
   set classes = classes || array['Psion']
 where owner_id is null
   and id in (
     'floating-disk',
     'hideous-laughter',
     'sanctuary',
     'locate-object',
     'abi-dalzims-horrid-wilting',
     'antimagic-field',
     'power-word-kill'
   )
   and not ('Psion' = any(classes));

-- ── NOT on the UA v2 base list, tagged in the DB ─────────────────────────
-- animate-dead      — on UA v1's list, absent from v2's reprinted list.
-- cloud-of-daggers  — Psykinetic level-3 grant, not a base-list spell.
-- steel-wind-strike — Psi Warper level-9 grant, likewise.
-- aura-of-vitality  — Metamorph level-5 grant, likewise.
--
-- The three subclass grants keep working: getSubclassSpellIds() resolves
-- Class.subclasses[].spell_list by NAME through SPELL_NAME_TO_ID and never
-- reads this column. Dropping the tag only takes them out of the general
-- Psion spell picker, which is the RAW behaviour — a Metamorph cannot
-- prepare Steel Wind Strike off the class list.
update public.spells
   set classes = array_remove(classes, 'Psion')
 where owner_id is null
   and id in (
     'animate-dead',
     'cloud-of-daggers',
     'steel-wind-strike',
     'aura-of-vitality'
   )
   and 'Psion' = any(classes);

-- ── DELIBERATELY OUT OF SCOPE: the non-Psion classes on UA spells ────────
-- Seven UA-original spells (Bleeding Darkness, Ectoplasmic Trail, Intellect
-- Fortress, Life Inversion Field, Psionic Blast, Summon Astral Entity,
-- Telekinetic Crush) print class lines in the PDF that name published
-- classes too — e.g. Psionic Blast is "Level 6 Evocation (Psion, Wizard)".
-- Production currently honours that; this repo does not, because the v2.559
-- "Psion hygiene" rule keeps UA content off published-class spell lists and
-- scripts/raw-regression.mjs enforces it.
--
-- That is a real, unresolved disagreement between the PDF and a deliberate
-- product decision, and it is NOT the Psion's own list, so this migration
-- leaves it alone rather than settling it as a side effect. Tracked in
-- docs/SPELL_DATA_DRIFT.md.

-- ── Guard: fail loudly if the result is not the 143-spell UA v2 list ─────
-- Only meaningful where the full spell catalog is present. A fresh DB built
-- from this migration chain gets schema but NOT the catalog (see
-- supabase/migrations/README.md), and the local Docker stack carries ~32
-- seed spells — asserting 143 there would abort a legitimate apply. So the
-- check arms itself only on a database that actually holds the catalog.
do $$
declare
  total integer;
  n     integer;
begin
  select count(*) into total from public.spells where owner_id is null;
  if total < 300 then
    raise notice
      'Psion list check skipped: only % canonical spells present, this is not a full catalog.', total;
    return;
  end if;

  select count(*) into n
    from public.spells
   where owner_id is null and 'Psion' = any(classes);
  if n <> 143 then
    raise exception
      'Psion spell list is % rows after reconcile, expected 143 (UA2025-Psion-v2). Refusing to leave the catalog in an unverified state.', n;
  end if;
end $$;
