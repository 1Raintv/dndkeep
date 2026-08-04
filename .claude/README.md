# .claude/ — agent toolkit for this repo

Committed resources for anyone pointing Claude (or another agent) at this
codebase. Nothing here is required for normal development.

| Path | What it is |
|---|---|
| `skills/setup-local-dndkeep/` | Interactive wizard: from a bare machine (no Docker) to a seeded local database + passing E2E tests. Start here if you want to develop without touching the production DB. |
| `skills/verify-ui-dndkeep/` | Visual-verification loop for UI changes — headless Playwright screenshots first (`scripts/ui-shot.mjs`), in-app browser pane as fallback. Includes the gotchas learned the hard way. |
| `skills/check-telemetry/` | Triage the `client_errors` telemetry table (local Docker DB): recent rows, actionable vs noise, summary. |
| `skills/check-logs/` | Sweep live console output — drive the app, collect console + failed requests per route, classify, summarize. |
| `audit/dndkeep-audit.md` | The 2026-08 architecture/performance audit, with a live status table (done / partial / open) at the top. Keep the table current when you work an item. |
| `audit/dndkeep-go-live-checklist.md` | Deferred security/reliability items reframed as a phased launch checklist (before real users / before payments / before depending on it). |
| `launch.json` | Dev-server config for Claude's preview tooling (`dndkeep-dev` → `npm run dev` on :5173). |

Also read: the repo root `CLAUDE.md` (the gate, architecture rules,
hazards — start there), `docs/LOCAL_DEV.md` (local database setup by
hand), `e2e/README.md` (test tiers and safety locks).

`settings.local.json` and `worktrees/` remain machine-local (gitignored).
