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

See `.env.local.example`. Short version: with Docker running,
`npx supabase start` then `npx supabase db reset`, copy the printed
API URL + anon key into `.env.local`. Delete `.env.local` to go back
to the shared prod DB. The CLI is a devDependency — no global install.

`db reset` replays the full migration chain and `supabase/seed.sql`,
which creates a deterministic test login:

- email `test-dm@dndkeep.local` / password `dndkeep-local-test`
- Pro subscription (campaign creation is Pro-gated at the DB)
- one campaign: "Local Test Campaign" (user is owner + dm)
- one character: "Seeded Fighter" (`/character/33333333-3333-3333-3333-333333333333`) —
  hosts the sheet flows the 3D-roller and battle-map specs drive

The chain includes four LOCAL-REPLAY shims that reconstruct objects
production got via the Dashboard SQL editor (never migrated):
`000_initial_schema` (the original schema.sql as a baseline),
`003_…session_states` (recovered from git history; later legitimately
dropped by the v2.296 migrations), `20260803990000_…dashboard_columns`
(28 drifted columns + creature_folders, censused by diffing the
generated prod types against the local schema), and
`20260803991000_…grants` (hosted Supabase auto-grants the API roles;
raw replays must do it explicitly). They are inert on production by
construction — prod never replays this chain.

## Why Playwright is pinned to 1.49

Last version supporting Node 18, which the dev machines currently run.
Bump together with a Node 20+ upgrade.
