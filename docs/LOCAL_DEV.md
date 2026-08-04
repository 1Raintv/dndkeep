# Local development database (optional)

By default this app develops against the **shared production Supabase**
(`.env`). That works and nothing requires you to change it — if you're
happy with the current workflow, you can stop reading.

This doc is for opting a machine into a **local Docker database** instead:
full schema, seeded test login, zero risk to real data, and it unlocks the
DB-backed E2E tests. The switch is per-machine and reversible in one file.

## How the switching works

Vite loads `.env.local` *over* `.env`. A machine **with** a `.env.local`
pointing at `127.0.0.1` talks to its local Docker stack; a machine
**without** one keeps using `.env` → production. `.env.local` is
gitignored — nothing you do here affects anyone else's checkout, deploys,
or the committed defaults.

## Prerequisites

- **Docker Desktop**, running (first setup downloads a few GB of images)
- That's it — the Supabase CLI is a devDependency of this repo
  (`npx supabase …`), no global install.

## Setup (once per machine)

```bash
npx supabase start      # boots Postgres/Auth/REST/Studio in Docker
npx supabase db reset   # replays all migrations + seeds test data
copy .env.local.example .env.local
npm run dev
```

Sign in with the seeded account:

| | |
|---|---|
| Email | `test-dm@dndkeep.local` |
| Password | `dndkeep-local-test` |
| Entitlements | Pro (campaign creation is Pro-gated *at the database*) |
| Data | owns **"Local Test Campaign"** (dm membership auto-created) |

Characters are deliberately not seeded — creating one is itself a flow
worth exercising, and the `characters` table is too wide to hand-seed
durably. Anything you create locally is yours to trash: `npx supabase
db reset` returns the database to the seeded state in seconds.

## Day-to-day

| Task | Command |
|---|---|
| Wipe + reseed the database | `npx supabase db reset` |
| Browse the DB in a UI | Studio at <http://localhost:54323> |
| Stop the stack (frees RAM) | `npx supabase stop` |
| Back to the production DB | delete `.env.local` (dev server restarts itself) |
| Run the DB-backed E2E tests | `E2E_DB=1 npx playwright test` (see `e2e/README.md`) |

## Why there are "drift shim" migrations

Production's schema partly predates the migration files — several tables,
28 columns, and the API-role grants were created directly in the Supabase
Dashboard and never captured as migrations. A fresh replay therefore
needed four reconstruction shims (`000_initial_schema`,
`003_drift_shim_session_states`, `20260803990000_…dashboard_columns`,
`20260803991000_…grants`). They're inert on production — prod never
replays this chain — and guarded with `if not exists` besides. Details in
each file's header and `e2e/README.md`.

The shims were censused by diffing the generated production types
(`src/types/supabase.ts`) against a replayed local schema, which covers
every column the app actually queries. They are a faithful
*reconstruction*, not a certified byte-for-byte copy of production — the
gold-standard cleanup (dumping prod's schema as a verified baseline)
needs the production DB password and lives on the go-live checklist.

## Troubleshooting

- **`failed to connect to the docker API`** — Docker Desktop isn't
  running (the CLI being installed isn't enough; the whale needs to be
  up).
- **Dev server crashes with `EBUSY …/.vs/…`** — shouldn't happen anymore
  (Vite ignores `.vs/` since v2.638), but if you see it: Visual Studio
  holds exclusive locks on its index files; make sure you're on a build
  that includes the `vite.config.ts` watcher ignores.
- **Ports 54321–54324 already in use** — another Supabase project's
  stack is running; `npx supabase stop --project-id <other>` or stop it
  from Docker Desktop.
- **App shows "Subscribe to create campaigns" for the test user** — the
  profile fetch is failing; almost always a schema-drift symptom. Run
  `npx supabase db reset` (picks up any new shims), and if it persists,
  compare `src/types/supabase.ts` against local `information_schema`
  columns — a single missing column 400s the whole profile select.
