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
