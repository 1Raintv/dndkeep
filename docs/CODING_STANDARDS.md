# Where things go

Placement rules for this repo. Every entry exists because code in the
wrong place is what the 2026-08 audit spent its time fixing: an
11,374-line battle-map component, five parallel dice rollers, fixes
applied to dead duplicate files, 650 KB of data tables in the entry
chunk. The build/test gate is in `CLAUDE.md`; this doc is the map.

## The map

| You are adding… | It goes in… | Never in… |
|---|---|---|
| Game-rule logic (dice, HP, modifiers, conditions, rests) | `src/rules/` — pure functions, colocated `*.test.ts` in the same commit | Components, contexts, or inline math at call sites |
| Dice of any kind | `src/rules/dice.ts` (already canonical) | A new `Math.floor(Math.random()*n)+1` anywhere |
| Database reads/writes | `src/lib/api/*` repository modules | Inline `supabase.from()` in components (being consolidated out — don't add more) |
| Schema changes | `supabase/migrations/*.sql`, idempotent (`IF NOT EXISTS`) | The Supabase dashboard alone — dashboard-only schema is how prod drifted (audit 2.6) |
| Battle-map features (layers, panels, tools) | A new or existing component in `src/components/Campaign/battlemap/` (geometry helpers: its `shared.ts`) | `BattleMapV2.tsx` — the root only shrinks (4,269 lines, down from 11,374; keep it falling) |
| Logging / error reporting | Through `src/lib/log.ts` (facade); new destinations = new sink beside `logSinkSupabase.ts` | New bare `console.*` calls, ad-hoc reporters |
| Static game data (spells, classes, items) | `src/data/` tables, imported ONLY by lazy-loaded code | Anything `App.tsx` eagerly reaches — `src/lib/gameUtils.ts` imports the full tables, so eager components must not import from it (entry budget: ~300 KB, CI-enforced) |
| A lazily-loaded route/component | `lazyWithRetry` from `src/lib/lazyWithRetry.ts` | Raw `React.lazy` (white-screens after deploys) |
| A heavy new dependency | Its own `manualChunks` entry in `vite.config.ts`, loaded lazily | The default chunk |
| Unit tests | Colocated `*.test.ts` next to the module | A separate test tree; e2e specs live in `e2e/` (Playwright — different runner) |
| Docs | `docs/` (ROADMAP.md is the plan of record) | README sprawl, comments-as-docs |
| Agent tooling, audit status | `.claude/` (keep the audit status table current) | — |

## The three placement sins

**1. The second implementation.** Before writing anything, grep for who
does it today. Five dice rollers disagreed with each other; damage math
existed in seven places. Once two versions exist, the next agent (human
or AI) edits the wrong one — ambiguity is self-compounding. If you find
a duplicate, the fix is deletion in the same commit, never coexistence.

**2. The root-level copy.** The repo used to carry stale duplicates of
live components at the root (`SpellsTab.tsx`); fixes landed in the dead
file. Before editing any component, confirm it's the one actually
imported — trace from `App.tsx` or grep importers. Never create a
"backup copy" or `-v2` file alongside the original.

**3. The god-file addition.** "It's related to the map so I'll add it
to BattleMapV2" is how 11,374 lines happened. Related-ness is not
placement — the root wires layers together; behavior lives in the
layer components. The same applies to any file trending large: split
at the seam, don't append.

## Boundaries that must not blur

- `src/rules/` imports **nothing** from components, supabase, or
  `src/data/`. That purity is why the whole suite runs in ~1 s.
- Unit tests never touch a database — the DB is production. Anything
  importing `lib/supabase` at module scope gets `vi.mock` (see
  `healSpells.test.ts`).
- RLS policies are the security boundary; the client filter is UX.
  Anything enforced only in the browser is not enforced (audit 1.4).
- User-influenced strings never meet `innerHTML` — `textContent` or
  JSX (audit 1.6: a character name executed code in the DM's browser).

## When you're done

Same-commit obligations: extend the colocated test file if logic
changed; update the audit status table if you touched an audit item;
ratchet `TS_BASELINE` down if your change lowered the error count
(never up); comment the *why* with the `v2.NNN` incident number, house
style.
