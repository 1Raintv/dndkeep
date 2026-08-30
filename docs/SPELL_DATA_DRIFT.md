# Spell data drift — DB vs static

## Status

As of **v2.152.0** (Phase O pt 5) the code-side source of truth is closed: every
component that reads spells goes through `useSpells` (`lib/hooks/useSpells.ts`).
`SpellsPage` was the last holdout — it used to import the static `SPELLS`
array from `data/spells.ts` directly, which hid DB-only spells from the
compendium browser while every other component saw them.

The **data** side still has drift. This file tracks what it is and what to do
about it.

## The drift (snapshot taken 2026-04-22)

> **Re-counted 2026-08-25:** DB still 378, static now 399. In-code-only is up
> to 39 and in-DB-only down to 18. Three of those 18 are the same spell under
> its pre-2024 ID — and **two of the three are live duplicates**: prod carries
> `irresistible-dance` *and* `ottos-irresistible-dance`, and `telepathic-bond`
> *and* `rarys-telepathic-bond`, so both appear twice in every picker that
> lists them. (`instant-summons` is the harmless case: the static file's
> `drawmijs-instant-summons` has no DB row, so there is only ever one.)
> The lists below are the 2026-04-22 wording and are stale in the details;
> the counts here are current.

| Source | Count |
|---|---|
| DB (`public.spells`, RLS-filtered for SRD + own homebrew + public) | 378 |
| Static `SPELLS` array in `src/data/spells.ts` | 383 |
| Union (what `useSpells` returns via `mergeWithStatic`) | ~400 |

### Spells in static but NOT in DB (22)

These 22 were present in the static array before the canonical seed moved to
the DB and have never been backfilled:

```
arms-of-hadar        blinding-smite      chaos-bolt          chromatic-orb
frostbite            hunger-of-hadar     life-transference   ray-of-sickness
shadow-blade         spirit-shroud       summon-beast        summon-celestial
summon-construct     summon-dragon       summon-elemental    summon-fey
summon-fiend         summon-shadowspawn  summon-undead       toll-the-dead
witch-bolt           word-of-radiance
```

**Notable:** Chromatic Orb, Witch Bolt, Toll the Dead, Blinding Smite are all
commonly-picked spells. The whole 2024 Summon family lives here too. These
should be seeded into the DB so they participate in the canonical RLS flow and
pick up DB-level corrections (like the Scorching Ray `attack_type` repair in
v2.149).

### Spells in DB but NOT in static (17)

```
aura-of-life         aura-of-purity      beast-sense         circle-of-power
compelled-duel       conjure-barrage     conjure-volley      cordon-of-arrows
destructive-wave     ensnaring-strike    find-greater-steed  grasping-vine
hail-of-thorns       holy-weapon         lightning-arrow     swift-quiver
tashas-caustic-brew
```

Ranger/Paladin spells and a few others that got added to the DB but not mirrored
back into the static file. Less urgent — `useSpells` merges them in so they show
up everywhere now that SpellsPage is on the hook.

## The `classes` drift — the one that actually bites (found 2026-08-25)

The section above tracks spells that exist in one source and not the other.
Those are mostly harmless: `mergeWithStatic` unions the two, so a static-only
spell still shows up everywhere.

**Rows present in BOTH sources are a different story.** `mergeWithStatic`
resolves an ID collision by letting the DB row win outright — the static entry
is discarded, field for field. So any correction made in `src/data/spells.ts`
to a spell the DB also has **never reaches a user**. It is live in the repo, in
the tests, in code review, and dead in the app.

27 canonical rows currently disagree with the static file on `classes` alone
(the class-availability list — what a class's spell picker offers). Columns are
what the **DB row is missing** vs the static file, and what it **carries that
the static file dropped**:

| id | DB missing | DB carries, code dropped |
|---|---|---|
| `mage-hand` | +Artificer | — |
| `spare-the-dying` | +Druid | — |
| `true-strike` | +Artificer | — |
| `floating-disk` | +Psion | — |
| `hideous-laughter` | +Psion | — |
| `sanctuary` | +Psion | — |
| `shield-of-faith` | — | -Artificer |
| `prayer-of-healing` | +Paladin | — |
| `animate-dead` | — | -Psion |
| `mass-healing-word` | +Bard | — |
| `protection-from-energy` | +Artificer | — |
| `death-ward` | — | -Artificer |
| `greater-invisibility` | — | -Artificer |
| `private-sanctum` | +Artificer | — |
| `resilient-sphere` | +Artificer | — |
| `secret-chest` | +Artificer | — |
| `arcane-hand` | +Artificer | — |
| `ectoplasmic-trail` | — | -Warlock |
| `bleeding-darkness` | — | -Warlock, -Wizard |
| `intellect-fortress` | — | -Artificer |
| `summon-astral-entity` | — | -Sorcerer, -Warlock |
| `telekinetic-crush` | — | -Sorcerer, -Warlock |
| `life-inversion-field` | — | -Cleric, -Sorcerer |
| `psionic-blast` | — | -Wizard |
| `abi-dalzims-horrid-wilting` | +Psion | — |
| `power-word-heal` | — | -Psion |
| `circle-of-power` | +Artificer, +Cleric, +Wizard | — |

> **Update 2026-08-29 (v2.686):** the three duplicate spells noted above are
> gone. `irresistible-dance` and `telepathic-bond` were deleted (the
> wizard-named rows they duplicated survive); `instant-summons` was renamed in
> place to `drawmijs-instant-summons` so it stays canonical instead of falling
> back to the static file. Verified same-spell first, and no character held any
> of the three. A user now sees 414 spells with zero duplicate groups.
>
> **Also 2026-08-29:** all 14 UA-only spells are `["Psion"]` in both sources —
> that closes the "seven UA-original spells" item below. See
> `docs/PSION_UA_SOURCES.md` § "UA content is Psion-only".
>
> **Settled 2026-08-29 (v2.687), and it was far worse than this table showed.**
> The owner supplied the official SRD 5.2.1 PDF, so the whole catalog could
> finally be checked against a source instead of only code-against-DB. That
> comparison found **63** spells whose class lists disagree with the SRD — not
> the ~20 this table lists, because this table only ever compared our two
> copies with each other, and **60 of the 63 were wrong in both at once**. Two
> wrong copies agree perfectly.
>
> The damage was almost entirely spells players were denied: Bard missing 27,
> Druid 27, Ranger 20, Sorcerer 20, Warlock 18, Wizard 8, Paladin 7, Cleric 6.
> Only 8 spells granted a class the SRD does not, and no character held any of
> those. All 63 are fixed in `src/data/spells.ts` and by migration
> `20260829010000_v2_687_srd_class_lists.sql`, and `srdSpellClasses.test.ts`
> now locks all 335 shared spells to the source.
>
> **The lesson for this file:** "code vs DB" is a consistency check, not a
> correctness one. It cannot see an error both copies share, and most errors
> here were exactly that. Check against the PDF.
>
> **Resolved 2026-08-29 (v2.688) by switching the Artificer off, not by
> settling the data.** The owner's call: tag the content, hide it site-wide for
> the original release, keep the tag so it can be flipped on later. The switch
> is `NON_SRD_CONTENT_ENABLED` in `src/data/contentGates.ts` — one constant,
> currently `false`, guarded by a test that fails if someone flips it without
> reading why.
>
> Nothing was deleted. The class data, its features and every Artificer entry
> in a spell's `classes` array stay exactly where they are; only the discovery
> surfaces filter (creator class picker, compendium list AND its direct URL,
> the spell browser's class filter, and the class badges on a spell). So the 10
> rows below are still unresolved — they are just no longer reachable. Settle
> them against the book the Artificer actually comes from before turning it on:
>
> | Spell | repo | production |
> |---|---|---|
> | Arcane Hand, Mage Hand, Private Sanctum, Protection from Energy, Resilient Sphere, Secret Chest, True Strike | Artificer | not Artificer |
> | Death Ward, Greater Invisibility, Shield of Faith | not Artificer | Artificer |
>
> The repo side came from a "v2.560 Artificer backfill" whose source was never
> recorded. `raw-regression.mjs` asserts only a floor ("Artificer on >= 70
> spell lists"), which is not a source either.
>
> **Also still open:** `circle-of-power` is not in the SRD either, so the same
> problem applies to its whole row, not just its Artificer entry — the repo has
> `[Artificer, Cleric, Paladin, Wizard]` and production has `[Paladin]`. It is
> one of 64 spells we carry that the SRD does not include (UA content plus
> PHB-only spells); none of those 64 can be checked against anything today.

> **Update 2026-08-25 (v2.685):** the Psion rows in this table are resolved.
> All of them were checked against the UA PDFs, `src/data/spells.ts` was
> corrected, `20260825001000_v2_685_psion_spell_list_ua_v2.sql` reconciles
> `public.spells`, and `src/data/psionSpellList.test.ts` locks the result.
> **The other ~20 rows below are still open** — nothing here has adjudicated
> Artificer, Paladin, Bard or Cleric availability against the SRD.

**Four of those rows are the v2.659 Psion audit, undone.** That pass added the
`Psion` tag to Sanctuary and Abi-Dalzim's Horrid Wilting (both named in UA v2's
"new spells" note) and removed it from Animate Dead (dropped by v2's reprinted
base list) — see `docs/PSION_UA_SOURCES.md`. All three landed in
`src/data/spells.ts` and none landed in `public.spells`, so in production the
Psion spell picker still offers Animate Dead and still hides Sanctuary and
Abi-Dalzim's. `floating-disk`, `hideous-laughter` and `power-word-heal` are the
same shape of disagreement but were never adjudicated against the PDFs at all.

**Only the `classes` column has been diffed.** Every other shared column —
`description`, `damage_dice`, `save_type`, `higher_levels` — can be silently
stale the same way and has not been checked.

Fixing this is rules-data work, which is human-gated (`docs/ROADMAP.md`
Track 1): each row needs adjudicating against the SRD 5.2 / UA PDFs before a
migration is written, not a bulk `UPDATE` from the static file.

## Why both sources exist

`useSpells` reads from DB with a **static fallback** so the app keeps working
if Supabase is slow or unreachable on first load — the `SPELLS` array renders
instantly, then the DB fetch upgrades the list. This is a deliberate resilience
pattern, not accidental duplication.

The drift is from the canonical seed being mid-migration — DB rows were added
without static mirrors, and static entries weren't ported to DB.

## What to do next

Two directions, both are real work:

### 1. Seed the 22 missing-from-DB spells

Each spell needs a verified SRD 5.2 source. Per project constraint (and
matching the 2024 MM data story in Phase M), I will not invent stat blocks
from memory. This needs either:

- Manual SQL migration authored from the 2024 SRD 5.2 PDF
- A trusted JSON dump (e.g. from a verified community source like open5e with
  attribution checked)
- A homebrew UI that DMs use to enter them

None of those exist yet. When ready, the insert pattern is
`ruleset_version='2014'` for spells that predate the 2024 PHB reworks,
`source='srd'`, `owner_id=NULL` for canonical visibility via RLS.

### 2. Refresh static fallback from DB dump

Periodically (say quarterly, or after any DB migration that touches spell data
like the v2.149 Scorching Ray repair), dump DB spells and regenerate
`src/data/spells.ts` so the fallback stays close to canonical. Script worth
writing once, runs from CI.

## Watch list

These are other spell-adjacent data files that could drift the same way if not
kept in sync:

- `src/data/spellSlots.ts` — class → slot progression tables (not in DB)
- `src/data/spellPreparedTables.ts` — class → prep count tables (not in DB)
- `src/lib/buffs.ts` `BUFF_SPELL_REGISTRY` — buff spell metadata (code registry)
- `src/lib/multiAttackSpells.ts` `MULTI_ATTACK_SPELLS` — multi-beam registry (code registry, Phase O v2.149)
- `src/lib/healSpells.ts` `HEAL_SPELLS` — heal spell registry (code registry, Phase O v2.150)

Code registries are expected to drift relative to the SRD — they exist to
capture per-spell routing behavior, not canonical stats. If a new heal spell
is added to the DB and DMs want it to use the combat pipeline, its name needs
to land in `HEAL_SPELLS` too. Same for buffs + multi-attack.
