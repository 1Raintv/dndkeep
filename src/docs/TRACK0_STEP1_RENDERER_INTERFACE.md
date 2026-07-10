# Track 0 Step 1 — Renderer Interface

**Date:** July 2026 (chat 15)
**Ships in:** v2.549.0
**Artifact:** `src/lib/map/mapRenderer.ts` (pure types, zero runtime deps)

Defines the seam that lets multiple map renderers share ONE automation core.
This is the plug Track 3's graphics-rich renderer builds against, and the fix for
the type-duplication already happening between BattleMapV2 and PlayerBattleMap.

---

## Why this exists

The Track 0 audit found the automation core is already renderer-agnostic, and that
**two renderers already exist** on the same data:
- `BattleMapV2.tsx` — Pixi renderer (the only Pixi-coupled file).
- `PlayerBattleMap.tsx` — a DOM/CSS renderer that **copies shared types locally
  "to avoid circular imports."**

That copy is the smell. Without a defined contract, each renderer re-declares the
data shapes and re-derives coordinate math, and they drift. `mapRenderer.ts` gives
all renderers one interface to depend on.

---

## The core idea: three coordinate spaces, one shared boundary

- **Grid** (row/col) and **World** (map-local px) are SHARED — the automation core
  reasons entirely in these.
- **Screen** (device px after pan/zoom) is the ONLY space that differs per renderer.

So the division of labor is: everything up to **world space is shared logic**; only
**world→screen is the renderer's job.** `screenToWorld` / `worldToScreen` are the
sole coordinate methods on the interface — because they're the only ones that vary.

---

## What the interface contains

- **Shared scene data** (`RenderScene`, `RenderToken`, `RenderWall`, `RenderText`,
  `RenderDrawing`) — world-space, plain data, structurally compatible with
  `battleMapStore`. Renderers depend on THESE, not on the store.
- **Semantic input events** (`MapInteractionEvent`) — renderers translate raw
  device input into world-space semantic events; the controller handles them and
  calls the automation core. Input handling stays renderer-specific; decisions stay
  shared.
- **Overlays** (`MapOverlay`) — AOE templates, reach rings, movement paths produced
  BY the pure geometry libs as world-space shapes; the renderer only paints them.
- **The `MapRenderer` contract** — `mount / renderScene / renderOverlays /
  setViewport / setInteractionHandler / screenToWorld / worldToScreen / destroy`.

## What it deliberately EXCLUDES (stays in the shared core)

Hit-testing, line-of-sight, cover, distance, pathfinding, movement legality, cone/
line footprints. A renderer must never reimplement these — it requests them from
the libs and paints the result as an overlay. **This exclusion is the rule that
keeps both maps' automations identical.**

---

## Migration path (incremental, non-breaking)

None of this rewrites BattleMapV2 now. The interface is additive — it compiles,
passes the gate, and nothing imports it yet. Adoption happens in later slices:

1. **(this ship)** Land the interface. Zero behavior change.
2. Make `PlayerBattleMap` import shared types from `mapRenderer.ts` instead of its
   local copies. Deletes the "copied to avoid circular imports" smell. Small, safe.
3. Extract coordinate conversions (Track 0 step 3) into pure functions the
   interface's `screenToWorld`/`worldToScreen` delegate to.
4. Gradually reshape BattleMapV2's Pixi layers to sit behind `MapRenderer` — not a
   rewrite, an incremental wrap. Each slice keeps the gate green.
5. Track 3's graphics renderer implements `MapRenderer` from day one and inherits
   the automation core for free.

---

## Verification

- New file is pure types, no runtime imports (no pixi/react/DOM).
- Gate: tsc **271 / TS2304 = 0** (zero new errors), rules-of-hooks clean, build green.
- Nothing imports it yet, so zero behavior change / zero regression risk.
