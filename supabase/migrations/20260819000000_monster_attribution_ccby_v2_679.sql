-- v2.679.0 — Monster attribution: OGL 1.0a -> CC-BY-4.0.
--
-- Phase B (v2.94.0, migration 20260421230818) stamped every SRD monster with
-- license_key 'ogl-1.0a' and an OGL attribution string. That is the wrong
-- licence, and MonsterBrowser.tsx renders attribution_text as a footer under
-- every monster, so the claim has been on screen for users ever since.
--
-- v2.672 corrected exactly this error in the UI copy but not in the data
-- behind it:
--
--   "BestiaryPage said SRD monsters are 'freely usable under OGL 1.0a'.
--    Wrong licence: WotC re-released SRD 5.1 under CC-BY-4.0 in Jan 2023,
--    and SRD 5.2.1 was CC-BY-4.0 from the start and never OGL."
--
-- These monsters are SRD 5.1 content (ruleset_version '2014'), which since
-- January 2023 is offered under CC-BY-4.0 — the licence this project relies
-- on and attributes at /srd. ruleset_version is deliberately NOT touched:
-- 2014 is correct for SRD 5.1 and it drives the bestiary's ruleset filter.
--
-- The attribution string below is WotC's required SRD 5.1 statement, matching
-- the one SrdAttributionPage.tsx renders, minus its leading "also" — that word
-- only reads correctly on a page where the SRD 5.2.1 paragraph comes first.
--
-- Idempotent by construction: the first statement is keyed on the wrong value,
-- so a re-run matches nothing.

UPDATE monsters
SET license_key      = 'cc-by-4.0',
    attribution_text = 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.'
WHERE license_key = 'ogl-1.0a';

-- SRD rows that were inserted after Phase B ran never got any licence metadata
-- at all, so the bestiary shows them with NO credit line — the opposite failure
-- to the one above, and the one CC-BY-4.0 actually requires you to avoid. None
-- in prod today; six in the local seed, which is how they were noticed.
UPDATE monsters
SET license_key      = 'cc-by-4.0',
    attribution_text = 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
    ruleset_version  = COALESCE(ruleset_version, '2014'),
    is_editable      = COALESCE(is_editable, FALSE)
WHERE source = 'srd' AND license_key IS NULL;
