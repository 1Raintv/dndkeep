# DNDKeep — Two-Track Roadmap

**Established:** July 2026 (chat 15)
**Status:** Living document. Update as tracks progress.
**Current version:** v2.665.0

This document is the durable map for DNDKeep's development. It exists so that
progress can continue across sessions without re-deriving context, and so the
parallel efforts don't drift into each other's risk budgets.

> **2026-08-12 — Track 3 was retired.** The roadmap ran three tracks until the
> separate Roll20-caliber mini-app was killed and its goals folded into Track 2.
> See [Track 3 — retired](#track-3--retired-2026-08-12) for the reasoning.

---

## The core principle: two tracks, two risk profiles

DNDKeep's development is split into two tracks that deliberately do **not**
compete for the same risk budget. Each has its own cadence and its own tolerance
for breakage.

| Track | What | Risk profile | Cadence |
|-------|------|--------------|---------|
| **1 — RAW accuracy + automation** | Correctness of rules data; detection/verification automation | Low tolerance for silent error. Human-gated. | Gated sessions when real RAW work exists |
| **2 — The map** | Evolve the production map toward Roll20 parity; keep + improve automations | Production, so gated — but engineering, not rules-judgment | Daily default; small visible ships |

The split is by **kind of judgment**, not by feature area. Track 1 is rules
judgment, where a silent error is a wrong number in someone's game and no test
catches it — so a human decides every edit. Track 2 is engineering, where the
gate (tsc, build, tests, hooks) actually catches regressions, so iteration can
move fast. Keeping them apart stops map velocity from leaking into rules data.

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
  the cover treatment their size earns. (v2.657 did this via the species seam in
  `CampaignDashboard`; the remaining piece is the per-character override.)
- **Not in scope: drawing Small tokens smaller.** Settled 2026-08-12 — Small and
  Medium occupy the same 5-ft space in the 2024 rules, so they render
  identically. See the Track 2 note.
- **Knock-ons to check:** carrying capacity (Powerful Build already counts as one
  size larger), Halfling Nimbleness ("move through the space of a creature one size
  larger"), grapple/shove size limits, and Naturally Stealthy.

---

## Track 2 — The map (daily iteration)

**Goal:** Evolve the production map toward Roll20 parity, in place, one gated
ship at a time. It starts graphically minimal (import a picture for
token/background) but carries all current automations. Keep the automations,
improve them, add capability.

Since Track 3 was retired (2026-08-12) this is the *only* map track: there is no
separate graphics-rich app to defer ambitious features into. Anything that would
once have been "Track 3 work" is now a Track 2 backlog item that has to earn its
way through the normal gate. The parity tiers are listed under
[Roll20 parity](#roll20-parity-inherited-from-track-3) below.

**What exists today:** PixiJS canvas, token placement (`scene_token_placements`),
`combatants` source-of-truth, SAT-based AOE footprint hit-testing, cone/line
geometry, 8-way direction snapping, reach visualization, concentration indicator,
action-economy ring, condition/immunity systems.

**Risk:** Production, so the gate applies (tsc ≤ the carried baseline —
see `TS_BASELINE` in `.github/workflows/ci.yml` for the current number — / TS2304 = 0,
rules-of-hooks clean, vite build). But this is engineering, not rules-judgment, so
iteration can move faster than Track 1.

**Candidate backlog (to be prioritized):**
- **Cover from walls — shipped in v2.661.** `wall_type` is no longer dead code:
  `scene_walls.wall_type` stores the material, a picker in the wall toolbar
  (`battlemap/WallTypePanel.tsx`) sets it for new walls, ctrl+click retypes an
  existing one, and `coverWalls` in `battlemap/coverState.ts` resolves it onto
  `CoverWall.type`. Closed doors now score as doors (total cover) instead of
  half, derived from `doorState` rather than stored twice.
  - **Existing walls were deliberately NOT backfilled.** They stay NULL and keep
    scoring as legacy untyped (half cover each). Converting them to solid would
    be the "correct" reading, but it silently upgrades every wall on every live
    map to total cover mid-campaign — a gameplay change, not a migration. The
    opt-in `update` is in the migration's header comment. **Live maps therefore
    see no change until a DM opts in or redraws.**
  - Not verified in a browser yet — Docker was down when it shipped, so the
    toolbar and the three wall colours have only been checked by unit test and
    build. Worth a look on next run.
- **Terrain objects — deliberately deferred (2026-08-12).** Crates, pillars,
  boulders as a cover source. Jared's call: *walls only for now* — get walls
  plus fog of war genuinely solid before widening the surface. When it is
  picked up, the choice is typed low walls (which would now reuse the whole
  v2.661 pipeline for free) versus a first-class object entity with its own
  cover level; `combineCover` already takes a third blocker source either way.
- **Walls + fog of war is the current focus.** Sequenced deliberately, since
  the wall system and the lighting system are the same system viewed twice —
  a wall's material has to answer both "how much cover" and "can you see
  through it".
  - ~~Materials drive line of sight~~ — **shipped v2.662.** Windows and low
    walls transmit sight while still granting ¾ and half cover; solid walls
    and shut doors block. Before this every wall was opaque to vision, so an
    arrow slit fogged a room exactly like a stone wall.
  - ~~Per-character vision range (the v2.226 TODO)~~ — **shipped v2.663.**
    Sight range is `sightRadiusFt` (`src/rules/vision.ts`): unlimited in
    bright and dim (lightly obscured is disadvantage, not a distance cap),
    and in the dark the better of the creature's darkvision and its own
    light. Darkvision is resolved from the species table at the same
    `CampaignDashboard` seam that resolves token size.
  - ~~Light sources~~ — **shipped v2.663, completed v2.665.** v2.663 put
    `light_radius_ft` on a token (None / Candle / Torch / Lantern /
    Daylight in the context menu), because darkvision alone would have
    left every Human blind the moment a scene went Dark. v2.665 made any
    token carrying a light actually *emit* it, so a token named "Brazier"
    lights the room — no `scene_lights` table, because a light source is
    a thing at a position that can be placed, moved, hidden and synced,
    which is the definition of a token.
    - Emission is gated on a PC having line of sight to the source, or a
      brazier would light its room for the party from anywhere on the
      map. The gate tests the source's centre point, so light spilling
      around a corner from a lamp you cannot see is not shown — the
      error is conservative (hides light, never reveals a dark room).
      Fixing it properly means intersecting visibility polygons per
      (viewer, light) pair.
    - ~~Separate bright/dim bands~~ — **shipped v2.666.** The fog is no
      longer binary: a light erases its bright band completely and its
      dim band most of the way, leaving a murk. `lightBandsFt` halves
      the stored total, which is exact for all four presets (every RAW
      light sheds dim for as far again as it sheds bright), so no
      migration was needed — the information was always in the column.
      - **Darkvision now reads as DIM, not bright**, per RAW: within the
        radius you treat darkness as dim light. The visible change is
        that a Dwarf's 60 ft is murky rather than daylight-clear.
      - The dim tier composites through its own RenderTexture. 'erase'
        multiplies, so drawing dim discs straight onto the fog would
        compound where they overlap and four Dwarves standing together
        would out-shine a torch. Flattening the union first makes
        overlap idempotent — two candles do not make bright light.
      - Fixed in passing: the Candle preset stored 20 ft while its own
        hint said 5 + 5. A candle lit as far as a torch's bright band.
        Invisible while the fog was binary; obvious once bands drew.
    - ~~Coloured light~~ — **shipped v2.668.** `light_color` (0xRRGGBB,
      NULL = untinted) on BOTH token tables with a mirror trigger, same
      shape as v2.663; six named swatches in the token context menu,
      offered only once a token actually carries a light.
      - Rendered as an additive polygon in a container BENEATH the fog
        sprite. It cannot go in the fog texture — that texture is an
        alpha mask being erased, so colour painted where alpha reached 0
        is invisible by construction. Under the fog is also what makes a
        second visibility gate unnecessary: tint in an unseen region is
        covered by opaque fog and tint in a dim region shows through at
        the dim tier's residual alpha, so it grades itself.
      - **Masked to the world rect.** A light near the edge throws a
        polygon past the map, and out there is no fog to attenuate it —
        first attempt smeared bright orange across the empty page.
      - **The DM does not see the tint in normal DM view**, because
        VisionLayer does not mount at all when fog is off. Consistent
        with the DM seeing no fog either, and Player View previews it.
        Worth revisiting only if setting mood without toggling preview
        turns out to matter at the table.
  - ~~Manual fog~~ — **shipped v2.664.** `scenes.fog_mode` picks per scene
    between `dynamic` (line of sight, the v2.224–v2.663 behaviour, still
    the default) and `manual` (the DM paints reveals with the ☁ brush and
    they stay revealed). Switching modes does not clear the painting, so
    a DM can flip to dynamic for a fight and back. Reveals are grid cells
    in `scenes.revealed_cells`, one write per stroke rather than per
    pointer-move.
    - ~~Rectangle reveal~~ — **shipped v2.667.** A Brush/Rect toggle in
      `FogBrushPanel`; Rect drags one diagonal and applies on release,
      previewing the rectangle live while the drag chooses its far
      corner. Most map features are rectangular rooms, which the round
      brush could only approximate by scrubbing the corners and still
      catching a cell of the corridor outside.
      - Size buttons are hidden rather than disabled in Rect mode — the
        drag *is* the size, and a visible-but-inert control reads as
        broken.
      - **No lasso.** A freeform polygon would be a third interaction
        for a case the freehand brush already covers; rect handles the
        regular shapes, brush the irregular ones. Revisit only if a
        real map wants a shape neither can express.
    - ~~"Reveal what the party has already seen"~~ — **shipped v2.669
      as `fog_mode = 'remembered'`**, the third mode. What the party can
      see right now renders exactly as `dynamic`; everywhere they have
      been keeps its WALL LAYOUT drawn over otherwise-solid fog, like a
      dungeon-crawler automap.
      - **Contents stay hidden, by construction.** The fog over a
        remembered cell is never erased even slightly. Tokens render
        BENEATH the fog, so any erase at all would leak a monster
        standing in a room the party walked out of; structure is drawn
        ON TOP instead. You remember the room, not its occupants.
      - **Players explore, not just the DM** — moving your own token
        uncovers the map. Players have no UPDATE on scenes and must not
        get one, so this goes through `explore_scene_cells`, a SECURITY
        DEFINER function that checks campaign membership and can only
        ever UNION cells in. Verified: a seeded player's cell lands, a
        non-member is refused, `anon` is refused at the grant, and a
        repeat call does not change the count.
      - `explored_cells` is a SEPARATE column from `revealed_cells`.
        Merging them would overwrite the DM's hand-painted manual fog
        the first time anyone switched modes. Remembered mode renders
        the union, and the ☁ brush stays available in it so a DM can
        still mark "they were told about this wing" by hand.
      - Writes are batched (1.2 s) — the recompute fires on every token
        move, and a write per step is a write per footfall. Memory is
        add-only, so a dropped batch costs nothing: the next recompute
        sends those cells again.
      - **Accumulation needs someone watching.** It happens on any
        client rendering fog — every player, and the DM in Player View.
        A token moved while no player is connected AND the DM has
        preview off records only where it ended up, not the corridor it
        crossed. At a live table that does not arise; if it ever does,
        the fix is letting the DM's client compute without rendering.
  - **Per-player fog** is still party-shared (the v2.225 note in `VisionLayer`).
    Matches Roll20/Foundry defaults, so this is a preference rather than a bug —
    revisit only if a table wants split parties to see separately.
- **Pointer group-drag (deferred from v2.653).** Multi-select shipped with
  marquee sweep, shift-click, a bulk action bar (lock / hide / reveal / delete)
  and arrow-key nudge — but dragging a whole selection with the mouse was left
  out on purpose. TokenLayer's drag path enforces per-creature movement budgets,
  wall collision, remote drag locks and the active-turn gate; "move six tokens
  at once" has no honest answer during combat (six separate budgets), and
  bolting a bulk path onto that pipeline risks the single-token drag everyone
  relies on. Arrow-key nudge covers aligning a cluster out of combat. Do this
  properly when the drag pipeline is next refactored, not before.
- ~~**RLS recursion on `scene_token_placements`**~~ — **fixed in v2.654.**
  `stp_player_update_owned_combatant` (v2.616) subqueried `combatants` while
  `combatants_player_select_via_placement` (v2.309) subqueried placements right
  back; Postgres evaluates all permissive policies, so every placement UPDATE
  died with 42P17. Resolved with a `SECURITY DEFINER` ownership helper so the
  placement policies stop re-entering combatants' policies. Left here as a note
  because the failure mode (mutually-recursive permissive policies) is easy to
  reintroduce the next time a policy subqueries across these two tables.
- Grid tooling: square/hex, adjustable size, snap-to-grid.
- Measurement/ruler in grid units.
- Basic drawing primitives (shapes, freehand) if they serve automation.
- Automation improvements surfaced from live play.
- ~~Should Small tokens render smaller?~~ **Settled 2026-08-12: no.** A Small
  creature and a Medium creature both occupy a 5-by-5-ft space in the 2024
  rules — size only changes the occupied area at Large and above (Tiny is the
  exception below Medium, taking 2½ ft, and `tokenRadiusForSize` already draws
  it at `0.5` for distinction). Drawing Small smaller would imply a mechanical
  difference that does not exist, and would shrink every Small monster as a
  side effect. Small and Medium stay identical at `0.95`.

### Roll20 parity (inherited from Track 3)

Folded in when Track 3 was retired. Roughly ordered by dependency; each is a
normal Track 2 item now, shipped through the gate against the live map.

1. **Canvas & navigation** (pan/zoom, pages) — partially have via PixiJS.
2. **Layers** (map / object / GM-hidden / lighting) — foundational; several
   items below assume it.
3. **Drawing tools** (pen, shapes, text, color/opacity) — partially have.
4. **Grid** (square/hex, snap, per-page scale) — see grid tooling above.
5. **Tokens**: art library, resize/rotate, status markers, bars, auras, sheet
   link. Status markers, bars and sheet link already exist.
6. **Measurement** (ruler, movement tracking) — movement tracking exists.
7. **Fog of war / dynamic lighting** — highest complexity and risk; depends on
   the wall-drawing tools. Manual fog of war is the cheaper first step. **Do
   not lead with this.**
8. **Asset / art library + uploads.**

**Sequencing note (carried over):** dynamic lighting is the "wow" but also the
hardest and riskiest — occlusion geometry, wall performance, per-token vision.
The layers + drawing + grid foundation underneath it is lower-risk, higher daily
value, and lighting depends on it. Build the foundation first.

---

## Track 3 — retired (2026-08-12)

**Was:** build a Roll20-caliber, graphics-intensive map as a separate mini-app,
in isolation, designed to import into the live site later.

**Decision: killed. Evolve the live map instead.** Its target feature set moved
into Track 2 under [Roll20 parity](#roll20-parity-inherited-from-track-3).

**Why.** The quarantine that justified a separate app was also its main cost. A
second app only carries "the same automations" if the automation layer is
genuinely shared, which made Track 0 a *hard* prerequisite — so nothing
graphics-rich could ship until an extraction with no user-visible payoff was
finished first. And the isolation that made aggressive iteration safe is the
same thing that kept the results away from real play: a feature is only proven
once a real session uses it. Meanwhile Track 2 kept absorbing the parity list
anyway — PixiJS canvas, drawing, walls, vision, multi-select and cover all
landed on the live map, which is most of tiers 1–6.

**What this costs.** Real, and worth naming: the live map is production, so
every parity feature now pays the gate and there is nowhere to prototype
recklessly. Fog of war and dynamic lighting — tier 7, the riskiest work — have
to land incrementally behind the existing map rather than arriving finished.
That is the accepted trade.

**If this is ever revisited,** the reason to reopen it would be a specific
feature that genuinely cannot be built incrementally against the live map.
Nothing on the parity list currently looks like that.

---

## Track 0 — Shared foundation

**Not a separate goal — enabling work the map depends on.**

**Status note (2026-08-12):** this was a *hard* prerequisite when Track 3
existed, because two separate apps could not otherwise share automation logic.
With one map, it is no longer blocking — but it is still worth doing on its own
merits, and the argument is now about testability rather than code-sharing.

**The decoupling requirement:** the automation/geometry logic should be
**renderer-agnostic** — operating on abstract coordinates + state rather than
reaching into PixiJS. The map becomes a *renderer* on top of an automation core.

- Get this right → automation is unit-testable without a canvas, and the
  rendering layer can be replaced or upgraded without touching rules behavior.
- Get it wrong → geometry logic stays welded to display objects, and the only
  way to test it is to boot a browser.

This is already partly true and trending the right way: `src/rules/` is pure by
construction, and the battle-map decomposition keeps pulling logic out into
testable modules (`battlemap/marqueeGeometry.ts`, `battlemap/coverState.ts`,
`lib/map/coords.ts`). Continue that direction rather than attempting one big
extraction.

> **Practical constraint:** a test that imports a battle-map component passes
> locally and fails in CI. `ci.yml` pins `node-version: 20`, which has no global
> `navigator`; pixi.js reads it at module scope, and Node 21+ locally hides the
> problem. This is the concrete reason to keep pure logic in its own module.

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
- **Track 2:** daily default — small, visible, gated ships. Bigger parity items
  (layers, fog of war) get dedicated deeper sessions, but still ship
  incrementally through the gate — there is no isolated sandbox any more.
- **Infra:** slot in as capacity allows; keep-warm cron first.

The daily continuous-improvement loop (once infra lands): keep-warm ping fires →
RAW regression suite runs and posts status → drift opens an issue with specifics.
Human involvement drops to skimming status and doing the irreducible RAW judgment
calls in gated sessions.
