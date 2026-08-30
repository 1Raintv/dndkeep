-- v2.690.0 — Circle of Power: give it back to Clerics and Wizards.
--
-- The owner supplied the 2024 Player's Handbook (2026-08-29) and approved
-- using it to check the spells the SRD cannot reach: "Yes that['s] correct,
-- but this one exception will be artificers to be enabled and disabled."
--
-- The SRD does not contain Circle of Power, so v2.687's reconcile never saw
-- it and production has been offering it to Paladins alone. The PHB says
-- otherwise, four independent ways in the same book:
--
--   the spell's own class line ....... Level 5 Abjuration (Cleric, Paladin, Wizard)
--   LEVEL 5 CLERIC SPELLS table ...... lists Circle of Power
--   LEVEL 5 PALADIN SPELLS table ..... lists Circle of Power
--   LEVEL 5 WIZARD SPELLS table ...... lists Circle of Power
--
-- This is the ONLY row where production disagreed with the PHB across the 36
-- spells the SRD could not cover. src/data/spells.ts already had it right;
-- only the database was wrong, which is the failure mode docs/SPELL_DATA_DRIFT
-- .md exists to catch — the DB row wins an ID collision in useSpells(), so the
-- repo being correct did nothing for players.
--
-- The Artificer tag is deliberately NOT added here. The Artificer is not in
-- the PHB (zero mentions in 868 pages) and stays behind its off-by-default
-- switch; src/data/spells.ts carries the tag for whenever it is turned on.
--
-- Canonical rows only. Idempotent.

update public.spells
   set classes = array['Cleric', 'Paladin', 'Wizard']
                 || (case when 'Artificer' = any(classes) then array['Artificer']::text[] else array[]::text[] end)
                 || (case when 'Psion'     = any(classes) then array['Psion']::text[]     else array[]::text[] end)
 where owner_id is null
   and id = 'circle-of-power'
   and not ('Cleric' = any(classes) and 'Wizard' = any(classes));

do $$
declare
  n integer;
begin
  select count(*) into n from public.spells where owner_id is null and id = 'circle-of-power';
  if n = 0 then
    raise notice 'circle-of-power not present; nothing to reconcile.';
    return;
  end if;

  select count(*) into n
    from public.spells
   where owner_id is null and id = 'circle-of-power'
     and 'Cleric' = any(classes) and 'Paladin' = any(classes) and 'Wizard' = any(classes);
  if n <> 1 then
    raise exception 'circle-of-power did not end up on Cleric/Paladin/Wizard.';
  end if;
end $$;
