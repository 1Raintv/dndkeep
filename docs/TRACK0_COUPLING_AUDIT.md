# Track 0 — Automation/Rendering Coupling Audit

**Date:** July 2026 (chat 15)
**Purpose:** Assess how coupled the map automation/geometry logic is to the PixiJS
renderer, per the Track 0 prerequisite in ROADMAP.md. Determines whether Track 3
(separate graphics-rich map) can inherit the same automations or would fork them.
**Verdict:** **Strong decoupling already exists.** The core logic is renderer-agnostic.
One large component (`BattleMapV2.tsx`) holds inline logic worth extracting, but it
is not a blocker — it is an optimization.

---

## Headline findings

### 1. PixiJS is imported in exactly ONE file
`grep` for `pixi.js` / `@pixi` across all of `src/` returns a single file:
`src/components/Campaign/BattleMapV2.tsx`. The rendering dependency is already
quarantined to one component. Not the geometry libs, not the automations, not even
`PlayerBattleMap.tsx`.

### 2. All seven core logic libs are pure
`battleMapGeometry.ts`, `coneGeometry.ts`, `lineGeometry.ts`, `wallCollision.ts`,
`pathfinding.ts`, `movement.ts`, and `automations.ts` contain **zero** references
to React, DOM (`document`/`window`/`HTMLElement`), canvas, or Pixi. They are pure
functions over plain data.

### 3. The logic operates on plain-data abstractions, not renderer objects
`battleMapGeometry.ts` exposes a clean API over plain interfaces:
- `BattleMapToken` (row/col numbers, ids, size — plain data)
- `WallSegment` (x1/y1/x2/y2 numbers, type enum)
- `ParticipantPosition`, `ParticipantFootprint` (plain coordinate/state)

Functions like `findParticipantsInArea<P>`, `hasLineOfSight`, `deriveCoverFromWalls`,
`distanceBetweenTokensFt` take coordinates + state and return matches/values. Any
renderer can produce these inputs and consume these outputs. **This is exactly the
"abstract coordinates + state" core the roadmap requires — it already exists.**

### 4. The one coupled file correctly REUSES the libs (doesn't duplicate them)
`BattleMapV2.tsx` imports `movement`, `pathfinding`, `wallCollision`, visibility,
and geometry from the libs rather than reimplementing them. The shared logic is
genuinely shared.

---

## The one real finding: BattleMapV2.tsx is 11,385 lines

This single component is large enough that it inevitably contains **inline logic
tangled with rendering + React state** — even though it imports the pure libs for
the heavy geometry. Measured signals in that file:

| Signal | Count | Reading |
|--------|-------|---------|
| React hooks (useState/Ref/Effect/Callback/Memo) | 169 | Heavy React/state surface |
| PIXI references | 12 | Rendering — expected, belongs here |
| Graphics/draw calls (beginFill/drawRect/addChild/…) | 143 | Rendering — belongs here |
| JSX/return blocks | 69 | Rendering — belongs here |
| Geometry math (hypot/atan2/sqrt/cos/sin/…) | 96 | **Mixed — some is extractable logic** |
| Local function definitions | 115 | **Mixed — some are pure helpers** |

The 96 inline geometry-math sites and many of the 115 local functions are the
extraction target. Some is legitimately rendering (converting logical coords to
screen pixels for Pixi — that stays). Some is logic that happens to live in the
component (coordinate transforms, hit-testing glue, interaction rules) and should
move to pure libs so a second renderer gets it for free.

---

## What this means for the roadmap

### Track 3 (graphics-rich map) is viable as designed
Because the logic core is renderer-agnostic and Pixi is isolated to one file, a
separate graphics-rich renderer can import the *same* pure libs
(`battleMapGeometry`, `movement`, `pathfinding`, geometry, `automations`) and get
every automation for free. The "same automations in both maps" requirement is
**achievable without forking the logic** — the architecture already supports it.

### The pre-req work is smaller than feared
Track 0 was framed as "audit coupling, extract a rendering-agnostic core if it
isn't already one." Finding: the core **is** already largely agnostic. The
remaining work is not a big refactor of the logic libs — it is **extracting the
residual inline logic out of BattleMapV2.tsx** into the existing pure-lib pattern.

---

## Recommended Track 0 work (optional, incremental, non-blocking)

None of this blocks starting Track 3. But doing it first makes Track 3 cleaner and
also improves Track 2's maintainability. Suggested order, each a small gated ship:

1. **Define the renderer interface.** Write down the contract a renderer must
   fulfill (consume `ActiveBattleMap` + participant state; emit token positions,
   drawings, walls; call into the pure libs for hit-testing/LoS/movement). This is
   the seam Track 3's new renderer plugs into. Small doc + a TS interface.

2. **Extract inline geometry from BattleMapV2.tsx.** Walk the 96 math sites; move
   any that are logic (not screen-pixel conversion) into `battleMapGeometry.ts` or
   a new `mapCoords.ts`. Pure functions, unit-testable, shared. Do this in slices
   (e.g. coordinate transforms first, then hit-testing glue) to keep each ship
   small and the gate green.

3. **Separate the coord systems explicitly.** There are at least three coordinate
   spaces (grid row/col, map-local px, screen px). Making the conversions explicit
   pure functions (`gridToMapPx`, `mapPxToScreen`, etc.) is the single highest-value
   extraction — both renderers need identical logical→map math, and only the
   map→screen step differs per renderer.

4. **Add unit tests on the extracted pure functions.** Now that they're pure, they
   are trivially testable, and these tests double as regression guards for both
   renderers.

---

## Files reference

**Pure logic (renderer-agnostic, reuse freely):**
- `src/lib/battleMapGeometry.ts` (39.8 KB — the core geometry/hit-test API)
- `src/lib/coneGeometry.ts`, `src/lib/lineGeometry.ts`
- `src/lib/wallCollision.ts`, `src/lib/pathfinding.ts`, `src/lib/movement.ts`
- `src/lib/automations.ts`
- `src/lib/vision/visibilityPolygon.ts`

**Rendering (Pixi-coupled, one file):**
- `src/components/Campaign/BattleMapV2.tsx` (11,385 lines — extraction target)

**Other map surface:**
- `src/components/Campaign/PlayerBattleMap.tsx` (no Pixi import — verify renderer)
- `src/lib/stores/battleMapStore.ts` (state store)
- `src/lib/api/` (scenes, tokens, walls, texts, drawings, assets — persistence)
