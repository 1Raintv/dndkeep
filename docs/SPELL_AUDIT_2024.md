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

## Tier 2a — Cantrips + tiniest L1 (v2.91.0)

Verified against 2024 PHB sources (Roll20, aidedd.org, dndbeyond.com, dndlounge.com, mythcreants.com, 5point5.fandom.com).

### Cantrips with mechanical changes

| Spell | Status | Key 2024 delta |
|---|---|---|
| Acid Splash | ✅ | School Conjuration → Evocation; targeting "1–2 creatures" → 5-ft-radius Sphere; added area_of_effect data |
| Chill Touch | ✅ | **Major rework:** 120 ft ranged → Touch melee; 1d8 → 1d10 necrotic; heal-block extended to end of your next turn; lost anti-undead disadvantage clause |
| True Strike | ✅ | **Complete rework:** advantage on next attack → now casts AS a weapon attack using spellcasting ability for attack/damage; optional Radiant damage; +1d6/2d6/3d6 radiant at L5/11/17; Duration Instantaneous, no concentration |
| Spare the Dying | ✅ | Range Touch → 15 ft (doubles at L5/11/17); added Druid class; removed undead/construct exclusion |
| Resistance | ✅ | **Complete rework:** one-shot +1d4 save → choose damage type, reduce damage of that type by 1d4 once per turn for full 1-min concentration |
| Guidance | ✅ | **Complete rework:** one-shot +1d4 ability check → choose a skill, +1d4 to any check using that skill for full 1-min concentration |
| Poison Spray | ✅ | School Conjuration → Necromancy; range 10 ft → 30 ft; CON save → ranged spell attack (1d12 on hit, standardized with Fire Bolt etc.) |
| Blade Ward | ✅ | **Rework:** Resistance to B/P/S → attackers subtract 1d4 from attack rolls; duration 1 round, no concentration |
| Mending | ✅ | Casting time 1 min → 1 Action (now combat-usable) |
| Eldritch Blast | ✅ | Prose updated to "You hurl a beam"; can target one creature **or object** (2024 addition) |
| Shillelagh | ✅ | **Major buff:** damage die d8 → d10 (L5) → d12 (L11) → 2d6 (L17); optional Force damage per hit |
| Friends | ✅ | Verified unchanged |

### L1 spells with mechanical changes

| Spell | Status | Key 2024 delta |
|---|---|---|
| Inflict Wounds | ✅ | **Major nerf:** melee spell attack 3d10 → Touch + CON save 2d10 (half on success); base reduced by 1d10 |
| Divine Favor | ✅ | School Evocation → Transmutation; mechanics unchanged |
| Shield of Faith | ✅ | Material component: "parchment w/ holy text" → "a prayer scroll"; mechanics unchanged |
| False Life | ✅ | Prose normalized; mechanics unchanged |
| Expeditious Retreat | ✅ | Prose normalized; mechanics unchanged |
| Purify Food and Drink | ✅ | Prose normalized; mechanics unchanged |
| Jump | ✅ | 2024 prose ("willing creature"); mechanics unchanged |
| Longstrider | ✅ | 2024 prose + "Using a Higher-Level Spell Slot" upcast phrasing |

### 2014/2024 dupe consolidation

| 2014 name | 2024 canonical | Action |
|---|---|---|
| Tasha's Hideous Laughter | Hideous Laughter | Deleted dup entry; merged Psion class into canonical; typo fix ("had" → "has"); Supabase row deleted |
| Tenser's Floating Disk | Floating Disk | Deleted dup entry; merged Psion class into canonical; typo fix ("If can" → "It can"); material comp normalized; Supabase row deleted |

**Tier 2a total: 22 spells fixed/verified this version + 2 dup entries removed.**

## Tier 2b — remaining L1 spells (v2.92.0, pending)
~45 L1 spells to verify against 2024 PHB (Alarm, Animal Friendship, Armor of Agathys, Arms of Hadar, Bane, Chaos Bolt, Charm Person, Chromatic Orb, Color Spray, Command, Comprehend Languages, Create or Destroy Water, Detect Evil and Good, Detect Magic, Detect Poison and Disease, Disguise Self, Dissonant Whispers, Entangle, Faerie Fire, Feather Fall, Find Familiar, Fog Cloud, Goodberry, Grease, Hellish Rebuke, Heroism, Hunter's Mark, Identify, Illusory Script, Mage Armor, Protection from Evil and Good, Ray of Sickness, Sanctuary, Searing Smite, Silent Image, Sleep, Speak with Animals, Thunderous Smite, Thunderwave, Unseen Servant, Witch Bolt, Wrathful Smite).

## Tier 2c — unchanged cantrips needing verification comments only (v2.92.0)
Ray of Frost, Fire Bolt, Mage Hand, Message, Minor Illusion, Light, Dancing Lights, Druidcraft, Prestidigitation, Produce Flame, Thaumaturgy, Shocking Grasp, Vicious Mockery, Mind Sliver, Frostbite, Toll the Dead, Word of Radiance — mechanically unchanged in 2024 but haven't yet had their inline verification comment added.

## Tier 3 — L2-L3 spells (~130 spells, pending v2.93.0+)

## Tier 4 — L4-L9 + rare/utility (~165 spells, pending)

---

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
