# DNDKeep — Three-Track Roadmap

**Established:** July 2026 (chat 15)
**Status:** Living document. Update as tracks progress.
**Current version:** v2.548.0

This document is the durable map for DNDKeep's development. It exists so that
progress can continue across sessions without re-deriving context, and so the
three parallel efforts don't drift into each other's risk budgets.

---

## The core principle: three tracks, three risk profiles

DNDKeep's development is split into three tracks that deliberately do **not**
compete for the same risk budget. Each has its own cadence and its own tolerance
for breakage.

| Track | What | Risk profile | Cadence |
|-------|------|--------------|---------|
| **1 — RAW accuracy + automation** | Correctness of rules data; detection/verification automation | Low tolerance for silent error. Human-gated. | Gated sessions when real RAW work exists |
| **2 — Live lightweight map** | Iterate the current production map; keep + improve automations | Production, so gated — but engineering, not rules-judgment | Daily default; small visible ships |
| **3 — Graphics-rich map** | Roll20-caliber map, built in isolation, imported later | High tolerance — quarantined from production | Dedicated deeper sessions |

The insight that makes this work: **Track 3's risk is quarantined.** Aggressive
"break things and iterate" is safe there precisely because it is not in the
production path. Track 2 gives daily visible progress; Track 3 gives the ambitious
long-term goal; Track 1 keeps the core trustworthy.

---

## Track 1 — RAW accuracy + automation

**Goal:** Get the site as automated and as close to 2024 D&D rules as possible,
using only official content. No invented spells, monsters, or mechanics.

### Content scope rule (LOCKED — Interpretation B, hardened v2.552)

- **Canonical source:** SRD 5.2.1 (CC-BY-4.0) is the canonical verbatim source.
  Where an entry exists in SRD 5.2.1, its rules text should match the SRD
  **exactly** — audits verify against the SRD PDF, not third-party wikis
  (wikis are used only for cross-checking non-SRD mechanics).
- **Mechanics:** Full 2024 rules implemented. Numbers, scaling, and rules behavior
  are not copyrightable and may be implemented in full (2024 PHB / MM / DMG).
- **Verbatim text:** Descriptive/flavor text may be reproduced verbatim **only**
  for SRD 5.2.1 / 5.1 content (licensed CC-BY-4.0). Non-SRD content gets full
  mechanical support with **paraphrased or original** descriptions — never
  copied PHB prose.
- **Attribution:** The `/srd` page carries the exact SRD 5.2.1 and SRD 5.1
  attribution statements required by CC-BY-4.0. This must remain reachable
  from the app at all times.
- **Source tagging (rolling):** As entries are audited, tag them
  `srd-5.2` / `srd-5.1` / `paraphrase` / `legacy` / `homebrew` so compliance
  is machine-checkable. New content added going forward must be tagged.
- **Official only:** No invented spells, monsters, subclasses, feats, or mechanics.
  Every entry traces to an official WotC source.
- **Legacy sources:** Where no 2024 version exists (e.g. Artificer = TCE), the
  pre-2024 official version is allowed, tagged as legacy, refreshed when WotC
  publishes a 2024 replacement.
- **Psion:** Private homebrew (UA-derived), RLS-scoped to the owner's account,
  **excluded** from all RAW audits and the regression suite. Not shipped to
  standard players.

> **Legal note:** The above is a product/accuracy posture, not legal advice.
> Claude is not a lawyer. Before a commercial launch, a real IP attorney should
> review the licensing posture (SRD CC-BY-4.0 attribution requirements, the
> mechanics-vs-expression line).

### Automation posture (LOCKED)

Track 1 automation is **detection and verification only** — never unattended
editing of rules data.

- **Safe to automate:** regression suite that asserts known-good RAW values,
  CI gate, duplicate/consistency scanners, drift detection that opens issues.
- **Human-gated:** every actual edit to rules data. Claude verifies against
  official sources; the human makes the judgment call; ships are gated deltas.
- **Never:** a cron that finds, edits, verifies, and auto-merges RAW data with no
  human in the loop. This compounds silent errors into production and is
  explicitly out of bounds. (See RAW_AUDIT_2024.md: errors compound.)

### Backlog (from RAW_AUDIT_2024.md sequence)

Shipped: v2.547 (quick wins #4/#12/#18/#21), v2.548 (spell cleanup S3/S4/S6/S7/S10).

Outstanding:
- **Description corrections:** #2 Divine Spark, #3 Relentless Rage, #9 Druid Wild
  Shape temp HP, #11 War Magic, #14/#15 Berserker.
- **Scaling tables (QC carefully):** #1 Cleric CD (L18 not L11), #5 Paladin CD.
- **Feat rewrites:** #6 Lucky, #7 Alert, #8 Skilled, #17 Tavern Brawler.
- **Save-DC architecture:** #10 Intimidating Presence (class-DC SaveSpec).
- **Additive spell content:** S1 Divine Smite, S2 the 11 missing 2024 PHB spells.
- **Artificer backfill:** S8 (~80 spell class-list additions), legacy-tagged.
- **Playtest hygiene:** strip Psion-UA spells from non-Psion class lists.
- **Regression suite:** encode all corrected values as assertions (see Track 0).

### Character size selection (queued — v2.652 dependency)

**Ask:** let a player choose their character's size where the 2024 species
permits it, and have that choice feed the cover rules that landed in v2.652.

**Why it's blocked on nothing but time:** `src/rules/cover.ts` already gates
creature cover on size (`creatureCoverContribution`, `CREATURE_COVER_MAX_SIZE_GAP`)
and the whole path reads a size label end to end. Today that label always comes
from the token, which defaults to `medium` — so the gate is real but nobody can
move it. This work is what makes the choice matter.

Scope:
- **Data:** `SpeciesData.size` is a single `CreatureSize` (`src/data/species.ts` —
  currently 12 × Medium, 2 × Small). 2024 PHB lets **Aasimar, Human and Tiefling**
  pick Small *or* Medium. Widen the field to allow a choice set, leaving fixed-size
  species as they are.
- **Character:** no `size` column exists on `characters`. Add one (idempotent
  migration), defaulting to the species' fixed size so every existing character is
  unchanged.
- **Creation + settings UI:** a size picker that only appears for species offering
  a choice; validate the pick against that species' allowed set on write.
- **Token:** PC tokens hardcode `size: 'medium'` (`BattleMapV2.tsx` ~L1634) — derive
  from the character instead, so a Small character occupies a Small token and gets
  the cover treatment their size earns.
- **Knock-ons to check:** carrying capacity (Powerful Build already counts as one
  size larger), Halfling Nimbleness ("move through the space of a creature one size
  larger"), grapple/shove size limits, and Naturally Stealthy.

---

## Track 2 — Live lightweight map (daily iteration)

**Goal:** Iterate daily on the current production map. It is graphically minimal
(import a picture for token/background) but carries all current automations. Keep
the automations, improve them, add capability — without a graphics overhaul.

**What exists today:** PixiJS canvas, token placement (`scene_token_placements`),
`combatants` source-of-truth, SAT-based AOE footprint hit-testing, cone/line
geometry, 8-way direction snapping, reach visualization, concentration indicator,
action-economy ring, condition/immunity systems.

**Risk:** Production, so the gate applies (tsc ≤ the carried baseline —
see `TS_BASELINE` in `.github/workflows/ci.yml` for the current number — / TS2304 = 0,
rules-of-hooks clean, vite build). But this is engineering, not rules-judgment, so
iteration can move faster than Track 1.

**Candidate backlog (to be prioritized):**
- **Cover from walls and DM-placed terrain (queued — the other half of v2.652).**
  v2.652 shipped cover from *creatures*; walls are still second-class and terrain
  doesn't exist:
  - `wall_type` is dead code. `CoverWall.type` (`src/rules/cover.ts`) scores
    solid / low / window / door, but there's no `scene_walls.wall_type` column and
    no way to set it — so **every wall on every live map is the legacy untyped
    case worth 1 point, i.e. half cover.** A stone wall reads the same as a
    railing, and it takes three stacked walls to reach total cover. Needs: an
    idempotent migration, the column plumbed through `sceneWalls` + the loader,
    and a type selector in the wall tool (which today only cycles door states).
  - **Terrain objects.** The DM can place tokens, walls, drawings and text —
    nothing that reads as a crate, pillar or boulder. Decide whether these become
    typed low walls (reuses everything above) or a first-class object entity with
    a cover level, then feed them in as a third source. `combineCover` is already
    shaped for it: add to the blockers list, the RAW "most protective wins" merge
    handles the rest.
- **Pointer group-drag (deferred from v2.653).** Multi-select shipped with
  marquee sweep, shift-click, a bulk action bar (lock / hide / reveal / delete)
  and arrow-key nudge — but dragging a whole selection with the mouse was left
  out on purpose. TokenLayer's drag path enforces per-creature movement budgets,
  wall collision, remote drag locks and the active-turn gate; "move six tokens
  at once" has no honest answer during combat (six separate budgets), and
  bolting a bulk path onto that pipeline risks the single-token drag everyone
  relies on. Arrow-key nudge covers aligning a cluster out of combat. Do this
  properly when the drag pipeline is next refactored, not before.
- **RLS recursion on `scene_token_placements` (found v2.653, not yet fixed).**
  `stp_player_update_owned_combatant` (v2.616) subqueries `combatants`;
  `combatants_player_select_via_placement` (v2.309) subqueries placements right
  back. Postgres evaluates all permissive policies, so **every** placement
  UPDATE dies with 42P17 — including the DM's. Reproduces locally 100%: drag any
  token with the fixture loaded. Production has both policies but is not broken
  today only because its one campaign predates the flag flip
  (`use_combatants_for_battlemap = false`); the column DEFAULT is `true`, so the
  next campaign created there gets an unmovable battle map. Fix needs a
  `SECURITY DEFINER` ownership helper so the placement policies stop re-entering
  combatants' policies — and must be verified as both DM and player, since RLS
  is the security boundary.
- Grid tooling: square/hex, adjustable size, snap-to-grid.
- Measurement/ruler in grid units.
- Basic drawing primitives (shapes, freehand) if they serve automation.
- Layer concept (map / token / DM-hidden) — foundational, also unlocks Track 3.
- Automation improvements surfaced from live play.

---

## Track 3 — Graphics-rich map (long-term, isolated)

**Goal:** Build a Roll20-caliber, graphics-intensive map carrying the same
automations, in isolation, designed to import into the live site later.

**Isolation mechanism (LOCKED):** Separate mini-app / project.

**Implication of a separate mini-app:** the shared automation layer (see Track 0)
must be extractable/importable so both the live map and the graphics map run the
*same* automation logic rather than two diverging copies. Without that, "the same
automations in both maps" degrades into double-maintenance. This makes Track 0 a
hard prerequisite for Track 3.

**Target feature set (Roll20 parity, roughly ordered by dependency):**
1. Canvas & navigation (pan/zoom, pages) — partially have via PixiJS.
2. Layers (map / object / GM-hidden / lighting).
3. Drawing tools (pen, shapes, text, color/opacity).
4. Grid (square/hex, snap, per-page scale).
5. Tokens (art library, resize/rotate, status markers, bars, auras, sheet link).
6. Measurement (ruler, movement tracking).
7. **Fog of war / dynamic lighting** — highest complexity/risk; depends on
   wall-drawing tools; do NOT lead with this.
8. Asset/art library + uploads.

**Sequencing note:** Dynamic lighting is the "wow" but also the hardest and
riskiest (occlusion geometry, wall performance, per-token vision). The layers +
drawing + grid foundation underneath it is lower-risk, higher daily value, and
lighting depends on it. Build foundation first.

---

## Track 0 — Shared foundation (prerequisite for Tracks 2 & 3)

**Not a separate goal — the enabling work both map tracks depend on.**

**The decoupling requirement:** For both maps to carry "the same automations," the
automation/geometry logic must be **map-agnostic** — operating on abstract
coordinates + state, decoupled from any specific renderer. Each map (lightweight
PixiJS, graphics-rich Track 3) becomes a *renderer* on top of a shared automation
core.

- Get this right → Track 3 inherits every automation for free; fixes apply to both.
- Get it wrong → two copies of AOE/cone/reach/condition logic, maintained forever.

**First engineering task of the whole roadmap:** audit how coupled the current
automation logic is to the PixiJS rendering layer, and extract a rendering-agnostic
automation core if it isn't already one. Everything in Tracks 2 and 3 sits on this.

---

## Infrastructure (cross-cutting, supports all tracks)

Deferred items that make the daily loop real:
- **Keep-warm cron** — prevent Supabase auto-pause (has caused 2 outages). The one
  genuinely daily-scheduled, fully-safe-to-run-unattended task. Highest priority.
- **Frontend resilience** — bounded timeout + retry on session restore, replacing
  the infinite "Loading…" spinner when auth is unreachable.
- **GitHub Actions CI gate** — encode the gate (tsc ≤ `TS_BASELINE` in ci.yml / TS2304 = 0, hooks
  clean, build) on every push. Regressions can't reach prod.
- **RAW regression suite** — the Track 1 detection layer; runs daily, opens issues
  on drift, never edits.

---

## Cadence

- **Track 1:** gated sessions when real RAW work exists.
- **Track 2:** daily default — small, visible, gated ships.
- **Track 3:** dedicated deeper sessions; aggressive iteration OK (isolated).
- **Infra:** slot in as capacity allows; keep-warm cron first.

The daily continuous-improvement loop (once infra lands): keep-warm ping fires →
RAW regression suite runs and posts status → drift opens an issue with specifics.
Human involvement drops to skimming status and doing the irreducible RAW judgment
calls in gated sessions.
