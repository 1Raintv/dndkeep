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

- Don't use when: the change isn't previewable in a browser (`src/rules/`, scripts, build
  config) — run the repo gate (`CLAUDE.md` § The gate) instead.
- 
## Steps

1. **Server** — reuse before launching. If something answers on `http://localhost:5173`,
   reuse it read-only — and if another session/agent owns it, coordinate before trusting
   its rendering (see gotchas: stale dep cache, mid-edit drift). If nothing is listening:
   Playwright mode → `npx vite --port 5173` via Bash `run_in_background: true`; pane
   mode → `preview_start {name: "dndkeep-dev"}`. — *done when:* the URL returns HTTP 200.

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
   - Pane: `navigate` → `resize_window` preset → `computer {screenshot}`; confirm the
     route landed via `location.pathname` and cross-check suspect layout with
     `getBoundingClientRect` through `javascript_tool` (see gotchas for the three pane
     traps). — *done when:* a shot of the changed element exists per relevant viewport.

4. **Judge, fix, re-shoot** — `Read` the PNG and compare against intent; scan the
   script's console/network dump (pane mode: `read_console_messages onlyErrors`). Edit
   source; Vite HMR applies it — no rebuild; re-run step 3. — *done when:* the pass/fail
   checklist below is all green.

5. **Promote to regression** — if the final look changed a public page:
   `npx playwright test visual --update-snapshots` and commit the baselines with the
   change (the image diff in review is the change record). A brand-new public page gets
   a spec in `e2e/` following `smoke.spec.ts`'s `collectConsoleErrors` pattern.
   — *done when:* `npm run test:e2e` is green locally, or the user explicitly deferred it —
   AND any dev server this loop *launched* is stopped (one it merely reused stays up).

## Pass/fail checklist

- [ ] Changed element renders and matches intent at desktop AND mobile (393 px) —
      no clipping, overlap, or hidden overflow.
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
  `test-dm@dndkeep.local` / `dndkeep-local-test`, Pro, owns "Local Test Campaign".
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
