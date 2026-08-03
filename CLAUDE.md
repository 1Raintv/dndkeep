# DNDKeep — instructions for Claude sessions

D&D 5e (2024 rules) session companion. Vite + React 19 + TypeScript (strict),
PixiJS 8 battle map, three.js/cannon-es 3D dice, Supabase backend
(Postgres + RLS + realtime), deployed to Vercel via `deploy.bat`.

## The gate — run before calling anything done

Every change must keep all of these green (CI enforces them on push;
`.github/workflows/ci.yml` is the source of truth):

```
npm run type-check     # total errors ≤ TS_BASELINE in ci.yml; TS2304 must be 0
npm run build          # production build must succeed
npm run raw-check      # 2024-rules regression suite
npm run coords-check   # battle-map coordinate math
npm run anchor-check   # battle-map anchor invariants
npm run test           # vitest unit suite (rules/, coords, parsers)
```

Unit tests are colocated `*.test.ts` files next to their modules and run
with vitest. When you add or change logic in `src/rules/` or another pure
module, extend its test file in the same commit. Modules that import
`lib/supabase` at module scope need `vi.mock('./supabase', ...)` (see
`src/lib/healSpells.test.ts`) — unit tests must NEVER touch the database,
which is production.

For lint, the gate is **rules-of-hooks violations = 0** (they crash at
runtime as React error #310). `npm run lint` currently fails outright because
of ~22 standing style errors (`--max-warnings 0` vs carried debt) — CI and
`lint.bat` therefore grep eslint output for `rules-of-hooks` instead of using
its exit code. Don't add new lint errors, but don't treat the standing ones
as blockers either.

The tsc baseline is carried debt, not a target — if your change *lowers* the
count, ratchet `TS_BASELINE` down in ci.yml in the same commit. Never raise it.

## Architecture rules

- **`src/rules/` is the domain layer**: pure game-rule functions with ZERO
  imports of components, supabase, or `src/data/` tables. New rules logic goes
  here. `src/rules/dice.ts` is the canonical dice module — never write another
  `Math.floor(Math.random() * n) + 1` or ad-hoc dice-expression parser.
- **Entry-chunk discipline**: anything imported (even transitively) by
  `App.tsx`'s eager imports lands in the bundle every visitor downloads before
  first paint. `src/lib/gameUtils.ts` statically imports the full spell/class/
  item data tables (~650 KB) — eagerly-loaded components must NOT import from
  it. After `npm run build`, the entry `index-*.js` should stay ~250 KB; if it
  jumps, you pulled data tables into the eager graph.
- **Lazy loading**: always `lazyWithRetry` from `src/lib/lazyWithRetry.ts`,
  never raw `React.lazy` — raw lazy white-screens when a deploy invalidates
  chunk hashes mid-session.
- **Battle-map structure**: `BattleMapV2.tsx` (~4,300 lines) is the root —
  scene management, realtime subscriptions, toolbars, layer wiring. All 15
  layer/panel components live in `src/components/Campaign/battlemap/`
  (TokenLayer, VisionLayer, WallLayer, DrawingLayer, the panels, plus
  `shared.ts` for their constants and geometry helpers). New map features go
  in a new or existing `battlemap/` component, not the root; keep shrinking
  the root, never grow it.
- Heavy stable deps (`three`, `pixi.js`, react, supabase) are split via
  `manualChunks` in `vite.config.ts` so app deploys don't invalidate their
  browser cache. Keep new heavy deps out of the default chunk.

## Hazards learned the hard way

- **Local dev talks to the production database.** `.env` points at the live
  Supabase project — there is no staging. Be deliberate with anything that
  writes.
- **Duplicate-file drift**: the repo previously carried stale root-level
  copies of live components (e.g. `SpellsTab.tsx`), and fixes got applied to
  the dead copy. Before editing a component, confirm it's the one actually
  imported (trace from `App.tsx` or grep importers).
- **`deploy.bat` runs `git add .`** — anything untracked in the working tree
  at deploy time gets committed. Keep `.gitignore` current instead of relying
  on manual staging.
- Version history convention: code comments cite `v2.NNN` versions
  (`src/version.ts`); keep doing that for non-obvious behavior.

## Conventions

- Concise, heavily-commented code is the house style — comments explain *why*
  (often with the version number of the incident that motivated the code).
- Supabase table access is being consolidated behind `src/lib/api/*`
  repository modules — prefer extending those over inline `supabase.from()`
  in components.
- Reference docs live in `docs/` (ROADMAP.md is the plan of record).
