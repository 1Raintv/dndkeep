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
| Data | owns **"Local Test Campaign"** (dm membership auto-created) and **"Seeded Fighter"** (a Fighter 1 character — only 5 columns lack defaults, the rest come from the schema) |

Anything you create locally is yours to trash: `npx supabase db reset`
returns the database to the seeded state in seconds.

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

## Optional: Visual Studio support

Prefer full Visual Studio over VS Code/terminal? Same philosophy as
`.env.local`: **per-machine, nothing committed**. The repo deliberately
ships no `.sln`/`.esproj` — VS project files are local-only, hidden from
git via `.git/info/exclude` (a per-clone ignore list that, unlike
`.gitignore`, is never committed). That also keeps them out of
`deploy.bat`'s `git add .`.

**No drift risk for anyone**: the `.esproj` format is glob-based — it
lists zero files, Solution Explorer just mirrors the folder on disk. A
teammate adding/renaming/deleting files without VS changes nothing here;
`git pull` and the new files simply appear. The wrapper never needs
maintenance to track the repo.

Heads-up: plain **Open Folder doesn't cut it** — Task Runner Explorer
(even with the NPM Task Runner extension) only activates with a real
project loaded. Hence the wrapper project. (This recipe was proven on
VS 2026 Professional 18.8; VS 2022 17.x should match modulo the `.sln`
vs `.slnx` default.)

1. Requires the **"JavaScript and TypeScript development tools"**
   component (VS Installer → Modify). For npm scripts in Task Runner
   Explorer, also install the **NPM Task Runner** extension
   (Mads Kristensen — skip its "Bindings" feature; those write into the
   tracked `package.json`).
2. Create `dndkeep.esproj` in the repo root:

   ```xml
   <Project Sdk="Microsoft.VisualStudio.JavaScript.Sdk/1.0.6237341">
     <PropertyGroup>
       <StartupCommand>npm run dev</StartupCommand>
       <JavaScriptTestRoot>src\</JavaScriptTestRoot>
       <JavaScriptTestFramework>Vitest</JavaScriptTestFramework>
       <!-- F5 runs the dev server; don't let VS's Build invoke vite build -->
       <ShouldRunBuildScript>false</ShouldRunBuildScript>
       <BuildOutputFolder>$(MSBuildProjectDirectory)\dist</BuildOutputFolder>
     </PropertyGroup>
   </Project>
   ```

3. Hide it from git — append to `.git/info/exclude`:

   ```
   dndkeep.esproj
   dndkeep.esproj.user
   dndkeep.sln
   dndkeep.slnx
   launch.json
   obj/
   ```

   (`obj/` is MSBuild's intermediate output — the esproj build drops
   cache files there on first Build/Start.)

4. **File → Open → Project/Solution** → `dndkeep.esproj` (first load
   restores the JavaScript SDK from NuGet). If VS asks to save a
   solution, save `dndkeep.sln` (or `.slnx` — newer VS defaults to the
   XML format) in the repo root — both excluded. Right-click the
   project → **Set as Startup Project** (an ad-hoc solution can come up
   with none assigned, which alone makes Start fail). Open the saved
   `.sln`/`.slnx` directly next time.

5. F5/Start needs a debug launch profile — without one you get "Unable
   to start debugging. The startup project cannot be launched." Create
   `launch.json` (same schema as VS Code's, excluded above) in the repo
   root, **mirrored at `.vscode/launch.json`** — which location a given
   VS build reads varies, and `.vscode/` is already gitignored:

   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "msedge",
         "request": "launch",
         "name": "localhost (Edge)",
         "url": "http://localhost:5173",
         "webRoot": "${workspaceFolder}",
         "skipFiles": ["<node_internals>/**", "**/node_modules/**"]
       }
     ]
   }
   ```

   `skipFiles` matters here: `@supabase/auth-js` throws (and internally
   handles) `NavigatorLockAcquireTimeoutError` during routine auth-token
   lock contention; without it the debugger false-positives that as an
   unhandled exception on every launch.

   Restart VS after adding it (profile discovery happens at project
   load), then pick the profile from the Start button's dropdown. If
   the dropdown still only shows "Start", use **"dndkeep Debug
   Properties"** in that same dropdown — the profile editor is the
   authoritative view, and profiles created there always take. If the
   browser opens before Vite is up, start `dev` from Task Runner
   Explorer first — with a `launch.json` present VS may not auto-run
   `StartupCommand`.

You get: **F5/Start** = debug browser attached to the Vite app
(breakpoints in `src/` bind via sourcemaps), and **Task Runner
Explorer** listing every `package.json` script (double-click to run —
the gate scripts included). Verify invisibility with `git status`
(clean) or `git check-ignore -v dndkeep.esproj`.

Solution Explorer will show gitignored scratch (`dist/`,
`test-results/`, `deploy.lock`…) that git doesn't track — expected, VS
shows the whole folder.

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
