# E2E + visual tests (optional tooling)

Nothing here is required for normal development or deploys — `npm run dev`
and `deploy.bat` work exactly as they always have on a machine that never
touches this directory.

## Tiers

| Tier | Command | Needs | Safe against prod? |
|---|---|---|---|
| Smokes + visual | `npm run test:e2e` | nothing extra | Yes — logged-out only, never writes |
| Bundle budget | `npm run build && npm run budget-check` | nothing extra | Yes — reads `dist/` |
| DB-backed flows | `E2E_DB=1 npx playwright test` | local Supabase via `.env.local` | Refuses to run unless the Supabase URL is local |

## Visual baselines

Committed under `e2e/__screenshots__/<platform>/`. When a change is
*supposed* to alter a page, regenerate and commit the new baseline —
the image diff in review is the change record:

```bash
npx playwright test visual --update-snapshots
```

Failures write actual/expected/diff PNGs into `playwright-report/`
(`npx playwright show-report` to browse).

## Local database (opt-in per machine)

See `.env.local.example`. Short version: install Docker + the Supabase
CLI, run `supabase start` + `supabase db reset`, copy the printed keys
into `.env.local`. Delete `.env.local` to go back to the shared prod DB.

## Why Playwright is pinned to 1.49

Last version supporting Node 18, which the dev machines currently run.
Bump together with a Node 20+ upgrade.
