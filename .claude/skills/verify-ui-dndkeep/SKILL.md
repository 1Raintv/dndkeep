---
name: verify-ui-dndkeep
description: Verify a DNDKeep visual/UI change by screenshotting the running app — Playwright-first, browser-pane fallback. Use when working on dndkeep UI and I say /verify-ui-dndkeep, "check the UI", "does it look right", "screenshot the page/app", or "verify it renders".
argument-hint: [route or element to verify, e.g. /srd or "landing hero"]
---

# verify-ui-dndkeep

Close the loop on a **visual** change to DNDKeep: shoot the real page, compare to intent,
adjust, re-shoot. Two modes — **headless Playwright** (default: works unattended, exact
viewports, same engine as the committed baselines) and the **in-app Browser pane**
(fallback: needs the user present with the pane open). Detect which works, then loop.

## When to use

- Use when: a change alters what a browser renders — layout, spacing, colour, a new or
  restyled component, responsive behaviour — and you need to see it rather than infer it.
- Don't use when: the change isn't previewable in a browser (`src/rules/`, scripts, build
  config) — run the repo gate (`CLAUDE.md` § The gate) instead.

## Steps

1. **Server** — reuse before launching. If something answers on `http://localhost:5173`,
   reuse it read-only — and if another session/agent owns it, coordinate before trusting
   its rendering (see gotchas: stale dep cache, mid-edit drift). If nothing is listening,
   start it with `preview_start {name: "dndkeep-dev"}` in BOTH modes — the harness forbids
   launching dev servers via Bash, and headless Playwright is happy to shoot a
   preview-started server. — *done when:* the URL returns HTTP 200.

2. **Detect the mode** — from the dndkeep repo root, run the probe:
   `node <this skill>/scripts/ui-shot.mjs http://localhost:5173/ <scratchpad>/probe.png`
   - Verdict printed + PNG on disk → **Playwright mode**.
   - Exit 3 (not resolvable) → `npm install` in the repo, retry once.
   - Exit 4 (unreachable) → the server isn't actually up; back to step 1.
   - Chromium-missing error → offer `npx playwright install chromium` (the user's call);
     declined or still failing → **pane mode**.
   — *done when:* one mode is confirmed by a screenshot that actually exists on disk.

3. **Shoot the changed view** at every viewport the change touches (mobile matters —
   clipping hides there):
   - Playwright: `node .../ui-shot.mjs <url> <scratchpad>/<name>.png --viewport
     desktop|mobile [--wait <css unique to the changed element>] [--full]`.
     Make `--wait` **text-specific** (`'h1:has-text("SRD Attribution")'`), never a bare
     tag or comma list — see the zero-size-`h1` gotcha, which hangs the wait for the
     full timeout.
   - Pane: `navigate` → `resize_window` preset → `computer {screenshot}`; confirm the
     route landed via `location.pathname` and cross-check suspect layout with
     `getBoundingClientRect` through `javascript_tool` (see gotchas for the three pane
     traps). — *done when:* a shot of the changed element exists per relevant viewport.

   Then run `scripts/overflow-check.mjs` on the same URL at the same viewports —
   `ui-shot` reports the console, this reports the layout, and you need both before
   checklist item 1 can be called green.

4. **Judge, fix, re-shoot** — `Read` the PNG and compare against intent; scan the
   script's console/network dump (pane mode: `read_console_messages onlyErrors`). Edit
   source; Vite HMR applies it — no rebuild; re-run step 3. — *done when:* the pass/fail
   checklist below is all green.

5. **Promote to regression** — if the final look changed a public page:
   `npx playwright test visual --update-snapshots` and commit the baselines with the
   change (the image diff in review is the change record). A brand-new public page gets
   a spec in `e2e/` following `smoke.spec.ts`'s `collectConsoleErrors` pattern.
   **Check the route is actually covered before trusting a green run** — `visual.spec.ts`
   silently had no `/srd` case, so `--update-snapshots` regenerated nothing and looked
   like success. **Then mutation-test anything you added**: revert the fix, confirm the
   new spec FAILS, restore. A guard asserting the wrong quantity passes cheerfully
   against the broken page (see the `innerWidth` gotcha — that is exactly how it went).
   — *done when:* `npm run test:e2e` is green locally, or the user explicitly deferred it —
   AND any dev server this loop *launched* is stopped (one it merely reused stays up).

## Pass/fail checklist

> **`VERDICT: PASS` means the CONSOLE was clean — it says nothing about layout.**
> Both shots of a nav whose CTA was clipped clean off the right edge came back PASS.
> Item 1 is judged by your eyes and the overflow probe, never by the verdict line.

- [ ] Changed element renders and matches intent at desktop AND mobile (393 px) —
      no clipping, overlap, or hidden overflow. **Run the probe, don't eyeball it:**
      `node <this skill>/scripts/overflow-check.mjs <url> --viewport mobile|desktop`
      (exit 0 clean / 1 overflow; `--json` for machine-readable). It reports the two
      ways overflow hides, because catching one tells you nothing about the other:
      - *page scrolls sideways* — `scrollWidth` exceeds the screen.
      - *element silently clipped by an ancestor* — page `scrollWidth` looks
        **completely normal** while content is cut off unseen. This was the
        landing-nav bug: page 393, screen 393, CTA sliced off at 414.
      Don't hand-roll this check — the obvious one-liner is wrong under mobile
      emulation (see the `innerWidth` gotcha) and that error passes silently.
- [ ] `VERDICT: PASS` from ui-shot (zero console errors); pane mode: zero errors
      beyond the allowlisted HMR-websocket pair.
- [ ] No unexpected ≥400 or failed network requests for the view.
- [ ] Shot shows real content, not a loading/empty/error state (unless that state is
      the thing being verified).

## Logged-in flows (local stack only)

When `.env.local` points at the local Supabase (see `docs/LOCAL_DEV.md`), the whole
logged-in app is verifiable — sheet, dice roller, battle map:

- **Sign in via `e2e/db/helpers.ts` → `signInAsSeedDm(page)`** — never hand-roll the
  login fill (see the hydration gotcha below). Seeded login:
  `test-dm@dndkeep.local` / `dndkeep-local-test`, Pro, owns "Local Test Campaign"
  and character `33333333-3333-3333-3333-333333333333` ("Seeded Fighter") at
  `/character/<id>` — the sheet is where the 3D roller, skill checks, and HP
  panel live.
- **The 3D dice roller does NOT live on `/dice`** — that page is a flat roller
  writing straight to the DB. `triggerRoll` (the 3D overlay) fires only from
  sheet flows (SkillsList, WeaponsTracker, SpellCastButton…). A roll's
  `roll_logs` POST happens inside `onResult` — i.e. on SETTLE — so counting
  those POSTs is the ground-truth "did the roll resolve" signal.
- **Double-trigger testing**: while the overlay is up, pointer clicks can't reach
  UI beneath it — `locator.dispatchEvent('click')` bypasses hit-testing and
  reproduces a programmatic double-trigger exactly (see e2e/db/dice-roller.spec.ts).
- **Mutation-test new regression specs**: temporarily revert the fix under test,
  confirm the spec FAILS, restore. Two minutes, and it's the only real proof a
  green test guards anything (the dice spec passed vacuously in its first form).
- **Ad-hoc probe scripts** (sign in, click around, screenshot, dump REST/console):
  write a `.mjs` using `import { chromium } from '@playwright/test'` and put it
  **inside the repo but NOT in `test-results/`** — `.claude/worktrees/` works. Two
  traps: outside the repo, ESM can't resolve `@playwright/test`; inside
  `test-results/`, the next `playwright test` run DELETES it.
- **WebGL works headless** (SwiftShader): the three.js dice and the Pixi map both
  render — `locator('canvas')` assertions and screenshots are valid evidence.
- `npx supabase db reset` between iterations gives a clean slate in seconds — but it
  regenerates dynamic values (campaign join codes), so never assert on those.
- Debug ladder when a flow fails: failure screenshot (`test-results/**/test-failed-1.png`
  → `Read` it) → REST capture (`page.on('response')` for non-GET >=400) → parse
  `trace.zip` for the action timeline (unzip; `.trace` lines are JSON events).

## Reference

- **Prod DB.** `.env` points at live Supabase; there is no staging. Never sign in,
  create accounts, or write. Logged-out routes only (`/`, `/auth`, `/srd`) — unless
  `.env.local` points at a local Supabase, which unlocks the `E2E_DB=1` flows.
- Viewports mirror `playwright.config.ts` projects: desktop 1280×720, mobile 393×851
  (Pixel 5 size only; ui-shot skips full device emulation).
- `deploy.bat` runs `git add .` — shots and temp files go to the scratchpad, never the
  repo tree.

## Gotchas

> Real failures observed (2026-08-03 trial).

- **Pane screenshots need the pane open.** `computer {screenshot}` times out with
  "Browser pane is not displayed" until the user opens it — ask the user, then retry. DOM, console,
  and JS tools work fine with it closed; only compositing needs the pane.
- **Pane "desktop" shots crop to the pane's visible size** (e.g. 800×984), silently
  cutting the right edge. Always `resize_window` to a preset first — preset shots
  capture the true viewport (mobile came back 375×812 @2×).
- **Pane `navigate` echoes only the origin** — a "successful" navigate may have landed
  elsewhere; verify `location.pathname` via `javascript_tool`.
- **Allowlist `[vite] failed to connect to websocket` ×2 in pane mode** — the pane's
  proxy breaks the HMR socket on every load. Noise, not an app error (headless
  Playwright connects directly and doesn't produce it).
- **A server another session has been hammering can serve mixed `.vite` dep-cache
  generations** — different `?v=` hashes across chunks → two React copies →
  "Invalid hook call … useContext null" caught by the error boundary. Not an app bug;
  browser reloads can't fix it, only a fresh dev server can.

> Real failures observed (2026-08-07 trial, Playwright mode end-to-end).

- **A fresh worktree has no `.env.local`, so every shot is a `Loading…` spinner.**
  Env files are gitignored and do NOT come across with `git worktree add`. Symptom is
  two `Missing Supabase environment variables` console errors and a spinner that looks
  like a slow page. Copy `.env.local` from the main checkout — verify it points at
  `127.0.0.1:54321` (local Docker), NOT prod — and **restart Vite**, which reads env
  only at boot. Checklist item 4 catches the symptom; nothing else warns you.
- **`--wait 'main, h1'` hangs for the full timeout on any route.** `index.html` ships a
  static `#seo-shell` whose `<h1>` stays in the DOM at **zero size** (`display:block`,
  `visibility:visible`, but `0×0`) — and Playwright's "visible" state requires a
  non-empty box. A CSS list resolves to the FIRST DOM match, which is that dead h1, so
  the wait never satisfies even though `main` is right there and visible. Use a
  text-specific selector. `e2e/smoke.spec.ts:43` documents the same trap for locators.
- **`querySelector('nav')` returns the wrong nav.** The app renders a fixed bottom tab
  bar that precedes page-level navs in the DOM. Select by what distinguishes it —
  `[...document.querySelectorAll('nav')].find(n => getComputedStyle(n).position === 'sticky')`
  — or you will measure the tab bar and conclude the page is fine.
- **Inline styles outrank media queries.** `globals.css` is full of
  `@media (max-width: 480px)` rules, but a value written inline on the element wins
  and the breakpoint silently does nothing. Any dimension that must respond to
  viewport has to live in a class — that WAS the landing-nav clipping bug.
- **`scrollWidth > innerWidth` cannot fail under the `mobile` project.** `Pixel 5`
  sets `isMobile: true`, so Chromium honours `<meta viewport>` by WIDENING the
  layout viewport to fit overflowing content: on a page that overflowed to 468px,
  `innerWidth` reported 468 too, and the assertion compared 468 ≤ 468 and passed.
  `visualViewport.width` stays at the true 393. A guard written the obvious way
  passes on a page that visibly scrolls sideways — this was caught ONLY by
  mutation-testing the new spec, which is why that step is not optional.
- **`sed -i` rewrites the whole file's line endings** (CRLF → LF) on this repo.
  `git diff --stat` still shows just your real edits because `core.autocrlf`
  normalises, but a raw `diff` against a `cp` backup reports every line changed
  and looks alarming. Prefer the Edit tool over `sed -i` for tracked files.

> Logged-in-flow failures observed building the db E2E tier (2026-08-03 pt 2).

- **`isVisible({timeout})` does NOT wait** — the timeout option is ignored; it
  reports instant state. A conditional built on it silently skipped scene creation
  whenever the empty-state hadn't rendered yet. Use `waitFor()` or
  `expect(a.or(b).first()).toBeVisible()` to race two possible UI states.
- **Filling `/auth` right after navigation races React hydration** — the first
  controlled render blanks a too-early `fill` (symptom: password set, email empty,
  native "Please fill out this field" bubble). Fill-and-verify with retries —
  that's exactly what `signInAsSeedDm` does.
- **The 3D dice overlay is a full-screen click-anywhere-dismiss layer** — while
  it's up, clicks aimed at UI hit the overlay instead. Dismiss (click empty space),
  then click the control.
- **`page.reload()` can lose SPA state** — the campaign dashboard is state-driven,
  so a reload lands back on the campaign LIST; re-enter via the card before waiting
  on dashboard content.
- **Strict-mode dupes**: hero CTA text appears twice on the landing page, and
  entity names render in BOTH the sidebar and content (sidebar copy hidden on
  mobile) — filter `locator('text=…').locator('visible=true')` or use `.first()`
  deliberately.
- **Full-suite CPU contention**: WebGL dice + Pixi maps + screenshots across 4
  workers on one dev server flake the heavy mobile tests (~1-2/run, different each
  time). Config carries `workers: 3` + `retries: 1`; the db tier alone runs clean
  at full speed. Prefer `npx playwright test db` while iterating on a flow.
- **Multi-client first-scene race (real app quirk)**: two DM sessions racing the
  FIRST scene create can both keep a stale empty state despite 201s; a reload
  resyncs. Documented in `e2e/db/battle-map.spec.ts`; low priority app-side.
