# Spell Audit — 2024 PHB (5.5e) Migration

**Scope:** Every spell in `src/data/spells.ts` must match 2024 PHB RAW text and mechanics. No 2014 carryover. If a spell wasn't reprinted in the 2024 PHB (e.g., Psion disciplines, XGE-only, Tasha's-only), it stays on its original source and is marked as such.

**Started:** v2.89.0 (2026-04-21)

**Status legend:**
- ✅ Verified against 2024 PHB
- ⚠️ Still 2014 data — needs migration
- 📘 Not in 2024 PHB — stays on original source (SRD/XGE/Tasha's/homebrew)
- ❓ Needs research to determine 2024 status

---

## Known structural changes (2014 → 2024)

Apply these **globally** during audit:

| Change | Affects | Notes |
|---|---|---|
| **Healing school → Abjuration** | Cure Wounds, Healing Word, Mass Cure Wounds, etc. | Was Evocation/Necromancy in 2014 |
| **"No effect on undead/constructs" removed** | All healing spells | Healing now works on all creature types |
| **Healing dice doubled** | Cure Wounds (1d8→2d8), Healing Word (1d4→2d4) | Upcast scaling also doubled |
| **Prayer of Healing gains Short Rest benefit** | Prayer of Healing only | Targets gain short rest alongside 2d8 heal |
| **One spell slot per turn** | All leveled spells | New 2024 restriction: can't cast 2 leveled spells per turn |
| **Cloud of Daggers** | Movable with Magic action | No longer stationary after cast |

---

## Tier 1 — Most-cast spells (priority)

| Spell | Level | Status | 2024 Version | Notes |
|---|---|---|---|---|
| Aura of Vitality | 3 | ✅ | v2.88.0 | Concentration note added, BA casting clarified |
| Cure Wounds | 1 | ✅ | v2.89.0 | School → Abjuration, 2d8+mod base, +2d8/slot, no undead/construct restriction |
| Healing Word | 1 | ✅ | v2.89.0 | School → Abjuration, 2d4+mod base, +2d4/slot, no undead/construct restriction |
| Mass Cure Wounds | 5 | ✅ | v2.90.0 | School Conjuration → Abjuration, **3d8→5d8+mod base**, no undead/construct restriction |
| Mass Healing Word | 3 | ✅ | v2.89.0 | School → Abjuration, 2d4+mod, no undead/construct restriction |
| Prayer of Healing | 2 | ✅ | v2.89.0 | School → Abjuration, 5 targets (was 6), **grants Short Rest benefit** |
| Bless | 1 | ✅ | v2.90.0 | Material component → Holy Symbol, prose polish. Mechanics unchanged (attacks + saves only) |
| Shield | 1 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |
| Sacred Flame | 0 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |
| Magic Missile | 1 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |
| Burning Hands | 1 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |
| Guiding Bolt | 1 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |
| Scorching Ray | 2 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |
| Fireball | 3 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |
| Lightning Bolt | 3 | ✅ | v2.90.0 | Verified unchanged in 2024 PHB |

**Tier 1 complete.** 15/15 spells verified. Core healing + most-cast combat spells now match 2024 PHB.

## Tier 2 — Cantrips + L1 combat (session 2)
*~65 spells, pending v2.90.0*

## Tier 3 — L2-L3 spells (session 3)
*~130 spells, pending v2.91.0*

## Tier 4 — L4-L9 + rare/utility (sessions 4+)
*~165 spells, pending v2.92.0+*

## Non-PHB 2024 content (stays on original source)
- **Psion disciplines** (homebrew, `classes: [..., "Psion"]`)
- Anything from Xanathar's or Tasha's not reprinted in 2024 PHB

---

## Workflow for each spell

1. Search authoritative source (dndbeyond.com, 5point5.fandom.com, dndlounge.com) for 2024 version
2. Compare to current `src/data/spells.ts` entry
3. Update `description`, `higher_levels`, `school`, `damage_dice`/`heal_dice`, `concentration`, `classes` as needed
4. Update this tracker row to ✅ with version bump that shipped the fix
5. Note meaningful changes in the rightmost column
