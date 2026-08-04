---
name: check-logs
description: Sweep DNDKeep's runtime console output for anything of note — drive the app, collect console + failed requests, summarize. Use when I say /check-logs, "what's the app logging", "any console errors/warnings", or "sweep the logs".
argument-hint: [optional focus, e.g. "the character sheet" or "logged-out pages"]
---

# check-logs

Sweep what the app writes to the console at runtime (the log facade's console
sink + everything legacy). Unlike telemetry, console output is not persisted
anywhere — so this skill *generates* a fresh session and reads its output.

## Steps

1. **Server** — reuse `http://localhost:5173` if it answers; else start one
   (Playwright mode: `npx vite --port 5173` in background; pane mode:
   `preview_start {name: "dndkeep-dev"}`). Mode detection, probe script, and
   its traps: follow `verify-ui-dndkeep` steps 1–2 — same machinery.
   — *done when:* a mode is confirmed by a successful probe.

2. **Drive a representative session**, collecting console + network per page
   (`ui-shot.mjs` dumps both; pane mode: `read_console_messages` after each
   navigation):
   - Always: `/`, `/auth`, `/srd`.
   - If `.env.local` points local (see `docs/LOCAL_DEV.md`): sign in via
     `signInAsSeedDm` and visit the seeded character sheet + campaign
     (the dice roller and battle map are the log-heavy paths).
   - If the user named a focus area, weight the sweep there.
   — *done when:* console output is captured for every visited route.

3. **Classify every captured line** (not just errors — the point is "of note"):
   - **Bug signal** — errors/warnings pointing at app code; include route +
     origin file (grep the message).
   - **Log-hygiene candidate** — legacy `console.*` noise that should migrate
     to the facade or drop a level (feeds owner-queue "logging strategy").
   - **Known noise** — allowlist below.
   — *done when:* no captured line is unclassified.

4. **Report**: counts per bucket, then bug signals first (route, message,
   origin, suggested next step), then the top hygiene offenders by volume.
   Offer follow-up tasks; don't fix unprompted. Stop any server this run
   started (a reused one stays up).
   — *done when:* summary delivered + server state restored.

## Known noise

- `[DNDKeep] Booted vX.Y.Z …` — the boot banner, deliberate.
- `[vite] connected` / `[vite] failed to connect to websocket` ×2 — HMR;
  the failure pair is pane-proxy noise only.
- React DevTools suggestion line — browser boilerplate.
- `[debug]`-prefixed facade lines — dev-level by design; only flag volume.

## Reference

- Console verbosity: `localStorage['dndkeep:log:console']` =
  `debug|info|warn|error|off`; build default via `VITE_LOG_CONSOLE_LEVEL`
  (dev fallback: debug).
- Prod DB rule: without a local `.env.local`, logged-out routes ONLY — never
  sign in or write (CLAUDE.md hazard).
- Telemetry (persisted errors in `client_errors`) is `/check-telemetry`'s
  territory; this skill is the live console.
