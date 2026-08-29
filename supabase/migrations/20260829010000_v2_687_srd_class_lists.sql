-- v2.687.0 — Align every shared spell's class list with the SRD 5.2.1.
--
-- Owner's rule, 2026-08-29: "Yes make sure the SRD matches whatever we're
-- trying to set up."
--
-- Comparing our catalog against "System Reference Document v5.2.1.pdf"
-- (pdftotext, the official PDF — never a web mirror) found 63 spells whose
-- class lists disagreed with the source. Sixty were wrong in BOTH
-- src/data/spells.ts and this table, so no amount of code review would have
-- caught them: both sources had been wrong together since the seed. Players
-- were the ones paying for it — Bards were missing 27 spells they are
-- entitled to, Druids 27, Rangers 20, Sorcerers 20, Warlocks 18.
--
-- Only 8 of the 63 take a class AWAY (Shatter had Warlock, Searing Smite had
-- Ranger, and so on). No character in production held any of those eight for
-- the class being removed — checked before writing this.
--
-- HOW THE SOURCE WAS READ: the SRD states each spell's classes twice, in the
-- per-class list tables and in the class line beneath the spell name. Both
-- were extracted and cross-checked; they never actually disagreed. The result
-- is locked by src/data/srdSpellClasses.test.ts, which fails on any drift.
--
-- ARTIFICER AND PSION ARE PRESERVED, NOT ASSERTED. Neither is in the SRD —
-- the Artificer is absent from the document entirely (zero mentions), and the
-- Psion is Unearthed Arcana. This migration therefore rebuilds each row as
-- "the SRD's classes, plus whichever of those two the row already had". It
-- deliberately does NOT settle the 10 Artificer rows where this table and the
-- repo disagree; that needs a source the SRD cannot provide, and it is an open
-- question for the owner. See docs/SPELL_DATA_DRIFT.md.
--
-- Canonical rows only. Idempotent: it sets each row to a computed value and
-- skips rows already equal to it.

update public.spells s
   set classes = t.target
  from (
    select v.id,
           v.srd
             || (case when 'Artificer' = any(x.classes) then array['Artificer']::text[] else array[]::text[] end)
             || (case when 'Psion'     = any(x.classes) then array['Psion']::text[]     else array[]::text[] end)
             as target
      from (values
    ('message', array['Bard','Druid','Sorcerer','Wizard']::text[]),
    ('spare-the-dying', array['Cleric','Druid']::text[]),
    ('bane', array['Bard','Cleric','Warlock']::text[]),
    ('color-spray', array['Bard','Sorcerer','Wizard']::text[]),
    ('command', array['Bard','Cleric','Paladin']::text[]),
    ('detect-magic', array['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard']::text[]),
    ('entangle', array['Druid','Ranger']::text[]),
    ('faerie-fire', array['Bard','Druid']::text[]),
    ('grease', array['Sorcerer','Wizard']::text[]),
    ('hideous-laughter', array['Bard','Warlock','Wizard']::text[]),
    ('protection-from-evil-and-good', array['Cleric','Druid','Paladin','Warlock','Wizard']::text[]),
    ('speak-with-animals', array['Bard','Druid','Ranger','Warlock']::text[]),
    ('aid', array['Bard','Cleric','Druid','Paladin','Ranger']::text[]),
    ('augury', array['Cleric','Druid','Wizard']::text[]),
    ('continual-flame', array['Cleric','Druid','Wizard']::text[]),
    ('enhance-ability', array['Bard','Cleric','Druid','Ranger','Sorcerer','Wizard']::text[]),
    ('enlarge-reduce', array['Bard','Druid','Sorcerer','Wizard']::text[]),
    ('flame-blade', array['Druid','Sorcerer']::text[]),
    ('flaming-sphere', array['Druid','Sorcerer','Wizard']::text[]),
    ('gentle-repose', array['Cleric','Paladin','Wizard']::text[]),
    ('gust-of-wind', array['Druid','Ranger','Sorcerer','Wizard']::text[]),
    ('magic-weapon', array['Paladin','Ranger','Sorcerer','Wizard']::text[]),
    ('mirror-image', array['Bard','Sorcerer','Warlock','Wizard']::text[]),
    ('prayer-of-healing', array['Cleric','Paladin']::text[]),
    ('shatter', array['Bard','Sorcerer','Wizard']::text[]),
    ('warding-bond', array['Cleric','Paladin']::text[]),
    ('create-food-and-water', array['Cleric','Paladin']::text[]),
    ('dispel-magic', array['Bard','Cleric','Druid','Paladin','Ranger','Sorcerer','Warlock','Wizard']::text[]),
    ('mass-healing-word', array['Bard','Cleric']::text[]),
    ('meld-into-stone', array['Cleric','Druid','Ranger']::text[]),
    ('revivify', array['Cleric','Druid','Paladin','Ranger']::text[]),
    ('slow', array['Bard','Sorcerer','Wizard']::text[]),
    ('speak-with-dead', array['Bard','Cleric','Wizard']::text[]),
    ('vampiric-touch', array['Sorcerer','Warlock','Wizard']::text[]),
    ('arcane-eye', array['Wizard']::text[]),
    ('divination', array['Cleric','Druid','Wizard']::text[]),
    ('dominate-beast', array['Druid','Ranger','Sorcerer']::text[]),
    ('fire-shield', array['Druid','Sorcerer','Wizard']::text[]),
    ('phantasmal-killer', array['Bard','Wizard']::text[]),
    ('arcane-hand', array['Sorcerer','Wizard']::text[]),
    ('cone-of-cold', array['Druid','Sorcerer','Wizard']::text[]),
    ('greater-restoration', array['Bard','Cleric','Druid','Paladin','Ranger']::text[]),
    ('mislead', array['Bard','Warlock','Wizard']::text[]),
    ('planar-binding', array['Bard','Cleric','Druid','Warlock','Wizard']::text[]),
    ('teleportation-circle', array['Bard','Sorcerer','Warlock','Wizard']::text[]),
    ('conjure-fey', array['Druid']::text[]),
    ('flesh-to-stone', array['Druid','Sorcerer','Wizard']::text[]),
    ('freezing-sphere', array['Sorcerer','Wizard']::text[]),
    ('heroes-feast', array['Bard','Cleric','Druid']::text[]),
    ('mass-suggestion', array['Bard','Sorcerer','Wizard']::text[]),
    ('sunbeam', array['Cleric','Druid','Sorcerer','Wizard']::text[]),
    ('prismatic-spray', array['Bard','Sorcerer','Wizard']::text[]),
    ('symbol', array['Bard','Cleric','Druid','Wizard']::text[]),
    ('antipathy-sympathy', array['Bard','Druid','Wizard']::text[]),
    ('demiplane', array['Sorcerer','Warlock','Wizard']::text[]),
    ('incendiary-cloud', array['Druid','Sorcerer','Wizard']::text[]),
    ('sunburst', array['Cleric','Druid','Sorcerer','Wizard']::text[]),
    ('gate', array['Cleric','Sorcerer','Warlock','Wizard']::text[]),
    ('prismatic-wall', array['Bard','Wizard']::text[]),
    ('weird', array['Warlock','Wizard']::text[]),
    ('rarys-telepathic-bond', array['Bard','Wizard']::text[]),
    ('befuddlement', array['Bard','Druid','Warlock','Wizard']::text[]),
    ('searing-smite', array['Paladin']::text[])           ) as v(id, srd)
      join public.spells x on x.id = v.id and x.owner_id is null
  ) t
 where s.id = t.id
   and s.owner_id is null
   and s.classes is distinct from t.target;

-- ── Guard ────────────────────────────────────────────────────────────────
-- Skipped on any database without the full catalog (see the README in this
-- folder): a fresh DB gets schema but not the spell data.
do $$
declare
  total integer;
  n     integer;
begin
  select count(*) into total from public.spells where owner_id is null;
  if total < 300 then
    raise notice 'SRD class check skipped: only % canonical spells present.', total;
    return;
  end if;

  -- The Psion list must be exactly what v2.685 established; nothing above
  -- touches Psion membership, so a different number means this overreached.
  select count(*) into n
    from public.spells
   where owner_id is null and 'Psion' = any(classes);
  if n <> 143 then
    raise exception 'Psion spell list is % rows, expected 143.', n;
  end if;

  -- UA content must still be Psion-only (v2.686).
  select count(*) into n
    from public.spells
   where owner_id is null and source = 'ua' and classes <> array['Psion'];
  if n <> 0 then
    raise exception 'UA spells back on published class lists: % rows.', n;
  end if;
end $$;
